import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../content/storage.service';
import { JobQueueService } from './job-queue.service';
import { EventsGateway } from '../events/events.gateway';

export const DEVICE_COMMANDS = [
  'HEALTH_CHECK',
  'SCREENSHOT',
  'OPEN_APP',
  'STOP_APP',
  'RESTART_APP',
  'PUSH_FILE',
  'REBOOT_DEVICE',
  'TAP',
  'TAP_UI',
  'SWIPE',
  'TYPE_TEXT',
  'KEYEVENT',
  'BACK',
  'HOME',
  'WAIT_UI',
  'DUMP_UI',
  'AUTOMATION_SEQUENCE',
  'VIEW_DEVICE_STATUS',
  'VIEW_JOB_LOG',
  'RUN_SINGLE_DEVICE_TEST',
  'VIDEO_CREATE',
] as const;
export type DeviceCommandName = typeof DEVICE_COMMANDS[number];

const ACTIVE_JOB_STATUSES = ['CREATED', 'QUEUED', 'ASSIGNED', 'RUNNING', 'VERIFYING'] as const;

import { VideoCreationQueueService } from '../video-processing/video-creation-queue.service';

type UploadFile = { originalname: string; mimetype: string; buffer: Buffer; size: number };

@Injectable()
export class SingleDeviceCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly queue: JobQueueService,
    private readonly events: EventsGateway,
    private readonly videoQueue: VideoCreationQueueService,
  ) {}

  async create(
    deviceCode: string,
    input: {
      command?: string;
      parameters?: unknown;
      idempotencyKey?: string;
      context?: Record<string, unknown>;
    },
    headerIdempotencyKey?: string,
    file?: UploadFile,
  ) {
    const command = String(input.command || '').toUpperCase() as DeviceCommandName;
    if (!DEVICE_COMMANDS.includes(command)) throw new BadRequestException(`ไม่รองรับคำสั่ง ${command || '(empty)'}`);
    if (command === 'PUSH_FILE' && !file) throw new BadRequestException('PUSH_FILE ต้องแนบไฟล์ใน field ชื่อ file');
    if (command !== 'PUSH_FILE' && command !== 'RUN_SINGLE_DEVICE_TEST' && file) {
      throw new BadRequestException(`คำสั่ง ${command} ไม่รับไฟล์`);
    }

    const device = await this.prisma.device.findUnique({ where: { code: deviceCode } });
    if (!device) throw new NotFoundException(`ยังไม่พบอุปกรณ์ ${deviceCode} กรุณาเริ่ม Device Agent หรือตรวจสอบสถานะเครื่อง`);

    const idempotencyKey = String(headerIdempotencyKey || input.idempotencyKey || randomUUID()).trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new BadRequestException('Idempotency key ต้องมีความยาว 1-200 ตัวอักษร');
    }
    const duplicate = await this.prisma.job.findFirst({
      where: { organizationId: device.organizationId, idempotencyKey },
      include: { deviceCommand: true, uploadedFiles: true, logs: { orderBy: { createdAt: 'desc' } } },
    });
    if (duplicate) return this.duplicateResult(duplicate);

    if (command === 'VIDEO_CREATE') {
      const params = (input.parameters as any) || {};
      const res = await this.videoQueue.enqueueVideoJob(device.organizationId, {
        brief: params.brief || 'สร้างวิดีโอ TikTok SNG EXPRESS ขนส่งไทย-ลาว',
        brandName: params.brandName || 'SNG EXPRESS',
        language: params.language || 'th',
        durationSeconds: params.durationSeconds || 25,
        aspectRatio: params.aspectRatio || '9:16',
        resolution: params.resolution || '1080x1920',
        tone: params.tone,
        callToAction: params.callToAction,
      }, idempotencyKey);
      return res;
    }

    const activeCommand = await this.prisma.deviceCommand.findFirst({
      where: { deviceId: device.id, status: { in: [...ACTIVE_JOB_STATUSES] } },
      include: { job: { include: { deviceCommand: true, uploadedFiles: true, logs: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (activeCommand) {
      const activeJob = activeCommand.job || await this.prisma.job.findUnique({ where: { id: activeCommand.jobId } });
      return { job: activeJob, duplicate: true, queued: true, reason: 'DEVICE_ALREADY_BUSY' };
    }

    const parameters = this.parameters(input.parameters);
    let uploadFile = file;
    if (command === 'RUN_SINGLE_DEVICE_TEST' && !uploadFile) {
      const buffer = Buffer.from(`FARM PHONE ${deviceCode} single-device test\n${new Date().toISOString()}\n`, 'utf8');
      uploadFile = {
        originalname: 'farm-phone-single-device-test.txt',
        mimetype: 'text/plain',
        buffer,
        size: buffer.length,
      };
    }

    let stored: Awaited<ReturnType<StorageService['upload']>> | null = null;
    let fileMetadata: { filename: string; size: number; checksum: string; destination: string } | null = null;
    if (uploadFile) {
      if (uploadFile.size <= 0) throw new BadRequestException('ไฟล์ว่าง ไม่สามารถส่งเข้าโทรศัพท์ได้');
      const filename = deviceSafeFilename(uploadFile.originalname);
      stored = await this.storage.upload(uploadFile);
      fileMetadata = {
        filename,
        size: uploadFile.size,
        checksum: createHash('sha256').update(uploadFile.buffer).digest('hex'),
        destination: `/sdcard/Download/FarmPhone/${filename}`,
      };
    }

    let job: any;
    try {
      job = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.job.create({
          data: {
            organizationId: device.organizationId,
            deviceId: device.id,
            type: 'DEVICE_COMMAND',
            status: 'CREATED',
            parameters: { command, ...parameters, ...(fileMetadata ? { file: fileMetadata } : {}) },
            metadata: {
              ...(input.context || {}),
              source: String(input.context?.source || 'SINGLE_DEVICE_DASHBOARD'),
              deviceCode,
            },
            attempts: 0,
            maxAttempts: 3,
            retryCount: 0,
            maxRetries: 3,
            idempotencyKey,
          },
        });
        let uploadedFileId: string | null = null;
        if (stored && fileMetadata && uploadFile) {
          const uploaded = await transaction.uploadedFile.create({
            data: {
              organizationId: device.organizationId,
              deviceId: device.id,
              jobId: created.id,
              filename: fileMetadata.filename,
              mimeType: uploadFile.mimetype || 'application/octet-stream',
              size: BigInt(fileMetadata.size),
              checksum: fileMetadata.checksum,
              storageKey: stored.objectName,
              url: stored.url,
              destination: fileMetadata.destination,
              status: 'STORED',
            },
          });
          uploadedFileId = uploaded.id;
        }
        const finalParameters = {
          command,
          ...parameters,
          ...(fileMetadata ? { file: { ...fileMetadata, uploadedFileId } } : {}),
        };
        const updated = await transaction.job.update({ where: { id: created.id }, data: { parameters: finalParameters } });
        await transaction.deviceCommand.create({
          data: {
            organizationId: device.organizationId,
            deviceId: device.id,
            jobId: created.id,
            command,
            parameters: finalParameters,
            status: 'CREATED',
          },
        });
        await transaction.jobLog.create({
          data: {
            organizationId: device.organizationId,
            jobId: created.id,
            deviceId: device.id,
            level: 'INFO',
            message: `สร้างคำสั่ง ${command} สำหรับ ${deviceCode}`,
            attemptNumber: 0,
          },
        });
        return updated;
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const racedDuplicate = await this.prisma.job.findFirst({
          where: { organizationId: device.organizationId, idempotencyKey },
          include: { deviceCommand: true, uploadedFiles: true, logs: { orderBy: { createdAt: 'desc' } } },
        });
        if (racedDuplicate) return this.duplicateResult(racedDuplicate);
      }
      throw error;
    }

    await this.initializeMvpAgents(device.organizationId, job.id, command, deviceCode);
    try {
      await this.queue.enqueue(job.id, null, job.maxAttempts);
      await this.prisma.deviceCommand.update({ where: { jobId: job.id }, data: { status: 'QUEUED' } });
    } catch (error) {
      const message = this.message(error);
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: 'FAILED', completedAt: new Date(), errorCode: 'QUEUE_UNAVAILABLE', errorMessage: message },
      });
      await this.prisma.deviceCommand.update({
        where: { jobId: job.id },
        data: { status: 'FAILED', completedAt: new Date(), errorCode: 'QUEUE_UNAVAILABLE', errorMessage: message },
      });
      await Promise.all([
        this.prisma.jobLog.create({
          data: {
            organizationId: device.organizationId,
            jobId: job.id,
            deviceId: device.id,
            level: 'ERROR',
            message: `ส่ง Job เข้า Queue ไม่สำเร็จ: ${message}`,
            attemptNumber: 0,
            errorCode: 'QUEUE_UNAVAILABLE',
          },
        }),
        this.prisma.log.create({
          data: {
            organizationId: device.organizationId,
            deviceId: device.id,
            jobId: job.id,
            level: 'ERROR',
            category: 'job',
            message: `ส่ง Job เข้า Queue ไม่สำเร็จ: ${message}`,
            metadata: { errorCode: 'QUEUE_UNAVAILABLE' },
          },
        }),
      ]);
      await this.failMvpAgents(device.organizationId, job.id, message);
      throw new ServiceUnavailableException(`ส่ง Job เข้า Redis ไม่สำเร็จ: ${message}`);
    }

    const result = await this.prisma.job.findUnique({
      where: { id: job.id },
      include: { deviceCommand: true, uploadedFiles: true, logs: { orderBy: { createdAt: 'desc' } } },
    });
    this.events.emitJobUpdate(result);
    return { job: result, duplicate: false, queued: true };
  }

  async downloadFile(fileId: string) {
    const file = await this.prisma.uploadedFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException(`Uploaded file ${fileId} not found`);
    const buffer = await this.storage.downloadBuffer(file.url || `minio://${process.env.MINIO_BUCKET || 'farm-phone-media'}/${file.storageKey}`);
    return { file, buffer };
  }

  private async initializeMvpAgents(organizationId: string, jobId: string, command: string, deviceCode: string) {
    const roles = ['MANAGER', 'DEVICE', 'QA', 'LOG'] as const;
    for (const role of roles) {
      const code = `16bit.${role}`;
      const status = role === 'MANAGER' ? 'SUCCESS' : role === 'LOG' ? 'WORKING' : 'WAITING';
      const agent = await this.prisma.aIAgent.upsert({
        where: { organizationId_code: { organizationId, code } },
        update: { status, lastActivityAt: new Date() },
        create: { organizationId, code, name: role, role, status },
      });
      const task = await this.prisma.agentTask.create({
        data: {
          agentId: agent.id,
          type: 'DEVICE_COMMAND',
          title: `${command} → ${deviceCode}`,
          description: `Job ${jobId}`,
          input: { jobId, command, deviceCode },
          status: role === 'MANAGER' ? 'COMPLETED' : role === 'LOG' ? 'IN_PROGRESS' : 'PENDING',
          startedAt: role === 'MANAGER' || role === 'LOG' ? new Date() : null,
          completedAt: role === 'MANAGER' ? new Date() : null,
        },
      });
      await this.prisma.aIAgent.update({
        where: { id: agent.id },
        data: { currentTaskId: role === 'MANAGER' ? null : task.id },
      });
      await this.prisma.agentEvent.create({
        data: { agentId: agent.id, eventType: 'DEVICE_TASK_CREATED', message: `${command} → ${deviceCode}`, metadata: { jobId, command, status, deviceCode } },
      });
      this.events.emitAgentState({ organizationId, code, status, currentTaskId: role === 'MANAGER' ? null : task.id, jobId });
    }
  }

  private async failMvpAgents(organizationId: string, jobId: string, message: string) {
    const agents = await this.prisma.aIAgent.findMany({
      where: { organizationId, code: { in: ['16bit.MANAGER', '16bit.DEVICE', '16bit.QA', '16bit.LOG'] } },
    });
    for (const agent of agents) {
      const task = await this.prisma.agentTask.findFirst({
        where: { agentId: agent.id, type: 'DEVICE_COMMAND', input: { path: ['jobId'], equals: jobId } },
      });
      await this.prisma.aIAgent.update({
        where: { id: agent.id },
        data: { status: 'ERROR', currentTaskId: null, lastActivityAt: new Date() },
      });
      if (task) {
        await this.prisma.agentTask.update({
          where: { id: task.id },
          data: { status: 'FAILED', completedAt: new Date(), error: message },
        });
      }
      await this.prisma.agentEvent.create({
        data: {
          agentId: agent.id,
          eventType: 'JOB_QUEUE_FAILED',
          message,
          metadata: { jobId, errorCode: 'QUEUE_UNAVAILABLE' },
        },
      });
      this.events.emitAgentState({ organizationId, code: agent.code, status: 'ERROR', currentTaskId: null, jobId });
    }
  }

  private parameters(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch {
        throw new BadRequestException('parameters ต้องเป็น JSON object ที่ถูกต้อง');
      }
    }
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    throw new BadRequestException('parameters ต้องเป็น object');
  }

  private duplicateResult<T extends { status: string }>(job: T) {
    return { job, duplicate: true, queued: ACTIVE_JOB_STATUSES.includes(job.status as typeof ACTIVE_JOB_STATUSES[number]) };
  }

  private isUniqueConflict(error: unknown) {
    return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002');
  }

  private message(error: unknown) { return error instanceof Error ? error.message : String(error); }
}

function deviceSafeFilename(filename: string) {
  const normalized = filename
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/_+\./g, '.')
    .replace(/^\.+/, '')
    .slice(0, 180);
  return normalized || `upload-${Date.now()}.bin`;
}
