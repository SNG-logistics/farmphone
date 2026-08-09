import { ServiceUnavailableException } from '@nestjs/common';
import { JobQueueService } from '../src/jobs/job-queue.service';
import { SingleDeviceCommandsService } from '../src/jobs/single-device-commands.service';

describe('Single-device failure injection', () => {
  it('persists exactly three failed attempts and moves the exhausted Job to DLQ once', async () => {
    const statuses: string[] = [];
    const mutableJob: any = {
      id: 'job-package-missing',
      organizationId: 'default-org',
      deviceId: 'device-1',
      status: 'RUNNING',
      attempts: 0,
      maxAttempts: 3,
      device: { id: 'device-1', adbStatus: 'ONLINE', battery: 80, storageUsed: 10n, storageTotal: 100n },
      deviceCommand: { command: 'OPEN_APP', status: 'RUNNING' },
    };
    const prisma: any = {
      job: {
        findUnique: jest.fn(async () => mutableJob),
        update: jest.fn(async ({ data }: any) => {
          statuses.push(data.status);
          return Object.assign(mutableJob, data);
        }),
      },
      deviceCommand: {
        update: jest.fn(async ({ data }: any) => Object.assign(mutableJob.deviceCommand, data)),
      },
      device: {
        update: jest.fn(async ({ data }: any) => Object.assign(mutableJob.device, data)),
      },
      jobLog: { create: jest.fn(async ({ data }: any) => data) },
      log: { create: jest.fn(async ({ data }: any) => data) },
      aIAgent: {
        upsert: jest.fn(async ({ where, update }: any) => ({
          id: where.organizationId_code.code,
          currentTaskId: null,
          ...update,
        })),
        update: jest.fn(async () => ({})),
      },
      agentTask: { findFirst: jest.fn(async () => null), update: jest.fn() },
      agentEvent: { create: jest.fn(async () => ({})) },
    };
    const events = { emitJobUpdate: jest.fn(), emitAgentState: jest.fn() };
    const deadLetterQueue = { add: jest.fn(async () => ({})) };
    const service = new JobQueueService(prisma, events as any, {} as any);
    (service as any).deadLetterQueue = deadLetterQueue;
    const failure = Object.assign(new Error('Package is not installed'), { code: 'PACKAGE_NOT_INSTALLED' });

    for (const attemptsMade of [1, 2, 3]) {
      await (service as any).handleAttemptFailure({
        data: { jobId: mutableJob.id },
        attemptsMade,
        opts: { attempts: 3 },
      }, failure);
    }

    expect(statuses).toEqual(['QUEUED', 'QUEUED', 'FAILED']);
    expect(mutableJob).toMatchObject({
      status: 'FAILED', attempts: 3, retryCount: 2,
      errorCode: 'PACKAGE_NOT_INSTALLED', errorMessage: 'Package is not installed',
    });
    expect(mutableJob.completedAt).toBeInstanceOf(Date);
    expect(mutableJob.device).toMatchObject({ adbStatus: 'ERROR', currentJobId: null });
    expect(prisma.jobLog.create.mock.calls.map(([call]: any[]) => call.data.attemptNumber)).toEqual([1, 2, 3]);
    expect(deadLetterQueue.add).toHaveBeenCalledTimes(1);
    expect(deadLetterQueue.add).toHaveBeenCalledWith('dead-letter', expect.objectContaining({
      jobId: mutableJob.id,
      error: 'Package is not installed',
    }), expect.objectContaining({ removeOnComplete: false, removeOnFail: false }));
  });

  it('fails an interrupted Job instead of retrying beyond maxAttempts during backend recovery', async () => {
    const interrupted: any = {
      id: 'job-exhausted', organizationId: 'default-org', deviceId: 'device-1',
      status: 'RUNNING', attempts: 3, maxAttempts: 3, scheduledAt: null, createdAt: new Date(),
      device: { id: 'device-1', currentJobId: 'job-exhausted', adbStatus: 'BUSY' },
      deviceCommand: { command: 'OPEN_APP', status: 'RUNNING' },
    };
    const prisma: any = {
      job: {
        findMany: jest.fn(async () => [interrupted]),
        update: jest.fn(async ({ data }: any) => Object.assign(interrupted, data)),
      },
      deviceCommand: { update: jest.fn(async ({ data }: any) => Object.assign(interrupted.deviceCommand, data)) },
      device: { update: jest.fn(async ({ data }: any) => Object.assign(interrupted.device, data)) },
      jobLog: { create: jest.fn(async ({ data }: any) => data) },
      log: { create: jest.fn(async ({ data }: any) => data) },
    };
    const mainQueue = { getJob: jest.fn(async () => null), add: jest.fn() };
    const deadLetterQueue = { add: jest.fn(async () => ({})) };
    const service = new JobQueueService(prisma, { emitJobUpdate: jest.fn() } as any, {} as any);
    (service as any).queue = mainQueue;
    (service as any).deadLetterQueue = deadLetterQueue;

    await (service as any).recoverPersistedJobs();

    expect(mainQueue.add).not.toHaveBeenCalled();
    expect(interrupted).toMatchObject({ status: 'FAILED', errorCode: 'RECOVERY_ATTEMPTS_EXHAUSTED' });
    expect(interrupted.device).toMatchObject({ adbStatus: 'ERROR', currentJobId: null });
    expect(interrupted.deviceCommand).toMatchObject({ status: 'FAILED', errorCode: 'RECOVERY_ATTEMPTS_EXHAUSTED' });
    expect(deadLetterQueue.add).toHaveBeenCalledTimes(1);
  });

  it('resets persisted execution fields before requeueing a dead-letter Job', async () => {
    const originalQueueJob = { remove: jest.fn(async () => undefined) };
    const deadLetter = {
      data: { jobId: 'job-retry-dlq' },
      remove: jest.fn(async () => undefined),
    };
    const queue = {
      getJob: jest.fn()
        .mockResolvedValueOnce(originalQueueJob)
        .mockResolvedValueOnce(null),
      add: jest.fn(async () => ({})),
    };
    const deadLetterQueue = { getJob: jest.fn(async () => deadLetter) };
    const prisma: any = {
      job: { update: jest.fn(async ({ data }: any) => ({ id: 'job-retry-dlq', ...data })) },
      deviceCommand: { updateMany: jest.fn(async () => ({ count: 1 })) },
    };
    const service = new JobQueueService(prisma, { emitJobUpdate: jest.fn() } as any, {} as any);
    (service as any).queue = queue;
    (service as any).deadLetterQueue = deadLetterQueue;

    await expect(service.retryDeadLetter('dead-letter-1')).resolves.toEqual({
      jobId: 'job-retry-dlq', requeued: true,
    });

    expect(originalQueueJob.remove).toHaveBeenCalledTimes(1);
    expect(prisma.job.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'job-retry-dlq' },
      data: {
        status: 'CREATED', attempts: 0, retryCount: 0, startedAt: null, completedAt: null,
        errorCode: null, errorMessage: null,
      },
    });
    expect(prisma.deviceCommand.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { jobId: 'job-retry-dlq' },
      data: expect.objectContaining({ status: 'CREATED', errorCode: null, errorMessage: null }),
    }));
    expect(queue.add).toHaveBeenCalledWith('execute', { jobId: 'job-retry-dlq', attemptOffset: 0 }, expect.objectContaining({ attempts: 3 }));
    expect(deadLetter.remove).toHaveBeenCalledTimes(1);
  });

  it('persists FAILED state, logs, and Agent errors when Redis enqueue is unavailable', async () => {
    const device = { id: 'device-1', code: 'PHONE-001', organizationId: 'default-org' };
    const createdJob: any = {
      id: 'job-no-redis', organizationId: 'default-org', deviceId: device.id,
      status: 'CREATED', maxAttempts: 3,
    };
    const agents = ['MANAGER', 'DEVICE', 'QA', 'LOG'].map((role) => ({
      id: `agent-${role}`, code: `16bit.${role}`, role,
    }));
    const transaction: any = {
      job: {
        create: jest.fn(async () => createdJob),
        update: jest.fn(async ({ data }: any) => Object.assign(createdJob, data)),
      },
      deviceCommand: { create: jest.fn(async () => ({})) },
      jobLog: { create: jest.fn(async () => ({})) },
    };
    const prisma: any = {
      device: { findUnique: jest.fn(async () => device) },
      job: {
        findFirst: jest.fn(async () => null),
        update: jest.fn(async ({ data }: any) => Object.assign(createdJob, data)),
        findUnique: jest.fn(async () => createdJob),
      },
      deviceCommand: {
        findFirst: jest.fn(async () => null),
        update: jest.fn(async () => ({})),
      },
      jobLog: { create: jest.fn(async () => ({})) },
      log: { create: jest.fn(async () => ({})) },
      aIAgent: {
        upsert: jest.fn(async ({ where, create }: any) => ({ id: `agent-${create.role}`, code: where.organizationId_code.code, role: create.role })),
        update: jest.fn(async () => ({})),
        findMany: jest.fn(async () => agents),
      },
      agentTask: {
        create: jest.fn(async ({ data }: any) => ({ id: `task-${data.agentId}`, ...data })),
        findFirst: jest.fn(async ({ where }: any) => ({ id: `task-${where.agentId}` })),
        update: jest.fn(async () => ({})),
      },
      agentEvent: { create: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) => callback(transaction)),
    };
    const queue = { enqueue: jest.fn(async () => { throw new Error('Redis connection refused'); }) };
    const events = { emitAgentState: jest.fn(), emitJobUpdate: jest.fn() };
    const service = new SingleDeviceCommandsService(prisma, {} as any, queue as any, events as any, {} as any);

    await expect(service.create('PHONE-001', { command: 'HEALTH_CHECK' }, 'redis-outage-key'))
      .rejects.toEqual(expect.any(ServiceUnavailableException));

    expect(createdJob).toMatchObject({
      status: 'FAILED', errorCode: 'QUEUE_UNAVAILABLE', errorMessage: 'Redis connection refused',
    });
    expect(prisma.deviceCommand.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { jobId: createdJob.id },
      data: expect.objectContaining({ status: 'FAILED', errorCode: 'QUEUE_UNAVAILABLE' }),
    }));
    expect(prisma.jobLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ level: 'ERROR', errorCode: 'QUEUE_UNAVAILABLE', attemptNumber: 0 }),
    }));
    expect(prisma.aIAgent.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ERROR', currentTaskId: null }),
    }));
    expect(events.emitAgentState).toHaveBeenCalledTimes(8);
  });

  it('returns the concurrent idempotency winner after a database unique-key race', async () => {
    const winner = { id: 'job-winner', status: 'RUNNING', deviceCommand: { command: 'SCREENSHOT' }, uploadedFiles: [], logs: [] };
    const prisma: any = {
      device: { findUnique: jest.fn(async () => ({ id: 'device-1', code: 'PHONE-001', organizationId: 'default-org' })) },
      job: { findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(winner) },
      deviceCommand: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async () => { throw { code: 'P2002' }; }),
    };
    const queue = { enqueue: jest.fn() };
    const service = new SingleDeviceCommandsService(prisma, {} as any, queue as any, {} as any, {} as any);

    await expect(service.create('PHONE-001', { command: 'SCREENSHOT' }, 'same-concurrent-key')).resolves.toMatchObject({
      job: winner, duplicate: true, queued: true,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects missing/empty file payloads and corrupted destination checksums before success', async () => {
    const queue = { enqueue: jest.fn() };
    const untouchedPrisma: any = { device: { findUnique: jest.fn() } };
    const commands = new SingleDeviceCommandsService(untouchedPrisma, {} as any, queue as any, {} as any, {} as any);
    await expect(commands.create('PHONE-001', { command: 'PUSH_FILE' }, 'missing-file'))
      .rejects.toThrow('PUSH_FILE');
    expect(untouchedPrisma.device.findUnique).not.toHaveBeenCalled();

    const emptyPrisma: any = {
      device: { findUnique: jest.fn(async () => ({ id: 'device-1', code: 'PHONE-001', organizationId: 'default-org' })) },
      job: { findFirst: jest.fn(async () => null) },
      deviceCommand: { findFirst: jest.fn(async () => null) },
    };
    const storage = { upload: jest.fn() };
    const emptyCommands = new SingleDeviceCommandsService(emptyPrisma, storage as any, queue as any, {} as any, {} as any);
    await expect(emptyCommands.create('PHONE-001', { command: 'PUSH_FILE' }, 'empty-file', {
      originalname: 'empty.txt', mimetype: 'text/plain', buffer: Buffer.alloc(0), size: 0,
    })).rejects.toThrow('ไฟล์ว่าง');
    expect(storage.upload).not.toHaveBeenCalled();

    const uploadedFile = { update: jest.fn() };
    const worker = new JobQueueService({ uploadedFile } as any, {} as any, {} as any);
    await expect((worker as any).verifyDeviceResult({
      id: 'job-corrupt', organizationId: 'default-org', device: { id: 'device-1', code: 'PHONE-001' },
    }, 'PUSH_FILE', {
      file: { uploadedFileId: 'file-1', size: 12, checksum: 'expected-checksum' },
    }, {
      jobId: 'job-corrupt', result: { size: 12, checksum: 'corrupted-checksum' },
    })).rejects.toMatchObject({ code: 'DESTINATION_CHECKSUM_MISMATCH' });
    expect(uploadedFile.update).not.toHaveBeenCalled();
  });
});
