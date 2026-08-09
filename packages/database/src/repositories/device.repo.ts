import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface DeviceDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  deviceGroupId: string | null;
  code: string;
  name: string;
  serialNumber: string | null;
  manufacturer: string;
  model: string;
  osVersion: string;
  adbStatus: string;
  battery: number;
  storage: number;
  storageUsed: number;
  storageTotal: number;
  agentVersion: string;
  networkType: string;
  assignedAccountId: string | null;
  currentJobId: string | null;
  lastHeartbeatAt: string | null;
  nodeId: string;
  metadata: Record<string, unknown> | null;
}

export class DeviceRepository extends BaseRepository<DeviceDoc> {
  protected readonly collectionName = 'devices';

  async findByCode(code: string): Promise<DeviceDoc | null> {
    const results = await this.findMany([
      { field: 'code', operator: '==', value: code },
    ], undefined, 1);
    return results[0] || null;
  }

  async findByNode(nodeId: string): Promise<DeviceDoc[]> {
    return this.findMany([
      { field: 'nodeId', operator: '==', value: nodeId },
    ]);
  }

  async findByStatus(status: string): Promise<DeviceDoc[]> {
    return this.findMany([
      { field: 'adbStatus', operator: '==', value: status },
    ]);
  }
}

export const deviceRepo = new DeviceRepository();
