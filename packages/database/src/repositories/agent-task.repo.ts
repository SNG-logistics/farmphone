import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface AgentTaskDoc extends BaseEntity, FirestoreDoc {
  agentId: string;
  parentTaskId: string | null;
  missionId: string | null;
  type: string;
  title: string;
  description: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

export class AgentTaskRepository extends BaseRepository<AgentTaskDoc> {
  protected readonly collectionName = 'agent_tasks';
}

export const agentTaskRepo = new AgentTaskRepository();
