import { ExecutionContext } from '@nestjs/common';
import { DeviceAgentGuard } from '../src/devices/device-agent.guard';
import { DevicesService } from '../src/devices/devices.service';
import { EventsGateway } from '../src/events/events.gateway';
import { PrismaService } from '../src/prisma/prisma.service';
import { SPECIALIZED_AGENTS, SpecializedAgentsService } from '../src/ai/agents/specialized-agents.service';

describe('Device Agent registration contract', () => {
  const baseDevice = {
    id: 'device-1', code: 'PHONE-001', organizationId: 'default-org', serialNumber: 'serial-1',
    model: 'Pixel', osVersion: '14', battery: 90, storageUsed: 0n, storageTotal: 0n,
    agentVersion: '1.0.0', metadata: null, currentJobId: null, adbStatus: 'ONLINE',
  };
  const organization = { upsert: jest.fn(async () => ({ id: 'default-org' })) };
  const device = {
    upsert: jest.fn(async ({ create }: any) => ({ id: 'device-1', ...create })),
    findMany: jest.fn(async () => [{ ...baseDevice }]),
    findUnique: jest.fn(async () => ({ id: 'device-1', code: 'PHONE-001' })),
    findFirst: jest.fn(async () => ({ ...baseDevice })),
    update: jest.fn(async ({ data }: any) => ({ ...baseDevice, ...data })),
  };
  const deviceHeartbeat = { create: jest.fn(async ({ data }: any) => ({ id: 'heartbeat-1', ...data })) };
  const log = { create: jest.fn(async ({ data }: any) => ({ id: 'log-1', ...data })) };
  const prisma = { organization, device, deviceHeartbeat, log };
  const events = { emitDeviceUpdate: jest.fn() };
  let service: DevicesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DevicesService(prisma as unknown as PrismaService, events as unknown as EventsGateway);
  });

  it('upserts registration by device code and records heartbeat', async () => {
    const result = await service.create({
      code: 'PHONE-001', name: 'Test Phone', model: 'Pixel', osVersion: '14',
      adbStatus: 'ONLINE', battery: 90, nodeId: 'NODE-A', organizationId: 'default-org',
    });
    expect(organization.upsert).toHaveBeenCalled();
    expect(device.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { code: 'PHONE-001' } }));
    expect(result).toMatchObject({ id: 'device-1', code: 'PHONE-001', battery: 90 });
    expect(events.emitDeviceUpdate).toHaveBeenCalledWith(expect.objectContaining({ type: 'DEVICE_REGISTERED' }));
  });

  it('backs off repeated registration attempts when Firestore quota is exhausted', async () => {
    organization.upsert.mockRejectedValueOnce({ code: 8, details: 'Quota exceeded.' });
    const registration = {
      code: 'PHONE-001', name: 'Test Phone', model: 'Pixel', osVersion: '14',
      adbStatus: 'ONLINE', battery: 90, nodeId: 'NODE-A', organizationId: 'default-org',
    };

    await expect(service.create(registration)).rejects.toMatchObject({ status: 503 });
    await expect(service.create(registration)).rejects.toMatchObject({ status: 503 });

    expect(organization.upsert).toHaveBeenCalledTimes(1);
    expect(device.upsert).not.toHaveBeenCalled();
  });

  it('serves a quota-safe empty device list and suppresses repeated Firestore reads', async () => {
    device.findMany.mockRejectedValueOnce({ code: 8, details: 'Quota exceeded.' });

    await expect(service.findAll()).resolves.toEqual([]);
    await expect(service.findAll()).resolves.toEqual([]);

    expect(device.findMany).toHaveBeenCalledTimes(1);
  });

  it('updates only supported device fields', async () => {
    await service.update('device-1', { adbStatus: 'OFFLINE', battery: 25, organizationId: 'attacker-org', code: 'CHANGED' });
    expect(device.update).toHaveBeenCalledWith({
      where: { id: 'device-1' },
      data: { adbStatus: 'OFFLINE', battery: 25 },
    });
  });

  it('POST heartbeat behavior sets device ONLINE and updates timestamp', async () => {
    await service.heartbeat('device-1');
    expect(device.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'device-1' },
      data: expect.objectContaining({ lastHeartbeatAt: expect.any(Date), adbStatus: 'ONLINE' }),
    }));
    expect(deviceHeartbeat.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deviceId: 'device-1', status: 'ONLINE' }),
    }));
  });

  it('persists real heartbeat telemetry without hardcoding ONLINE', async () => {
    await service.heartbeat('PHONE-001', {
      deviceCode: 'PHONE-001', serialNumber: 'serial-1', status: 'WARNING', batteryLevel: 12,
      storageUsed: 90_000, storageTotal: 100_000, androidVersion: '14', model: 'Pixel',
      agentVersion: '1.0.0', timestamp: '2026-07-28T00:00:00.000Z',
    });
    expect(device.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ adbStatus: 'WARNING', battery: 12, storageUsed: 90_000n, storageTotal: 100_000n }),
    }));
    expect(deviceHeartbeat.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deviceCode: 'PHONE-001', status: 'WARNING', serialNumber: 'serial-1' }),
    }));
  });

  it('derives WARNING from low battery even when telemetry reports ONLINE', async () => {
    await service.heartbeat('PHONE-001', {
      status: 'ONLINE', batteryLevel: 5, storageUsed: 10, storageTotal: 100,
      timestamp: new Date().toISOString(),
    });
    expect(device.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ adbStatus: 'WARNING', battery: 5 }),
    }));
    expect(deviceHeartbeat.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'WARNING', batteryLevel: 5 }),
    }));
  });

  it('keeps realtime telemetry fresh without repeated Firestore writes inside both persistence windows', async () => {
    await service.heartbeat('PHONE-001', { status: 'ONLINE', batteryLevel: 90 });
    jest.clearAllMocks();

    const result = await service.heartbeat('PHONE-001', { status: 'ONLINE', batteryLevel: 89 });

    expect(result).toMatchObject({ adbStatus: 'ONLINE', battery: 89, lastHeartbeatAt: expect.any(Date) });
    expect(device.findFirst).not.toHaveBeenCalled();
    expect(device.update).not.toHaveBeenCalled();
    expect(deviceHeartbeat.create).not.toHaveBeenCalled();
    expect(log.create).not.toHaveBeenCalled();
    expect(events.emitDeviceUpdate).toHaveBeenCalledWith(expect.objectContaining({
      type: 'DEVICE_HEARTBEAT',
      device: expect.objectContaining({ battery: 89 }),
    }));
  });

  it('persists an operational state change immediately but keeps history throttled', async () => {
    await service.heartbeat('PHONE-001', { status: 'ONLINE', batteryLevel: 90 });
    jest.clearAllMocks();

    await service.heartbeat('PHONE-001', { status: 'WARNING', batteryLevel: 12 });

    expect(device.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ adbStatus: 'WARNING', battery: 12 }),
    }));
    expect(deviceHeartbeat.create).not.toHaveBeenCalled();
    expect(log.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ level: 'WARN', deviceId: 'device-1' }),
    }));
  });

  it('serves a cached live heartbeat and suppresses retries during Firestore quota backoff', async () => {
    device.update.mockRejectedValueOnce({ code: 8, details: 'Quota exceeded.' });

    await expect(service.heartbeat('PHONE-001', { status: 'ONLINE', batteryLevel: 88 }))
      .resolves.toMatchObject({ code: 'PHONE-001', battery: 88 });
    await expect(service.heartbeat('PHONE-001', { status: 'ONLINE', batteryLevel: 87 }))
      .resolves.toMatchObject({ code: 'PHONE-001', battery: 87 });

    expect(device.findFirst).toHaveBeenCalledTimes(1);
    expect(device.update).toHaveBeenCalledTimes(1);
    expect(deviceHeartbeat.create).not.toHaveBeenCalled();
    expect(events.emitDeviceUpdate).toHaveBeenCalledTimes(2);
  });

  it('does not hide non-quota Firestore failures', async () => {
    device.update.mockRejectedValueOnce(new Error('permission denied'));
    await expect(service.heartbeat('PHONE-001')).rejects.toThrow('permission denied');
  });

  it('bounds every high-frequency relation returned by device detail', async () => {
    await service.findOne('PHONE-001');
    expect(device.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        heartbeats: expect.objectContaining({ take: 20 }),
        commands: expect.objectContaining({ take: 20 }),
        jobs: expect.objectContaining({ take: 10 }),
        uploadedFiles: expect.objectContaining({ take: 10 }),
        jobLogs: expect.objectContaining({ take: 50 }),
      }),
    }));
  });
});

