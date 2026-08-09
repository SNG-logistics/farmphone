import { Injectable } from '@nestjs/common';
import {
  UiChallenge,
  UiDisposition,
  UiMarkerSet,
  UiSnapshot,
  UiState,
  UiStateAssessment,
} from './platform-automation.types';

interface DetectionRule {
  markerKey: keyof UiMarkerSet;
  state: UiState;
  disposition: UiDisposition;
  challengeType?: UiChallenge['type'];
}

const detectionRules: readonly DetectionRule[] = [
  { markerKey: 'captcha', state: 'CAPTCHA_REQUIRED', disposition: 'HUMAN_REQUIRED', challengeType: 'CAPTCHA' },
  { markerKey: 'otp', state: 'OTP_REQUIRED', disposition: 'HUMAN_REQUIRED', challengeType: 'OTP' },
  { markerKey: 'login', state: 'LOGIN_REQUIRED', disposition: 'HUMAN_REQUIRED', challengeType: 'LOGIN' },
  { markerKey: 'consent', state: 'CONSENT_REQUIRED', disposition: 'HUMAN_REQUIRED', challengeType: 'CONSENT' },
  { markerKey: 'rateLimited', state: 'RATE_LIMITED', disposition: 'WAIT', challengeType: 'RATE_LIMIT' },
  { markerKey: 'publishFailed', state: 'PUBLISH_FAILED', disposition: 'ABORT' },
  { markerKey: 'uploadInProgress', state: 'UPLOAD_IN_PROGRESS', disposition: 'WAIT' },
  { markerKey: 'publishSucceeded', state: 'PUBLISH_SUCCEEDED', disposition: 'CONTINUE' },
  { markerKey: 'ready', state: 'READY', disposition: 'CONTINUE' },
];

@Injectable()
export class UiStateDetector {
  detect(snapshot: UiSnapshot, markers: UiMarkerSet): UiStateAssessment {
    const visibleValues = [
      ...snapshot.texts,
      ...(snapshot.contentDescriptions ?? []),
      ...(snapshot.resourceIds ?? []),
    ].map((value) => this.normalize(value));

    for (const rule of detectionRules) {
      const matchedMarkers = markers[rule.markerKey].filter((marker) =>
        visibleValues.some((value) => value.includes(this.normalize(marker))),
      );

      if (matchedMarkers.length > 0) {
        return {
          state: rule.state,
          disposition: rule.disposition,
          matchedMarkers,
          challenge: rule.challengeType
            ? this.challenge(rule.challengeType, matchedMarkers)
            : undefined,
          screenshotUrl: snapshot.screenshotUrl,
          assessedAt: snapshot.capturedAt ?? new Date(),
        };
      }
    }

    return {
      state: 'UNKNOWN',
      disposition: 'HUMAN_REQUIRED',
      matchedMarkers: [],
      screenshotUrl: snapshot.screenshotUrl,
      assessedAt: snapshot.capturedAt ?? new Date(),
    };
  }

  private challenge(type: UiChallenge['type'], markers: readonly string[]): UiChallenge {
    return {
      type,
      requiresHuman: true,
      bypassAllowed: false,
      reason: `${type} requires manual review; matched UI marker: ${markers.join(', ')}`,
    };
  }

  private normalize(value: string) {
    return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  }
}
