import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobQueueService } from './job-queue.service';
import { EventsGateway } from '../events/events.gateway';
import { PlatformAutomationRegistry } from '../platform-automation';
import { VideoCreationQueueService } from '../video-processing/video-creation-queue.service';

@Injectable()
export class JobsService {
  constructor(
    private prisma: PrismaService,
    private queue: JobQueueService,
    private events: EventsGateway,
    private automation: PlatformAutomationRegistry,
    private videoQueue: VideoCreationQueueService,
  ) {}

  async findAll(filters?: { status?: string; deviceId?: string; campaignId?: string }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.deviceId) where.deviceId = filters.deviceId;
    if (filters?.campaignId) where.campaignId = filters.campaignId;

    const jobs = await this.prisma.job.findMany({
      where,
      include: {
        device: true,
        campaign: true,
        account: true,
        content: true,
        deviceCommand: true,
        logs: { orderBy: { createdAt: 'desc' } },
        uploadedFiles: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return jobs;
  }

  async findOne(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: {
        device: true,
        campaign: true,
        account: true,
        content: true,
        deviceCommand: true,
        logs: { orderBy: { createdAt: 'desc' } },
        uploadedFiles: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!job) {
      throw new NotFoundException(`Job with ID "${id}" not found`);
    }
    return job;
  }

  async create(data: {
    name: string;
    description?: string;
    type?: string;
    status?: string;
    deviceId?: string;
    campaignId?: string;
    accountId?: string;
    contentId?: string;
    scheduledAt?: string;
    organizationId?: string;
    metadata?: any;
  }) {
    const createData: any = {
      organizationId: data.organizationId || 'default-org',
      type: data.type || 'BATCH_OPERATION',
      status: data.status || 'CREATED',
      metadata: { name: data.name, description: data.description, ...data.metadata },
    };
    if (data.deviceId) createData.deviceId = data.deviceId;
    if (data.campaignId) createData.campaignId = data.campaignId;
    if (data.accountId) createData.accountId = data.accountId;
    if (data.contentId) createData.contentId = data.contentId;
    if (data.scheduledAt) createData.scheduledAt = new Date(data.scheduledAt);

    const job = await this.prisma.job.create({
      data: createData,
      include: {
        device: true,
        campaign: true,
      },
    });
    return job;
  }

  async createAndEnqueue(data: {
    name: string;
    description?: string;
    type?: string;
    deviceId?: string;
    campaignId?: string;
    accountId?: string;
    contentId?: string;
    scheduledAt?: string;
    organizationId?: string;
    metadata?: any;
    queueName?: string;
    payload?: any;
  }) {
    if (data.type === 'VIDEO_CREATE') {
      const params = (data.payload as any) || (data.metadata as any) || {};
      const res = await this.videoQueue.enqueueVideoJob(
        data.organizationId || 'default-org',
        {
          brief: params.brief || data.description || data.name || 'สร้างวิดีโอ TikTok SNG EXPRESS ขนส่งไทย-ลาว',
          brandName: params.brandName || 'SNG EXPRESS',
          language: params.language || 'th',
          durationSeconds: params.durationSeconds || 25,
          aspectRatio: params.aspectRatio || '9:16',
          resolution: params.resolution || '1080x1920',
          tone: params.tone,
          callToAction: params.callToAction,
        },
      );
      return res;
    }
    const createData: any = {
      organizationId: data.organizationId || 'default-org',
      type: data.type || 'BATCH_OPERATION',
      status: 'CREATED',
      metadata: { name: data.name, description: data.description, ...data.metadata },
    };
    if (data.deviceId) createData.deviceId = data.deviceId;
    if (data.campaignId) createData.campaignId = data.campaignId;
    if (data.accountId) createData.accountId = data.accountId;
    if (data.contentId) createData.contentId = data.contentId;
    if (data.scheduledAt) createData.scheduledAt = new Date(data.scheduledAt);

    await this.prisma.organization.upsert({ where: { id: createData.organizationId }, update: {}, create: { id: createData.organizationId, name: 'Local Test Organization' } });

    // Create the job in the database
    const job = await this.prisma.job.create({
      data: createData,
      include: {
        device: true,
        campaign: true,
        account: true,
        content: true,
      },
    });

    await this.queue.enqueue(job.id, job.scheduledAt);

    return {
      job,
      queued: true,
      message: 'Job created and added to BullMQ',
    };
  }

  async updateStatus(id: string, status: string) {
    const existing = await this.prisma.job.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Job with ID "${id}" not found`);
    }

    const job = await this.prisma.job.update({
      where: { id },
      data: { status },
      include: {
        device: true,
        campaign: true,
      },
    });
    return job;
  }

  async review(id: string, data: { decision: 'APPROVE' | 'REJECT' | 'RESUME'; note?: string; actor?: string }) {
    const job = await this.findOne(id);
    if (job.status !== 'ACTION_REQUIRED' && job.status !== 'AWAITING_APPROVAL') {
      throw new BadRequestException(`Job ${id} ไม่ได้อยู่ในสถานะรอการตรวจ`);
    }

    const metadata = this.metadata(job.metadata);
    const review = {
      decision: data.decision,
      note: data.note || '',
      actor: data.actor || 'local-operator',
      reviewedAt: new Date().toISOString(),
      previousErrorCode: job.errorCode,
    };

    if (data.decision === 'REJECT') {
      return this.transition(job, 'CANCELLED', {
        completedAt: new Date(),
        errorCode: 'REJECTED_BY_OPERATOR',
        errorMessage: data.note || 'ผู้ปฏิบัติงานปฏิเสธงาน',
        metadata: { ...metadata, review },
      }, review.actor);
    }

    if (data.decision === 'RESUME' || job.errorCode !== 'PRE_PUBLISH_REVIEW') {
      const resumed = await this.transition(job, 'CREATED', {
        errorCode: null,
        errorMessage: null,
        metadata: { ...metadata, review },
        retryCount: { increment: 1 },
      }, review.actor);
      await this.queue.enqueue(job.id);
      return resumed;
    }

    return this.transition(job, 'AWAITING_DEVICE_WORKER', {
      errorCode: null,
      errorMessage: 'อนุมัติหน้าก่อนโพสต์แล้ว รอ Device Worker ดำเนินการบนเครื่องจริง',
      metadata: { ...metadata, review, publishApproved: true },
    }, review.actor);
  }

  async verify(id: string, data: {
    uiTexts?: string[];
    contentDescriptions?: string[];
    resourceIds?: string[];
    screenshotUrl?: string;
    accountIdentifier?: string;
    contentFingerprint?: string;
    caption?: string;
    postId?: string;
    permalink?: string;
    actor?: string;
  }) {
    const job = await this.findOne(id);
    if (!job.account || !job.content) throw new BadRequestException('Job ต้องมี Account และ Content');
    const adapter = this.automation.get(job.account.platform);
    const ui = adapter.inspectUi({
      texts: data.uiTexts || [],
      contentDescriptions: data.contentDescriptions || [],
      resourceIds: data.resourceIds || [],
      screenshotUrl: data.screenshotUrl,
      capturedAt: new Date(),
    });
    const evidence = data.screenshotUrl ? [{
      type: 'SCREENSHOT' as const,
      url: data.screenshotUrl,
      capturedAt: new Date(),
      description: 'Post-verification screenshot',
    }] : [];
    const result = adapter.verifyPost({
      ui,
      expected: {
        accountIdentifier: job.account.username,
        caption: job.content.caption || undefined,
      },
      observed: {
        accountIdentifier: data.accountIdentifier,
        contentFingerprint: data.contentFingerprint,
        caption: data.caption,
        postId: data.postId,
        permalink: data.permalink,
      },
      evidence,
    });
    const status = result.status === 'VERIFIED' ? 'SUCCESS'
      : result.status === 'FAILED' ? 'FAILED'
        : result.status === 'ACTION_REQUIRED' ? 'ACTION_REQUIRED' : 'VERIFYING';
    const metadata = this.metadata(job.metadata);
    return this.transition(job, status, {
      completedAt: status === 'SUCCESS' || status === 'FAILED' ? new Date() : null,
      errorCode: status === 'SUCCESS' ? null : `VERIFICATION_${result.status}`,
      errorMessage: result.reason,
      metadata: { ...metadata, verification: result },
    }, data.actor || 'local-operator');
  }

  private async transition(job: any, status: string, data: any, actor: string) {
    const terminalBefore = job.status === 'SUCCESS' || job.status === 'FAILED';
    const terminalAfter = status === 'SUCCESS' || status === 'FAILED';
    const updated = await this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.job.update({
        where: { id: job.id },
        data: { status, ...data },
        include: { device: true, campaign: true, account: true, content: true },
      });
      if (job.campaignId && terminalAfter && !terminalBefore) {
        await transaction.campaign.update({
          where: { id: job.campaignId },
          data: status === 'SUCCESS' ? { successJobs: { increment: 1 } } : { failedJobs: { increment: 1 } },
        });
      }
      if (status === 'SUCCESS') {
        if (job.contentId) await transaction.content.update({ where: { id: job.contentId }, data: { status: 'USED', usageCount: { increment: 1 } } });
        if (job.accountId) await transaction.account.update({ where: { id: job.accountId }, data: { lastJobAt: new Date(), todayJobCount: { increment: 1 } } });
      }
      await transaction.auditLog.create({
        data: {
          organizationId: job.organizationId,
          action: `JOB_${status}`,
          resourceType: 'Job',
          resourceId: job.id,
          userId: actor,
          changes: { from: job.status, to: status, errorCode: data.errorCode || null },
        },
      });
      return changed;
    });
    this.events.emitJobUpdate(updated);
    return updated;
  }

  private metadata(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  async getStats() {
    const totalJobs = await this.prisma.job.count();
    const byStatus = await this.prisma.job.groupBy({
      by: ['status'],
      _count: { status: true },
    });
    const byType = await this.prisma.job.groupBy({
      by: ['type'],
      _count: { type: true },
    });

    return {
      totalJobs,
      byStatus: byStatus.map((item) => ({
        status: item.status,
        count: item._count.status,
      })),
      byType: byType.map((item) => ({
        type: item.type,
        count: item._count.type,
      })),
    };
  }

  getDeadLetters() {
    return this.queue.getDeadLetters();
  }

  retryDeadLetter(id: string) {
    return this.queue.retryDeadLetter(id);
  }
}
