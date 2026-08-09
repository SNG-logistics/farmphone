import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CeoAgentService } from '../ai/agents/ceo-agent.service';
import { ManagerAgentService } from '../ai/agents/manager-agent.service';
import { SpecializedAgentsService } from '../ai/agents/specialized-agents.service';
import { LocalTtsProvider } from './tts/tts-provider';
import { VideoComposerService } from './video-composer.service';
import { VideoQualityAssuranceService } from './video-qa.service';
import { join } from 'path';
import { writeFileSync } from 'fs';

export interface ExecuteVideoPipelineInput {
  organizationId: string;
  brief: string;
  brandName?: string;
  language?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
  tone?: string;
  callToAction?: string;
  jobId?: string;
  onProgress?: (percent: number, step: string) => void;
}

@Injectable()
export class MissionExecutionService {
  private readonly logger = new Logger(MissionExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly ceoAgent: CeoAgentService,
    private readonly managerAgent: ManagerAgentService,
    private readonly specializedAgents: SpecializedAgentsService,
    private readonly ttsProvider: LocalTtsProvider,
    private readonly composer: VideoComposerService,
    private readonly qaService: VideoQualityAssuranceService,
  ) {}

  async executeVideoCreationPipeline(input: ExecuteVideoPipelineInput) {
    const orgId = input.organizationId || 'default-org';
    const jobId = input.jobId || `job-video-${Date.now()}`;
    const brief = input.brief;
    const brandName = input.brandName || 'SNG EXPRESS';
    const durationSeconds = input.durationSeconds || 25;
    const reportProgress = (percent: number, stepName: string) => {
      this.logger.log(`[VIDEO PIPELINE ${percent}%] ${stepName}`);
      if (input.onProgress) input.onProgress(percent, stepName);
      this.events.emitWorkflowUpdate({
        type: 'JOB_PROGRESS',
        jobId,
        percent,
        step: stepName,
      });
    };

    reportProgress(5, 'Mission received - Initializing CEO Strategy');

    // 1. CEO Agent creates Mission
    const ceoResult = await this.ceoAgent.analyzeGoal(
      brief,
      orgId,
      'system-user',
    );
    const missionId = ceoResult.mission.id;

    // 2. Manager Agent breaks down workflow steps into tasks
    reportProgress(15, 'Manager Agent decomposing tasks');
    await this.managerAgent.createTasks(
      missionId,
      orgId,
      ceoResult.mission.name,
      ceoResult.mission.description || brief,
      ceoResult.plan.workflowSteps,
    );

    // 3. Content Agent generates Script (JSON Schema validated)
    reportProgress(25, 'Content Agent generating script and voiceover JSON');
    const contentScriptOutput = await this.specializedAgents.execute({
      code: '16bit.CONTENT',
      organizationId: orgId,
      instruction: `สร้าง Script วิดีโอแนวตั้ง 9:16 สำหรับ ${brandName} จากโจทย์: ${brief}. กำหนด voiceover และ scenes ให้ความยาวรวมประมาณ ${durationSeconds} วินาที`,
    });
    const script = contentScriptOutput.output;

    // Validate Content Script Schema
    if (!script || typeof script !== 'object') {
      throw new BadRequestException('Content Agent output failed JSON validation');
    }

    // 4. Designer Agent creates Scene Plan
    reportProgress(35, 'Designer Agent creating 9:16 vertical scene design');
    const designerOutput = await this.specializedAgents.execute({
      code: '16bit.DESIGNER',
      organizationId: orgId,
      instruction: `ออกแบบ Scene Design 9:16 สำหรับ ${brandName} ธีมสีเหลือง ดำ ขาว. Safe area 1080x1920`,
      context: { script },
    });
    const scenePlan = designerOutput.output;

    // 5. TTS Voiceover Generation
    reportProgress(50, 'Generating TTS Voiceover audio track');
    const voiceoverSegments = Array.isArray((script as any).voiceover)
      ? (script as any).voiceover
      : [{ start: 0, end: durationSeconds, text: brief }];

    const ttsResult = await this.ttsProvider.generateVoiceover({
      jobId,
      text: brief,
      voiceover: voiceoverSegments,
      durationSeconds,
    });

    // 6. Video Composer renders 1080x1920 MP4 via FFmpeg
    reportProgress(60, 'Rendering 1080x1920 H.264 MP4 video via FFmpeg');
    const composeResult = await this.composer.composeVideo({
      jobId,
      organizationId: orgId,
      brief,
      brandName,
      durationSeconds,
      aspectRatio: input.aspectRatio || '9:16',
      resolution: input.resolution || '1080x1920',
      script,
      scenePlan,
      voiceAudioPath: ttsResult.audioPath,
    });

    // 7. Video Quality Assurance verification via ffprobe
    reportProgress(85, 'Video Quality Assurance (ffprobe & SHA-256 Checksum)');
    const qaResult = await this.qaService.verifyVideo(composeResult.mp4Path, durationSeconds, 3);
    writeFileSync(join(composeResult.outputDir, 'qa-report.json'), JSON.stringify(qaResult, null, 2));

    if (!qaResult.verified) {
      this.logger.error(`QA Failed: ${qaResult.errors.join('; ')}`);
      await this.prisma.mission.update({ where: { id: missionId }, data: { status: 'ERROR' } });
      throw new BadRequestException(`Video QA Verification failed: ${qaResult.errors.join('; ')}`);
    }

    // 8. Save Content Record to Database
    reportProgress(95, 'Saving video to Content Library');
    const videoRelativeUrl = `/generated-videos/${orgId}/${jobId}/final.mp4`;
    const thumbnailRelativeUrl = `/generated-videos/${orgId}/${jobId}/thumbnail.jpg`;

    const contentRecord = await this.prisma.content.create({
      data: {
        organizationId: orgId,
        title: (script as any).title || `${brandName} Promotional Video`,
        type: 'VIDEO',
        url: videoRelativeUrl,
        thumbnailUrl: thumbnailRelativeUrl,
        duration: Math.round(qaResult.duration),
        fileSize: qaResult.fileSize,
        width: qaResult.width,
        height: qaResult.height,
        caption: (script as any).caption || brief,
        hashtags: Array.isArray((script as any).hashtags) ? (script as any).hashtags : ['#SNGEXPRESS', '#ขนส่งไทยลาว'],
        status: 'READY',
      },
    });

    // 9. Mission -> COMPLETED
    await this.prisma.mission.update({
      where: { id: missionId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    reportProgress(100, 'Video Creation Completed & Saved to Content Library');

    return {
      success: true,
      jobId,
      missionId,
      contentId: contentRecord.id,
      videoUrl: videoRelativeUrl,
      thumbnailUrl: thumbnailRelativeUrl,
      fileSize: qaResult.fileSize,
      duration: qaResult.duration,
      checksum: qaResult.checksum,
      script,
      scenePlan,
      qaReport: qaResult,
    };
  }
}
