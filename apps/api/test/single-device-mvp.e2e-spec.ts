import { DeviceCommandBrokerService } from '../src/events/device-command-broker.service';
import { JobQueueService } from '../src/jobs/job-queue.service';
import { DEVICE_COMMANDS, SingleDeviceCommandsService } from '../src/jobs/single-device-commands.service';
import { DeviceOfflineMonitorService } from '../src/devices/device-offline-monitor.service';
import { signDeviceFile, verifyDeviceFileSignature } from '../src/jobs/device-file-signature';

describe('Single-device command broker', () => {
  it('resolves the matching physical-device response exactly once', async () => {
    const broker = new DeviceCommandBrokerService();
    const waiting = broker.waitFor('job-1', 1_000);
    expect(broker.resolve({ jobId: 'job-1', result: { result: 'PASS' } })).toBe(true);
    expect(await waiting).toMatchObject({ jobId: 'job-1', result: { result: 'PASS' } });
    expect(broker.resolve({ jobId: 'job-1', result: {} })).toBe(false);
  });

  it('ignores a stale command/attempt response and keeps the current waiter', async () => {
    const broker = new DeviceCommandBrokerService();
    const waiting = broker.waitFor('job-correlated', 1_000, 'OPEN_APP', 2);
    expect(broker.resolve({ jobId: 'job-correlated', command: 'STOP_APP', attemptNumber: 2, result: {} })).toBe(false);
    expect(broker.resolve({ jobId: 'job-correlated', command: 'OPEN_APP', attemptNumber: 1, result: {} })).toBe(false);
    expect(broker.resolve({ jobId: 'job-correlated', command: 'OPEN_APP', attemptNumber: 2, result: { verifiedRunning: true } })).toBe(true);
    await expect(waiting).resolves.toMatchObject({ command: 'OPEN_APP', attemptNumber: 2 });
  });

  it('times out instead of leaving a job RUNNING forever', async () => {
    const broker = new DeviceCommandBrokerService();
    await expect(broker.waitFor('job-timeout', 10)).rejects.toMatchObject({ code: 'DEVICE_RESPONSE_TIMEOUT' });
  });
});

describe('Screenshot evidence access', () => {
  it('accepts only the HMAC signature for the requested file', () => {
    const signature = signDeviceFile('file-1');
    expect(verifyDeviceFileSignature('file-1', signature)).toBe(true);
    expect(verifyDeviceFileSignature('file-2', signature)).toBe(false);
    expect(verifyDeviceFileSignature('file-1', 'invalid')).toBe(false);
  });
});

describe('Queued PHONE-001 command execution', () => {
  it('exposes every exact Phase-1 command name', () => {
    expect(DEVICE_COMMANDS).toEqual([
      'HEALTH_CHECK', 'SCREENSHOT', 'OPEN_APP', 'STOP_APP', 'RESTART_APP',
      'PUSH_FILE', 'REBOOT_DEVICE', 'VIEW_DEVICE_STATUS', 'VIEW_JOB_LOG', 'RUN_SINGLE_DEVICE_TEST', 'VIDEO_CREATE',
    ]);
  });

  it('dispatches to Device Agent and verifies HEALTH_CHECK before SUCCESS', async () => {
    const statuses: string[] = [];
    const mutableJob: any = {
      id: 'job-1', organizationId: 'default-org', deviceId: 'device-1', type: 'DEVICE_COMMAND', status: 'QUEUED',
      parameters: { command: 'HEALTH_CHECK' }, maxAttempts: 3, startedAt: null,
      device: { id: 'device-1', code: 'PHONE-001', nodeId: 'NODE-A' },
      deviceCommand: { id: 'command-1', command: 'HEALTH_CHECK' }, uploadedFiles: [],
      account: null, content: null, campaign: null,
    };
    const prisma: any = {
      job: {
        findUnique: jest.fn(async () => mutableJob),
        update: jest.fn(async ({ data }: any) => { if (data.status) statuses.push(data.status); return Object.assign(mutableJob, data); }),
      },
      deviceCommand: { update: jest.fn(async () => ({})) },
      device: { update: jest.fn(async () => ({})) },
      jobLog: { create: jest.fn(async ({ data }: any) => data) },
      log: { create: jest.fn(async ({ data }: any) => data) },
      aIAgent: {
        upsert: jest.fn(async ({ where, update }: any) => ({ id: where.organizationId_code.code, code: where.organizationId_code.code, ...update })),
        update: jest.fn(async () => ({})),
      },
      agentTask: { findFirst: jest.fn(async () => null), update: jest.fn() },
      agentEvent: { create: jest.fn(async () => ({})) },
    };
    const events: any = {
      emitDeviceCommand: jest.fn(), emitJobUpdate: jest.fn(), emitAgentState: jest.fn(),
    };
    const broker: any = { waitFor: jest.fn(async () => ({ jobId: 'job-1', result: { result: 'PASS', checks: { adbConnection: 'PASS', authorization: 'PASS' } } })) };
    const service = new JobQueueService(prisma, events, {} as any, broker, {} as any);

    await (service as any).process({ data: { jobId: 'job-1' }, attemptsMade: 0, opts: { attempts: 3 } });

    expect(events.emitDeviceCommand).toHaveBeenCalledWith('NODE-A', expect.objectContaining({ jobId: 'job-1', deviceCode: 'PHONE-001', command: 'HEALTH_CHECK' }));
    expect(statuses).toEqual(expect.arrayContaining(['ASSIGNED', 'RUNNING', 'VERIFYING', 'SUCCESS']));
    expect(mutableJob.result).toMatchObject({ result: 'PASS' });
    expect(prisma.jobLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ attemptNumber: 1 }) }));
  });
});

