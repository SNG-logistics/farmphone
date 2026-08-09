import { TIKTOK_PROFILE } from './platform-profiles';
import { UiStateDetector } from './ui-state-detector.service';

describe('UiStateDetector', () => {
  const detector = new UiStateDetector();

  it('stops for CAPTCHA even when a ready marker is also visible', () => {
    const result = detector.detect(
      { texts: ['Create', 'Verify you are human'] },
      TIKTOK_PROFILE.markers,
    );

    expect(result.state).toBe('CAPTCHA_REQUIRED');
    expect(result.disposition).toBe('HUMAN_REQUIRED');
    expect(result.challenge).toEqual(expect.objectContaining({
      type: 'CAPTCHA',
      requiresHuman: true,
      bypassAllowed: false,
    }));
  });

  it.each([
    ['Enter verification code', 'OTP_REQUIRED', 'OTP'],
    ['Log in to continue', 'LOGIN_REQUIRED', 'LOGIN'],
    ['Accept terms', 'CONSENT_REQUIRED', 'CONSENT'],
  ])('classifies %s as a manual challenge', (text, state, challengeType) => {
    const result = detector.detect({ texts: [text] }, TIKTOK_PROFILE.markers);

    expect(result.state).toBe(state);
    expect(result.challenge?.type).toBe(challengeType);
    expect(result.challenge?.bypassAllowed).toBe(false);
  });

  it('requires review when the UI is unknown', () => {
    const result = detector.detect({ texts: ['Unrecognized screen'] }, TIKTOK_PROFILE.markers);

    expect(result).toEqual(expect.objectContaining({
      state: 'UNKNOWN',
      disposition: 'HUMAN_REQUIRED',
    }));
  });
});
