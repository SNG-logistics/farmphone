import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FirestoreQuotaBackoff, isFirestoreQuotaError, positiveInteger } from '../stability/firestore-quota-backoff';

const MVP_AGENTS = [
  { code: '16bit.MANAGER', name: 'Manager Agent', role: 'MANAGER', description: 'Creates & manages PHONE-001 device tasks.' },
  { code: '16bit.DEVICE', name: 'Device Agent', role: 'DEVICE', description: 'Tracks & executes PHONE-001 device commands.' },
  { code: '16bit.QA', name: 'QA Agent', role: 'QA', description: 'Verifies command execution & output quality.' },
  { code: '16bit.LOG', name: 'Log Agent', role: 'LOG', description: 'Records operational logs & device events.' },
];

@Injectable()
export class AgentsService implements OnModuleInit {
  private readonly logger = new Logger(AgentsService.name);
  private readonly bootstrapByOrganization = new Map<string, Promise<void>>();
  private readonly quotaBackoff = new FirestoreQuotaBackoff(
    positiveInteger(process.env.FIRESTORE_QUOTA_BACKOFF_MS, 15 * 60_000),
    positiveInteger(process.env.FIRESTORE_QUOTA_BACKOFF_MAX_MS, 60 * 60_000),
  );

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.bootstrapMvpAgents();
    } catch (error) {
      if (!isFirestoreQuotaError(error)) throw error;
      this.quotaBackoff.recordFailure(error);
      this.logger.warn('Firestore quota exhausted; skipped the one-time MVP agent bootstrap');
    }
  }

  async bootstrapMvpAgents(organizationId = 'default-org') {
    const pending = this.bootstrapByOrganization.get(organizationId);
    if (pending) return pending;

    const bootstrap = this.seedMissingMvpAgents(organizationId);
    this.bootstrapByOrganization.set(organizationId, bootstrap);
    try {
      await bootstrap;
    } catch (error) {
      this.bootstrapByOrganization.delete(organizationId);
      throw error;
    }
  }

  async findAll(organizationId = 'default-org') {
    const now = Date.now();
    if (!this.quotaBackoff.canAttempt(now)) return this.fallbackAgents(organizationId);

    try {
      const agents = await this.prisma.aIAgent.findMany({
        where: { organizationId, code: { in: ['16bit.MANAGER', '16bit.DEVICE', '16bit.QA', '16bit.LOG'] } },
        include: {
          tasks: { orderBy: { createdAt: 'desc' }, take: 5 },
          events: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
        orderBy: { code: 'asc' },
      });
      this.quotaBackoff.recordSuccess();
      return agents;
    } catch (error) {
      const delayMs = this.quotaBackoff.recordFailure(error, now);
      if (delayMs === null) throw error;
      this.logger.warn(`Firestore quota exhausted; serving the built-in agent catalog for ${Math.ceil(delayMs / 60_000)} minute(s)`);
      return this.fallbackAgents(organizationId);
    }
  }

  async findOne(id: string) {
    const agent = await this.prisma.aIAgent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException(`Agent ${id} not found`);
    return agent;
  }

  async findByCode(code: string) {
    const agent = await this.prisma.aIAgent.findFirst({ where: { code } });
    if (!agent) throw new NotFoundException(`Agent with code ${code} not found`);
    return agent;
  }

  async update(id: string, data: any) {
    await this.findOne(id);
    return this.prisma.aIAgent.update({ where: { id }, data });
  }

  async updateStatus(id: string, status: string) {
    await this.findOne(id);
    const normalized = status.trim().toUpperCase();
    if (!['IDLE', 'THINKING', 'WORKING', 'WAITING', 'SUCCESS', 'WARNING', 'ERROR'].includes(normalized)) {
      throw new BadRequestException(`Unsupported agent status: ${status}`);
    }
    return this.prisma.aIAgent.update({ where: { id }, data: { status: normalized, lastActivityAt: new Date() } });
  }

  async activateAll(organizationId = 'default-org') {
    await this.bootstrapMvpAgents(organizationId);

    const mvpCodes = ['16bit.MANAGER', '16bit.DEVICE', '16bit.QA', '16bit.LOG'];
    const agents = await this.prisma.aIAgent.findMany({
      where: { organizationId, code: { in: mvpCodes } },
    });

    const updated = [];
    for (const agent of agents) {
      const activeAgent = await this.prisma.aIAgent.update({
        where: { id: agent.id },
        data: {
          status: 'WORKING',
          lastActivityAt: new Date(),
        },
      });

      // Create a working task for this agent
      const task = await this.prisma.agentTask.create({
        data: {
          agentId: agent.id,
          type: 'AUTONOMOUS_CYCLE',
          title: `[MVP OPERATING] ${agent.role} Active Task Cycle`,
          description: `Agent ${agent.code} is performing autonomous operational checks for PHONE-001.`,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        },
      });

      await this.prisma.aIAgent.update({ where: { id: agent.id }, data: { currentTaskId: task.id } });

      await this.prisma.agentEvent.create({
        data: {
          agentId: agent.id,
          eventType: 'AGENT_WORKING',
          message: `${agent.code} started active operational cycle.`,
          metadata: { taskId: task.id },
        },
      });

      updated.push({ ...activeAgent, currentTask: task });
    }

    return updated;
  }

  private async seedMissingMvpAgents(organizationId: string) {
    const existing = await this.prisma.aIAgent.findMany({ where: { organizationId } });
    const existingCodes = new Set(existing.map((agent: { code?: string }) => agent.code));

    for (const def of MVP_AGENTS) {
      if (existingCodes.has(def.code)) continue;
      await this.prisma.aIAgent.create({
        data: {
          organizationId,
          code: def.code,
          name: def.name,
          role: def.role,
          status: 'IDLE',
        },
      });
    }
  }

  private fallbackAgents(organizationId: string) {
    return MVP_AGENTS.map((agent) => ({
      id: null,
      organizationId,
      ...agent,
      status: 'WARNING',
      currentTaskId: null,
      lastActivityAt: null,
      tasks: [],
      events: [],
      config: { degraded: true, reason: 'FIRESTORE_QUOTA_EXHAUSTED' },
    }));
  }
}
