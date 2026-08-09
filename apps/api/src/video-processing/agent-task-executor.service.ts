import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { SpecializedAgentsService } from '../ai/agents/specialized-agents.service';

@Injectable()
export class AgentTaskExecutorService {
  private readonly logger = new Logger(AgentTaskExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly specializedAgents: SpecializedAgentsService,
  ) {}

  async processPendingTasksForMission(missionId: string, organizationId: string): Promise<void> {
    const tasks = await this.prisma.agentTask.findMany({
      where: { missionId },
      include: { agent: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const task of tasks) {
      if (task.status === 'COMPLETED' || task.status === 'FAILED') continue;

      // Update state to ASSIGNED -> IN_PROGRESS
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });
      this.events.emitAgentState({
        organizationId,
        agentCode: task.agent.code,
        status: 'WORKING',
        taskId: task.id,
      });

      try {
        const result = await this.specializedAgents.execute({
          code: task.agent.code,
          organizationId,
          taskId: task.id,
          instruction: task.description || task.title,
          context: { missionId, taskTitle: task.title, taskType: task.type },
        });

        await this.prisma.agentTask.update({
          where: { id: task.id },
          data: { status: 'COMPLETED', completedAt: new Date(), output: result.output as any },
        });
        this.events.emitAgentState({
          organizationId,
          agentCode: task.agent.code,
          status: 'SUCCESS',
          taskId: task.id,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Task ${task.id} (${task.title}) failed: ${errorMsg}`);
        await this.prisma.agentTask.update({
          where: { id: task.id },
          data: { status: 'FAILED', completedAt: new Date(), error: errorMsg },
        });
        this.events.emitAgentState({
          organizationId,
          agentCode: task.agent.code,
          status: 'ERROR',
          taskId: task.id,
          error: errorMsg,
        });
        throw error;
      }
    }
  }
}
