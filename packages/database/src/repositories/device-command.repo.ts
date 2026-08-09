import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface DeviceCommandDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  deviceId: string;
  jobId: string;
  command: string;
  parameters: Record<string, unknown>;
  status: string;
  result: Record<string, unknown> | null;
  errorCode: string;
  errorMessage: string;
  requestedAt: string;
  assignedAt: string;
  startedAt: string;
  completedAt: string;
}

export class DeviceCommandRepository extends BaseRepository<DeviceCommandDoc> {
  protected readonly collectionName = 'device_commands';
}

export const deviceCommandRepo = new DeviceCommandRepository();