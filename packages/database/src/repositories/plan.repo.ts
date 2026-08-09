import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface PlanDoc extends BaseEntity, FirestoreDoc {
  name: string;
  maxDevices: number;
  maxAccounts: number;
  monthlyPrice: number;
  includedCredits: number;
  features: string[];
  isActive: boolean;
}

export class PlanRepository extends BaseRepository<PlanDoc> {
  protected readonly collectionName = 'plans';
}

export const planRepo = new PlanRepository();
