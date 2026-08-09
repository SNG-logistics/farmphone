import { PostVerificationService } from './post-verification.service';
import { UiStateAssessment } from './platform-automation.types';

describe('PostVerificationService', () => {
  const verifier = new PostVerificationService();

  it('verifies only when success, identity, account, and content match', () => {
    const result = verifier.verify({
      platform: 'instagram',
      ui: assessment('PUBLISH_SUCCEEDED', 'CONTINUE'),
      expected: {
        accountIdentifier: '@farm-one',
        contentFingerprint: 'sha256:video-one',
        caption: 'First post',
      },
      observed: {
        accountIdentifier: '@farm-one',
        contentFingerprint: 'sha256:video-one',
        caption: 'First post',
        postId: 'post-1',
      },
    });

    expect(result.status).toBe('VERIFIED');
    expect(result.verified).toBe(true);
    expect(result.verifiedAt).toBeInstanceOf(Date);
  });

  it('returns inconclusive when post identity is missing', () => {
    const result = verifier.verify({
      platform: 'youtube',
      ui: assessment('PUBLISH_SUCCEEDED', 'CONTINUE'),
      expected: { accountIdentifier: 'channel-one' },
      observed: { accountIdentifier: 'channel-one' },
    });

    expect(result.status).toBe('INCONCLUSIVE');
    expect(result.verified).toBe(false);
    expect(result.retryable).toBe(true);
  });

  it('fails without retry when the observed account is wrong', () => {
    const result = verifier.verify({
      platform: 'facebook',
      ui: assessment('PUBLISH_SUCCEEDED', 'CONTINUE'),
      expected: { accountIdentifier: 'page-one' },
      observed: { accountIdentifier: 'page-two', postId: 'post-2' },
    });

    expect(result.status).toBe('FAILED');
    expect(result.retryable).toBe(false);
    expect(result.reason).toContain('does not match');
  });

  it('requires a person for OTP and never reports verification', () => {
    const ui: UiStateAssessment = {
      ...assessment('OTP_REQUIRED', 'HUMAN_REQUIRED'),
      challenge: {
        type: 'OTP',
        requiresHuman: true,
        bypassAllowed: false,
        reason: 'OTP requires manual review.',
      },
    };
    const result = verifier.verify({
      platform: 'tiktok',
      ui,
      expected: {},
      observed: { postId: 'untrusted-post' },
    });

    expect(result.status).toBe('ACTION_REQUIRED');
    expect(result.verified).toBe(false);
    expect(result.retryable).toBe(false);
  });
});

function assessment(
  state: UiStateAssessment['state'],
  disposition: UiStateAssessment['disposition'],
): UiStateAssessment {
  return {
    state,
    disposition,
    matchedMarkers: [],
    assessedAt: new Date('2026-07-28T00:00:00.000Z'),
  };
}
