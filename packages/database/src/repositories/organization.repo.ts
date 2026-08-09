import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface OrganizationDoc extends BaseEntity, FirestoreDoc {
  name: string;
  planId: string | null;
  creditBalance: number;
  isActive: boolean;
}

export class OrganizationRepository extends BaseRepository<OrganizationDoc> {
  protected readonly collectionName = 'organizations';
}

export const organizationRepo = new OrganizationRepository();
