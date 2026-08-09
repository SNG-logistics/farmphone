import { AutomationRecipesService } from '../src/automation-recipes/automation-recipes.service';
import { SingleDeviceCommandsService } from '../src/jobs/single-device-commands.service';
import { JobQueueService } from '../src/jobs/job-queue.service';
import { EventsGateway } from '../src/events/events.gateway';
import { DeviceCommandBrokerService } from '../src/events/device-command-broker.service';
import { PlatformUploaderService } from '../src/jobs/platform-uploader.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/content/storage.service';
import { compileRecipe, validateRecipeSteps } from '../src/automation-recipes/recipe-compiler';

describe('Automation recipe compiler contract', () => {
  it('uses resourceId, contentDescription, text, then coordinate fallback', () => {
    const sequence = compileRecipe({
      id: 'recipe-order',
      version: 3,
      steps: [{
        command: 'TAP_UI',
        selector: {
          text: 'Publish',
          coordinate: { x: 500, y: 1600 },
          contentDescription: 'Publish post',
          resourceId: 'com.example:id/publish',
        },
        evidence: { before: true, after: true, onFailure: true },
      }],
    });

    expect(sequence.steps[0].selectors).toEqual([
      { strategy: 'resourceId', value: 'com.example:id/publish' },
      { strategy: 'contentDescription', value: 'Publish post' },
      { strategy: 'text', value: 'Publish' },
      { strategy: 'coordinate', x: 500, y: 1600 },
    ]);
    expect(sequence.steps[0].evidence).toEqual({ before: true, after: true, onFailure: true });
  });

  it('rejects empty plans, selector-less UI steps, and non-executable LLM plan commands', () => {
    expect(() => validateRecipeSteps([])).toThrow('at least one automation step');
    expect(() => validateRecipeSteps([{ command: 'WAIT_UI' }])).toThrow('requires a selector');
    expect(() => validateRecipeSteps([{ command: 'LLM_PLAN', parameters: { prompt: 'do it' } }])).toThrow('unsupported command');
  });
});

describe('Automation recipe runner contract', () => {
  const activeRecipe = {
    id: 'recipe-1',
    organizationId: 'org-1',
    name: 'Open and inspect',
    description: '',
    status: 'ACTIVE',
    version: 2,
    runCount: 0,
    steps: [{
      command: 'TAP_UI',
      selector: {
        resourceId: 'com.example:id/create',
        contentDescription: 'Create',
        text: 'Create post',
        coordinate: { x: 500, y: 1500 },
      },
      evidence: { after: true, onFailure: true },
    }],
  };

  it('compiles and queues one AUTOMATION_SEQUENCE job per physical ADB serial', async () => {
    const prisma = {
      automationRecipe: {
        findFirst: jest.fn(async () => ({ ...activeRecipe })),
        update: jest.fn(async ({ data }: any) => ({ ...activeRecipe, ...data })),
      },
      device: {
        findMany: jest.fn(async () => [
          { id: 'device-1', organizationId: 'org-1', code: 'PHONE-007', serialNumber: 'R58M-REAL-007', metadata: {} },
          { id: 'device-2', organizationId: 'org-1', code: 'PHONE-011', serialNumber: 'R58M-REAL-011', metadata: {} },
        ]),
      },
    };
    const commands = {
      create: jest.fn(async (deviceCode: string, _input?: any) => ({
        job: { id: `job-${deviceCode}`, status: 'QUEUED' },
        duplicate: false,
      })),
    };
    const service = new AutomationRecipesService(
      prisma as unknown as PrismaService,
      commands as unknown as SingleDeviceCommandsService,
    );

    const result = await service.run('org-1', 'recipe-1', ['PHONE-007', 'PHONE-011']);

    expect(result).toMatchObject({ recipeId: 'recipe-1', recipeVersion: 2, deviceCount: 2 });
    expect(commands.create).toHaveBeenCalledTimes(2);
    const [, firstInput] = commands.create.mock.calls[0];
    expect(firstInput).toMatchObject({
      command: 'AUTOMATION_SEQUENCE',
      context: {
        source: 'AUTOMATION_RECIPE',
        recipeId: 'recipe-1',
        recipeVersion: 2,
        recipeRunId: result.runId,
      },
      parameters: {
        sequenceVersion: 1,
        recipeId: 'recipe-1',
        recipeVersion: 2,
        stopOnFailure: true,
      },
    });
    expect(firstInput.parameters.steps[0].selectors.map((selector: any) => selector.strategy)).toEqual([
      'resourceId', 'contentDescription', 'text', 'coordinate',
    ]);
  });

  it('refuses a production run when a selected record has no physical serial', async () => {
    const prisma = {
      automationRecipe: { findFirst: jest.fn(async () => ({ ...activeRecipe })) },
      device: { findMany: jest.fn(async () => [{ code: 'PHONE-099', serialNumber: '', metadata: {} }]) },
    };
    const commands = { create: jest.fn() };
    const service = new AutomationRecipesService(
      prisma as unknown as PrismaService,
      commands as unknown as SingleDeviceCommandsService,
    );

    await expect(service.run('org-1', 'recipe-1', ['PHONE-099'])).rejects.toThrow('no physical ADB serial');
    expect(commands.create).not.toHaveBeenCalled();
  });
});

