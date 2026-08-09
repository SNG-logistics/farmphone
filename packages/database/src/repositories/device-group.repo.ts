import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface DeviceGroupDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  name: string;
  nodeId: string;
  deviceCount: number;
}

export class DeviceGroupRepository extends BaseRepository<DeviceGroupDoc> {
  protected readonly collectionName = 'device_groups';
}

export const deviceGroupRepo = new DeviceGroupRepository();
