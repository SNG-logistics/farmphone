import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FirestoreQuotaBackoff, positiveInteger } from '../stability/firestore-quota-backoff';

@Injectable()
export class AgentTasksService {
  private readonly logger = new Logger(AgentTasksService.name);
  private readonly quotaBackoff = new FirestoreQuotaBackoff(
    positiveInteger(process.env.FIRESTORE_QUOTA_BACKOFF_MS, 15 * 60_000),
    positiveInteger(process.env.FIRESTORE_QUOTA_BACKOFF_MAX_MS, 60 * 60_000),
  );

  constructor(private prisma: PrismaService) {}

  async findAll(agentId?: string) {
    const now = Date.now();
    if (!this.quotaBackoff.canAttempt(now)) return [];
    const where = agentId ? { agentId } : {};
    try {
      const tasks = await this.prisma.agentTask.findMany({ where });
      this.quotaBackoff.recordSuccess();
      return tasks;
    } catch (error) {
      const delayMs = this.quotaBackoff.recordFailure(error, now);
      if (delayMs === null) throw error;
      this.logger.warn(`Firestore quota exhausted; serving an empty agent task list for ${Math.ceil(delayMs / 60_000)} minute(s)`);
      return [];
    }
  }

  async findOne(id: string) {
    const task = await this.prisma.agentTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Agent task ${id} not found`);
    return task;
  }

  async create(data: any) {
    return this.prisma.agentTask.create({ data });
  }

  async update(id: string, data: any) {
    await this.findOne(id);
    return this.prisma.agentTask.update({ where: { id }, data });
  }
}
