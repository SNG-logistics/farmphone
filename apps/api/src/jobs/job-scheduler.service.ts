import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { JobQueueService } from './job-queue.service';
import { FirestoreQuotaBackoff, positiveInteger } from '../stability/firestore-quota-backoff';

@Injectable()
export class JobSchedulerService {
  private readonly logger = new Logger(JobSchedulerService.name);
  private readonly quotaBackoff = new FirestoreQuotaBackoff(
    positiveInteger(process.env.FIRESTORE_QUOTA_BACKOFF_MS, 15 * 60_000),
    positiveInteger(process.env.FIRESTORE_QUOTA_BACKOFF_MAX_MS, 60 * 60_000),
  );

  constructor(private prisma: PrismaService, private queue: JobQueueService) {}

  @Cron('*/30 * * * * *')
  async enqueueDueJobs() {
    const now = Date.now();
    if (!this.quotaBackoff.canAttempt(now)) return;
    try {
      const dueJobs = await this.prisma.job.findMany({
        where: {
          status: 'CREATED',
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date(now) } }],
        },
        take: 20,
        orderBy: { createdAt: 'asc' },
      });
      for (const job of dueJobs) await this.queue.enqueue(job.id, job.scheduledAt);
      this.quotaBackoff.recordSuccess();
    } catch (error) {
      const delayMs = this.quotaBackoff.recordFailure(error, now);
      if (delayMs === null) throw error;
      this.logger.warn(`Firestore quota exhausted; job scheduler paused for ${Math.ceil(delayMs / 60_000)} minute(s)`);
    }
  }
}
