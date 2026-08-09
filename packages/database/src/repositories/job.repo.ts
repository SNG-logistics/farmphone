import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface JobDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  campaignId: string | null;
  accountId: string | null;
  deviceId: string | null;
  contentId: string | null;
  type: string;
  priority: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  status: string;
  parameters: Record<string, unknown>;
  result: Record<string, unknown> | null;
  attempts: number;
  maxAttempts: number;
  retryCount: number;
  maxRetries: number;
  errorCode: string | null;
  errorMessage: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown> | null;
}

export class JobRepository extends BaseRepository<JobDoc> {
  protected readonly collectionName = 'jobs';
}

export const jobRepo = new JobRepository();