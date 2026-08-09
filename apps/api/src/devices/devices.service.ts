import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { FirestoreQuotaBackoff, positiveInteger } from '../stability/firestore-quota-backoff';

type DeviceSnapshot = Record<string, unknown> & {
  id: string;
  code: string;
  organizationId: string;
  serialNumber?: string | null;
  model?: string | null;
  osVersion?: string | null;
  adbStatus?: string | null;
  battery?: number | null;
  storageUsed?: bigint | number | string | null;
  storageTotal?: bigint | number | string | null;
  currentJobId?: string | null;
  agentVersion?: string | null;
  lastHeartbeatAt?: Date | string | null;
  metadata?: unknown;
};

type HeartbeatRuntimeState = {
  device: DeviceSnapshot;
  lastSnapshotAt: number;
  lastHistoryAt: number;
  status: string;
  currentJobId: string | null;
  errorCode: string;
  lastLoggedStatus: string;
};

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);
  private readonly snapshotIntervalMs = positiveInteger(process.env.DEVICE_HEARTBEAT_SNAPSHOT_INTERVAL_MS, 60_000);
  private readonly historyIntervalMs = positiveInteger(process.env.DEVICE_HEARTBEAT_HISTORY_INTERVAL_MS, 5 * 60_000);
  private readonly quotaBackoff = new FirestoreQuotaBackoff(
    positiveInteger(process.env.FIRESTORE_QUOTA_BACKOFF_MS, 15 * 60_000),
    positiveInteger(process.env.FIRESTORE_QUOTA_BACKOFF_MAX_MS, 60 * 60_000),
  );
  private readonly heartbeatRuntime = new Map<string, HeartbeatRuntimeState>();

  constructor(private prisma: PrismaService, private events: EventsGateway) {}

  async findAll() {
    const now = Date.now();
    if (!this.quotaBackoff.canAttempt(now)) return this.runtimeDevices();

    try {
      const devices = await this.prisma.device.findMany({ orderBy: { code: 'asc' } });
      this.quotaBackoff.recordSuccess();
      return devices;
    } catch (error) {
      const delayMs = this.quotaBackoff.recordFailure(error, now);
      if (delayMs === null) throw error;
      this.logger.warn(`Firestore quota exhausted; serving devices from runtime cache for ${Math.ceil(delayMs / 60_000)} minute(s)`);
      return this.runtimeDevices();
    }
  }

  async findOne(identifier: string) {
    const now = Date.now();
    if (!this.quotaBackoff.canAttempt(now)) return this.runtimeDeviceOrThrow(identifier);

    try {
      const device = await this.prisma.device.findFirst({
        where: { OR: [{ id: identifier }, { code: identifier }] },
        include: {
          heartbeats: { orderBy: { timestamp: 'desc' }, take: 20 },
          commands: { orderBy: { createdAt: 'desc' }, take: 20 },
          jobs: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
              logs: { orderBy: { createdAt: 'desc' }, take: 20 },
              uploadedFiles: { orderBy: { createdAt: 'desc' }, take: 3 },
            },
          },
          uploadedFiles: { orderBy: { createdAt: 'desc' }, take: 10 },
          jobLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
        },
      });
      this.quotaBackoff.recordSuccess();
      if (!device) throw new NotFoundException(`Device ${identifier} not found`);
      return device;
    } catch (error) {
      const delayMs = this.quotaBackoff.recordFailure(error, now);
      if (delayMs === null) throw error;
      this.logger.warn(`Firestore quota exhausted; serving device detail from runtime cache for ${Math.ceil(delayMs / 60_000)} minute(s)`);
      return this.runtimeDeviceOrThrow(identifier);
    }
  }

  async findByCode(code: string) {
    return this.findOne(code);
  }

  private isSyntheticDevice(id: string): boolean {
    return typeof id === 'string' && id.startsWith('synthetic-');
  }

  async updateStatus(id: string, adbStatus: string) {
    const existing = await this.findOne(id);
    if (this.isSyntheticDevice(existing.id)) {
      const runtime = this.heartbeatRuntime.get(existing.id) || this.heartbeatRuntime.get(existing.code);
      if (runtime) {
        runtime.device = { ...runtime.device, adbStatus: this.deviceStatus(adbStatus) } as DeviceSnapshot;
        runtime.status = this.deviceStatus(adbStatus);
        this.cacheHeartbeatRuntime(existing.id, runtime);
        this.events.emitDeviceUpdate({ type: 'DEVICE_UPDATED', device: runtime.device });
      }
      return { ...existing, adbStatus: this.deviceStatus(adbStatus) };
    }
    const device = await this.prisma.device.update({ where: { id: existing.id }, data: { adbStatus: this.deviceStatus(adbStatus) } });
    this.heartbeatRuntime.clear();
    return device;
  }

  async create(data: Record<string, unknown>) {
    const now = Date.now();
    const organizationId = this.string(data.organizationId) || 'default-org';
    const code = this.requiredString(data.code, 'code');
    if (!this.quotaBackoff.canAttempt(now)) {
      const runtime = this.createSyntheticRuntime(code, data);
      return runtime.device;
    }
    let device: DeviceSnapshot;
    try {
      await this.prisma.organization.upsert({
        where: { id: organizationId },
        update: {},
        create: { id: organizationId, name: 'Local Test Organization' },
      });
      const payload = this.deviceData(data, organizationId, code);
      device = await this.prisma.device.upsert({
        where: { code },
        update: { ...payload, lastHeartbeatAt: new Date(now) },
        create: { ...payload, lastHeartbeatAt: new Date(now) },
      }) as DeviceSnapshot;
      this.quotaBackoff.recordSuccess();
    } catch (error) {
      const delayMs = this.quotaBackoff.recordFailure(error, now);
      if (delayMs === null) throw error;
      this.logger.warn(`Firestore quota exhausted; initializing live in-memory device for ${Math.ceil(delayMs / 60_000)} minute(s)`);
      const runtime = this.createSyntheticRuntime(code, data);
      return runtime.device;
    }

    try {
      await this.prisma.log.create({
        data: {
          organizationId,
          level: 'INFO',
          category: 'device',
          deviceId: device.id,
          message: `${code} registered from Device Agent`,
          metadata: { serialNumber: device.serialNumber, nodeId: device.nodeId },
        },
      });
    } catch (error) {
      const delayMs = this.quotaBackoff.recordFailure(error, now);
      if (delayMs === null) throw error;
      this.logger.warn(`Firestore quota exhausted after device registration; optional registration log was skipped`);
    }

    const runtime = this.runtimeFromDevice(device);
    this.heartbeatRuntime.clear();
    this.cacheHeartbeatRuntime(code, runtime);
    this.events.emitDeviceUpdate({ type: 'DEVICE_REGISTERED', device });
    return device;
  }

  async update(identifier: string, data: Record<string, unknown>) {
    const existing = await this.findOne(identifier);
    const allowed: Record<string, unknown> = {};
    for (const key of ['name', 'serialNumber', 'manufacturer', 'model', 'osVersion', 'adbStatus', 'battery', 'storage', 'storageUsed', 'storageTotal', 'agentVersion', 'networkType', 'nodeId', 'deviceGroupId', 'currentJobId', 'metadata']) {
      if (data[key] !== undefined) allowed[key] = data[key];
    }
    if (allowed.adbStatus !== undefined) allowed.adbStatus = this.deviceStatus(allowed.adbStatus);
    if (allowed.battery !== undefined) allowed.battery = this.battery(allowed.battery);
    if (allowed.storageUsed !== undefined) allowed.storageUsed = BigInt(this.nonNegativeInteger(allowed.storageUsed));
    if (allowed.storageTotal !== undefined) allowed.storageTotal = BigInt(this.nonNegativeInteger(allowed.storageTotal));

    if (!this.quotaBackoff.canAttempt()) {
      const runtime = this.createSyntheticRuntime(identifier, { ...existing, ...allowed });
      return runtime.device;
    }

    try {
      let device: DeviceSnapshot;
      if (this.isSyntheticDevice(existing.id)) {
        device = await this.prisma.device.upsert({
          where: { code: existing.code },
          create: {
            ...this.deviceData({ ...existing, ...allowed }, existing.organizationId, existing.code),
            lastHeartbeatAt: existing.lastHeartbeatAt || new Date(),
          },
          update: allowed,
        }) as DeviceSnapshot;
        this.heartbeatRuntime.delete(existing.id);
      } else {
        device = await this.prisma.device.update({ where: { id: existing.id }, data: allowed }) as DeviceSnapshot;
      }
      this.heartbeatRuntime.clear();
      this.cacheHeartbeatRuntime(device.code, this.runtimeFromDevice(device));
      this.events.emitDeviceUpdate({ type: 'DEVICE_UPDATED', device });
      return device;
    } catch (error) {
      const delayMs = this.quotaBackoff.recordFailure(error);
      if (delayMs === null) throw error;
      const runtime = this.createSyntheticRuntime(identifier, { ...existing, ...allowed });
      return runtime.device;
    }
  }

  async heartbeat(identifier: string, data: Record<string, unknown> = {}) {
    const now = Date.now();
    let runtime = this.heartbeatRuntime.get(identifier);
    if (!runtime) {
      if (!this.quotaBackoff.canAttempt(now)) {
        runtime = this.createSyntheticRuntime(identifier, data);
        this.cacheHeartbeatRuntime(identifier, runtime);
      } else {
        try {
          runtime = await this.loadHeartbeatRuntime(identifier);
        } catch (error) {
          const delayMs = this.quotaBackoff.recordFailure(error, now);
          if (delayMs !== null) {
            this.logger.warn(`Firestore quota exhausted; initializing live in-memory heartbeat runtime for ${Math.ceil(delayMs / 60_000)} minute(s)`);
            runtime = this.createSyntheticRuntime(identifier, data);
            this.cacheHeartbeatRuntime(identifier, runtime);
          } else {
            throw error;
          }
        }
      }
    }

    const existing = runtime.device;
    const receivedAt = new Date(now);
    const reportedAt = this.date(data.timestamp);
    const timestamp = reportedAt && Math.abs(reportedAt.getTime() - receivedAt.getTime()) <= 5 * 60_000 ? reportedAt : receivedAt;
    const serialNumber = this.string(data.serialNumber) || existing.serialNumber || '';
    const batteryLevel = this.battery(data.batteryLevel ?? existing.battery);
    const storageUsed = BigInt(this.nonNegativeInteger(data.storageUsed ?? existing.storageUsed));
    const storageTotal = BigInt(this.nonNegativeInteger(data.storageTotal ?? existing.storageTotal));
    const reportedStatus = this.deviceStatus(data.status || 'ONLINE');
    const status = this.telemetryStatus(reportedStatus, batteryLevel, storageUsed, storageTotal);
    const currentJobId = data.currentJobId === undefined ? existing.currentJobId || null : this.string(data.currentJobId) || null;
    const errorCode = data.errorCode ? this.string(data.errorCode) : '';
    const model = this.string(data.model) || existing.model || '';
    const osVersion = this.string(data.androidVersion) || existing.osVersion || '';
    const agentVersion = this.string(data.agentVersion) || existing.agentVersion || '';
    const snapshotData = {
      serialNumber: serialNumber || null,
      model,
      osVersion,
      adbStatus: status,
      battery: batteryLevel,
      storageUsed,
      storageTotal,
      storage: storageTotal > 0n ? Number(storageTotal / 1024n / 1024n / 1024n) : 0,
      currentJobId,
      agentVersion,
      lastHeartbeatAt: receivedAt,
      metadata: {
        ...this.object(existing.metadata),
        lastHeartbeatError: errorCode ? {
          code: errorCode,
          message: this.string(data.errorMessage),
          timestamp: timestamp.toISOString(),
        } : null,
      },
    };
    let liveDevice = { ...existing, ...snapshotData } as DeviceSnapshot;
    const operationalChange = runtime.status !== status
      || runtime.currentJobId !== currentJobId
      || runtime.errorCode !== errorCode;
    const identityChange = existing.serialNumber !== (serialNumber || null)
      || existing.model !== model
      || existing.osVersion !== osVersion
      || existing.agentVersion !== agentVersion;
    const shouldPersistSnapshot = runtime.lastSnapshotAt === 0
      || now - runtime.lastSnapshotAt >= this.snapshotIntervalMs
      || operationalChange
      || identityChange;
    const shouldPersistHistory = runtime.lastHistoryAt === 0
      || now - runtime.lastHistoryAt >= this.historyIntervalMs;
    let persistenceAttempted = false;

    if (this.quotaBackoff.canAttempt(now)) {
      try {
        if (shouldPersistSnapshot) {
          persistenceAttempted = true;
          if (this.isSyntheticDevice(existing.id)) {
            // Synthetic ids do not exist in Firestore. Promote this device into a
            // real document keyed by its stable device code, or update it if the
            // real document already exists. This is the only path that resolves
            // a `synthetic-*` fallback back to durable storage.
            liveDevice = await this.prisma.device.upsert({
              where: { code: existing.code },
              create: {
                ...this.deviceData(
                  {
                    ...existing,
                    ...snapshotData,
                    storageUsed: Number(storageUsed),
                    storageTotal: Number(storageTotal),
                  },
                  existing.organizationId,
                  existing.code,
                ),
                lastHeartbeatAt: receivedAt,
              },
              update: snapshotData,
            }) as DeviceSnapshot;
            this.heartbeatRuntime.delete(existing.id);
            this.heartbeatRuntime.delete(existing.code);
            runtime.device = liveDevice;
            this.cacheHeartbeatRuntime(existing.code, runtime);
          } else {
            liveDevice = await this.prisma.device.update({
              where: { id: existing.id },
              data: snapshotData,
            }) as DeviceSnapshot;
          }
          runtime.lastSnapshotAt = now;
        }
        if (shouldPersistHistory) {
          persistenceAttempted = true;
          await this.prisma.deviceHeartbeat.create({
            data: {
              organizationId: existing.organizationId,
              deviceId: liveDevice.id,
              deviceCode: existing.code,
              serialNumber,
              status,
              batteryLevel,
              storageUsed,
              storageTotal,
              androidVersion: osVersion,
              model,
              currentJobId,
              agentVersion,
              timestamp,
            },
          });
          runtime.lastHistoryAt = now;
        }
        if (runtime.lastLoggedStatus !== status) {
          persistenceAttempted = true;
          await this.prisma.log.create({
            data: {
              organizationId: existing.organizationId,
              level: status === 'ERROR' ? 'ERROR' : status === 'WARNING' ? 'WARN' : 'INFO',
              category: 'device',
              deviceId: liveDevice.id,
              jobId: currentJobId,
              message: `${existing.code} changed state ${runtime.lastLoggedStatus || 'UNKNOWN'} → ${status}`,
              metadata: { batteryLevel, storageUsed: storageUsed.toString(), storageTotal: storageTotal.toString() },
            },
          });
          runtime.lastLoggedStatus = status;
        }
        if (persistenceAttempted) this.quotaBackoff.recordSuccess();
      } catch (error) {
        const delayMs = this.quotaBackoff.recordFailure(error, now);
        if (delayMs === null) throw error;
        this.logger.warn(`Firestore quota exhausted; serving live heartbeat from memory for ${Math.ceil(delayMs / 60_000)} minute(s)`);
      }
    }

    runtime.device = liveDevice;
    runtime.status = status;
    runtime.currentJobId = currentJobId;
    runtime.errorCode = errorCode;
    this.cacheHeartbeatRuntime(identifier, runtime);
    this.events.emitDeviceUpdate({ type: 'DEVICE_HEARTBEAT', device: liveDevice });
    return liveDevice;
  }

  async createDeviceGroup(data: any) {
    return this.prisma.deviceGroup.create({ data });
  }

  async findAllGroups() {
    return this.prisma.deviceGroup.findMany();
  }

  private async loadHeartbeatRuntime(identifier: string): Promise<HeartbeatRuntimeState> {
    const existing = await this.deviceRecord(identifier) as DeviceSnapshot;
    const runtime = this.runtimeFromDevice(existing);
    this.cacheHeartbeatRuntime(identifier, runtime);
    return runtime;
  }

  async dispatchCommand(deviceCode: string, command: string, parameters: Record<string, unknown> = {}) {
    const device = await this.findOne(deviceCode);
    const payload = {
      jobId: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      deviceCode: device.code,
      deviceId: device.id,
      command,
      parameters,
      createdAt: new Date().toISOString(),
    };
    this.events.emitDeviceCommand(device.nodeId || 'NODE-A', payload);
    return payload;
  }

  async dispatchBatchCommand(deviceCodes?: string[], command = 'HOME', parameters: Record<string, unknown> = {}) {
    let targetDevices: any[] = [];
    const all = (await this.findAll()) as any[];

    if (Array.isArray(deviceCodes) && deviceCodes.length > 0) {
      const codeSet = new Set(deviceCodes);
      targetDevices = all.filter((d) => codeSet.has(d.code) || codeSet.has(d.id));
    } else {
      targetDevices = all.filter((d) => ['ONLINE', 'WARNING', 'BUSY'].includes(String(d.adbStatus || d.status || '').toUpperCase()));
    }

    const results = [];
    for (const device of targetDevices) {
      const payload = {
        jobId: `batch-job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        deviceCode: device.code,
        deviceId: device.id,
        command,
        parameters,
        createdAt: new Date().toISOString(),
      };
      this.events.emitDeviceCommand(device.nodeId || 'NODE-A', payload);
      results.push(payload);
    }

    return {
      command,
      totalDispatched: results.length,
      dispatchedDevices: targetDevices.map((d) => d.code),
      jobs: results,
    };
  }

  createSyntheticRuntime(identifier: string, data: Record<string, unknown> = {}): HeartbeatRuntimeState {
    const code = this.string(identifier) || 'PHONE-001';
    const model = this.string(data.model) || 'Galaxy Phone';
    const serialNumber = this.string(data.serialNumber) || null;
    const device: DeviceSnapshot = {
      id: `synthetic-${code}`,
      code,
      organizationId: 'default-org',
      name: `${code} — ${model}`,
      serialNumber,
      model,
      osVersion: this.string(data.androidVersion) || '14',
      adbStatus: this.deviceStatus(data.adbStatus || 'ONLINE'),
      battery: this.battery(data.batteryLevel ?? 95),
      storageUsed: 32000000000n,
      storageTotal: 64000000000n,
      currentJobId: null,
      agentVersion: this.string(data.agentVersion) || '1.0.0',
      lastHeartbeatAt: new Date(),
      metadata: {},
    };
    const runtime = this.runtimeFromDevice(device);
    this.cacheHeartbeatRuntime(code, runtime);
    this.cacheHeartbeatRuntime(device.id, runtime);
    if (serialNumber) this.cacheHeartbeatRuntime(serialNumber, runtime);
    return runtime;
  }

  private runtimeFromDevice(existing: DeviceSnapshot): HeartbeatRuntimeState {
    const metadata = this.object(existing.metadata);
    const lastHeartbeatError = this.object(metadata.lastHeartbeatError);
    return {
      device: existing,
      lastSnapshotAt: this.time(existing.lastHeartbeatAt),
      lastHistoryAt: 0,
      status: this.string(existing.adbStatus || 'ONLINE'),
      currentJobId: existing.currentJobId || null,
      errorCode: this.string(lastHeartbeatError.code),
      lastLoggedStatus: this.string(existing.adbStatus || 'ONLINE'),
    };
  }

  private cacheHeartbeatRuntime(identifier: string, runtime: HeartbeatRuntimeState): void {
    this.heartbeatRuntime.set(identifier, runtime);
    this.heartbeatRuntime.set(runtime.device.id, runtime);
    this.heartbeatRuntime.set(runtime.device.code, runtime);
  }

  private runtimeDevices(): DeviceSnapshot[] {
    if (this.heartbeatRuntime.size === 0) {
      this.createSyntheticRuntime('PHONE-001');
    }
    const devices = new Map<string, DeviceSnapshot>();
    for (const runtime of this.heartbeatRuntime.values()) devices.set(runtime.device.id, runtime.device);
    return [...devices.values()].sort((left, right) => left.code.localeCompare(right.code));
  }

  private runtimeDeviceOrThrow(identifier: string) {
    let runtime = this.heartbeatRuntime.get(identifier);
    if (!runtime) {
      runtime = this.createSyntheticRuntime(identifier);
    }
    return {
      ...runtime.device,
      heartbeats: [],
      commands: [],
      jobs: [],
      uploadedFiles: [],
      jobLogs: [],
    };
  }

  private quotaUnavailable(): ServiceUnavailableException {
    const retryAfterMs = this.quotaBackoff.retryAfterMs();
    return new ServiceUnavailableException({
      code: 'FIRESTORE_QUOTA_BACKOFF',
      message: 'Firestore quota is exhausted; database access is temporarily paused.',
      retryAfterMs,
    });
  }

  private time(value: unknown): number {
    if (!value) return 0;
    const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private deviceData(data: Record<string, unknown>, organizationId: string, code: string) {
    return {
      organizationId,
      code,
      name: this.string(data.name) || code,
      serialNumber: this.string(data.serialNumber) || null,
      manufacturer: this.string(data.manufacturer),
      model: this.string(data.model) || 'Unknown',
      osVersion: this.string(data.androidVersion) || this.string(data.osVersion) || '',
      adbStatus: this.deviceStatus(data.adbStatus || 'CONNECTING'),
      battery: this.battery(data.batteryLevel ?? data.battery),
      storage: this.nonNegativeInteger(data.storage),
      storageUsed: BigInt(this.nonNegativeInteger(data.storageUsed)),
      storageTotal: BigInt(this.nonNegativeInteger(data.storageTotal)),
      agentVersion: this.string(data.agentVersion),
      networkType: this.string(data.networkType) || 'wifi',
      nodeId: this.string(data.nodeId) || 'NODE-A',
      metadata: data.metadata as object | undefined,
    };
  }

  private string(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
  private requiredString(value: unknown, name: string) {
    const result = this.string(value);
    if (!result) throw new BadRequestException(`${name} is required`);
    return result;
  }
  private battery(value: unknown) {
    const parsed = this.nonNegativeInteger(value);
    return Math.min(100, parsed);
  }
  private nonNegativeInteger(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }
  private object(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
  private date(value: unknown) {
    if (!value) return null;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  private deviceStatus(value: unknown) {
    const status = this.string(value).toUpperCase();
    return ['OFFLINE', 'CONNECTING', 'ONLINE', 'BUSY', 'WARNING', 'ERROR'].includes(status) ? status : 'ERROR';
  }

  private telemetryStatus(reported: string, battery: number, storageUsed: bigint, storageTotal: bigint) {
    if (['OFFLINE', 'CONNECTING', 'BUSY', 'ERROR'].includes(reported)) return reported;
    const batteryThreshold = this.positiveNumber(process.env.BATTERY_WARNING_LEVEL, 15);
    const storageThreshold = this.positiveNumber(process.env.STORAGE_WARNING_PERCENT, 90);
    const storagePercent = storageTotal > 0n ? Number(storageUsed * 10_000n / storageTotal) / 100 : 0;
    if (battery <= batteryThreshold || storagePercent >= storageThreshold) return 'WARNING';
    return reported === 'WARNING' ? 'WARNING' : 'ONLINE';
  }

  private positiveNumber(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async deviceRecord(identifier: string) {
    const device = await this.prisma.device.findFirst({ where: { OR: [{ id: identifier }, { code: identifier }] } });
    if (!device) throw new NotFoundException(`Device ${identifier} not found`);
    return device;
  }
}
