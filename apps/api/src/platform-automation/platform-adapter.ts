import {
  PlatformDefinition,
  PostVerificationInput,
  PostVerificationResult,
  PublishPlan,
  PublishRequest,
  UiSnapshot,
  UiStateAssessment,
} from './platform-automation.types';
import { PostVerificationService } from './post-verification.service';
import { UiStateDetector } from './ui-state-detector.service';

export interface PlatformAutomationAdapter {
  readonly definition: PlatformDefinition;
  createPublishPlan(request: PublishRequest): PublishPlan;
  inspectUi(snapshot: UiSnapshot): UiStateAssessment;
  verifyPost(input: Omit<PostVerificationInput, 'platform'>): PostVerificationResult;
}

export abstract class DeclarativePlatformAdapter implements PlatformAutomationAdapter {
  protected constructor(
    readonly definition: PlatformDefinition,
    private readonly detector: UiStateDetector,
    private readonly verifier: PostVerificationService,
  ) {}

  createPublishPlan(request: PublishRequest): PublishPlan {
    const actions: PublishPlan['actions'] = [
      this.action('launch', 'LAUNCH_APP', `Launch ${this.definition.displayName}.`, false, {
        packageName: this.definition.androidPackage,
      }),
      this.action('safe-start', 'ASSERT_UI_SAFE', 'Stop for login, CAPTCHA, OTP, consent, or rate-limit states.'),
      this.action('account', 'CONFIRM_ACCOUNT', 'Confirm the active account before selecting media.', true, {
        accountIdentifier: request.accountIdentifier,
      }),
      this.action('media', 'SELECT_MEDIA', 'Select the prepared media file.', false, {
        remoteMediaPath: request.remoteMediaPath,
      }),
      ...(request.caption
        ? [this.action('caption', 'ENTER_CAPTION', 'Enter the approved caption.', false, { caption: request.caption })]
        : []),
      this.action('visibility', 'CONFIGURE_VISIBILITY', 'Apply the requested visibility.', false, {
        visibility: request.visibility ?? 'PUBLIC',
      }),
      this.action('approval', 'HUMAN_APPROVAL_CHECKPOINT', 'Require a person to approve the final preview.', true),
      this.action('submit', 'SUBMIT_POST', 'Submit only after approval and a fresh safe-state check.', true),
      this.action('verify', 'VERIFY_POST', 'Collect post identity, UI state, and evidence after submission.'),
    ];

    return {
      platform: this.definition.platform,
      jobId: request.jobId,
      packageName: this.definition.androidPackage,
      safety: {
        requiresHumanApprovalBeforePublish: true,
        abortOnChallenge: true,
        challengeBypassSupported: false,
      },
      actions,
    };
  }

  inspectUi(snapshot: UiSnapshot) {
    return this.detector.detect(snapshot, this.definition.markers);
  }

  verifyPost(input: Omit<PostVerificationInput, 'platform'>) {
    return this.verifier.verify({ ...input, platform: this.definition.platform });
  }

  private action(
    id: string,
    kind: PublishPlan['actions'][number]['kind'],
    description: string,
    requiresHumanApproval = false,
    payload?: Readonly<Record<string, string>>,
  ) {
    return {
      id,
      kind,
      description,
      requiresHumanApproval,
      abortOnChallenge: true,
      payload,
    };
  }
}
