import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { MissionExecutionService } from './mission-execution.service';

export interface CreateVideoJobParameters {
  brief: string;
  brandName?: string;
  language?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
  tone?: string;
  callToAction?: string;
}

@Injectable()
export class VideoCreationQueueService {
  private readonly logger = new Logger(VideoCreationQueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly missionExecution: MissionExecutionService,
  ) {}

  async enqueueVideoJob(
    organizationId: string,
    params: CreateVideoJobParameters,
    idempotencyKey?: string,
  ) {
    const brief = params.brief || 'สร้างวิดีโอ TikTok SNG EXPRESS ขนส่งไทย-ลาว';
    const key = idempotencyKey || `video-create-${Date.now()}`;

    // Idempotency check
    if (idempotencyKey) {
      const existing = await this.prisma.job.findFirst({
        where: { organizationId, idempotencyKey: key },
        include: { content: true },
      });
      if (existing) {
        return { duplicate: true, job: existing };
      }
    }

    // Create Job record
    const job = await this.prisma.job.create({
      data: {
        organizationId,
        type: 'VIDEO_CREATE',
        status: 'QUEUED',
        idempotencyKey: key,
        parameters: params as any,
        metadata: { name: `VIDEO_CREATE: ${params.brandName || 'SNG EXPRESS'}`, description: brief, progress: 5, step: 'QUEUED' },
      },
    });

    this.events.emitJobUpdate({ organizationId, job });

    // Process video pipeline asynchronously
    setImmediate(async () => {
      try {
        await this.prisma.job.update({
          where: { id: job.id },
          data: { status: 'RUNNING', startedAt: new Date() },
        });

        const result = await this.missionExecution.executeVideoCreationPipeline({
          organizationId,
          jobId: job.id,
          brief,
          brandName: params.brandName,
          durationSeconds: params.durationSeconds,
          aspectRatio: params.aspectRatio,
          resolution: params.resolution,
          tone: params.tone,
          callToAction: params.callToAction,
          onProgress: async (percent, step) => {
            let status = 'RUNNING';
            if (percent >= 60 && percent < 85) status = 'RENDERING';
            if (percent >= 85 && percent < 95) status = 'VERIFYING';
            if (percent === 100) status = 'SUCCESS';

            await this.prisma.job.update({
              where: { id: job.id },
              data: {
                status,
                metadata: { progress: percent, step },
              },
            }).catch(() => {});
          },
        });

        await this.prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'SUCCESS',
            contentId: result.contentId,
            completedAt: new Date(),
            metadata: {
              progress: 100,
              step: 'SUCCESS',
              videoUrl: result.videoUrl,
              thumbnailUrl: result.thumbnailUrl,
              fileSize: result.fileSize,
              duration: result.duration,
              checksum: result.checksum,
            },
          },
        });

        const updatedJob = await this.prisma.job.findUnique({ where: { id: job.id } });
        if (updatedJob) this.events.emitJobUpdate({ organizationId, job: updatedJob });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Video job ${job.id} failed: ${errorMsg}`);
        await this.prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            errorMessage: errorMsg,
            completedAt: new Date(),
          },
        });
        const failedJob = await this.prisma.job.findUnique({ where: { id: job.id } });
        if (failedJob) this.events.emitJobUpdate({ organizationId, job: failedJob });
      }
    });

    return { duplicate: false, job };
  }
}