describe('Single-device idempotency', () => {
  it('returns the existing Job and never enqueues duplicate execution', async () => {
    const duplicate = { id: 'job-existing', status: 'QUEUED', deviceCommand: { command: 'SCREENSHOT' }, uploadedFiles: [], logs: [] };
    const prisma: any = {
      device: { findUnique: jest.fn(async () => ({ id: 'device-1', code: 'PHONE-001', organizationId: 'default-org' })) },
      job: { findFirst: jest.fn(async () => duplicate) },
    };
    const queue = { enqueue: jest.fn() };
    const service = new SingleDeviceCommandsService(prisma, {} as any, queue as any, {} as any, {} as any);
    const result = await service.create('PHONE-001', { command: 'SCREENSHOT' }, 'same-key');
    expect(result).toMatchObject({ job: duplicate, duplicate: true });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});

describe('PHONE-001 offline detection', () => {
  it('does not write an unchanged ADB discovery snapshot', async () => {
    const existing = {
      id: 'device-1', code: 'PHONE-001', organizationId: 'default-org', serialNumber: 'REAL-1',
      model: 'Galaxy', battery: 80, storageTotal: 128 * 1024 * 1024 * 1024,
      adbStatus: 'ONLINE', lastHeartbeatAt: new Date(),
    };
    const prisma: any = {
      organization: { findUnique: jest.fn(), create: jest.fn() },
      device: {
        findMany: jest.fn(async () => [existing]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      log: { create: jest.fn() },
    };
    const events = { emitDeviceUpdate: jest.fn() };
    const adb = {
      diagnose: jest.fn(async () => ({
        available: true,
        devices: [{ serial: 'REAL-1', state: 'device', model: 'Galaxy', battery: 80, storageGb: 128 }],
      })),
    };
    const monitor = new DeviceOfflineMonitorService(prisma, events as any, adb as any);

    const result = await (monitor as any).syncConnectedAdbDevices();

    expect(result.connectedSerials).toEqual(new Set(['REAL-1']));
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(prisma.organization.create).not.toHaveBeenCalled();
    expect(prisma.device.create).not.toHaveBeenCalled();
    expect(prisma.device.update).not.toHaveBeenCalled();
    expect(events.emitDeviceUpdate).not.toHaveBeenCalled();
  });

  it('backs off the monitor after Firestore reports RESOURCE_EXHAUSTED', async () => {
    const quotaError = { code: 8, details: 'Quota exceeded.' };
    const prisma: any = {
      device: { findMany: jest.fn(async () => { throw quotaError; }) },
      log: { create: jest.fn() },
    };
    const events = { emitDeviceUpdate: jest.fn() };
    const adb = {
      diagnose: jest.fn(async () => ({
        available: true,
        devices: [{ serial: 'REAL-1', state: 'device', model: 'Galaxy', battery: 80, storageGb: 128 }],
      })),
    };
    const monitor = new DeviceOfflineMonitorService(prisma, events as any, adb as any);

    await monitor.monitorDevices();
    await monitor.monitorDevices();

    expect(adb.diagnose).toHaveBeenCalledTimes(1);
    expect(prisma.device.findMany).toHaveBeenCalledTimes(1);
  });

  it('marks stale heartbeat OFFLINE and emits a realtime update', async () => {
    const stale = {
      id: 'device-1', code: 'PHONE-001', organizationId: 'default-org', serialNumber: 'REAL-1',
      adbStatus: 'ONLINE', lastHeartbeatAt: new Date(0),
    };
    const prisma: any = {
      device: {
        findMany: jest.fn(async () => [stale]),
        findUnique: jest.fn(async () => stale),
        update: jest.fn(async ({ data }: any) => ({ ...stale, ...data })),
      },
      log: { create: jest.fn(async () => ({})) },
    };
    const events = { emitDeviceUpdate: jest.fn() };
    const adb = { getDevices: jest.fn(async () => []) };
    const monitor = new DeviceOfflineMonitorService(prisma, events as any, adb as any);
    await monitor.markStaleDeviceOffline();
    expect(prisma.device.update).toHaveBeenCalledWith({
      where: { id: 'device-1' },
      data: { adbStatus: 'OFFLINE', currentJobId: null },
    });
    expect(events.emitDeviceUpdate).toHaveBeenCalledWith(expect.objectContaining({ type: 'DEVICE_OFFLINE' }));
  });

  it('does not overwrite a heartbeat that arrives during stale-device scanning', async () => {
    const stale = {
      id: 'device-1', code: 'PHONE-001', organizationId: 'default-org', serialNumber: 'REAL-1',
      adbStatus: 'ONLINE', lastHeartbeatAt: new Date(0),
    };
    const prisma: any = {
      device: {
        findMany: jest.fn(async () => [stale]),
        findUnique: jest.fn(async () => ({ ...stale, lastHeartbeatAt: new Date() })),
        update: jest.fn(),
      },
      log: { create: jest.fn() },
    };
    const events = { emitDeviceUpdate: jest.fn() };
    const adb = { getDevices: jest.fn(async () => []) };
    await new DeviceOfflineMonitorService(prisma, events as any, adb as any).markStaleDeviceOffline();
    expect(prisma.device.findUnique).toHaveBeenCalledWith({ where: { id: 'device-1' } });
    expect(prisma.device.update).not.toHaveBeenCalled();
    expect(prisma.log.create).not.toHaveBeenCalled();
    expect(events.emitDeviceUpdate).not.toHaveBeenCalled();
  });

  it('keeps a stale database snapshot ONLINE while its serial is connected through ADB', async () => {
    const stale = {
      id: 'device-1', code: 'PHONE-001', organizationId: 'default-org', serialNumber: 'REAL-1',
      adbStatus: 'ONLINE', lastHeartbeatAt: new Date(0),
    };
    const prisma: any = {
      device: {
        findMany: jest.fn(async () => [stale]),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      log: { create: jest.fn() },
    };
    const events = { emitDeviceUpdate: jest.fn() };
    await new DeviceOfflineMonitorService(prisma, events as any, {} as any)
      .markStaleDeviceOffline(new Set(['REAL-1']));
    expect(prisma.device.findUnique).not.toHaveBeenCalled();
    expect(prisma.device.update).not.toHaveBeenCalled();
    expect(events.emitDeviceUpdate).not.toHaveBeenCalled();
  });
});

describe('Exact command verification', () => {
  const job = {
    id: 'job-command', organizationId: 'default-org', deviceId: 'device-1',
    device: { id: 'device-1', code: 'PHONE-001', serialNumber: 'REAL-001' },
  };

  it('requires positive evidence for RESTART_APP and live device identity', async () => {
    const service = new JobQueueService({} as any, {} as any, {} as any, {} as any, {} as any);
    await expect((service as any).verifyDeviceResult(job, 'RESTART_APP', {}, {
      jobId: job.id,
      result: { packageName: 'com.example.app', verifiedStopped: true, verifiedRunning: true },
    })).resolves.toMatchObject({ verifiedStopped: true, verifiedRunning: true });
    await expect((service as any).verifyDeviceResult(job, 'RESTART_APP', {}, {
      jobId: job.id,
      result: { verifiedStopped: true, verifiedRunning: false },
    })).rejects.toMatchObject({ code: 'RESTART_APP_VERIFICATION_FAILED' });

    await expect((service as any).verifyDeviceResult(job, 'VIEW_DEVICE_STATUS', {}, {
      jobId: job.id,
      result: { deviceCode: 'PHONE-001', serialNumber: 'REAL-001', adbStatus: 'ONLINE', authorization: 'AUTHORIZED' },
    })).resolves.toMatchObject({ deviceCode: 'PHONE-001', serialNumber: 'REAL-001', adbStatus: 'ONLINE' });
  });

  it('stores and verifies all physical evidence in the 13-step single-device report', async () => {
    const png = Buffer.alloc(128);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    const checksum = require('crypto').createHash('sha256').update(png).digest('hex');
    const prisma: any = {
      uploadedFile: {
        create: jest.fn(async () => ({ id: 'screenshot-file' })),
        update: jest.fn(async () => ({})),
      },
    };
    const storage = { storeEvidence: jest.fn(async () => ({ objectName: 'evidence/job-command/image.png', url: 'minio://bucket/image.png' })) };
    const service = new JobQueueService(prisma, {} as any, {} as any, {} as any, storage as any);
    const parameters = {
      file: { uploadedFileId: 'fixture-file', size: 12, checksum: 'fixture-checksum', destination: '/sdcard/fixture.txt' },
    };
    const result = await (service as any).verifyDeviceResult(job, 'RUN_SINGLE_DEVICE_TEST', parameters, {
      jobId: job.id,
      result: {
        status: 'PASS',
        steps: Array.from({ length: 13 }, (_, index) => ({ name: `STEP_${index + 1}`, status: 'PASS' })),
        health: { result: 'PASS', checks: { adbConnection: 'PASS', authorization: 'PASS' } },
        screenshot: { screenshotBase64: png.toString('base64'), checksum },
        openApp: { verifiedRunning: true },
        pushFile: { size: 12, checksum: 'fixture-checksum', destination: '/sdcard/fixture.txt' },
        stopApp: { verifiedStopped: true },
      },
    });
    expect(result).toMatchObject({
      status: 'PASS',
      screenshot: { uploadedFileId: 'screenshot-file', checksum },
      openApp: { verifiedRunning: true },
      stopApp: { verifiedStopped: true },
    });
    expect(prisma.uploadedFile.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'fixture-file' } }));
  });

  it('reads VIEW_JOB_LOG from persisted database rows and bounds the result', async () => {
    const prisma: any = {
      job: { findFirst: jest.fn(async () => ({ id: 'target-job', status: 'FAILED', attempts: 3, maxAttempts: 3, createdAt: new Date() })) },
      jobLog: { findMany: jest.fn(async () => [{ id: 'log-1', createdAt: new Date(), attemptNumber: 3, message: 'ADB failed' }]) },
    };
    const service = new JobQueueService(prisma, {} as any, {} as any);
    const result = await (service as any).readJobLogResult(job, { targetJobId: 'target-job', limit: 500 });
    expect(result).toMatchObject({ targetJob: { id: 'target-job', attempts: 3 }, count: 1 });
    expect(prisma.jobLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });
});

describe('Persisted queue recovery', () => {
  it('requeues an interrupted database Job with only its remaining attempts', async () => {
    const interrupted = {
      id: 'job-recover', organizationId: 'default-org', deviceId: null, status: 'RUNNING',
      attempts: 1, maxAttempts: 3, scheduledAt: null, createdAt: new Date(), device: null, deviceCommand: null,
    };
    const prisma: any = {
      job: {
        findMany: jest.fn(async () => [interrupted]),
        update: jest.fn(async ({ data }: any) => ({ ...interrupted, ...data })),
      },
      jobLog: { create: jest.fn(async ({ data }: any) => data) },
      log: { create: jest.fn(async ({ data }: any) => data) },
    };
    const events = { emitJobUpdate: jest.fn() };
    const queue = { getJob: jest.fn(async () => null), add: jest.fn(async () => ({})) };
    const service = new JobQueueService(prisma, events as any, {} as any);
    (service as any).queue = queue;
    await (service as any).recoverPersistedJobs();
    expect(queue.add).toHaveBeenCalledWith('execute', { jobId: 'job-recover', attemptOffset: 1 }, expect.objectContaining({ attempts: 2 }));
    expect(prisma.job.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'job-recover' },
      data: expect.objectContaining({ status: 'QUEUED' }),
    }));
  });
});
