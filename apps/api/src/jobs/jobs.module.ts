import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { EventsModule } from '../events/events.module';
import { JobQueueService } from './job-queue.service';
import { JobSchedulerService } from './job-scheduler.service';
import { DevicesModule } from '../devices/devices.module';
import { ContentModule } from '../content/content.module';
import { PlatformUploaderService } from './platform-uploader.service';
import { PlatformAutomationModule } from '../platform-automation';
import { SingleDeviceCommandsController } from './single-device-commands.controller';
import { SingleDeviceCommandsService } from './single-device-commands.service';
import { VideoProcessingModule } from '../video-processing/video-processing.module';

@Module({
  imports: [EventsModule, DevicesModule, ContentModule, PlatformAutomationModule, VideoProcessingModule],
  controllers: [JobsController, SingleDeviceCommandsController],
  providers: [JobsService, JobQueueService, JobSchedulerService, PlatformUploaderService, SingleDeviceCommandsService],
  exports: [JobsService, SingleDeviceCommandsService],
})
export class JobsModule {}
