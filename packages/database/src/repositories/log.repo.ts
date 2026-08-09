import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface LogDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  level: string;
  category: string;
  message: string;
  userId: string | null;
  agentId: string | null;
  deviceId: string | null;
  jobId: string | null;
  metadata: Record<string, unknown> | null;
}

export class LogRepository extends BaseRepository<LogDoc> {
  protected readonly collectionName = 'logs';
}

export const logRepo = new LogRepository();
