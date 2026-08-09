import { PlatformAdapter, PublishPlanInput, PublishPlan, UiSnapshot, UiInspection } from './base.adapter';

export class FacebookAdapter extends PlatformAdapter {
  readonly platform = 'facebook';
  readonly packageName = 'com.facebook.katana';

  createPublishPlan(input: PublishPlanInput): PublishPlan {
    return {
      packageName: this.packageName,
      actions: [
        'LAUNCH_APP',
        'WAIT_FOR_HOME',
        'TAP_CREATE_POST',
        'SELECT_MEDIA',
        'FILL_CAPTION',
        'TAP_POST',
        'WAIT_UPLOAD',
        'VERIFY_SUCCESS',
        'GO_HOME',
      ],
      expectedUi: [
        'com.facebook.katana:id/create_button',
        'com.facebook.katana:id/post_button',
        'com.facebook.katana:id/news_feed',
      ],
    };
  }

  inspectUi(snapshot: UiSnapshot): UiInspection {
    const challenge = this.detectCommonChallenges(snapshot.texts);
    if (challenge) return { state: 'CHALLENGE', challenge };

    const lowerTexts = snapshot.texts.map((t) => t.toLowerCase());

    if (lowerTexts.some((t) => t.includes('post') || t.includes('create post'))) return { state: 'PUBLISH_SCREEN' };
    if (lowerTexts.some((t) => t.includes('posting') || t.includes('uploading'))) return { state: 'UPLOADING' };
    if (lowerTexts.some((t) => t.includes('shared') || t.includes('posted'))) return { state: 'SUCCESS' };
    if (lowerTexts.some((t) => t.includes('news feed') || t.includes('home'))) return { state: 'HOME' };

    return { state: 'UNKNOWN' };
  }
}
