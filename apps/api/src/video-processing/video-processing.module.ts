import { Module } from '@nestjs/common';
import { ExecFileProcessRunner } from './process-runner.service';
import { VideoPathService } from './video-path.service';
import { VideoProbeService } from './video-probe.service';
import { VideoProcessingController } from './video-processing.controller';
import { VideoTranscodeService } from './video-transcode.service';
import { LocalTtsProvider } from './tts/tts-provider';
import { VideoQualityAssuranceService } from './video-qa.service';
import { VideoComposerService } from './video-composer.service';
import { AgentTaskExecutorService } from './agent-task-executor.service';
import { MissionExecutionService } from './mission-execution.service';
import { VideoCreationQueueService } from './video-creation-queue.service';
import { VideoCreativeQaService } from './video-creative-qa.service';

// Modules required by MissionExecutionService
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, EventsModule, AiModule],
  controllers: [VideoProcessingController],
  providers: [
    ExecFileProcessRunner,
    VideoPathService,
    VideoProbeService,
    VideoTranscodeService,
    LocalTtsProvider,
    VideoQualityAssuranceService,
    VideoCreativeQaService,
    VideoComposerService,
    AgentTaskExecutorService,
    MissionExecutionService,
    VideoCreationQueueService,
  ],
  exports: [
    VideoPathService,
    VideoProbeService,
    VideoTranscodeService,
    LocalTtsProvider,
    VideoQualityAssuranceService,
    VideoCreativeQaService,
    VideoComposerService,
    AgentTaskExecutorService,
    MissionExecutionService,
    VideoCreationQueueService,
  ],
})
export class VideoProcessingModule {}
