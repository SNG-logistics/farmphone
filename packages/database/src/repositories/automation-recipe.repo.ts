import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface AutomationRecipeDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  name: string;
  description: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  version: number;
  steps: Record<string, unknown>[];
  runCount: number;
  lastRunAt: string | null;
}

export class AutomationRecipeRepository extends BaseRepository<AutomationRecipeDoc> {
  protected readonly collectionName = 'automation_recipes';
}

export const automationRecipeRepo = new AutomationRecipeRepository();
