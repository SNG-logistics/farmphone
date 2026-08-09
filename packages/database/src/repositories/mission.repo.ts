import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface MissionDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  name: string;
  description: string;
  status: string;
  campaignId: string | null;
  createdBy: string;
  startedAt: string | null;
  completedAt: string | null;
}

export class MissionRepository extends BaseRepository<MissionDoc> {
  protected readonly collectionName = 'missions';
}

export const missionRepo = new MissionRepository();