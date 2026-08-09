import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface JobLogDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  jobId: string;
  deviceId: string | null;
  level: string;
  message: string;
  attemptNumber: number | null;
  errorCode: string | null;
  adbOutput: string | null;
  metadata: Record<string, unknown> | null;
}

export class JobLogRepository extends BaseRepository<JobLogDoc> {
  protected readonly collectionName = 'job_logs';
}

export const jobLogRepo = new JobLogRepository();
