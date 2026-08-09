import { Module } from '@nestjs/common';
import { MockPlatformAutomationAdapter } from './mock-platform.adapter';
import { PlatformAutomationRegistry } from './platform-automation-registry.service';
import { PostVerificationService } from './post-verification.service';
import {
  FacebookAutomationAdapter,
  InstagramAutomationAdapter,
  TikTokAutomationAdapter,
  YouTubeAutomationAdapter,
} from './production-platform.adapters';
import { UiStateDetector } from './ui-state-detector.service';

const adapters = [
  TikTokAutomationAdapter,
  YouTubeAutomationAdapter,
  FacebookAutomationAdapter,
  InstagramAutomationAdapter,
  MockPlatformAutomationAdapter,
];

@Module({
  providers: [UiStateDetector, PostVerificationService, ...adapters, PlatformAutomationRegistry],
  exports: [UiStateDetector, PostVerificationService, ...adapters, PlatformAutomationRegistry],
})
export class PlatformAutomationModule {}
