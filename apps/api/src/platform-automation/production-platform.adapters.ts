import { Injectable } from '@nestjs/common';
import { DeclarativePlatformAdapter } from './platform-adapter';
import {
  FACEBOOK_PROFILE,
  INSTAGRAM_PROFILE,
  TIKTOK_PROFILE,
  YOUTUBE_PROFILE,
} from './platform-profiles';
import { PostVerificationService } from './post-verification.service';
import { UiStateDetector } from './ui-state-detector.service';

@Injectable()
export class TikTokAutomationAdapter extends DeclarativePlatformAdapter {
  constructor(detector: UiStateDetector, verifier: PostVerificationService) {
    super(TIKTOK_PROFILE, detector, verifier);
  }
}

@Injectable()
export class YouTubeAutomationAdapter extends DeclarativePlatformAdapter {
  constructor(detector: UiStateDetector, verifier: PostVerificationService) {
    super(YOUTUBE_PROFILE, detector, verifier);
  }
}

@Injectable()
export class FacebookAutomationAdapter extends DeclarativePlatformAdapter {
  constructor(detector: UiStateDetector, verifier: PostVerificationService) {
    super(FACEBOOK_PROFILE, detector, verifier);
  }
}

@Injectable()
export class InstagramAutomationAdapter extends DeclarativePlatformAdapter {
  constructor(detector: UiStateDetector, verifier: PostVerificationService) {
    super(INSTAGRAM_PROFILE, detector, verifier);
  }
}
