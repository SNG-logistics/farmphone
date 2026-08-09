import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../events/events.gateway';
import { AiService } from '../ai.service';

export const SPECIALIZED_AGENTS = {
  '16bit.CEO': { role: 'Chief Executive Officer', recommendedModel: 'deepseek-reasoner', fallbackModelTier: 'default', capability: 'Analyze high-level business goals, define campaign vision, and orchestrate top-level strategy.' },
  '16bit.MANAGER': { role: 'Operations Manager', recommendedModel: 'claude-3-5-sonnet-20241022', fallbackModelTier: 'default', capability: 'Decompose complex goals into structured tasks and assign specialized AI agents.' },
  '16bit.ANALYST': { role: 'Market & Data Analyst', recommendedModel: 'deepseek-chat', fallbackModelTier: 'default', capability: 'Analyze audience trends, competitor benchmarks, hook points, and risk metrics.' },
  '16bit.CONTENT': { role: 'Creative Copywriter', recommendedModel: 'claude-3-5-sonnet-20241022', fallbackModelTier: 'default', capability: 'Draft high-converting scripts, captions, hashtags, and viral short-video hooks.' },
  '16bit.DESIGNER': { role: 'Visual Graphic Designer', recommendedModel: 'gpt-4o', fallbackModelTier: 'default', capability: 'Design 9:16 storyboards, color palettes, visual hierarchies, and overlay typography.' },
  '16bit.VIDEO': { role: 'Video Engineer', recommendedModel: 'gemini-1.5-pro', fallbackModelTier: 'default', capability: 'Validate 9:16 vertical video specs, aspect ratio, frame rates, and audio synchronization.' },
  '16bit.SCHEDULER': { role: 'Scheduling Operator', recommendedModel: 'gemini-1.5-flash', fallbackModelTier: 'mini', capability: 'Compute peak posting times, build cron schedules, and verify collision guards.' },
  '16bit.DEVICE': { role: 'Device Farm Controller', recommendedModel: 'gpt-4o-mini', fallbackModelTier: 'mini', capability: 'Evaluate ADB readiness for PHONE-001 to PHONE-020, battery health, and storage.' },
  '16bit.API': { role: 'API Integration Specialist', recommendedModel: 'claude-3-5-haiku-20241022', fallbackModelTier: 'mini', capability: 'Manage API calls, headers, idempotency keys, rate limits, and fallback retries.' },
  '16bit.UPLOADER': { role: 'Publishing Operator', recommendedModel: 'gpt-4o-mini', fallbackModelTier: 'mini', capability: 'Execute automated publishing workflows with human approval and evidence capture.' },
  '16bit.SECURITY': { role: 'Security & Compliance Officer', recommendedModel: 'deepseek-chat', fallbackModelTier: 'mini', capability: 'Audit account credentials, platform policies, sensitive data leaks, and authorization.' },
  '16bit.QA': { role: 'Quality Assurance Inspector', recommendedModel: 'claude-3-5-sonnet-20241022', fallbackModelTier: 'mini', capability: 'Perform 100% verification on published posts, screenshots, links, and captions.' },
  '16bit.DATA': { role: 'Analytics & Metrics Reporter', recommendedModel: 'deepseek-reasoner', fallbackModelTier: 'mini', capability: 'Track views, conversion rates, engagement KPIs, and ROI reporting.' },
  '16bit.AI_ENGINE': { role: 'AI Supervisor', recommendedModel: 'o3-mini', fallbackModelTier: 'default', capability: 'Inspect AI agent state, model failure fallback, token efficiency, and escalation.' },
  '16bit.NOTIFIER': { role: 'Notification Operator', recommendedModel: 'gemini-1.5-flash', fallbackModelTier: 'mini', capability: 'Format multi-channel status alerts, alerts severity, and operational summaries.' },
  '16bit.LOG': { role: 'Audit Logger', recommendedModel: 'gpt-4o-mini', fallbackModelTier: 'mini', capability: 'Log operational timelines, correlation IDs, execution checkpoints, and audit trails.' },
} as const;

type SpecializedAgentCode = keyof typeof SPECIALIZED_AGENTS;

@Injectable()
export class SpecializedAgentsService {
  private readonly logger = new Logger(SpecializedAgentsService.name);

