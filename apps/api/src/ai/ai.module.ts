import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { GeminiService } from './gemini.service';
import { ScriptGeneratorService } from './script-generator.service';
import { DailyPlannerService } from './daily-planner.service';
import { AiController } from './ai.controller';
import { CeoAgentService } from './agents/ceo-agent.service';
import { ManagerAgentService } from './agents/manager-agent.service';
import { AgentOrchestratorService } from './orchestrator/agent-orchestrator.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { SpecializedAgentsService } from './agents/specialized-agents.service';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [AiController],
  providers: [
    AiService,
    GeminiService,
    ScriptGeneratorService,
    DailyPlannerService,
    CeoAgentService,
    ManagerAgentService,
    AgentOrchestratorService,
    SpecializedAgentsService,
  ],
  exports: [
    AiService,
    GeminiService,
    ScriptGeneratorService,
    DailyPlannerService,
    CeoAgentService,
    ManagerAgentService,
    AgentOrchestratorService,
    SpecializedAgentsService,
  ],
})
export class AiModule {}

