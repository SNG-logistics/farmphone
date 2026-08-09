import { PlatformAdapter, PublishPlanInput, PublishPlan, UiSnapshot, UiInspection } from './base.adapter';

export class InstagramAdapter extends PlatformAdapter {
  readonly platform = 'instagram';
  readonly packageName = 'com.instagram.android';

  createPublishPlan(input: PublishPlanInput): PublishPlan {
    return {
      packageName: this.packageName,
      actions: [
        'LAUNCH_APP',
        'WAIT_FOR_HOME',
        'TAP_CREATE_BUTTON',
        'SELECT_MEDIA',
        'APPLY_FILTER_IF_NEEDED',
        'FILL_CAPTION',
        'TAP_SHARE',
        'WAIT_UPLOAD',
        'VERIFY_SUCCESS',
        'GO_HOME',
      ],
      expectedUi: [
        'com.instagram.android:id/tab_bar',
        'com.instagram.android:id/creation_menu',
        'com.instagram.android:id/share_button',
      ],
    };
  }

  inspectUi(snapshot: UiSnapshot): UiInspection {
    const challenge = this.detectCommonChallenges(snapshot.texts);
    if (challenge) return { state: 'CHALLENGE', challenge };

    const lowerTexts = snapshot.texts.map((t) => t.toLowerCase());

    if (lowerTexts.some((t) => t.includes('share') || t.includes('new post'))) return { state: 'PUBLISH_SCREEN' };
    if (lowerTexts.some((t) => t.includes('uploading') || t.includes('sharing'))) return { state: 'UPLOADING' };
    if (lowerTexts.some((t) => t.includes('shared') || t.includes('posted'))) return { state: 'SUCCESS' };
    if (lowerTexts.some((t) => t.includes('home') || t.includes('feed'))) return { state: 'HOME' };

    return { state: 'UNKNOWN' };
  }
}
