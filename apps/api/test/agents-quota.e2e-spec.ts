import { AgentsService } from '../src/agents/agents.service';
import { AgentTasksService } from '../src/agents/agent-tasks.service';

describe('AgentsService quota-safe listing and bootstrap', () => {
  function createHarness() {
    const aIAgent = {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: String(data.code), ...data })),
      update: jest.fn(),
    };
    const prisma = {
      aIAgent,
      agentTask: { create: jest.fn() },
      agentEvent: { create: jest.fn() },
    };
    return { service: new AgentsService(prisma as any), aIAgent };
  }

  it('keeps GET/list behavior read-only', async () => {
    const { service, aIAgent } = createHarness();
    const agents = [{ id: 'manager', code: '16bit.MANAGER', organizationId: 'default-org' }];
    aIAgent.findMany.mockResolvedValueOnce(agents);

    await expect(service.findAll()).resolves.toEqual(agents);

    expect(aIAgent.findMany).toHaveBeenCalledTimes(1);
    expect(aIAgent.create).not.toHaveBeenCalled();
    expect(aIAgent.update).not.toHaveBeenCalled();
  });

  it('seeds only missing MVP agents and runs once per organization', async () => {
    const { service, aIAgent } = createHarness();
    aIAgent.findMany.mockResolvedValueOnce([
      { id: 'manager', code: '16bit.MANAGER', organizationId: 'default-org' },
    ]);

    await service.bootstrapMvpAgents();
    await service.bootstrapMvpAgents();

    expect(aIAgent.findMany).toHaveBeenCalledTimes(1);
    expect(aIAgent.create).toHaveBeenCalledTimes(3);
    expect(aIAgent.create.mock.calls.map(([argument]) => argument.data.code)).toEqual([
      '16bit.DEVICE',
      '16bit.QA',
      '16bit.LOG',
    ]);
  });

  it('does not fail API startup when Firestore quota is exhausted', async () => {
    const { service, aIAgent } = createHarness();
    aIAgent.findMany.mockRejectedValueOnce(Object.assign(new Error('Quota exceeded.'), { code: 8 }));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(aIAgent.create).not.toHaveBeenCalled();
  });

  it('serves the built-in agent catalog while Firestore quota is exhausted', async () => {
    const { service, aIAgent } = createHarness();
    aIAgent.findMany.mockRejectedValueOnce(Object.assign(new Error('Quota exceeded.'), { code: 8 }));

    const agents = await service.findAll();

    expect(agents).toHaveLength(4);
    expect(agents.map((agent: { code: string }) => agent.code)).toEqual([
      '16bit.MANAGER',
      '16bit.DEVICE',
      '16bit.QA',
      '16bit.LOG',
    ]);
    expect(agents.every((agent: { status: string }) => agent.status === 'WARNING')).toBe(true);
    expect(agents.every((agent: { config: { reason: string } }) => agent.config.reason === 'FIRESTORE_QUOTA_EXHAUSTED')).toBe(true);

    await expect(service.findAll()).resolves.toHaveLength(4);
    expect(aIAgent.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('AgentTasksService quota-safe listing', () => {
  it('serves an empty task list without repeatedly querying Firestore during backoff', async () => {
    const findMany = jest.fn().mockRejectedValueOnce(Object.assign(new Error('Quota exceeded.'), { code: 8 }));
    const service = new AgentTasksService({ agentTask: { findMany } } as any);

    await expect(service.findAll()).resolves.toEqual([]);
    await expect(service.findAll()).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
