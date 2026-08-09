import { StorageService } from '../src/content/storage.service';
import { AdbService } from '../src/devices/adb.service';
import { EventsGateway } from '../src/events/events.gateway';
import { JobQueueService } from '../src/jobs/job-queue.service';
import { JobSchedulerService } from '../src/jobs/job-scheduler.service';
import { PlatformUploaderService } from '../src/jobs/platform-uploader.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PlatformAutomationRegistry } from '../src/platform-automation';

type ProcessableQueue = { process: (job: { data: { jobId: string } }) => Promise<unknown> };

describe('Job worker challenge and evidence flows', () => {
  const events = { emitJobUpdate: jest.fn() };
  const uploader = { prepare: jest.fn() };

  function workerFor(job: Record<string, any>) {
    const mutableJob = { ...job };
    const prisma = {
      job: {
        findUnique: jest.fn(async () => mutableJob),
        update: jest.fn(async ({ data }: any) => Object.assign(mutableJob, data)),
      },
    };
    const service = new JobQueueService(
      prisma as unknown as PrismaService,
      events as unknown as EventsGateway,
      uploader as unknown as PlatformUploaderService,
    );
    return { mutableJob, prisma, worker: service as unknown as ProcessableQueue };
  }

  beforeEach(() => {
    uploader.prepare.mockReset();
    events.emitJobUpdate.mockReset();
  });

  it.each([
    ['AUTH_REQUIRED', 'VERIFIED'],
    ['ACTIVE', 'OTP_REQUIRED'],
    ['ACTIVE', 'CAPTCHA_REQUIRED'],
  ])('moves unsafe account state %s/%s to ACTION_REQUIRED', async (status, authStatus) => {
    const { mutableJob, worker } = workerFor({
      id: 'job-challenge',
      type: 'UPLOAD_VIDEO',
      status: 'QUEUED',
      account: { status, authStatus },
      content: { url: 'minio://farm-phone/content/clip.mp4' },
      device: { code: 'SERIAL-001' },
      metadata: {},
    });

    await worker.process({ data: { jobId: mutableJob.id } });

    expect(mutableJob).toMatchObject({
      status: 'ACTION_REQUIRED',
      errorCode: 'AUTH_OR_CHALLENGE_REQUIRED',
    });
    expect(uploader.prepare).not.toHaveBeenCalled();
    expect(events.emitJobUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ACTION_REQUIRED' }));
  });

  it('stores pre-publish evidence and checkpoint metadata for operator review', async () => {
    uploader.prepare.mockResolvedValue({
      remotePath: '/sdcard/Movies/FarmPhone/clip.mp4',
      packageName: 'com.zhiliaoapp.musically',
      evidenceUrl: 'https://minio.test/evidence/job-ready.png',
      ui: { state: 'READY', disposition: 'CONTINUE' },
      checkpoint: 'PRE_PUBLISH_REVIEW',
      instructions: 'Review account and approve publish',
    });
    const { mutableJob, worker } = workerFor({
      id: 'job-ready',
      type: 'UPLOAD_VIDEO',
      status: 'QUEUED',
      account: { platform: 'TikTok', username: 'channel-1', status: 'ACTIVE', authStatus: 'VERIFIED' },
      content: { url: 'minio://farm-phone/content/clip.mp4', caption: 'Approved caption' },
      device: { code: 'SERIAL-001' },
      metadata: { evidenceRequired: true },
    });

    const result = await worker.process({ data: { jobId: mutableJob.id } });

    expect(uploader.prepare).toHaveBeenCalledWith({
      jobId: 'job-ready',
      serial: 'SERIAL-001',
      platform: 'TikTok',
      contentUrl: 'minio://farm-phone/content/clip.mp4',
      accountIdentifier: 'channel-1',
      caption: 'Approved caption',
    });
    expect(result).toEqual(expect.objectContaining({ evidenceUrl: expect.stringContaining('/evidence/') }));
    expect(mutableJob).toMatchObject({
      status: 'ACTION_REQUIRED',
      errorCode: 'PRE_PUBLISH_REVIEW',
      metadata: {
        evidenceRequired: true,
        preparation: expect.objectContaining({ checkpoint: 'PRE_PUBLISH_REVIEW' }),
      },
    });
  });
});

describe('Platform uploader evidence contract', () => {
  const screenshot = Buffer.from('png-evidence');
  const adb = {
    pushFile: jest.fn(async () => undefined),
    launchPackage: jest.fn(async () => undefined),
    captureUiSnapshot: jest.fn(async () => ({ texts: ['Create post'], capturedAt: new Date() })),
    screenshot: jest.fn(async () => screenshot),
  };
  const storage = {
    downloadToTemp: jest.fn(async () => 'C:\\tmp\\clip.mp4'),
    uploadEvidence: jest.fn(async () => 'https://minio.test/evidence/job-1.png'),
    removeTemp: jest.fn(async () => undefined),
  };
  const adapter = {
    createPublishPlan: jest.fn(({ jobId }: { jobId: string }) => ({
      platform: 'tiktok', jobId, packageName: 'com.zhiliaoapp.musically',
      safety: { requiresHumanApprovalBeforePublish: true, abortOnChallenge: true, challengeBypassSupported: false },
      actions: [],
    })),
    inspectUi: jest.fn(() => ({ state: 'READY', disposition: 'CONTINUE', matchedMarkers: ['Create post'], assessedAt: new Date() })),
  };
  const automation = { get: jest.fn(() => adapter) };
  const service = new PlatformUploaderService(
    adb as unknown as AdbService,
    storage as unknown as StorageService,
    automation as unknown as PlatformAutomationRegistry,
  );

  beforeEach(() => jest.clearAllMocks());

  it('pushes media, opens the platform, captures evidence, and cleans up', async () => {
    const result = await service.prepare({
      jobId: 'job-1',
      serial: 'SERIAL-001',
      platform: 'TikTok',
      contentUrl: 'minio://farm-phone/content/clip.mp4',
      accountIdentifier: 'channel-1',
    });

    expect(adb.pushFile).toHaveBeenCalledWith('SERIAL-001', 'C:\\tmp\\clip.mp4', '/sdcard/Movies/FarmPhone/clip.mp4');
    expect(adb.launchPackage).toHaveBeenCalledWith('SERIAL-001', 'com.zhiliaoapp.musically');
    expect(storage.uploadEvidence).toHaveBeenCalledWith(screenshot, 'job-1');
    expect(storage.removeTemp).toHaveBeenCalledWith('C:\\tmp\\clip.mp4');
    expect(result).toMatchObject({
      evidenceUrl: 'https://minio.test/evidence/job-1.png',
      checkpoint: 'PRE_PUBLISH_REVIEW',
    });
  });

  it('still removes the temporary file when ADB preparation fails', async () => {
    adb.launchPackage.mockRejectedValueOnce(new Error('app unavailable'));

    await expect(service.prepare({
      jobId: 'job-failed',
      serial: 'SERIAL-001',
      platform: 'Instagram',
      contentUrl: 'minio://farm-phone/content/clip.mp4',
      accountIdentifier: 'channel-1',
    })).rejects.toThrow('app unavailable');

    expect(storage.removeTemp).toHaveBeenCalledWith('C:\\tmp\\clip.mp4');
    expect(storage.uploadEvidence).not.toHaveBeenCalled();
  });
});

describe('Scheduled job dispatch', () => {
  it('enqueues every due CREATED job and preserves its schedule', async () => {
    const scheduledAt = new Date(Date.now() - 1_000);
    const jobs = [
      { id: 'job-now', scheduledAt: null },
      { id: 'job-due', scheduledAt },
    ];
    const prisma = { job: { findMany: jest.fn(async () => jobs) } };
    const queue = { enqueue: jest.fn(async () => undefined) };
    const scheduler = new JobSchedulerService(
      prisma as unknown as PrismaService,
      queue as unknown as JobQueueService,
    );

    await scheduler.enqueueDueJobs();

    expect(prisma.job.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'CREATED' }),
      take: 20,
    }));
    expect(queue.enqueue).toHaveBeenNthCalledWith(1, 'job-now', null);
    expect(queue.enqueue).toHaveBeenNthCalledWith(2, 'job-due', scheduledAt);
  });
});
