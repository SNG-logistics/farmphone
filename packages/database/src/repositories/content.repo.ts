import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface ContentDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  title: string;
  type: string;
  url: string;
  thumbnailUrl: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  caption: string | null;
  hashtags: string[];
  tags: string[];
  status: string;
  usageCount: number;
  campaignId: string | null;
}

export class ContentRepository extends BaseRepository<ContentDoc> {
  protected readonly collectionName = 'content';
}

export const contentRepo = new ContentRepository();