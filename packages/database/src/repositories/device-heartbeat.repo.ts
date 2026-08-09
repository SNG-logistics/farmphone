import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface DeviceHeartbeatDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  deviceId: string;
  deviceCode: string;
  serialNumber: string;
  status: string;
  batteryLevel: number;
  storageUsed: number;
  storageTotal: number;
  androidVersion: string;
  model: string;
  currentJobId: string | null;
  agentVersion: string;
  timestamp: string;
}

export class DeviceHeartbeatRepository extends BaseRepository<DeviceHeartbeatDoc> {
  protected readonly collectionName = 'device_heartbeats';

  async findRecentByDevice(deviceId: string, limit = 10): Promise<DeviceHeartbeatDoc[]> {
    return this.findMany(
      [{ field: 'deviceId', operator: '==', value: deviceId }],
      { field: 'timestamp', direction: 'desc' },
      limit,
    );
  }
}

export const deviceHeartbeatRepo = new DeviceHeartbeatRepository();
