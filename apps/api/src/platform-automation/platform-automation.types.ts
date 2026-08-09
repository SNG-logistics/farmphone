export const PRODUCTION_PLATFORMS = ['tiktok', 'youtube', 'facebook', 'instagram'] as const;

export type ProductionPlatform = (typeof PRODUCTION_PLATFORMS)[number];
export type AutomationPlatform = ProductionPlatform | 'mock';

export function normalizeAutomationPlatform(platform: string) {
  const value = String(platform || '').trim().toLocaleLowerCase().replace(/[\s_-]+/g, '');
  const aliases: Readonly<Record<string, ProductionPlatform>> = {
    fb: 'facebook',
    ig: 'instagram',
    yt: 'youtube',
    youtubeshorts: 'youtube',
  };
  return aliases[value] ?? value;
}

export function isProductionAutomationPlatform(platform: string): platform is ProductionPlatform {
  return (PRODUCTION_PLATFORMS as readonly string[]).includes(platform);
}

export function isMockAutomationEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return environment.NODE_ENV !== 'production' && environment.AUTOMATION_MOCK_MODE === 'true';
}

export type UiState =
  | 'READY'
  | 'LOGIN_REQUIRED'
  | 'CAPTCHA_REQUIRED'
  | 'OTP_REQUIRED'
  | 'CONSENT_REQUIRED'
  | 'RATE_LIMITED'
  | 'UPLOAD_IN_PROGRESS'
  | 'PUBLISH_SUCCEEDED'
  | 'PUBLISH_FAILED'
  | 'UNKNOWN';

export type UiDisposition = 'CONTINUE' | 'WAIT' | 'HUMAN_REQUIRED' | 'ABORT';

export interface UiSnapshot {
  texts: readonly string[];
  contentDescriptions?: readonly string[];
  resourceIds?: readonly string[];
  screenshotUrl?: string;
  capturedAt?: Date;
}

export interface UiChallenge {
  type: 'CAPTCHA' | 'OTP' | 'LOGIN' | 'CONSENT' | 'RATE_LIMIT';
  requiresHuman: true;
  bypassAllowed: false;
  reason: string;
}

export interface UiStateAssessment {
  state: UiState;
  disposition: UiDisposition;
  matchedMarkers: readonly string[];
  challenge?: UiChallenge;
  screenshotUrl?: string;
  assessedAt: Date;
}

export interface UiMarkerSet {
  ready: readonly string[];
  login: readonly string[];
  captcha: readonly string[];
  otp: readonly string[];
  consent: readonly string[];
  rateLimited: readonly string[];
  uploadInProgress: readonly string[];
  publishSucceeded: readonly string[];
  publishFailed: readonly string[];
}

export interface PlatformDefinition {
  platform: AutomationPlatform;
  displayName: string;
  androidPackage: string;
  markers: UiMarkerSet;
  capabilities: {
    video: boolean;
    image: boolean;
    scheduling: boolean;
  };
}

export interface PublishRequest {
  jobId: string;
  accountIdentifier: string;
  remoteMediaPath: string;
  caption?: string;
  contentFingerprint?: string;
  visibility?: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
}

export type AutomationActionKind =
  | 'LAUNCH_APP'
  | 'ASSERT_UI_SAFE'
  | 'SELECT_MEDIA'
  | 'ENTER_CAPTION'
  | 'CONFIGURE_VISIBILITY'
  | 'CONFIRM_ACCOUNT'
  | 'HUMAN_APPROVAL_CHECKPOINT'
  | 'SUBMIT_POST'
  | 'VERIFY_POST';

export interface AutomationAction {
  id: string;
  kind: AutomationActionKind;
  description: string;
  requiresHumanApproval: boolean;
  abortOnChallenge: boolean;
  payload?: Readonly<Record<string, string>>;
}

export interface PublishPlan {
  platform: AutomationPlatform;
  jobId: string;
  packageName: string;
  safety: {
    requiresHumanApprovalBeforePublish: true;
    abortOnChallenge: true;
    challengeBypassSupported: false;
  };
  actions: readonly AutomationAction[];
}

export type VerificationStatus =
  | 'VERIFIED'
  | 'PENDING'
  | 'FAILED'
  | 'INCONCLUSIVE'
  | 'ACTION_REQUIRED';

export interface PostEvidence {
  type: 'SCREENSHOT' | 'UI_SNAPSHOT' | 'PERMALINK' | 'PLATFORM_RESPONSE';
  url?: string;
  capturedAt: Date;
  description: string;
}

export interface PostVerificationInput {
  platform: AutomationPlatform;
  ui: UiStateAssessment;
  expected: {
    accountIdentifier?: string;
    contentFingerprint?: string;
    caption?: string;
  };
  observed: {
    accountIdentifier?: string;
    contentFingerprint?: string;
    caption?: string;
    postId?: string;
    permalink?: string;
  };
  evidence?: readonly PostEvidence[];
}

export interface VerificationSignal {
  name: 'UI_SUCCESS' | 'POST_ID' | 'PERMALINK' | 'ACCOUNT' | 'CONTENT' | 'CAPTION';
  matched: boolean;
  required: boolean;
  detail: string;
}

export interface PostVerificationResult {
  platform: AutomationPlatform;
  status: VerificationStatus;
  verified: boolean;
  retryable: boolean;
  postId?: string;
  permalink?: string;
  reason: string;
  signals: readonly VerificationSignal[];
  evidence: readonly PostEvidence[];
  verifiedAt?: Date;
}
