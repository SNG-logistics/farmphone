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

describe('platform automation adapters', () => {
  const detector = new UiStateDetector();
  const verifier = new PostVerificationService();
  const mock = new MockPlatformAutomationAdapter(detector, verifier);
  const request = {
    jobId: 'job-one',
    accountIdentifier: '@channel-one',
    remoteMediaPath: '/sdcard/Movies/clip-one.mp4',
    caption: 'Clip one',
    contentFingerprint: 'sha256:clip-one',
    visibility: 'PUBLIC' as const,
  };

  it('creates a guarded publish plan with approval before submission', () => {
    const plan = mock.createPublishPlan(request);
    const approvalIndex = plan.actions.findIndex((action) => action.kind === 'HUMAN_APPROVAL_CHECKPOINT');
    const submitIndex = plan.actions.findIndex((action) => action.kind === 'SUBMIT_POST');

    expect(plan.safety).toEqual({
      requiresHumanApprovalBeforePublish: true,
      abortOnChallenge: true,
      challengeBypassSupported: false,
    });
    expect(approvalIndex).toBeGreaterThan(-1);
    expect(submitIndex).toBeGreaterThan(approvalIndex);
    expect(plan.actions[submitIndex].requiresHumanApproval).toBe(true);
  });

  it('simulates a verified post without a phone', () => {
    const result = mock.simulatePublish(request);

    expect(result.ui.state).toBe('PUBLISH_SUCCEEDED');
    expect(result.verification).toEqual(expect.objectContaining({
      status: 'VERIFIED',
      verified: true,
      postId: 'mock-job-one',
    }));
  });

  it('simulates an OTP stop without attempting a bypass', () => {
    const result = mock.simulatePublish(request, {
      uiSnapshot: { texts: ['Enter verification code'] },
    });

    expect(result.ui.challenge?.bypassAllowed).toBe(false);
    expect(result.verification.status).toBe('ACTION_REQUIRED');
  });

  it('resolves platform aliases and rejects unsupported platforms', () => {
    const registry = new PlatformAutomationRegistry(
      new TikTokAutomationAdapter(detector, verifier),
      new YouTubeAutomationAdapter(detector, verifier),
      new FacebookAutomationAdapter(detector, verifier),
      new InstagramAutomationAdapter(detector, verifier),
      mock,
    );

    expect(registry.get('YouTube Shorts').definition.platform).toBe('youtube');
    expect(registry.get('IG').definition.platform).toBe('instagram');
    expect(() => registry.get('unknown')).toThrow('Unsupported automation platform');
  });
});
