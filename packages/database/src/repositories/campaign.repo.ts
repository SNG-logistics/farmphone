import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface CampaignDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  name: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  accountIds: string[];
  contentIds: string[];
  deviceGroupId: string | null;
  schedule: string | null;
  dailyLimit: number;
  status: string;
  totalJobs: number;
  successJobs: number;
  failedJobs: number;
}

export class CampaignRepository extends BaseRepository<CampaignDoc> {
  protected readonly collectionName = 'campaigns';
}

export const campaignRepo = new CampaignRepository();