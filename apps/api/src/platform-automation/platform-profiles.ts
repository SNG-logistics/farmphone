import { PlatformDefinition, UiMarkerSet } from './platform-automation.types';

const commonChallengeMarkers = {
  captcha: ['captcha', 'verify you are human', 'security check'],
  otp: ['enter verification code', 'one-time password', 'authentication code'],
  login: ['log in to continue', 'sign in to continue'],
  consent: ['review and accept', 'accept terms', 'consent required'],
  rateLimited: ['try again later', 'too many attempts', 'temporarily restricted'],
} satisfies Pick<UiMarkerSet, 'captcha' | 'otp' | 'login' | 'consent' | 'rateLimited'>;

export const TIKTOK_PROFILE: PlatformDefinition = {
  platform: 'tiktok',
  displayName: 'TikTok',
  androidPackage: 'com.zhiliaoapp.musically',
  capabilities: { video: true, image: true, scheduling: false },
  markers: {
    ...commonChallengeMarkers,
    ready: ['create', 'upload', 'post'],
    uploadInProgress: ['uploading', 'posting'],
    publishSucceeded: ['your video is being uploaded', 'posted'],
    publishFailed: ['could not upload video', 'post failed'],
  },
};

export const YOUTUBE_PROFILE: PlatformDefinition = {
  platform: 'youtube',
  displayName: 'YouTube',
  androidPackage: 'com.google.android.youtube',
  capabilities: { video: true, image: false, scheduling: false },
  markers: {
    ...commonChallengeMarkers,
    ready: ['create a short', 'upload a video', 'create'],
    uploadInProgress: ['uploading video', 'processing video'],
    publishSucceeded: ['video published', 'upload complete'],
    publishFailed: ['upload failed', 'processing abandoned'],
  },
};

export const FACEBOOK_PROFILE: PlatformDefinition = {
  platform: 'facebook',
  displayName: 'Facebook',
  androidPackage: 'com.facebook.katana',
  capabilities: { video: true, image: true, scheduling: false },
  markers: {
    ...commonChallengeMarkers,
    ready: ['create post', 'photo/video', 'reel'],
    uploadInProgress: ['posting', 'uploading'],
    publishSucceeded: ['your post is now published', 'post published'],
    publishFailed: ['could not post', 'upload failed'],
  },
};

export const INSTAGRAM_PROFILE: PlatformDefinition = {
  platform: 'instagram',
  displayName: 'Instagram',
  androidPackage: 'com.instagram.android',
  capabilities: { video: true, image: true, scheduling: false },
  markers: {
    ...commonChallengeMarkers,
    ready: ['new post', 'new reel', 'create'],
    uploadInProgress: ['sharing', 'uploading'],
    publishSucceeded: ['reel shared', 'post shared'],
    publishFailed: ['not posted', 'couldn\'t share'],
  },
};

export const MOCK_PROFILE: PlatformDefinition = {
  platform: 'mock',
  displayName: 'Mock Platform',
  androidPackage: 'farm.phone.mock',
  capabilities: { video: true, image: true, scheduling: true },
  markers: {
    ...commonChallengeMarkers,
    ready: ['mock ready'],
    uploadInProgress: ['mock uploading'],
    publishSucceeded: ['mock published'],
    publishFailed: ['mock failed'],
  },
};
