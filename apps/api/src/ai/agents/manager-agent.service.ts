import { Injectable, Logger } from '@nestjs/common';
import { AiService, ChatMessage } from '../ai.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../events/events.gateway';

interface TaskPlan {
  tasks: {
    title: string;
    description: string;
    agentCode: string;
    type: string;
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    dependsOn?: string[];
  }[];
}

const MANAGER_SYSTEM_PROMPT = `คุณคือ "16bit.MANAGER" — Project Manager AI ของระบบ Farm Phone AI Office

หน้าที่ของคุณ:
1. รับ Mission Plan จาก CEO
2. แตก workflow steps ออกเป็น Tasks ที่ทำได้จริง
3. กำหนด priority ให้แต่ละ task
4. Assign task ไปยัง agent ที่เหมาะสม

Agent codes: 16bit.CEO, 16bit.MANAGER, 16bit.ANALYST, 16bit.CONTENT, 16bit.DESIGNER, 16bit.VIDEO, 16bit.SCHEDULER, 16bit.DEVICE, 16bit.API, 16bit.UPLOADER, 16bit.SECURITY, 16bit.QA, 16bit.DATA, 16bit.AI_ENGINE, 16bit.NOTIFIER, 16bit.LOG

Task types: CONTENT_UPLOAD, CONTENT_PUBLISH, ACCOUNT_CHECK, DEVICE_HEALTH, CAMPAIGN_EXECUTE, BATCH_OPERATION

ตอบเป็น JSON เท่านั้น:
{
  "tasks": [
    {
      "title": "ชื่อ task สั้นๆ",
      "description": "รายละเอียด",
      "agentCode": "16bit.AGENT_CODE",
      "type": "TASK_TYPE",
      "priority": "NORMAL"
    }
  ]
}

กฎ:
- tasks ต้องเรียงลำดับตาม workflow steps
- แต่ละ step อาจแตกเป็นหลาย tasks ได้
- ตอบ JSON เท่านั้น ห้ามมี text อื่น`;

@Injectable()
export class ManagerAgentService {
  private readonly logger = new Logger(ManagerAgentService.name);

  constructor(
    private ai: AiService,
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
  ) {}

  /**
   * Break a Mission's workflow steps into actionable AgentTasks
   */
  async createTasks(
    missionId: string,
    organizationId: string,
    missionName: string,
    missionDescription: string,
    workflowSteps: { name: string; agentCode: string | null }[],
  ): Promise<{ tasks: any[]; plan: TaskPlan }> {
    this.logger.log(`MANAGER breaking down mission: "${missionName}"`);

    // Update MANAGER agent status → THINKING
    await this.updateAgentStatus(organizationId, '16bit.MANAGER', 'THINKING');

    const stepsDescription = workflowSteps
      .map((s, i) => `${i + 1}. ${s.name} (agent: ${s.agentCode || 'TBD'})`)
      .join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: MANAGER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Mission: "${missionName}"
Description: ${missionDescription}

Workflow Steps:
${stepsDescription}

แตก steps เหล่านี้ออกเป็น tasks ที่ทำได้จริง`,
      },
    ];

    const plan = await this.ai.chatCompletionJson<TaskPlan>(messages);

    this.logger.log(
      `MANAGER created ${plan.tasks.length} tasks for mission "${missionName}"`,
    );

    // Update MANAGER agent status → WORKING
    await this.updateAgentStatus(organizationId, '16bit.MANAGER', 'WORKING');

    // Find agent IDs for task assignment
    const agents = await this.prisma.aIAgent.findMany({
      where: { organizationId },
      select: { id: true, code: true },
    });
    const agentMap = new Map(agents.map((a: { code: string; id: string }) => [a.code, a.id]));

    // Save tasks to database
    const createdTasks = [];
    for (const task of plan.tasks) {
      const agentId = agentMap.get(task.agentCode);
      if (!agentId) {
        this.logger.warn(
          `Agent ${task.agentCode} not found, skipping task "${task.title}"`,
        );
        continue;
      }

      const created = await this.prisma.agentTask.create({
        data: {
          agentId,
          missionId,
          type: task.type || 'BATCH_OPERATION',
          title: task.title,
          description: task.description,
          status: 'PENDING',
          input: { priority: task.priority },
        },
      });
      createdTasks.push(created);

      // Broadcast task creation via WebSocket
      this.eventsGateway.emitWorkflowUpdate({
        type: 'TASK_CREATED',
        taskId: created.id,
        missionId,
        title: task.title,
        agentCode: task.agentCode,
      });

      // Update the assigned agent's status
      await this.updateAgentStatus(
        organizationId,
        task.agentCode,
        'WAITING',
      );
    }

    // Update mission status to EXECUTING
    await this.prisma.mission.update({
      where: { id: missionId },
      data: { status: 'EXECUTING', startedAt: new Date() },
    });

    // Update MANAGER agent status → SUCCESS
    await this.updateAgentStatus(organizationId, '16bit.MANAGER', 'SUCCESS');

    // Log agent event
    await this.logAgentEvent(
      organizationId,
      '16bit.MANAGER',
      'TASK_CREATED',
      `แตก Mission "${missionName}" เป็น ${createdTasks.length} tasks`,
    );

    return { tasks: createdTasks, plan };
  }

  private async updateAgentStatus(
    organizationId: string,
    agentCode: string,
    status: string,
  ) {
    try {
      await this.prisma.aIAgent.updateMany({
        where: { organizationId, code: agentCode },
        data: { status, lastActivityAt: new Date() },
      });

      // Broadcast agent state change via WebSocket
      this.eventsGateway.emitAgentState({
        organizationId,
        agentCode,
        status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn(
        `Could not update agent ${agentCode} status: ${error}`,
      );
    }
  }

  private async logAgentEvent(
    organizationId: string,
    agentCode: string,
    eventType: string,
    message: string,
  ) {
    try {
      const agent = await this.prisma.aIAgent.findFirst({
        where: { organizationId, code: agentCode },
      });
      if (agent) {
        await this.prisma.agentEvent.create({
          data: { agentId: agent.id, eventType, message },
        });
      }
    } catch (error) {
      this.logger.warn(`Could not log agent event: ${error}`);
    }
  }
}