describe('Device Agent authentication', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousToken = process.env.DEVICE_AGENT_TOKEN;

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
    process.env.DEVICE_AGENT_TOKEN = previousToken;
  });

  function context(token: string, address = '10.0.0.2') {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-device-agent-token': token }, socket: { remoteAddress: address } }) }),
    } as unknown as ExecutionContext;
  }

  it('accepts the configured shared token in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DEVICE_AGENT_TOKEN = 'device-secret';
    expect(new DeviceAgentGuard().canActivate(context('device-secret'))).toBe(true);
  });

  it('rejects an invalid token in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DEVICE_AGENT_TOKEN = 'device-secret';
    expect(() => new DeviceAgentGuard().canActivate(context('wrong'))).toThrow('Invalid device agent token');
  });
});

describe('Specialized agent catalog', () => {
  it('contains all 16 backend roles including CEO and MANAGER', () => {
    expect(Object.keys(SPECIALIZED_AGENTS)).toHaveLength(16);
    const service = new SpecializedAgentsService({} as any, {} as any, {} as any, { get: () => undefined } as any);
    expect(service.list()).toHaveLength(16);
    expect(service.list().map((agent) => agent.code)).toEqual(expect.arrayContaining(['16bit.CEO', '16bit.MANAGER', '16bit.ANALYST', '16bit.UPLOADER', '16bit.SECURITY', '16bit.QA']));
  });
});
