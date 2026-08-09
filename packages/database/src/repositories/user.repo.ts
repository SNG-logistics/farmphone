import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface UserDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  permissions: string[];
  isActive: boolean;
  lastLoginAt: string | null;
  refreshToken: string | null;
}

export class UserRepository extends BaseRepository<UserDoc> {
  protected readonly collectionName = 'users';
}

export const userRepo = new UserRepository();