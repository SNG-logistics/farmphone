/**
 * Farm Phone AI Office — Platform Automation Base Adapter Interface
 *
 * Each social media platform has different UI flows, package names,
 * and challenge patterns (CAPTCHA, OTP, login screens, etc.).
 * Adapters encapsulate platform-specific automation logic.
 */

export interface PublishPlanInput {
  jobId: string;
  accountIdentifier: string;
  remoteMediaPath: string;
  caption?: string;
  visibility?: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
}

export interface PublishPlan {
  packageName: string;
  actions: string[];
  expectedUi: string[];
}

export interface UiSnapshot {
  texts: string[];
  contentDescriptions: string[];
  resourceIds: string[];
  capturedAt: Date;
}

export interface UiInspection {
  state: string;
  challenge?: {
    type: 'CAPTCHA' | 'OTP' | 'LOGIN' | 'PERMISSION' | 'COOLDOWN' | 'ERROR_POPUP' | 'OTHER';
    reason: string;
    suggestedAction: string;
  };
}

export abstract class PlatformAdapter {
  abstract readonly platform: string;
  abstract readonly packageName: string;

  abstract createPublishPlan(input: PublishPlanInput): PublishPlan;
  abstract inspectUi(snapshot: UiSnapshot): UiInspection;

  /** Shared challenge detection across platforms */
  protected detectCommonChallenges(texts: string[]): UiInspection['challenge'] | undefined {
    const lowerTexts = texts.map((t) => t.toLowerCase());

    if (lowerTexts.some((t) => t.includes('captcha') || t.includes('verify you are human'))) {
      return { type: 'CAPTCHA', reason: 'CAPTCHA detected — manual verification required', suggestedAction: 'Solve CAPTCHA manually on device screen' };
    }
    if (lowerTexts.some((t) => t.includes('enter code') || t.includes('verification code') || t.includes('otp'))) {
      return { type: 'OTP', reason: 'OTP screen detected — enter verification code', suggestedAction: 'Check SMS/email for OTP and enter manually' };
    }
    if (lowerTexts.some((t) => t.includes('log in') || t.includes('sign in') || t.includes('password'))) {
      return { type: 'LOGIN', reason: 'Login screen detected — re-authentication required', suggestedAction: 'Log in manually on device to restore session' };
    }
    if (lowerTexts.some((t) => t.includes('permission') || t.includes('allow') || t.includes('deny'))) {
      return { type: 'PERMISSION', reason: 'Permission dialog detected — app needs approval', suggestedAction: 'Grant required permissions on device' };
    }
    if (lowerTexts.some((t) => t.includes('too many') || t.includes('try again later') || t.includes('rate limit'))) {
      return { type: 'COOLDOWN', reason: 'Rate limit / cooldown detected — wait before retry', suggestedAction: 'Wait 15-30 minutes before retrying' };
    }
    if (lowerTexts.some((t) => t.includes('error') || t.includes('something went wrong') || t.includes('try again'))) {
      return { type: 'ERROR_POPUP', reason: 'Error dialog detected', suggestedAction: 'Dismiss error and retry operation' };
    }

    return undefined;
  }
}
