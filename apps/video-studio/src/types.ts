export interface SceneTiming {
  startFrame: number;
  durationFrames: number;
}

export interface SubtitleWord {
  word: string;
  startFrame: number;
  endFrame: number;
}

export interface SubtitleItem {
  id: string;
  startFrame: number;
  endFrame: number;
  text: string;
  words: SubtitleWord[];
}

export interface SngExpressProps {
  title: string;
  brandName: string;
  preset: 'PREMIUM_LOGISTICS' | 'FAST_SOCIAL' | 'STORY_COMMERCIAL';
  theme: {
    primaryYellow: string;
    darkBackground: string;
    whiteText: string;
    accentGreen: string;
  };
  audioTrackUrl?: string;
  voiceoverUrl?: string;
  productCards: Array<{
    id: string;
    title: string;
    price: string;
    platform: 'Shopee' | 'Lazada' | 'OnlineStore';
    color: string;
  }>;
  trackingSteps: Array<{
    status: string;
    location: string;
    completed: boolean;
    time: string;
  }>;
  subtitles: SubtitleItem[];
}
