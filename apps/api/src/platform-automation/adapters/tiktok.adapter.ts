import { PlatformAdapter, PublishPlanInput, PublishPlan, UiSnapshot, UiInspection } from './base.adapter';

export class TikTokAdapter extends PlatformAdapter {
  readonly platform = 'tiktok';
  readonly packageName = 'com.zhiliaoapp.musically';

  createPublishPlan(input: PublishPlanInput): PublishPlan {
    return {
      packageName: this.packageName,
      actions: [
        'LAUNCH_APP',
        'WAIT_FOR_HOME',
        'TAP_CREATE_BUTTON',
        'SELECT_MEDIA',
        'FILL_CAPTION',
        'TAP_POST',
        'WAIT_UPLOAD',
        'VERIFY_SUCCESS',
        'GO_HOME',
      ],
      expectedUi: [
        'com.zhiliaoapp.musically:id/home',
        'com.zhiliaoapp.musically:id/create',
        'com.zhiliaoapp.musically:id/publish',
      ],
    };
  }

  inspectUi(snapshot: UiSnapshot): UiInspection {
    const challenge = this.detectCommonChallenges(snapshot.texts);
    if (challenge) return { state: 'CHALLENGE', challenge };

    const lowerTexts = snapshot.texts.map((t) => t.toLowerCase());

    if (lowerTexts.some((t) => t.includes('post'))) return { state: 'PUBLISH_SCREEN' };
    if (lowerTexts.some((t) => t.includes('uploading') || t.includes('posting'))) return { state: 'UPLOADING' };
    if (lowerTexts.some((t) => t.includes('posted') || t.includes('video posted'))) return { state: 'SUCCESS' };
    if (lowerTexts.some((t) => t.includes('for you') || t.includes('following'))) return { state: 'HOME' };

    return { state: 'UNKNOWN' };
  }
}