describe('Automation ACTION_REQUIRED queue contract', () => {
  it('persists an operator checkpoint without retrying or reporting success', async () => {
    const job: Record<string, any> = {
      id: 'job-action',
      organizationId: 'org-1',
      deviceId: 'device-1',
      type: 'DEVICE_COMMAND',
      status: 'QUEUED',
      attempts: 0,
      maxAttempts: 3,
      parameters: {
        command: 'AUTOMATION_SEQUENCE',
        steps: [{ command: 'TYPE_TEXT', parameters: { text: 'unsafe' } }],
      },
      deviceCommand: { command: 'AUTOMATION_SEQUENCE' },
      device: { id: 'device-1', code: 'PHONE-007', nodeId: 'NODE-A', adbStatus: 'ONLINE' },
    };
    const prisma = {
      job: {
        findUnique: jest.fn(async () => job),
        update: jest.fn(async ({ data }: any) => Object.assign(job, data)),
      },
      deviceCommand: { update: jest.fn(async () => undefined) },
      device: { update: jest.fn(async () => undefined) },
      jobLog: { create: jest.fn(async ({ data }: any) => data) },
      log: { create: jest.fn(async ({ data }: any) => data) },
      aIAgent: {
        upsert: jest.fn(async ({ create, update }: any) => ({ id: `agent-${create.code}`, ...create, ...update })),
        update: jest.fn(async () => undefined),
      },
      agentTask: {
        findFirst: jest.fn(async () => null),
        update: jest.fn(async () => undefined),
      },
      agentEvent: { create: jest.fn(async () => undefined) },
    };
    const response = {
      jobId: job.id,
      command: 'AUTOMATION_SEQUENCE',
      status: 'ACTION_REQUIRED',
      result: {
        status: 'ACTION_REQUIRED',
        totalSteps: 1,
        steps: [{ index: 0, command: 'TYPE_TEXT', status: 'ACTION_REQUIRED' }],
        failureReason: {
          code: 'ACTION_REQUIRED',
          message: 'OTP requires operator action; automation stopped',
          retryable: false,
          actionRequired: { kind: 'OTP', matched: 'Verification code' },
        },
      },
    };
    const broker = { waitFor: jest.fn(async () => response), reject: jest.fn() };
    const events = {
      isNodeConnected: jest.fn(() => true),
      emitDeviceCommand: jest.fn(),
      emitJobUpdate: jest.fn(),
      emitAgentState: jest.fn(),
    };
    const worker = new JobQueueService(
      prisma as unknown as PrismaService,
      events as unknown as EventsGateway,
      {} as PlatformUploaderService,
      broker as unknown as DeviceCommandBrokerService,
      {} as StorageService,
    ) as unknown as { process: (queueJob: any) => Promise<any> };

    await worker.process({ data: { jobId: job.id }, attemptsMade: 0, opts: { attempts: 3 } });

    expect(job).toMatchObject({
      status: 'ACTION_REQUIRED',
      errorCode: 'ACTION_REQUIRED',
      errorMessage: expect.stringContaining('OTP requires operator action'),
    });
    expect(prisma.deviceCommand.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ACTION_REQUIRED' }),
    }));
    expect(events.emitJobUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCESS' }));
  });
});
