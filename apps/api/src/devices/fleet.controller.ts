import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

interface FleetDevice {
  id: string;
  code: string;
  adbStatus: string;
  battery: number;
  storageUsed: bigint;
  storageTotal: bigint;
  lastHeartbeatAt: Date | null;
}

@ApiTags('Fleet')
@ApiBearerAuth()
@Controller('fleet')
export class FleetController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get fleet health summary (all devices aggregated)' })
  async summary() {
    const devices: FleetDevice[] = await this.prisma.device.findMany({
      select: {
        id: true,
        code: true,
        adbStatus: true,
        battery: true,
        storageUsed: true,
        storageTotal: true,
        lastHeartbeatAt: true,
      },
    });

    const total = devices.length;
    const online = devices.filter((d: FleetDevice) => d.adbStatus === 'ONLINE').length;
    const busy = devices.filter((d: FleetDevice) => d.adbStatus === 'BUSY').length;
    const warning = devices.filter((d: FleetDevice) => d.adbStatus === 'WARNING').length;
    const error = devices.filter((d: FleetDevice) => d.adbStatus === 'ERROR').length;
    const offline = devices.filter((d: FleetDevice) => d.adbStatus === 'OFFLINE').length;
    const connecting = devices.filter((d: FleetDevice) => d.adbStatus === 'CONNECTING').length;

    const batteries = devices.map((d: FleetDevice) => d.battery).filter((b: number) => b > 0);
    const avgBattery = batteries.length > 0 ? Math.round(batteries.reduce((sum: number, b: number) => sum + b, 0) / batteries.length) : 0;

    const totalStorage = devices.reduce((sum: number, d: FleetDevice) => sum + Number(d.storageTotal), 0);
    const usedStorage = devices.reduce((sum: number, d: FleetDevice) => sum + Number(d.storageUsed), 0);

    return {
      success: true,
      data: {
        total,
        online,
        busy,
        warning,
        error,
        offline,
        connecting,
        avgBattery,
        totalStorage,
        usedStorage,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  @Get('devices')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get enriched device list for fleet view' })
  async devices() {
    const devices = await this.prisma.device.findMany({
      orderBy: { code: 'asc' },
      include: {
        heartbeats: { orderBy: { timestamp: 'desc' }, take: 1 },
        deviceGroup: { select: { id: true, name: true } },
      },
    });

    const data = devices.map((device: typeof devices[number]) => ({
      id: device.id,
      code: device.code,
      name: device.name,
      serialNumber: device.serialNumber,
      manufacturer: device.manufacturer,
      model: device.model,
      osVersion: device.osVersion,
      adbStatus: device.adbStatus,
      battery: device.battery,
      storageUsed: device.storageUsed.toString(),
      storageTotal: device.storageTotal.toString(),
      agentVersion: device.agentVersion,
      networkType: device.networkType,
      nodeId: device.nodeId,
      currentJobId: device.currentJobId,
      lastHeartbeatAt: device.lastHeartbeatAt,
      deviceGroup: device.deviceGroup,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    }));

    return { success: true, data };
  }

  @Post('batch-command')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Dispatch a command to multiple devices' })
  async batchCommand(
    @Body() body: { deviceCodes: string[]; command: string; parameters?: Record<string, unknown> },
  ) {
    const { deviceCodes, command, parameters } = body;
    if (!Array.isArray(deviceCodes) || deviceCodes.length === 0) {
      return { success: false, message: 'deviceCodes array is required' };
    }

    const devices = await this.prisma.device.findMany({
      where: { code: { in: deviceCodes } },
    });

    const dispatched: Array<{ deviceCode: string; nodeId: string }> = [];
    const skipped: Array<{ deviceCode: string; reason: string }> = [];

    for (const device of devices) {
      if (device.adbStatus === 'OFFLINE') {
        skipped.push({ deviceCode: device.code, reason: 'Device is OFFLINE' });
        continue;
      }

      this.events.emitDeviceCommand(device.nodeId, {
        deviceId: device.id,
        deviceCode: device.code,
        command,
        parameters: parameters || {},
        jobId: `batch-${Date.now()}-${device.code}`,
      });
      dispatched.push({ deviceCode: device.code, nodeId: device.nodeId });
    }

    const notFound = deviceCodes.filter(
      (code: string) => !devices.some((d: typeof devices[number]) => d.code === code),
    );
    for (const code of notFound) {
      skipped.push({ deviceCode: code, reason: 'Device not found' });
    }

    return {
      success: true,
      data: {
        dispatched: dispatched.length,
        skipped: skipped.length,
        details: { dispatched, skipped },
      },
    };
  }
}
