import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface AccountDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  platform: string;
  username: string;
  nickname: string | null;
  status: string;
  assignedDeviceId: string | null;
  authStatus: string;
  encryptedToken: string | null;
  lastJobAt: string | null;
  todayJobCount: number;
  metadata: Record<string, unknown> | null;
}

export class AccountRepository extends BaseRepository<AccountDoc> {
  protected readonly collectionName = 'accounts';
}

export const accountRepo = new AccountRepository();