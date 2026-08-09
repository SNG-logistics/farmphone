import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { AccountsController } from '../src/accounts/accounts.controller';
import { AccountsService } from '../src/accounts/accounts.service';
import { JwtAuthGuard } from '../src/auth/jwt.guard';
import { CampaignsController } from '../src/campaigns/campaigns.controller';
import { CampaignsService } from '../src/campaigns/campaigns.service';
import { ContentController } from '../src/content/content.controller';
import { ContentService } from '../src/content/content.service';
import { StorageService } from '../src/content/storage.service';
import { JobQueueService } from '../src/jobs/job-queue.service';
import { JobsController } from '../src/jobs/jobs.controller';
import { JobsService } from '../src/jobs/jobs.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { InMemoryPrisma } from './support/in-memory-prisma';
import { EventsGateway } from '../src/events/events.gateway';
import { PlatformAutomationRegistry } from '../src/platform-automation';
import { RolesGuard } from '../src/auth/roles.guard';
import { VideoCreationQueueService } from '../src/video-processing/video-creation-queue.service';
import { SingleDeviceCommandsService } from '../src/jobs/single-device-commands.service';

describe('Farm Phone mocked API flows', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: InMemoryPrisma;

  const storage = {
    upload: jest.fn(async () => ({
      objectName: 'content/fixture/clip.mp4',
      url: 'minio://farm-phone/content/fixture/clip.mp4',
      previewUrl: 'https://minio.test/preview/clip.mp4',
    })),
  };
  const queue = {
    enqueue: jest.fn<Promise<void>, [string, Date | null | undefined]>(async () => undefined),
  };

  beforeAll(async () => {
    prisma = new InMemoryPrisma();
    const moduleRef = await Test.createTestingModule({
      controllers: [ContentController, AccountsController, CampaignsController, JobsController],
      providers: [
        ContentService,
        AccountsService,
        CampaignsService,
        JobsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: JobQueueService, useValue: queue },
        { provide: EventsGateway, useValue: { emitJobUpdate: jest.fn() } },
        { provide: PlatformAutomationRegistry, useValue: { get: jest.fn() } },
        { provide: VideoCreationQueueService, useValue: { enqueueVideoJob: jest.fn().mockResolvedValue({ duplicate: false, job: { id: 'job-1' } }) } },
        { provide: SingleDeviceCommandsService, useValue: { create: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  afterAll(async () => app.close());

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`${baseUrl}${path}`, init);
    const body = await response.json();
    return { response, body };
  }

  async function json(path: string, method: string, body: unknown) {
    return request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('uploads media, persists MinIO metadata, and normalizes hashtags', async () => {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('mock-video')], { type: 'video/mp4' }), 'clip-one.mp4');
    form.append('title', 'Clip One');
    form.append('caption', 'Launch caption');
    form.append('hashtags', '#farm, #phone  automation');
    form.append('organizationId', 'org-e2e');

    const { response, body } = await request('/content/upload', { method: 'POST', body: form });

    expect(response.status).toBe(201);
    expect(storage.upload).toHaveBeenCalledWith(expect.objectContaining({
      originalname: 'clip-one.mp4',
      mimetype: 'video/mp4',
      size: 10,
    }));
    expect(body).toMatchObject({
      success: true,
      data: {
        title: 'Clip One',
        type: 'video',
        url: 'minio://farm-phone/content/fixture/clip.mp4',
        fileSize: '10',
        status: 'READY',
        hashtags: ['#farm', '#phone', 'automation'],
      },
    });
    expect(prisma.organizations).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'org-e2e' })]));
  });

  it('rejects an upload request without a file without touching storage', async () => {
    const uploadCalls = storage.upload.mock.calls.length;
    const form = new FormData();
    form.append('title', 'Missing file');

    const { response, body } = await request('/content/upload', { method: 'POST', body: form });

    expect(response.status).toBe(201);
    expect(body.success).toBe(false);
    expect(storage.upload).toHaveBeenCalledTimes(uploadCalls);
  });

  it('supports the account create, list, update, and delete lifecycle', async () => {
    const created = await json('/accounts', 'POST', {
      organizationId: 'org-e2e',
      platform: 'TikTok',
      username: 'channel-one',
      nickname: 'Channel One',
      assignedDeviceId: 'SERIAL-001',
      status: 'ACTIVE',
      authStatus: 'VERIFIED',
    });
    expect(created.response.status).toBe(201);
    const accountId = created.body.data.id;

    const listed = await request('/accounts');
    expect(listed.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: accountId, username: 'channel-one', authStatus: 'VERIFIED' }),
    ]));

    const updated = await json(`/accounts/${accountId}`, 'PATCH', { status: 'PAUSED' });
    expect(updated.body.data.status).toBe('PAUSED');

    const removed = await request(`/accounts/${accountId}`, { method: 'DELETE' });
    expect(removed.body.data.id).toBe(accountId);
    expect(prisma.accounts.some((item) => item.id === accountId)).toBe(false);
  });

  it('launches every account-content pair as an evidence-aware scheduled job', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const created = await json('/campaigns', 'POST', {
      organizationId: 'org-e2e',
      name: 'Two by two campaign',
      accountIds: ['account-a', 'account-b'],
      contentIds: ['content-a', 'content-b'],
      schedule: future,
      dailyLimit: 4,
    });
    const campaignId = created.body.id;

    const launched = await request(`/campaigns/${campaignId}/launch`, { method: 'POST' });

    expect(launched.response.status).toBe(201);
    expect(launched.body.campaign).toMatchObject({ id: campaignId, status: 'READY', totalJobs: 4 });
    expect(launched.body.jobs).toHaveLength(4);
    expect(launched.body.jobs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        campaignId,
        accountId: 'account-a',
        contentId: 'content-a',
        type: 'UPLOAD_VIDEO',
        metadata: expect.objectContaining({ requiresPostVerification: true, evidenceRequired: true }),
      }),
    ]));
    expect(queue.enqueue).toHaveBeenCalledTimes(4);
    for (const call of queue.enqueue.mock.calls) expect(call[1]).toEqual(new Date(future));
  });

  it('refuses to launch an incomplete campaign', async () => {
    const created = await json('/campaigns', 'POST', {
      organizationId: 'org-e2e',
      name: 'Incomplete campaign',
      accountIds: [],
      contentIds: ['content-a'],
    });

    const launched = await request(`/campaigns/${created.body.id}/launch`, { method: 'POST' });

    expect(launched.response.status).toBe(400);
    expect(launched.body.message).toEqual(expect.any(String));
  });

  it('creates and filters queued jobs through the HTTP contract', async () => {
    const created = await json('/jobs', 'POST', {
      organizationId: 'org-e2e',
      name: 'Upload clip one',
      type: 'UPLOAD_VIDEO',
      campaignId: 'campaign-filter',
      accountId: 'account-filter',
      contentId: 'content-filter',
      metadata: { evidenceRequired: true },
    });

    expect(created.response.status).toBe(201);
    expect(created.body).toMatchObject({ queued: true, job: { status: 'CREATED', type: 'UPLOAD_VIDEO' } });
    expect(queue.enqueue).toHaveBeenCalledWith(created.body.job.id, null);

    const filtered = await request('/jobs?campaignId=campaign-filter&status=CREATED');
    expect(filtered.body).toEqual([
      expect.objectContaining({ id: created.body.job.id, campaignId: 'campaign-filter' }),
    ]);
  });
});
