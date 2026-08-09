import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface WorkflowStepDoc extends BaseEntity, FirestoreDoc {
  missionId: string;
  sortOrder: number;
  name: string;
  status: string;
  agentCode: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

export class WorkflowStepRepository extends BaseRepository<WorkflowStepDoc> {
  protected readonly collectionName = 'workflow_steps';
}

export const workflowStepRepo = new WorkflowStepRepository();
