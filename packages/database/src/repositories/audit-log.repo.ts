import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface AuditLogDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  changes: Record<string, unknown> | null;
}

export class AuditLogRepository extends BaseRepository<AuditLogDoc> {
  protected readonly collectionName = 'audit_logs';
}

export const auditLogRepo = new AuditLogRepository();
