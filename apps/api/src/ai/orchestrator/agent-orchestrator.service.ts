import { Injectable, Logger } from '@nestjs/common';
import { CeoAgentService } from '../agents/ceo-agent.service';
import { ManagerAgentService } from '../agents/manager-agent.service';

export interface ExecuteResult {
  missionId: string;
  missionName: string;
  description: string;
  workflowSteps: any[];
  tasks: any[];
  status: string;
}

@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);

  constructor(
    private ceoAgent: CeoAgentService,
    private managerAgent: ManagerAgentService,
  ) {}

  /**
   * Execute a user command through the full AI agent pipeline:
   * 1. CEO analyzes goal → creates Mission + WorkflowSteps
   * 2. MANAGER breaks down steps → creates Tasks assigned to agents
   */
  async execute(
    command: string,
    organizationId: string,
    userId: string,
  ): Promise<ExecuteResult> {
    this.logger.log(`Orchestrator executing command: "${command}"`);

    // Step 1: CEO Agent — analyze goal and create Mission
    const { mission, plan } = await this.ceoAgent.analyzeGoal(
      command,
      organizationId,
      userId,
    );

    this.logger.log(
      `Mission created: ${mission.id} — "${plan.missionName}"`,
    );

    // Step 2: MANAGER Agent — break down into tasks
    const steps = mission.workflowSteps.map((s: any) => ({
      name: s.name,
      agentCode: s.agentCode,
    }));

    const { tasks } = await this.managerAgent.createTasks(
      mission.id,
      organizationId,
      plan.missionName,
      plan.description,
      steps,
    );

    this.logger.log(
      `Orchestration complete: ${tasks.length} tasks created for mission ${mission.id}`,
    );

    return {
      missionId: mission.id,
      missionName: plan.missionName,
      description: plan.description,
      workflowSteps: mission.workflowSteps,
      tasks,
      status: 'EXECUTING',
    };
  }
}
