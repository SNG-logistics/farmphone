import { Injectable } from '@nestjs/common';
import { DeclarativePlatformAdapter } from './platform-adapter';
import { MOCK_PROFILE } from './platform-profiles';
import {
  PostVerificationResult,
  PublishPlan,
  PublishRequest,
  UiSnapshot,
  UiStateAssessment,
} from './platform-automation.types';
import { PostVerificationService } from './post-verification.service';
import { UiStateDetector } from './ui-state-detector.service';

export interface MockPublishScenario {
  uiSnapshot?: UiSnapshot;
  observed?: {
    accountIdentifier?: string;
    contentFingerprint?: string;
    caption?: string;
    postId?: string;
    permalink?: string;
  };
}

export interface MockPublishSimulation {
  plan: PublishPlan;
  ui: UiStateAssessment;
  verification: PostVerificationResult;
}

@Injectable()
export class MockPlatformAutomationAdapter extends DeclarativePlatformAdapter {
  constructor(detector: UiStateDetector, verifier: PostVerificationService) {
    super(MOCK_PROFILE, detector, verifier);
  }

  simulatePublish(request: PublishRequest, scenario: MockPublishScenario = {}): MockPublishSimulation {
    const ui = this.inspectUi(scenario.uiSnapshot ?? { texts: ['mock published'] });
    const observed = {
      accountIdentifier: request.accountIdentifier,
      contentFingerprint: request.contentFingerprint,
      caption: request.caption,
      postId: `mock-${request.jobId}`,
      permalink: `https://mock.farm-phone.local/posts/${encodeURIComponent(request.jobId)}`,
      ...scenario.observed,
    };

    return {
      plan: this.createPublishPlan(request),
      ui,
      verification: this.verifyPost({
        ui,
        expected: {
          accountIdentifier: request.accountIdentifier,
          contentFingerprint: request.contentFingerprint,
          caption: request.caption,
        },
        observed,
        evidence: [],
      }),
    };
  }
}
