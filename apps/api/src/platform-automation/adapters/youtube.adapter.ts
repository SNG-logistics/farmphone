import { PlatformAdapter, PublishPlanInput, PublishPlan, UiSnapshot, UiInspection } from './base.adapter';

export class YouTubeAdapter extends PlatformAdapter {
  readonly platform = 'youtube';
  readonly packageName = 'com.google.android.youtube';

  createPublishPlan(input: PublishPlanInput): PublishPlan {
    return {
      packageName: this.packageName,
      actions: [
        'LAUNCH_APP',
        'WAIT_FOR_HOME',
        'TAP_CREATE_BUTTON',
        'SELECT_VIDEO',
        'FILL_TITLE',
        'FILL_DESCRIPTION',
        'SELECT_VISIBILITY',
        'WAIT_UPLOAD',
        'VERIFY_SUCCESS',
        'GO_HOME',
      ],
      expectedUi: [
        'com.google.android.youtube:id/create_button',
        'com.google.android.youtube:id/upload_progress',
        'com.google.android.youtube:id/upload_success',
      ],
    };
  }

  inspectUi(snapshot: UiSnapshot): UiInspection {
    const challenge = this.detectCommonChallenges(snapshot.texts);
    if (challenge) return { state: 'CHALLENGE', challenge };

    const lowerTexts = snapshot.texts.map((t) => t.toLowerCase());

    if (lowerTexts.some((t) => t.includes('upload') || t.includes('create'))) return { state: 'PUBLISH_SCREEN' };
    if (lowerTexts.some((t) => t.includes('uploading') || t.includes('processing'))) return { state: 'UPLOADING' };
    if (lowerTexts.some((t) => t.includes('published') || t.includes('upload complete'))) return { state: 'SUCCESS' };
    if (lowerTexts.some((t) => t.includes('home') || t.includes('subscriptions'))) return { state: 'HOME' };

    return { state: 'UNKNOWN' };
  }
}
