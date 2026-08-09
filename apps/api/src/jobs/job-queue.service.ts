import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { Job as BullJob, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { redisConfig } from '@farm-phone/config';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { PlatformUploaderService } from './platform-uploader.service';
import { DeviceCommandBrokerService, DeviceCommandResponse } from '../events/device-command-broker.service';
import { StorageService } from '../content/storage.service';
import { createHash } from 'crypto';
import { deviceFileViewUrl } from './device-file-signature';

type QueuePayload = { jobId: string; attemptOffset?: number };
type CommandExecutionError = Error & {
  code: string;
  adbOutput: string;
  result?: Record<string, unknown>;
};

@Injectable()
export class JobQueueService implements OnModuleInit, OnModuleDestroy {
  private producerConnection?: IORedis;
  private workerConnection?: IORedis;
  private queue?: Queue<QueuePayload>;
  private deadLetterQueue?: Queue<QueuePayload & { error: string; failedAt: string }>;
  private worker?: Worker<QueuePayload>;

  constructor(
    private prisma: PrismaService,
    private events: EventsGateway,
    private uploader: PlatformUploaderService,
    @Optional() private commandBroker?: DeviceCommandBrokerService,
    @Optional() private storage?: StorageService,
  ) {}

  private redisAvailable = false;

  async onModuleInit() {
    try {
      const conn = new IORedis(redisConfig.url, {
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });

      const ready = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          conn.disconnect();
          resolve(false);
        }, 1500);
        conn.once('ready', () => {
          clearTimeout(timer);
          resolve(true);
        });
        conn.once('error', () => {
          clearTimeout(timer);
          conn.disconnect();
          resolve(false);
        });
      });

      if (ready) {
        this.producerConnection = conn;
        this.workerConnection = this.producerConnection.duplicate();
        this.redisAvailable = true;

        this.queue = new Queue<QueuePayload>('farm-phone-jobs', { connection: this.producerConnection });
        this.deadLetterQueue = new Queue('farm-phone-dead-letter', { connection: this.producerConnection });
        this.worker = new Worker<QueuePayload>('farm-phone-jobs', (job) => this.process(job as BullJob<QueuePayload>), {
          connection: this.workerConnection,
          concurrency: 1,
        });
        this.worker.on('failed', (job, error) => {
          if (job?.data.jobId) void this.handleAttemptFailure(job as BullJob<QueuePayload>, error);
        });
        await this.recoverPersistedJobs().catch(() => {});
        console.log('[Redis] Connected to Redis queue');
      } else {
        this.redisAvailable = false;
        console.warn('[Redis] Redis not reachable, operating in standalone Firebase in-memory mode');
      }
    } catch {
      this.redisAvailable = false;
      console.warn('[Redis] Redis not reachable, operating in standalone Firebase in-memory mode');
    }
  }

  async enqueue(jobId: string, scheduledAt?: Date | null, maxAttempts = 3, attemptOffset = 0) {
    const delay = scheduledAt ? Math.max(0, scheduledAt.getTime() - Date.now()) : 0;
    const totalAttempts = Math.max(1, Math.min(maxAttempts, 10));
    const normalizedOffset = Math.max(0, Math.min(attemptOffset, totalAttempts - 1));

    if (this.queue) {
      try {
        const existing = await this.queue.getJob(jobId);
        if (existing) return;
        await this.queue.add('execute', { jobId, attemptOffset: normalizedOffset }, {
          jobId,
          delay,
          attempts: totalAttempts - normalizedOffset,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        });
        await this.update(jobId, 'QUEUED');
        return;
      } catch {
        this.redisAvailable = false;
      }
    }

    // In-memory execution fallback when Redis is offline (Firebase Standalone Mode)
    await this.update(jobId, 'QUEUED');
    setTimeout(() => {
      const mockJob = {
        data: { jobId, attemptOffset: normalizedOffset },
        attemptsMade: 0,
        opts: { attempts: totalAttempts },
      } as unknown as BullJob<QueuePayload>;
      this.process(mockJob).catch((err) => this.handleAttemptFailure(mockJob, err));
    }, delay);
  }

  private async recoverPersistedJobs() {
    if (!this.queue) return;
    const interrupted = await this.prisma.job.findMany({
      where: { status: { in: ['CREATED', 'QUEUED', 'ASSIGNED', 'RUNNING', 'VERIFYING'] } },
      include: { device: true, deviceCommand: true },
      orderBy: { createdAt: 'asc' },
      take: 1_000,
    });
    for (const job of interrupted) {
      if (await this.queue.getJob(job.id)) continue;
      const attempts = Math.max(0, job.attempts || 0);
      const maxAttempts = Math.max(1, job.maxAttempts || 3);
      if (attempts >= maxAttempts) {
        const error = this.commandError('RECOVERY_ATTEMPTS_EXHAUSTED', 'Job หยุดระหว่าง Backend restart และใช้จำนวนครั้งครบแล้ว');
        await this.prisma.job.update({
          where: { id: job.id },
          data: { status: 'FAILED', completedAt: new Date(), errorCode: error.code, errorMessage: error.message },
        });
        if (job.deviceCommand) {
          await this.prisma.deviceCommand.update({
            where: { jobId: job.id },
            data: { status: 'FAILED', completedAt: new Date(), errorCode: error.code, errorMessage: error.message },
          });
        }
        if (job.device) {
          await this.prisma.device.update({ where: { id: job.device.id }, data: { adbStatus: 'ERROR', currentJobId: null } });
        }
        await this.logJob(job, 'ERROR', error.message, attempts, { recoveredAfterRestart: true }, error.code);
        await this.moveToDeadLetter(job.id, error);
        continue;
      }

      await this.enqueue(job.id, job.scheduledAt, maxAttempts, attempts);
      if (job.deviceCommand) {
        await this.prisma.deviceCommand.update({
          where: { jobId: job.id },
          data: { status: 'QUEUED', assignedAt: null, startedAt: null, completedAt: null },
        });
      }
      if (job.device?.currentJobId === job.id) {
        await this.prisma.device.update({
          where: { id: job.device.id },
          data: { adbStatus: this.restoredDeviceStatus(job.device), currentJobId: null },
        });
      }
      await this.logJob(job, 'WARN', 'กู้ Job กลับเข้า Queue หลัง Backend restart', attempts, {
        recoveredAfterRestart: true,
        remainingAttempts: maxAttempts - attempts,
      });
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.deadLetterQueue?.close();
    await this.producerConnection?.quit();
    await this.workerConnection?.quit();
  }

  async getDeadLetters(start = 0, end = 49) {
    if (!this.deadLetterQueue) throw new Error('Dead-letter queue is not ready');
    const jobs = await this.deadLetterQueue.getJobs(['waiting', 'completed', 'failed'], start, end, true);
    return jobs.map((job) => ({ id: job.id, data: job.data, timestamp: job.timestamp }));
  }

  async retryDeadLetter(deadLetterId: string) {
    if (!this.deadLetterQueue || !this.queue) throw new Error('Dead-letter queue is not ready');
    const deadLetter = await this.deadLetterQueue.getJob(deadLetterId);
    if (!deadLetter) throw new Error(`Dead-letter job ${deadLetterId} not found`);
    const original = await this.queue.getJob(deadLetter.data.jobId);
    if (original) await original.remove();
    await this.prisma.job.update({
      where: { id: deadLetter.data.jobId },
      data: { status: 'CREATED', attempts: 0, retryCount: 0, startedAt: null, completedAt: null, errorCode: null, errorMessage: null },
    });
    await this.prisma.deviceCommand.updateMany({
      where: { jobId: deadLetter.data.jobId },
      data: { status: 'CREATED', assignedAt: null, startedAt: null, completedAt: null, errorCode: null, errorMessage: null },
    });
    await this.enqueue(deadLetter.data.jobId);
    await deadLetter.remove();
    return { jobId: deadLetter.data.jobId, requeued: true };
  }

  private async process(queueJob: BullJob<QueuePayload>) {
    const job = await this.prisma.job.findUnique({
      where: { id: queueJob.data.jobId },
      include: { account: true, content: true, device: true, campaign: true, deviceCommand: true, uploadedFiles: true },
    });
    if (!job) throw new Error(`Job ${queueJob.data.jobId} not found`);

    // Firestore-backed Prisma proxy does not hydrate include relations.
    // Hydrate the device record explicitly so DEVICE_COMMAND jobs can route
    // to the registered Device Agent (deviceId === device code in this mode).
    if (!job.device && job.deviceId) {
      const device = await this.prisma.device.findUnique({ where: { id: String(job.deviceId) } });
      if (device) job.device = device;
    }

    if (job.status === 'SUCCESS' || job.status === 'CANCELLED') {
      return { skipped: true, status: job.status };
    }

    if (job.type === 'DEVICE_COMMAND') {
      return this.processDeviceCommand(queueJob, job);
    }

    await this.update(job.id, 'RUNNING', { startedAt: new Date() });

    if (job.type === 'UPLOAD_VIDEO') {
      if (!job.account || !job.content) throw new Error('Job ต้องมี Account และ Content');
      if (job.account.status !== 'ACTIVE' || job.account.authStatus !== 'VERIFIED') {
        await this.update(job.id, 'ACTION_REQUIRED', {
          errorCode: 'AUTH_OR_CHALLENGE_REQUIRED',
          errorMessage: 'กรุณาตรวจ Login, CAPTCHA หรือ OTP บนโทรศัพท์ก่อนเริ่มใหม่',
        });
        return { actionRequired: true };
      }
      const serial = job.device?.serialNumber || job.device?.code || job.account.assignedDeviceId || process.env.ANDROID_DEVICE_SERIAL;
      if (!serial) throw new Error('Account ยังไม่ได้ผูก Serial หรือ Device');
      const preparation = await this.uploader.prepare({
        jobId: job.id,
        serial,
        platform: job.account.platform,
        contentUrl: job.content.url,
        accountIdentifier: job.account.username,
        caption: job.content.caption,
      });
      const metadata = typeof job.metadata === 'object' && job.metadata ? job.metadata : {};
      await this.update(job.id, 'ACTION_REQUIRED', {
        errorCode: preparation.ui.challenge ? preparation.ui.state : 'PRE_PUBLISH_REVIEW',
        errorMessage: preparation.instructions,
        metadata: { ...metadata, preparation },
      });
      return preparation;
    }

    await this.update(job.id, 'SUCCESS', { completedAt: new Date() });
    return { completed: true };
  }

  private async processDeviceCommand(queueJob: BullJob<QueuePayload>, job: any) {
    if (!job.device) throw this.commandError('DEVICE_NOT_FOUND', 'Job does not reference a physical device');
    const parameters = this.record(job.parameters);
    const command = String(parameters.command || job.deviceCommand?.command || '');
    const backendOnly = command === 'VIEW_JOB_LOG';
    if (!backendOnly && !this.commandBroker) throw this.commandError('COMMAND_BROKER_UNAVAILABLE', 'Device command broker ไม่พร้อม');
    if (['SCREENSHOT', 'PUSH_FILE', 'RUN_SINGLE_DEVICE_TEST', 'AUTOMATION_SEQUENCE'].includes(command) && !this.storage) {
      throw this.commandError('STORAGE_UNAVAILABLE', 'Storage service ไม่พร้อม');
    }
    const attemptNumber = (queueJob.data.attemptOffset || 0) + queueJob.attemptsMade + 1;
    const startedAt = job.startedAt || new Date();

    await this.prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'ASSIGNED',
        attempts: attemptNumber,
        retryCount: Math.max(0, attemptNumber - 1),
        startedAt,
        errorCode: null,
        errorMessage: null,
      },
    });
    await this.prisma.deviceCommand.update({
      where: { jobId: job.id },
      data: { status: 'ASSIGNED', assignedAt: new Date(), errorCode: null, errorMessage: null },
    });
    this.events.emitJobUpdate({ ...job, status: 'ASSIGNED', attempts: attemptNumber, startedAt });
    if (!backendOnly) {
      await this.prisma.device.update({ where: { id: job.device.id }, data: { adbStatus: 'BUSY', currentJobId: job.id } });
    }
    await this.logJob(job, 'INFO', backendOnly ? `ประมวลผล ${command} จากฐานข้อมูล` : `มอบหมาย ${command} ให้ Device Agent`, attemptNumber);
    await this.updateMvpAgents(job.organizationId, job.id, {
      DEVICE: backendOnly ? 'WAITING' : 'WORKING',
      QA: 'WAITING',
      LOG: 'WORKING',
    });

    await this.update(job.id, 'RUNNING');
    await this.prisma.deviceCommand.update({ where: { jobId: job.id }, data: { status: 'RUNNING', startedAt: new Date() } });
    let result: Record<string, unknown>;
    if (backendOnly) {
      result = await this.readJobLogResult(job, parameters);
    } else {
      const response = await this.dispatchDeviceCommand(job, command, parameters, attemptNumber);
      result = await this.verifyDeviceResult(job, command, parameters, response);
    }

    if (String(result.status || '').toUpperCase() === 'ACTION_REQUIRED') {
      return this.pauseForOperator(job, result, attemptNumber);
    }

    await this.update(job.id, 'VERIFYING');
    await this.prisma.deviceCommand.update({ where: { jobId: job.id }, data: { status: 'VERIFYING' } });
    await this.updateMvpAgents(job.organizationId, job.id, { DEVICE: 'SUCCESS', QA: 'WORKING', LOG: 'WORKING' });

    const completedAt = new Date();
    const updated = await this.update(job.id, 'SUCCESS', { result, completedAt, errorCode: null, errorMessage: null });
    await this.prisma.deviceCommand.update({
      where: { jobId: job.id },
      data: { status: 'SUCCESS', result: result as any, completedAt, errorCode: null, errorMessage: null },
    });
    if (!backendOnly) {
      await this.prisma.device.update({
        where: { id: job.device.id },
        data: { adbStatus: this.restoredDeviceStatus(job.device, result), currentJobId: null },
      });
    }
    await this.logJob(job, 'INFO', `${command} ผ่านการ Verify`, attemptNumber, { result });
    await this.updateMvpAgents(job.organizationId, job.id, { DEVICE: 'SUCCESS', QA: 'SUCCESS', LOG: 'SUCCESS' });
    return updated;
  }

  private async dispatchDeviceCommand(job: any, command: string, parameters: Record<string, unknown>, attemptNumber: number) {
    const connected = typeof (this.events as EventsGateway & { isNodeConnected?: (nodeId: string) => boolean }).isNodeConnected === 'function'
      ? (this.events as EventsGateway & { isNodeConnected: (nodeId: string) => boolean }).isNodeConnected(job.device.nodeId)
      : true;
    if (!connected) throw this.commandError('DEVICE_AGENT_OFFLINE', `Device Agent ${job.device.nodeId} ไม่ได้เชื่อมต่อ`);
    const timeoutMs = command === 'REBOOT_DEVICE'
      ? 150_000
      : command === 'RUN_SINGLE_DEVICE_TEST'
        ? 240_000
        : command === 'AUTOMATION_SEQUENCE'
          ? 900_000
          : 75_000;
    const responsePromise = this.commandBroker!.waitFor(job.id, timeoutMs, command, attemptNumber);
    try {
      this.events.emitDeviceCommand(job.device.nodeId, {
        jobId: job.id,
        deviceId: job.device.id,
        deviceCode: job.device.code,
        command,
        parameters: await this.agentParameters(parameters),
        attemptNumber,
      });
    } catch (error) {
      this.commandBroker!.reject(job.id, error instanceof Error ? error : new Error(String(error)));
    }
    const response = await responsePromise;
    if (response.error) {
      const detail = typeof response.error === 'string' ? { message: response.error } : response.error;
      const error = this.commandError(detail.code || 'DEVICE_COMMAND_FAILED', detail.message || 'Device command failed', detail.adbOutput || '');
      const responseResult = this.record(response.result);
      if (Object.keys(responseResult).length) error.result = responseResult;
      throw error;
    }
    return response;
  }

  private async agentParameters(parameters: Record<string, unknown>) {
    if (parameters.command !== 'PUSH_FILE' && parameters.command !== 'RUN_SINGLE_DEVICE_TEST') return parameters;
    const file = this.record(parameters.file);
    const uploadedFileId = String(file.uploadedFileId || '');
    if (!uploadedFileId) throw this.commandError('UPLOADED_FILE_NOT_FOUND', `${String(parameters.command)} ไม่มี uploadedFileId`);
    const requestedDirectory = String(parameters.destination || '').replace(/\/+$/, '');
    const storedDestination = String(file.destination || '');
    return {
      ...parameters,
      file: undefined,
      filename: file.filename,
      size: file.size,
      checksum: file.checksum,
      destination: requestedDirectory || storedDestination.replace(/\/[^/]+$/, ''),
      downloadPath: `/api/v1/devices/files/${uploadedFileId}/download`,
    };
  }

  private async verifyDeviceResult(
    job: any,
    command: string,
    parameters: Record<string, unknown>,
    response: DeviceCommandResponse,
  ): Promise<Record<string, unknown>> {
    let raw = this.record(response.result);
    if (command === 'AUTOMATION_SEQUENCE') {
      raw = await this.verifyAutomationSequence(job, parameters, response, raw);
    }
    if (String(raw.status || '').toUpperCase() === 'ACTION_REQUIRED') return raw;
    if (command === 'HEALTH_CHECK') {
      if (!['PASS', 'WARNING'].includes(String(raw.result))) throw this.commandError('HEALTH_CHECK_FAILED', 'Health Check รายงาน FAIL');
      const checks = this.record(raw.checks);
      if (checks.adbConnection !== 'PASS' || checks.authorization !== 'PASS') {
        throw this.commandError('HEALTH_CHECK_FAILED', 'Health Check ไม่ยืนยัน ADB connection และ authorization');
      }
      return raw;
    }
    if (command === 'SCREENSHOT') {
      const encoded = String(raw.screenshotBase64 || '');
      const buffer = Buffer.from(encoded, 'base64');
      if (buffer.length < 100 || buffer.subarray(1, 4).toString() !== 'PNG') throw this.commandError('SCREENSHOT_INVALID', 'ผลลัพธ์ Screenshot ไม่ใช่ PNG จริง');
      const calculated = createHash('sha256').update(buffer).digest('hex');
      if (raw.checksum && calculated !== raw.checksum) throw this.commandError('SCREENSHOT_CHECKSUM_MISMATCH', 'Checksum Screenshot ไม่ตรง');
      const stored = await this.storage!.storeEvidence(buffer, job.id);
      const uploaded = await this.prisma.uploadedFile.create({
        data: {
          organizationId: job.organizationId,
          deviceId: job.device.id,
          jobId: job.id,
          filename: `${job.device.code}-${Date.now()}.png`,
          mimeType: 'image/png',
          size: BigInt(buffer.length),
          checksum: calculated,
          storageKey: stored.objectName,
          url: stored.url,
          status: 'CAPTURED',
        },
      });
      const signedView = deviceFileViewUrl(uploaded.id);
      return { screenshotUrl: signedView.url, uploadedFileId: uploaded.id, size: buffer.length, checksum: calculated, screenshotUrlExpiresAt: signedView.expiresAt };
    }
    if (command === 'OPEN_APP' && raw.verifiedRunning !== true) throw this.commandError('OPEN_APP_VERIFICATION_FAILED', 'Device Agent ไม่ยืนยันว่าแอปเปิดอยู่');
    if (command === 'STOP_APP' && raw.verifiedStopped !== true) throw this.commandError('STOP_APP_VERIFICATION_FAILED', 'Device Agent ไม่ยืนยันว่าแอปหยุดแล้ว');
    if (command === 'RESTART_APP' && (raw.verifiedStopped !== true || raw.verifiedRunning !== true)) {
      throw this.commandError('RESTART_APP_VERIFICATION_FAILED', 'Device Agent ไม่ยืนยันทั้งการหยุดและเปิดแอปใหม่');
    }
    if (command === 'REBOOT_DEVICE' && raw.bootCompleted !== true) throw this.commandError('REBOOT_VERIFICATION_FAILED', 'Device Agent ไม่ยืนยันว่า reboot สำเร็จ');
    if (command === 'PUSH_FILE') {
      const expected = this.record(parameters.file);
      if (Number(raw.size) !== Number(expected.size)) throw this.commandError('DESTINATION_SIZE_MISMATCH', 'ขนาดไฟล์ปลายทางไม่ตรง');
      if (String(raw.checksum) !== String(expected.checksum)) throw this.commandError('DESTINATION_CHECKSUM_MISMATCH', 'Checksum ไฟล์ปลายทางไม่ตรง');
      await this.prisma.uploadedFile.update({
        where: { id: String(expected.uploadedFileId) },
        data: { status: 'PUSHED', destination: String(raw.destination || expected.destination) },
      });
    }
    if (command === 'VIEW_DEVICE_STATUS') {
      const deviceCode = String(raw.deviceCode || raw.code || '');
      const serialNumber = String(raw.serialNumber || '');
      const status = String(raw.adbStatus || raw.status || '').toUpperCase();
      const authorization = String(raw.authorization || raw.adbAuthorization || '').toUpperCase();
      if (deviceCode !== job.device.code || !serialNumber) {
        throw this.commandError('DEVICE_STATUS_IDENTITY_MISMATCH', `Device status does not confirm ${job.device.code}/ADB serial identity`);
      }
      if (job.device.serialNumber && serialNumber !== job.device.serialNumber) {
        throw this.commandError('DEVICE_STATUS_SERIAL_MISMATCH', 'Serial Number จาก Device Agent ไม่ตรงกับฐานข้อมูล');
      }
      if (!['OFFLINE', 'CONNECTING', 'ONLINE', 'BUSY', 'WARNING', 'ERROR'].includes(status)) {
        throw this.commandError('DEVICE_STATUS_INVALID', `Device Agent ส่งสถานะที่ไม่รองรับ: ${status || '(empty)'}`);
      }
      if (!['PASS', 'AUTHORIZED', 'DEVICE'].includes(authorization)) {
        throw this.commandError('ADB_UNAUTHORIZED', 'Device status ไม่ยืนยัน ADB authorization');
      }
      return { ...raw, deviceCode, serialNumber, adbStatus: status, authorization };
    }
    if (command === 'RUN_SINGLE_DEVICE_TEST') {
      const reportStatus = String(raw.status || raw.result || '').toUpperCase();
      if (reportStatus !== 'PASS') {
        const error = this.commandError('SINGLE_DEVICE_TEST_FAILED', 'RUN_SINGLE_DEVICE_TEST รายงาน FAIL');
        error.result = raw;
        throw error;
      }
      const health = await this.verifyDeviceResult(job, 'HEALTH_CHECK', parameters, { ...response, result: this.record(raw.health) });
      const screenshot = await this.verifyDeviceResult(job, 'SCREENSHOT', parameters, { ...response, result: this.record(raw.screenshot) });
      const openApp = await this.verifyDeviceResult(job, 'OPEN_APP', parameters, { ...response, result: this.record(raw.openApp) });
      const pushFile = await this.verifyDeviceResult(job, 'PUSH_FILE', parameters, { ...response, result: this.record(raw.pushFile) });
      const stopApp = await this.verifyDeviceResult(job, 'STOP_APP', parameters, { ...response, result: this.record(raw.stopApp) });
      const steps = Array.isArray(raw.steps) ? raw.steps : [];
      if (steps.length < 13) {
        throw this.commandError('SINGLE_DEVICE_REPORT_INCOMPLETE', 'รายงาน RUN_SINGLE_DEVICE_TEST มีขั้นตอนไม่ครบ 13 ขั้น');
      }
      return { ...raw, status: 'PASS', health, screenshot, openApp, pushFile, stopApp };
    }
    return raw;
  }

  private async verifyAutomationSequence(
    job: any,
    parameters: Record<string, unknown>,
    response: DeviceCommandResponse,
    raw: Record<string, unknown>,
  ) {
    const result = await this.persistSequenceEvidence(job, response, raw);
    const status = String(result.status || '').toUpperCase();
    const steps = Array.isArray(result.steps) ? result.steps.map((step) => this.record(step)) : [];
    const expectedSteps = Array.isArray(parameters.steps) ? parameters.steps.length : 0;
    if (!['SUCCESS', 'FAILED', 'ACTION_REQUIRED'].includes(status)) {
      throw this.commandError('AUTOMATION_RESULT_INVALID', `Device Agent returned invalid automation status ${status || '(empty)'}`);
    }
    if (steps.length === 0 || steps.length > expectedSteps || Number(result.totalSteps) !== expectedSteps) {
      const error = this.commandError('AUTOMATION_RESULT_INCOMPLETE', `Automation result contains ${steps.length}/${expectedSteps} step results`);
      error.result = result;
      throw error;
    }
    await this.logAutomationSteps(job, steps, Number(response.attemptNumber || job.attempts || 1));
    if (status === 'SUCCESS' && (steps.length !== expectedSteps || steps.some((step) => step.status !== 'SUCCESS'))) {
      const error = this.commandError('AUTOMATION_RESULT_INCONSISTENT', 'Automation reported SUCCESS without successful evidence for every step');
      error.result = result;
      throw error;
    }
    if (status === 'FAILED') {
      const failure = this.record(result.failureReason);
      const error = this.commandError(
        String(failure.code || 'AUTOMATION_SEQUENCE_FAILED'),
        String(failure.message || 'Automation sequence failed'),
        String(failure.adbOutput || ''),
      );
      error.result = result;
      throw error;
    }
    return result;
  }

  private async logAutomationSteps(job: any, steps: Record<string, any>[], attemptNumber: number) {
    for (const step of steps) {
      const status = String(step.status || 'UNKNOWN').toUpperCase();
      const failure = this.record(step.failureReason);
      const evidence = this.record(step.evidence);
      await this.logJob(
        job,
        status === 'SUCCESS' ? 'INFO' : status === 'ACTION_REQUIRED' ? 'WARN' : 'ERROR',
        `Automation step ${Number(step.index) + 1} ${String(step.command || '(unknown)')} → ${status}`,
        attemptNumber,
        {
          stepIndex: step.index,
          stepId: step.id,
          command: step.command,
          status,
          durationMs: step.durationMs,
          selectorUsed: this.record(step.output).selectorUsed || null,
          evidence,
          failureReason: Object.keys(failure).length ? failure : null,
        },
        failure.code ? String(failure.code) : undefined,
        failure.adbOutput ? String(failure.adbOutput) : undefined,
      );
    }
  }

  private async persistSequenceEvidence(
    job: any,
    response: DeviceCommandResponse,
    raw: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const steps = Array.isArray(raw.steps) ? raw.steps : [];
    const persisted: Record<string, unknown>[] = [];
    for (const value of steps) {
      const step = this.record(value);
      const evidence = this.record(step.evidence);
      const storedEvidence: Record<string, unknown> = {};
      for (const [name, item] of Object.entries(evidence)) {
        const screenshot = this.record(item);
        storedEvidence[name] = screenshot.screenshotBase64
          ? await this.verifyDeviceResult(job, 'SCREENSHOT', {}, { ...response, result: screenshot })
          : item;
      }
      const output = this.record(step.output);
      const storedOutput = output.screenshotBase64
        ? await this.verifyDeviceResult(job, 'SCREENSHOT', {}, { ...response, result: output })
        : step.output;
      persisted.push({
        ...step,
        ...(step.output !== undefined ? { output: storedOutput } : {}),
        ...(Object.keys(storedEvidence).length ? { evidence: storedEvidence } : {}),
      });
    }
    return { ...raw, steps: persisted };
  }

  private async pauseForOperator(job: any, result: Record<string, unknown>, attemptNumber: number) {
    const failure = this.record(result.failureReason);
    const errorCode = String(failure.code || 'ACTION_REQUIRED');
    const errorMessage = String(failure.message || 'Automation paused for operator action');
    const updated = await this.update(job.id, 'ACTION_REQUIRED', {
      result,
      errorCode,
      errorMessage,
      completedAt: null,
    });
    await this.prisma.deviceCommand.update({
      where: { jobId: job.id },
      data: { status: 'ACTION_REQUIRED', result: result as any, errorCode, errorMessage, completedAt: null },
    });
    await this.prisma.device.update({
      where: { id: job.device.id },
      data: { adbStatus: this.restoredDeviceStatus(job.device), currentJobId: null },
    });
    await this.logJob(job, 'WARN', errorMessage, attemptNumber, { actionRequired: failure.actionRequired || null }, errorCode);
    await this.updateMvpAgents(job.organizationId, job.id, { DEVICE: 'WAITING', QA: 'WAITING', LOG: 'SUCCESS' });
    return updated;
  }

  private async readJobLogResult(job: any, parameters: Record<string, unknown>) {
    const requestedJobId = String(parameters.jobId || parameters.targetJobId || '').trim();
    const limit = Math.max(1, Math.min(100, Math.trunc(Number(parameters.limit) || 50)));
    const target = requestedJobId
      ? await this.prisma.job.findFirst({
        where: { id: requestedJobId, organizationId: job.organizationId, deviceId: job.device.id },
      })
      : await this.prisma.job.findFirst({
        where: { organizationId: job.organizationId, deviceId: job.device.id, id: { not: job.id } },
        orderBy: { createdAt: 'desc' },
      });
    if (requestedJobId && !target) {
      throw this.commandError('JOB_LOG_NOT_FOUND', `ไม่พบ Job ${requestedJobId} ของ ${job.device.code}`);
    }
    if (!target) return { targetJob: null, logs: [], count: 0 };
    const logs = await this.prisma.jobLog.findMany({
      where: { organizationId: job.organizationId, deviceId: job.device.id, jobId: target.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return this.jsonSafe({
      targetJob: {
        id: target.id,
        status: target.status,
        attempts: target.attempts,
        maxAttempts: target.maxAttempts,
        errorCode: target.errorCode,
        errorMessage: target.errorMessage,
        startedAt: target.startedAt,
        completedAt: target.completedAt,
        createdAt: target.createdAt,
      },
      logs,
      count: logs.length,
    });
  }

  private async handleAttemptFailure(queueJob: BullJob<QueuePayload>, error: Error) {
    if (typeof this.prisma?.job?.findUnique !== 'function') return;
    const job = await this.prisma.job.findUnique({ where: { id: queueJob.data.jobId }, include: { device: true, deviceCommand: true } });
    if (!job) return;
    const attemptOffset = queueJob.data.attemptOffset || 0;
    const maxAttempts = attemptOffset + (typeof queueJob.opts.attempts === 'number' ? queueJob.opts.attempts : job.maxAttempts);
    const attemptNumber = attemptOffset + queueJob.attemptsMade;
    const finalAttempt = attemptNumber >= maxAttempts;
    const commandFailure = error as Error & { code?: string; adbOutput?: string; result?: Record<string, unknown> };
    const errorCode = String(commandFailure.code || 'DEVICE_COMMAND_FAILED');
    const adbOutput = String(commandFailure.adbOutput || '');
    const status = finalAttempt ? 'FAILED' : 'QUEUED';
    await this.prisma.job.update({
      where: { id: job.id },
      data: {
        status,
        attempts: attemptNumber,
        retryCount: Math.max(0, attemptNumber - 1),
        completedAt: finalAttempt ? new Date() : null,
        errorCode,
        errorMessage: error.message,
        ...(commandFailure.result ? { result: commandFailure.result as any } : {}),
      },
    });
    if (job.deviceCommand) {
      await this.prisma.deviceCommand.update({
        where: { jobId: job.id },
        data: { status, completedAt: finalAttempt ? new Date() : null, errorCode, errorMessage: error.message },
      });
    }
    const backendOnly = job.deviceCommand?.command === 'VIEW_JOB_LOG';
    if (job.device && !backendOnly) {
      await this.prisma.device.update({
        where: { id: job.device.id },
        data: { adbStatus: finalAttempt ? 'ERROR' : this.restoredDeviceStatus(job.device), currentJobId: null },
      });
    }
    await this.logJob(job, 'ERROR', `Attempt ${attemptNumber}/${maxAttempts} ล้มเหลว: ${error.message}`, attemptNumber, { errorCode }, errorCode, adbOutput);
    await this.updateMvpAgents(job.organizationId, job.id, { DEVICE: finalAttempt ? 'ERROR' : 'WARNING', QA: 'ERROR', LOG: finalAttempt ? 'ERROR' : 'WARNING' });
    this.events.emitJobUpdate({
      ...job,
      status,
      attempts: attemptNumber,
      errorCode,
      errorMessage: error.message,
      ...(commandFailure.result ? { result: commandFailure.result } : {}),
    });
    if (finalAttempt) await this.moveToDeadLetter(job.id, error);
  }

  private async update(id: string, status: string, data: Record<string, unknown> = {}) {
    const job = await this.prisma.job.update({ where: { id }, data: { status, ...data } });
    this.events.emitJobUpdate(job);
    return job;
  }

  private async moveToDeadLetter(id: string, error: Error) {
    await this.deadLetterQueue?.add('dead-letter', {
      jobId: id,
      error: error.message,
      failedAt: new Date().toISOString(),
    }, {
      jobId: `${id}-${Date.now()}`,
      removeOnComplete: false,
      removeOnFail: false,
    });
    this.events.emitJobUpdate({ id, status: 'FAILED', deadLetter: true, error: error.message });
  }

  private async logJob(
    job: { id: string; organizationId: string; deviceId?: string | null },
    level: string,
    message: string,
    attemptNumber?: number,
    metadata?: Record<string, unknown>,
    errorCode?: string,
    adbOutput?: string,
  ) {
    const [jobLog] = await Promise.all([
      this.prisma.jobLog.create({
        data: { organizationId: job.organizationId, jobId: job.id, deviceId: job.deviceId, level, message, attemptNumber, metadata: metadata as any, errorCode, adbOutput },
      }),
      this.prisma.log.create({
        data: {
          organizationId: job.organizationId,
          jobId: job.id,
          deviceId: job.deviceId,
          level: level === 'WARNING' ? 'WARN' : level,
          category: 'job',
          message,
          metadata: { attemptNumber: attemptNumber ?? null, errorCode: errorCode || null, adbOutput: adbOutput || null, ...(metadata || {}) } as any,
        },
      }),
    ]);
    return jobLog;
  }

  private async updateMvpAgents(organizationId: string, jobId: string, states: Record<string, string>) {
    for (const [role, status] of Object.entries(states)) {
      const code = `16bit.${role}`;
      const agent = await this.prisma.aIAgent.upsert({
        where: { organizationId_code: { organizationId, code } },
        update: { status, lastActivityAt: new Date() },
        create: { organizationId, code, name: role, role, status },
      });
      const task = await this.prisma.agentTask.findFirst({
        where: { agentId: agent.id, type: 'DEVICE_COMMAND', input: { path: ['jobId'], equals: jobId } },
      });
      if (task) {
        await this.prisma.agentTask.update({
          where: { id: task.id },
          data: {
            status: status === 'WORKING' ? 'IN_PROGRESS' : status === 'SUCCESS' ? 'COMPLETED' : status === 'ERROR' ? 'FAILED' : 'PENDING',
            startedAt: status === 'WORKING' ? task.startedAt || new Date() : task.startedAt,
            completedAt: status === 'SUCCESS' || status === 'ERROR' ? new Date() : null,
            error: status === 'ERROR' ? 'Device command failed' : null,
          },
        });
      }
      const terminal = status === 'SUCCESS' || status === 'ERROR';
      await this.prisma.aIAgent.update({
        where: { id: agent.id },
        data: { currentTaskId: terminal ? null : task?.id || agent.currentTaskId || null },
      });
      await this.prisma.agentEvent.create({ data: { agentId: agent.id, eventType: 'JOB_STATE_CHANGED', message: `${jobId} → ${status}`, metadata: { jobId, status } } });
      this.events.emitAgentState({ organizationId, code, status, currentTaskId: terminal ? null : task?.id || null, jobId });
    }
  }

  private record(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  private restoredDeviceStatus(device: Record<string, any>, result: Record<string, unknown> = {}) {
    const health = this.record(result.health);
    if (String(result.adbStatus || '').toUpperCase() === 'WARNING') return 'WARNING';
    if (String(result.result || health.result || '').toUpperCase() === 'WARNING') return 'WARNING';
    if (String(device.adbStatus || '').toUpperCase() === 'WARNING') return 'WARNING';
    const battery = Number(device.battery);
    const storageUsed = Number(device.storageUsed || 0);
    const storageTotal = Number(device.storageTotal || 0);
    const batteryThreshold = Number(process.env.BATTERY_WARNING_LEVEL || 15);
    const storageThreshold = Number(process.env.STORAGE_WARNING_PERCENT || 90);
    if (battery > 0 && battery <= batteryThreshold) return 'WARNING';
    if (storageTotal > 0 && (storageUsed / storageTotal) * 100 >= storageThreshold) return 'WARNING';
    return 'ONLINE';
  }

  private jsonSafe<T>(value: T): T {
    return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)) as T;
  }

  private commandError(code: string, message: string, adbOutput = ''): CommandExecutionError {
    const error = new Error(message) as CommandExecutionError;
    error.code = code;
    error.adbOutput = adbOutput;
    return error;
  }
}
