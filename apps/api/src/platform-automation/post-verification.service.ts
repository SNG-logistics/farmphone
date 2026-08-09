import { Injectable } from '@nestjs/common';
import {
  PostVerificationInput,
  PostVerificationResult,
  VerificationSignal,
} from './platform-automation.types';

@Injectable()
export class PostVerificationService {
  verify(input: PostVerificationInput): PostVerificationResult {
    const signals = this.signals(input);
    const base = {
      platform: input.platform,
      postId: input.observed.postId,
      permalink: input.observed.permalink,
      signals,
      evidence: input.evidence ?? [],
    };

    if (input.ui.challenge || input.ui.disposition === 'HUMAN_REQUIRED') {
      return {
        ...base,
        status: 'ACTION_REQUIRED',
        verified: false,
        retryable: false,
        reason: input.ui.challenge?.reason ?? 'The UI state requires manual review.',
      };
    }

    if (input.ui.state === 'PUBLISH_FAILED') {
      return {
        ...base,
        status: 'FAILED',
        verified: false,
        retryable: true,
        reason: 'The platform UI reported that publishing failed.',
      };
    }

    if (input.ui.state === 'UPLOAD_IN_PROGRESS' || input.ui.state === 'RATE_LIMITED') {
      return {
        ...base,
        status: 'PENDING',
        verified: false,
        retryable: true,
        reason: 'Publishing has not reached a terminal state.',
      };
    }

    const mismatchedRequired = signals.filter((signal) => signal.required && !signal.matched);
    const explicitMismatch = mismatchedRequired.find((signal) =>
      ['ACCOUNT', 'CONTENT', 'CAPTION'].includes(signal.name) && signal.detail.includes('does not match'),
    );

    if (explicitMismatch) {
      return {
        ...base,
        status: 'FAILED',
        verified: false,
        retryable: false,
        reason: explicitMismatch.detail,
      };
    }

    if (mismatchedRequired.length > 0) {
      return {
        ...base,
        status: 'INCONCLUSIVE',
        verified: false,
        retryable: true,
        reason: `Missing required verification signals: ${mismatchedRequired.map((signal) => signal.name).join(', ')}`,
      };
    }

    return {
      ...base,
      status: 'VERIFIED',
      verified: true,
      retryable: false,
      reason: 'The platform state and post identity signals match the expected post.',
      verifiedAt: new Date(),
    };
  }

  private signals(input: PostVerificationInput): VerificationSignal[] {
    const hasPostId = Boolean(input.observed.postId?.trim());
    const hasPermalink = Boolean(input.observed.permalink?.trim());

    return [
      {
        name: 'UI_SUCCESS',
        matched: input.ui.state === 'PUBLISH_SUCCEEDED',
        required: true,
        detail: input.ui.state === 'PUBLISH_SUCCEEDED'
          ? 'The platform UI reported publishing success.'
          : `The current UI state is ${input.ui.state}.`,
      },
      {
        name: 'POST_ID',
        matched: hasPostId,
        required: !hasPermalink,
        detail: hasPostId ? `Observed post ID ${input.observed.postId}.` : 'No post ID was observed.',
      },
      {
        name: 'PERMALINK',
        matched: hasPermalink,
        required: !hasPostId,
        detail: hasPermalink ? 'A platform permalink was observed.' : 'No permalink was observed.',
      },
      this.expectedSignal('ACCOUNT', input.expected.accountIdentifier, input.observed.accountIdentifier),
      this.expectedSignal('CONTENT', input.expected.contentFingerprint, input.observed.contentFingerprint),
      this.expectedSignal('CAPTION', input.expected.caption, input.observed.caption),
    ];
  }

  private expectedSignal(
    name: 'ACCOUNT' | 'CONTENT' | 'CAPTION',
    expected: string | undefined,
    observed: string | undefined,
  ): VerificationSignal {
    if (!expected) {
      return { name, matched: true, required: false, detail: `No expected ${name.toLowerCase()} was provided.` };
    }

    if (!observed) {
      return { name, matched: false, required: true, detail: `The expected ${name.toLowerCase()} was not observed.` };
    }

    const matched = this.normalize(expected) === this.normalize(observed);
    return {
      name,
      matched,
      required: true,
      detail: matched
        ? `The observed ${name.toLowerCase()} matches.`
        : `The observed ${name.toLowerCase()} does not match the expected value.`,
    };
  }

  private normalize(value: string) {
    return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  }
}
