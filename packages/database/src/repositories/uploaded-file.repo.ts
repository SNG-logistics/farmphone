import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface UploadedFileDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  deviceId: string | null;
  jobId: string | null;
  filename: string;
  mimeType: string | null;
  size: number;
  checksum: string;
  storageKey: string;
  url: string | null;
  destination: string | null;
  status: string;
}

export class UploadedFileRepository extends BaseRepository<UploadedFileDoc> {
  protected readonly collectionName = 'uploaded_files';
}

export const uploadedFileRepo = new UploadedFileRepository();