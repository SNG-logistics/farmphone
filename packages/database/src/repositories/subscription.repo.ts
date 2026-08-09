import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface SubscriptionDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  planId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

export class SubscriptionRepository extends BaseRepository<SubscriptionDoc> {
  protected readonly collectionName = 'subscriptions';
}

export const subscriptionRepo = new SubscriptionRepository();
