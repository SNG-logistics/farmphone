import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface NotificationDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  channel: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  metadata: Record<string, unknown> | null;
}

export class NotificationRepository extends BaseRepository<NotificationDoc> {
  protected readonly collectionName = 'notifications';
}

export const notificationRepo = new NotificationRepository();