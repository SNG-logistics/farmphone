import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface AiAgentDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  code: string;
  name: string;
  role: string;
  avatar: string;
  status: string;
  currentTaskId: string | null;
  lastActivityAt: string;
  config: Record<string, unknown>;
}

export class AiAgentRepository extends BaseRepository<AiAgentDoc> {
  protected readonly collectionName = 'ai_agents';
}

export const aiAgentRepo = new AiAgentRepository();