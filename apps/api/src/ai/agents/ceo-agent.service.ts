import { Injectable, Logger } from '@nestjs/common';
import { AiService, ChatMessage } from '../ai.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../events/events.gateway';

interface MissionPlan {
  missionName: string;
  description: string;
  workflowSteps: {
    name: string;
    agentCode: string;
    description: string;
  }[];
}

const CEO_SYSTEM_PROMPT = `คุณคือ "16bit.CEO" — Chief Executive AI ของระบบ Farm Phone AI Office
ระบบนี้ควบคุม Device Farm (มือถือหลายเครื่อง) เพื่อจัดการ Social Media Campaigns อัตโนมัติ

หน้าที่ของคุณ:
1. รับ goal/command จากผู้ใช้ (ภาษาไทยหรืออังกฤษ)
2. วิเคราะห์ว่าต้องทำอะไรบ้าง
3. สร้าง Mission Plan ที่มี workflow steps ชัดเจน

AI Agents ที่มีในระบบ:
- 16bit.CEO — รับ Goal หลัก, สร้าง Mission (คุณ)
- 16bit.MANAGER — แยก Mission เป็น Task ย่อย
- 16bit.ANALYST — วิเคราะห์ข้อมูล, สร้าง Report
- 16bit.CONTENT — จัดการ Content Library, เขียน Caption
- 16bit.DESIGNER — ดูแล Creative Asset
- 16bit.VIDEO — ตรวจ Video + FFmpeg
- 16bit.SCHEDULER — จัดการเวลา + Queue
- 16bit.DEVICE — ควบคุม Device Farm
- 16bit.API — OAuth, Rate Limit
- 16bit.UPLOADER — จัดการ Upload
- 16bit.SECURITY — Auth, Permission
- 16bit.QA — ตรวจ Result
- 16bit.DATA — Dashboard, Analytics
- 16bit.AI_ENGINE — ดูสถานะ AI ทั้งหมด
- 16bit.NOTIFIER — ส่ง Notification
- 16bit.LOG — เก็บบันทึกทั้งหมด

ตอบเป็น JSON เท่านั้น ในรูปแบบ:
{
  "missionName": "ชื่อ Mission สั้นๆ",
  "description": "รายละเอียดสิ่งที่จะทำ",
  "workflowSteps": [
    { "name": "STEP_NAME", "agentCode": "16bit.AGENT_CODE", "description": "สิ่งที่ step นี้ทำ" }
  ]
}

กฎ:
- workflow steps ต้องเรียงลำดับที่ถูกต้อง
- ใช้ agent ที่เหมาะสมกับแต่ละ step
- ขั้นตอนแรกควรเป็น CHECK_SYSTEM และขั้นตอนสุดท้ายควรเป็น NOTIFY_COMPLETE
- ตอบ JSON เท่านั้น ห้ามมี text อื่น`;

@Injectable()
export class CeoAgentService {
  private readonly logger = new Logger(CeoAgentService.name);

  constructor(
    private ai: AiService,
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
  ) {}

  /**
   * Analyze a user's goal and create a Mission with WorkflowSteps
   */
  async analyzeGoal(
    goal: string,
    organizationId: string,
    userId: string,
  ): Promise<{
    mission: any;
    plan: MissionPlan;
  }> {
    this.logger.log(`CEO analyzing goal: "${goal}"`);

    // Update CEO agent status → THINKING
    await this.updateAgentStatus(organizationId, '16bit.CEO', 'THINKING');

    // Call LLM
    const messages: ChatMessage[] = [
      { role: 'system', content: CEO_SYSTEM_PROMPT },
      { role: 'user', content: goal },
    ];

    const plan = await this.ai.chatCompletionJson<MissionPlan>(messages);

    this.logger.log(
      `CEO created plan: "${plan.missionName}" with ${plan.workflowSteps.length} steps`,
    );

    // Update CEO agent status → WORKING
    await this.updateAgentStatus(organizationId, '16bit.CEO', 'WORKING');

    // Save Mission to database
    const mission = await this.prisma.mission.create({
      data: {
        organizationId,
        name: plan.missionName,
        description: plan.description,
        status: 'PLANNING',
        createdBy: userId,
        workflowSteps: {
          create: plan.workflowSteps.map((step, index) => ({
            sortOrder: index,
            name: step.name,
            status: 'WAITING',
            agentCode: step.agentCode,
          })),
        },
      },
      include: { workflowSteps: true },
    });

    // Broadcast mission created over WebSocket
    this.eventsGateway.emitWorkflowUpdate({
      type: 'MISSION_CREATED',
      missionId: mission.id,
      missionName: plan.missionName,
      description: plan.description,
      workflowSteps: mission.workflowSteps,
    });

    // Update CEO agent status → SUCCESS
    await this.updateAgentStatus(organizationId, '16bit.CEO', 'SUCCESS');

    // Log agent event
    await this.logAgentEvent(
      organizationId,
      '16bit.CEO',
      'MISSION_CREATED',
      `สร้าง Mission "${plan.missionName}" สำเร็จ — ${plan.workflowSteps.length} steps`,
    );

    return { mission, plan };
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

      // Broadcast agent status change via WebSocket
      this.eventsGateway.emitAgentState({
        organizationId,
        agentCode,
        status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Agent may not exist yet, log but don't fail
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
          data: {
            agentId: agent.id,
            eventType,
            message,
          },
        });
      }
    } catch (error) {
      this.logger.warn(`Could not log agent event: ${error}`);
    }
  }
}
