jest.mock('@farm-phone/database', () => {
  const repository = () => ({
    findById: jest.fn(),
    findByCode: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  });
  return {
    organizationRepo: repository(),
    userRepo: repository(),
    deviceRepo: repository(),
    deviceHeartbeatRepo: repository(),
    deviceCommandRepo: repository(),
    deviceGroupRepo: repository(),
    jobRepo: repository(),
    jobLogRepo: repository(),
    accountRepo: repository(),
    campaignRepo: repository(),
    contentRepo: repository(),
    missionRepo: repository(),
    aiAgentRepo: repository(),
    agentTaskRepo: repository(),
    agentEventRepo: repository(),
    notificationRepo: repository(),
    uploadedFileRepo: repository(),
    planRepo: repository(),
    creditLedgerRepo: repository(),
    subscriptionRepo: repository(),
    logRepo: repository(),
    auditLogRepo: repository(),
    workflowStepRepo: repository(),
  };
});

import {
  aiAgentRepo,
  deviceRepo,
  organizationRepo,
  subscriptionRepo,
} from '@farm-phone/database';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Firebase Prisma proxy upsert semantics', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns an existing id-selected row without writing when update is empty', async () => {
    const existing = { id: 'default-org', name: 'Existing Organization' } as any;
    jest.spyOn(organizationRepo, 'findById').mockResolvedValue(existing);
    const update = jest.spyOn(organizationRepo, 'update');
    const create = jest.spyOn(organizationRepo, 'create');

    const result = await new PrismaService().organization.upsert({
      where: { id: 'default-org' },
      update: {},
      create: { id: 'default-org', name: 'Local Test Organization' },
    });

    expect(result).toBe(existing);
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('resolves a code selector and updates the actual document id with update fields only', async () => {
    const existing = { id: 'device-doc-42', code: 'PHONE-001', name: 'Existing Phone' } as any;
    const updated = { ...existing, adbStatus: 'ONLINE' } as any;
    jest.spyOn(deviceRepo, 'findByCode').mockResolvedValue(existing);
    const update = jest.spyOn(deviceRepo, 'update').mockResolvedValue(updated);
    const create = jest.spyOn(deviceRepo, 'create');

    const result = await new PrismaService().device.upsert({
      where: { code: 'PHONE-001' },
      update: { adbStatus: 'ONLINE' },
      create: { code: 'PHONE-001', name: 'Create-only name', adbStatus: 'CONNECTING' },
    });

    expect(update).toHaveBeenCalledWith('device-doc-42', { adbStatus: 'ONLINE' });
    expect(create).not.toHaveBeenCalled();
    expect(result).toBe(updated);
  });

  it('flattens a compound unique selector into its component fields', async () => {
    const existing = { id: 'agent-doc-9', organizationId: 'org-1', code: '16bit.QA', status: 'IDLE' } as any;
    const updated = { ...existing, status: 'WORKING' } as any;
    const findMany = jest.spyOn(aiAgentRepo, 'findMany').mockResolvedValue([existing]);
    const update = jest.spyOn(aiAgentRepo, 'update').mockResolvedValue(updated);

    await new PrismaService().aIAgent.upsert({
      where: { organizationId_code: { organizationId: 'org-1', code: '16bit.QA' } },
      update: { status: 'WORKING' },
      create: { organizationId: 'org-1', code: '16bit.QA', name: 'QA', status: 'WORKING' },
    });

    expect(findMany).toHaveBeenCalledWith([
      { field: 'organizationId', operator: '==', value: 'org-1' },
      { field: 'code', operator: '==', value: '16bit.QA' },
    ], undefined, 1);
    expect(update).toHaveBeenCalledWith('agent-doc-9', { status: 'WORKING' });
  });

  it('creates with create fields only when a non-id unique selector has no match', async () => {
    jest.spyOn(subscriptionRepo, 'findMany').mockResolvedValue([]);
    const created = { id: 'subscription-doc-1', organizationId: 'org-1', planId: 'pro' } as any;
    const create = jest.spyOn(subscriptionRepo, 'create').mockResolvedValue(created);
    const update = jest.spyOn(subscriptionRepo, 'update');
    const createData = { organizationId: 'org-1', planId: 'pro', status: 'ACTIVE' };

    const result = await new PrismaService().subscription.upsert({
      where: { organizationId: 'org-1' },
      update: { planId: 'pro' },
      create: createData,
    });

    expect(create).toHaveBeenCalledWith(createData);
    expect(update).not.toHaveBeenCalled();
    expect(result).toBe(created);
  });
});