  constructor(
    private ai: AiService,
    private prisma: PrismaService,
    private events: EventsGateway,
    private configService: ConfigService,
  ) {}

  list() {
    return Object.entries(SPECIALIZED_AGENTS).map(([code, definition]) => ({ code, ...definition }));
  }

  private normalizeCode(rawCode: string): SpecializedAgentCode | null {
    const trimmed = String(rawCode || '').trim();
    if (!trimmed) return null;
    const nameWithoutPrefix = trimmed.replace(/^16bit\./i, '').toUpperCase();
    const canonicalKey = `16bit.${nameWithoutPrefix}` as SpecializedAgentCode;
    return SPECIALIZED_AGENTS[canonicalKey] ? canonicalKey : null;
  }

  async execute(input: {
    code: string;
    organizationId: string;
    taskId?: string;
    instruction: string;
    context?: unknown;
  }) {
    const code = this.normalizeCode(input.code);
    if (!code) throw new BadRequestException(`Unsupported specialized agent: ${input.code}`);
    const definition = SPECIALIZED_AGENTS[code];
    if (!input.instruction?.trim()) throw new BadRequestException('instruction is required');

    const agent = await this.prisma.aIAgent.upsert({
      where: { organizationId_code: { organizationId: input.organizationId, code } },
      update: { name: definition.role, role: definition.role, status: 'WORKING', lastActivityAt: new Date() },
      create: { organizationId: input.organizationId, code, name: definition.role, role: definition.role, status: 'WORKING' },
    });
    if (input.taskId) await this.prisma.agentTask.update({ where: { id: input.taskId }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
    this.events.emitAgentState({ organizationId: input.organizationId, agentCode: code, status: 'WORKING' });

    try {
      const def = definition as { recommendedModel?: string; fallbackModelTier?: string; role: string; capability: string };
      const envKey = `COMETAPI_AGENT_${code.replace(/^16bit\./i, '').toUpperCase()}_MODEL`;
      const customEnvModel = this.configService.get<string>(envKey);
      const targetModel = customEnvModel || def.recommendedModel || (def.fallbackModelTier === 'mini' ? this.ai.getMiniModel() : this.ai.getDefaultModel());
      const output = await this.ai.chatCompletionJson<Record<string, unknown>>(
        [
          {
            role: 'system',
            content: `You are ${code}, the ${definition.role} in Farm Phone AI Office.
Capabilities: ${definition.capability}
Goal: Generate clear, highly compelling, precise, and actionable outputs. For viral short video clips, ensure 0-3s hook, high retention structure, and clear Call to Action (CTA).
Return strict JSON with keys: summary, status, findings, actions, warnings, outputData. Never bypass CAPTCHA, OTP, authentication, or human approval.`,
          },
          { role: 'user', content: JSON.stringify({ instruction: input.instruction, context: input.context ?? {} }) },
        ],
        { model: targetModel },
      );
      await this.prisma.aIAgent.update({ where: { id: agent.id }, data: { status: 'SUCCESS', lastActivityAt: new Date() } });
      const jsonOutput = output as any;
      if (input.taskId) await this.prisma.agentTask.update({ where: { id: input.taskId }, data: { status: 'COMPLETED', output: jsonOutput, completedAt: new Date() } });
      await this.prisma.agentEvent.create({ data: { agentId: agent.id, eventType: 'AGENT_COMPLETED', message: `${code} (${targetModel}) completed task`, metadata: { taskId: input.taskId || null, model: targetModel, output: jsonOutput } } });
      this.events.emitAgentState({ organizationId: input.organizationId, agentCode: code, status: 'SUCCESS', output });
      return { agentCode: code, taskId: input.taskId || null, modelUsed: targetModel, output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`${code} failed: ${message}`);
      await this.prisma.aIAgent.update({ where: { id: agent.id }, data: { status: 'ERROR', lastActivityAt: new Date() } });
      if (input.taskId) await this.prisma.agentTask.update({ where: { id: input.taskId }, data: { status: 'FAILED', error: message, completedAt: new Date() } });
      await this.prisma.agentEvent.create({ data: { agentId: agent.id, eventType: 'AGENT_FAILED', message, metadata: { taskId: input.taskId } } });
      this.events.emitAgentState({ organizationId: input.organizationId, agentCode: code, status: 'ERROR', error: message });
      throw error;
    }
  }
}
