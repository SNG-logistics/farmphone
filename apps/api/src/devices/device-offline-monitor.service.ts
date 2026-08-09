import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { AdbService } from './adb.service';
import { DevicesService } from './devices.service';
import { FirestoreQuotaBackoff, positiveInteger } from '../stability/firestore-quota-backoff';

type AdbDevice = {
  serial: string;
  state: string;
  model?: string;
  battery?: number;
  storageGb?: number;
};

type StoredDevice = {
  id: string;
  code: string;
  organizationId: string;
  serialNumber?: string | null;
  model?: string | null;
  battery?: number | null;
  storageTotal?: bigint | number | string | null;
  adbStatus?: string | null;
  currentJobId?: string | null;
  lastHeartbeatAt?: Date | string | null;
};

type AdbSyncResult = {
  connectedSerials: Set<string>;
  dbDevices?: StoredDevice[];
};

@Injectable()
export class DeviceOfflineMonitorService {
  private readonly logger = new Logger(DeviceOfflineMonitorService.name);
  private readonly timeoutMs = positiveInteger(process.env.DEVICE_OFFLINE_TIMEOUT_MS, 180_000);
  private readonly adbSyncIntervalMs = 5_000;
  private readonly offlineCheckIntervalMs = positiveInteger(process.env.DEVICE_OFFLINE_CHECK_INTERVAL_MS, 60_000);
  private readonly selectedSerial = String(process.env.ANDROID_DEVICE_SERIAL || '').trim();
  private readonly selectedDeviceCode = String(process.env.DEVICE_CODE || 'PHONE-001').trim();
  private readonly quotaBackoff = new FirestoreQuotaBackoff(
    positiveInteger(process.env.FIRESTORE_QUOTA_BACKOFF_MS, 15 * 60_000),
    positiveInteger(process.env.FIRESTORE_QUOTA_BACKOFF_MAX_MS, 60 * 60_000),
  );
  private nextAdbSyncAt = 0;
  private nextOfflineCheckAt = 0;
  private running = false;
  private connectedSerials = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly adb: AdbService,
    private readonly devicesService: DevicesService,
  ) {}

  @Interval(5_000)
  async monitorDevices() {
    const now = Date.now();
    if (this.running) return;
    if (now < this.nextAdbSyncAt && now < this.nextOfflineCheckAt) return;

    this.running = true;
    try {
      let synchronizedDevices: StoredDevice[] | undefined;
      if (now >= this.nextAdbSyncAt) {
        const sync = await this.syncConnectedAdbDevices();
        this.connectedSerials = sync.connectedSerials;
        synchronizedDevices = sync.dbDevices;
        this.nextAdbSyncAt = now + this.adbSyncIntervalMs;
      }
      if (now >= this.nextOfflineCheckAt) {
        await this.markStaleDeviceOffline(this.connectedSerials, synchronizedDevices);
        this.nextOfflineCheckAt = now + this.offlineCheckIntervalMs;
      }
    } catch (error) {
      this.logger.warn(`Device monitor failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async syncConnectedAdbDevices(): Promise<AdbSyncResult> {
    const diag = await this.adb.diagnose();
    if (!diag.available) return { connectedSerials: new Set<string>() };

    const allReadyDevices = (diag.devices as AdbDevice[]).filter((device) => device.state === 'device');
    const readyDevices = this.selectedSerial
      ? allReadyDevices.filter((device) => device.serial === this.selectedSerial)
      : allReadyDevices;
    const connectedSerials = new Set(readyDevices.map((device) => device.serial));
    if (readyDevices.length === 0) return { connectedSerials };

    const organizationId = 'default-org';
    const allDbDevices = (await this.devicesService.findAll()) as StoredDevice[];
    const assignedCodes = new Set(allDbDevices.map((device: typeof allDbDevices[number]) => device.code));
    const newDevices = readyDevices.filter(
      (item) => !allDbDevices.some((device: typeof allDbDevices[number]) => device.serialNumber === item.serial),
    );

    if (newDevices.length > 0 && this.quotaBackoff.canAttempt()) {
      try {
        const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
        if (!organization) {
          await this.prisma.organization.create({ data: { id: organizationId, name: 'Local Test Organization' } });
        }
      } catch (error) {
        this.quotaBackoff.recordFailure(error);
      }
    }

    for (const item of readyDevices) {
      const existing = allDbDevices.find((device: typeof allDbDevices[number]) => device.serialNumber === item.serial);
      const targetCode = existing?.code || this.nextDeviceCode(assignedCodes, item.serial);
      assignedCodes.add(targetCode);
      const model = item.model || existing?.model || 'Android';
      const name = `${targetCode} — ${model} (${item.serial})`;

      if (!existing) {
        if (this.quotaBackoff.canAttempt()) {
          try {
            const created = await this.prisma.device.create({
              data: {
                code: targetCode,
                organizationId,
                nodeId: process.env.NODE_ID || 'NODE-A',
                serialNumber: item.serial,
                model,
                name,
                adbStatus: 'ONLINE',
                lastHeartbeatAt: new Date(),
                ...(item.battery == null ? {} : { battery: item.battery }),
                ...(item.storageGb == null ? {} : { storageTotal: Math.round(item.storageGb * 1024 * 1024 * 1024) }),
              },
            });
            this.logger.log(`Auto-discovered ADB device ${item.serial} (${model}) as ${targetCode}`);
            this.events.emitDeviceUpdate({ type: 'DEVICE_UPDATED', device: created });
            continue;
          } catch (error) {
            this.quotaBackoff.recordFailure(error);
          }
        }
        const synthetic = this.devicesService.createSyntheticRuntime(targetCode, {
          serialNumber: item.serial,
          model,
          batteryLevel: item.battery ?? 95,
          adbStatus: 'ONLINE',
        });
        this.logger.log(`Auto-discovered ADB device ${item.serial} (${model}) as ${targetCode} (in-memory)`);
        this.events.emitDeviceUpdate({ type: 'DEVICE_UPDATED', device: synthetic.device });
        continue;
      }

      const patch: Record<string, unknown> = {};
      if (existing.serialNumber !== item.serial) patch.serialNumber = item.serial;
      if (existing.model !== model) patch.model = model;
      if (item.battery != null && existing.battery !== item.battery) patch.battery = item.battery;
      if (item.storageGb != null) {
        const storageTotal = Math.round(item.storageGb * 1024 * 1024 * 1024);
        if (Number(existing.storageTotal) !== storageTotal) patch.storageTotal = storageTotal;
      }
      if (['OFFLINE', 'CONNECTING'].includes(String(existing.adbStatus || ''))) patch.adbStatus = 'ONLINE';

      if (this.quotaBackoff.canAttempt() && Object.keys(patch).length > 0) {
        try {
          const updated = await this.prisma.device.update({ where: { id: existing.id }, data: patch });
          this.events.emitDeviceUpdate({ type: 'DEVICE_UPDATED', device: updated });
        } catch (error) {
          this.quotaBackoff.recordFailure(error);
        }
      }
      // Do NOT overwrite the real runtime cache with a synthetic device here.
      // The device already exists in Firestore with a real id — replacing it with
      // `synthetic-<code>` made heartbeat try to update a non-existent document (500).
      // DevicesService.heartbeat keeps the runtime cache up to date on its own.
    }


    return { connectedSerials, dbDevices: allDbDevices };
  }

  private nextDeviceCode(assignedCodes: Set<string>, serial: string): string {
    if (this.selectedSerial && serial === this.selectedSerial && !assignedCodes.has(this.selectedDeviceCode)) {
      return this.selectedDeviceCode;
    }
    let number = 1;
    while (assignedCodes.has(`PHONE-${String(number).padStart(3, '0')}`)) number += 1;
    return `PHONE-${String(number).padStart(3, '0')}`;
  }

  async markStaleDeviceOffline(connectedSerials = new Set<string>(), knownDevices?: StoredDevice[]) {
    const cutoff = new Date(Date.now() - this.timeoutMs);
    const devices = (knownDevices || await this.devicesService.findAll()) as StoredDevice[];
    const stale = devices.filter((device: typeof devices[number]) => {
      if (device.adbStatus === 'OFFLINE') return false;
      if (this.selectedSerial && device.serialNumber !== this.selectedSerial && device.code !== this.selectedDeviceCode) {
        return false;
      }
      const lastHeartbeatAt = device.lastHeartbeatAt ? new Date(device.lastHeartbeatAt).getTime() : 0;
      return !lastHeartbeatAt || lastHeartbeatAt < cutoff.getTime();
    });

    for (const device of stale) {
      if (device.serialNumber && connectedSerials.has(device.serialNumber)) continue;
      if (this.quotaBackoff.canAttempt()) {
        try {
          const current = await this.prisma.device.findUnique({ where: { id: device.id } });
          if (!current || current.adbStatus === 'OFFLINE') continue;
          const currentHeartbeatAt = current.lastHeartbeatAt ? new Date(current.lastHeartbeatAt).getTime() : 0;
          if (currentHeartbeatAt && currentHeartbeatAt >= cutoff.getTime()) continue;
          const updated = await this.prisma.device.update({
            where: { id: current.id },
            data: { adbStatus: 'OFFLINE', currentJobId: null },
          });
          await this.prisma.log.create({
            data: {
              organizationId: current.organizationId,
              level: 'WARN',
              category: 'device',
              deviceId: current.id,
              message: `${current.code} changed state ${current.adbStatus} → OFFLINE`,
              metadata: { reason: 'HEARTBEAT_TIMEOUT', timeoutMs: this.timeoutMs },
            },
          });
          this.logger.warn(`${current.code} heartbeat timed out`);
          this.events.emitDeviceUpdate({ type: 'DEVICE_OFFLINE', device: updated, reason: 'HEARTBEAT_TIMEOUT' });
        } catch (error) {
          this.quotaBackoff.recordFailure(error);
        }
      }
    }
  }
}
