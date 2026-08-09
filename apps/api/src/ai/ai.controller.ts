import { Controller, Get, Post, Body, Logger, HttpCode, Param, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AgentOrchestratorService } from './orchestrator/agent-orchestrator.service';
import { AiService } from './ai.service';
import { GeminiService } from './gemini.service';
import { ScriptGeneratorService } from './script-generator.service';
import { DailyPlannerService } from './daily-planner.service';
import { SpecializedAgentsService } from './agents/specialized-agents.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

class ExecuteCommandDto {
  @IsString()
  @IsNotEmpty()
  command: string;

  @IsString()
  @IsOptional()
  organizationId?: string;

  @IsString()
  @IsOptional()
  userId?: string;
}

class ChatDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  model?: string;
}

class AnalyzeScreenDto {
  @IsString()
  @IsNotEmpty()
  imageBase64: string;

  @IsString()
  @IsOptional()
  prompt?: string;
}

class DecideActionDto {
  @IsString()
  @IsNotEmpty()
  imageBase64: string;

  @IsString()
  @IsNotEmpty()
  goalContext: string;
}

class ViralScriptDto {
  @IsString()
  @IsNotEmpty()
  spokenPrompt: string;

  @IsString()
  @IsOptional()
  brandName?: string;

  @IsString()
  @IsOptional()
  targetPlatform?: 'tiktok' | 'facebook' | 'instagram' | 'shopee';
}

class Daily3PeakPlanDto {
  @IsString()
  @IsNotEmpty()
  businessName: string;

  @IsString()
  @IsOptional()
  industry?: string;

  @IsString()
  @IsNotEmpty()
  targetAudience: string;

  @IsString()
  @IsNotEmpty()
  brandTone: string;

  @IsString()
  @IsNotEmpty()
  coreUSP: string;

  @IsString()
  @IsOptional()
  targetPlatform?: 'tiktok' | 'facebook' | 'instagram' | 'shopee';
}

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MANAGER')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private orchestrator: AgentOrchestratorService,
    private aiService: AiService,
    private geminiService: GeminiService,
    private scriptGenerator: ScriptGeneratorService,
    private dailyPlanner: DailyPlannerService,
    private specializedAgents: SpecializedAgentsService,
  ) {}

  /**
   * Execute an AI command through the full agent pipeline
   * POST /api/ai/execute
   */
  @Post('execute')
  @HttpCode(200)
  async execute(@Body() dto: ExecuteCommandDto) {
    this.logger.log(`POST /ai/execute — command: "${dto.command}"`);

    // Use defaults if not provided (dev mode)
    const organizationId = dto.organizationId || 'default-org';
    const userId = dto.userId || 'default-user';

    const result = await this.orchestrator.execute(
      dto.command,
      organizationId,
      userId,
    );

    return {
      success: true,
      data: result,
      message: `Mission "${result.missionName}" created with ${result.tasks.length} tasks`,
    };
  }

  /**
   * Simple chat endpoint for testing AI connectivity
   * POST /api/ai/chat
   */
  @Post('chat')
  @HttpCode(200)
  async chat(@Body() dto: ChatDto) {
    this.logger.log(`POST /ai/chat — message: "${dto.message}"`);

    const response = await this.aiService.chatCompletion(
      [{ role: 'user', content: dto.message }],
      { model: dto.model },
    );

    return {
      success: true,
      data: {
        response,
        model: dto.model || this.aiService.getDefaultModel(),
      },
    };
  }

  /**
   * Health check for AI service & Gemini API
   * POST /api/ai/health
   */
  @Post('health')
  @HttpCode(200)
  async health() {
    try {
      const response = await this.aiService.chatCompletion(
        [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
        { maxTokens: 10 },
      );

      return {
        success: true,
        data: {
          status: 'connected',
          model: this.aiService.getDefaultModel(),
          geminiAvailable: this.geminiService.isAvailable(),
          response: response.trim(),
        },
      };
    } catch (error) {
      return {
        success: false,
        data: {
          status: 'error',
          model: this.aiService.getDefaultModel(),
          geminiAvailable: this.geminiService.isAvailable(),
          error: String(error),
        },
      };
    }
  }

  /**
   * Convert plain spoken Thai text into a structured 3-part viral marketing short video script
   * POST /api/ai/viral-script
   */
  @Post('viral-script')
  @HttpCode(200)
  async generateViralScript(@Body() dto: ViralScriptDto) {
    this.logger.log(`POST /ai/viral-script — prompt: "${dto.spokenPrompt}"`);
    const script = await this.scriptGenerator.generateViralScript(dto);
    return { success: true, data: script };
  }

  /**
   * Design AI Brand Persona & generate customized 3-Peak Daily Posting Plan for user review
   * POST /api/ai/daily-3peak-plan
   */
  @Post('daily-3peak-plan')
  @HttpCode(200)
  async generateDaily3PeakPlan(@Body() dto: Daily3PeakPlanDto) {
    this.logger.log(`POST /ai/daily-3peak-plan — business: "${dto.businessName}"`);
    const plan = await this.dailyPlanner.generateDaily3PeakPlan(dto);
    return { success: true, data: plan };
  }



  /**
   * Analyze mobile screenshot using Gemini Multimodal Vision
   * POST /api/ai/gemini/analyze-screen
   */
  @Post('gemini/analyze-screen')
  @HttpCode(200)
  async analyzeScreen(@Body() dto: AnalyzeScreenDto) {
    this.logger.log('POST /ai/gemini/analyze-screen');
    const result = await this.geminiService.analyzeScreen(
      { base64: dto.imageBase64 },
      dto.prompt,
    );
    return { success: true, data: result };
  }

  /**
   * Determine optimal device action from screenshot using Gemini Vision
   * POST /api/ai/gemini/decide-action
   */
  @Post('gemini/decide-action')
  @HttpCode(200)
  async decideAction(@Body() dto: DecideActionDto) {
    this.logger.log(`POST /ai/gemini/decide-action — goal: "${dto.goalContext}"`);
    const decision = await this.geminiService.decideDeviceAction(
      { base64: dto.imageBase64 },
      dto.goalContext,
    );
    return { success: true, data: decision };
  }

  @Post('agents/:code/execute')
  @HttpCode(200)
  executeSpecialized(
    @Param('code') code: string,
    @Body() body: { organizationId?: string; taskId?: string; instruction: string; context?: unknown },
  ) {
    return this.specializedAgents.execute({
      code,
      organizationId: body.organizationId || 'default-org',
      taskId: body.taskId,
      instruction: body.instruction,
      context: body.context,
    });
  }

  @Get('agents/catalog')
  @HttpCode(200)
  specializedCatalog() {
    return { success: true, data: this.specializedAgents.list() };
  }
}

