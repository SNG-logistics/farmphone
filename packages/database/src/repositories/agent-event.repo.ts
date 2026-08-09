import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface AgentEventDoc extends BaseEntity, FirestoreDoc {
  agentId: string;
  eventType: string;
  message: string;
  metadata: Record<string, unknown> | null;
}

export class AgentEventRepository extends BaseRepository<AgentEventDoc> {
  protected readonly collectionName = 'agent_events';
}

export const agentEventRepo = new AgentEventRepository();
