import React from 'react';
import { useCurrentFrame } from 'remotion';
import { MotionBackground } from '../components/MotionBackground';
import { AnimatedSubtitle } from '../components/AnimatedSubtitle';
import { HookScene } from '../scenes/HookScene';
import { ProblemScene } from '../scenes/ProblemScene';
import { ShoppingScene } from '../scenes/ShoppingScene';
import { WarehouseScene } from '../scenes/WarehouseScene';
import { RouteScene } from '../scenes/RouteScene';
import { TrackingScene } from '../scenes/TrackingScene';
import { CtaScene } from '../scenes/CtaScene';
import { SubtitleItem } from '../types';

export interface CompositionProps {
  subtitles?: SubtitleItem[];
}

export const SngExpressEcommerce: React.FC<CompositionProps> = ({ subtitles = [] }) => {
  const frame = useCurrentFrame();

  // 7 Scene frame boundaries (Total: 750 frames = 25s at 30fps)
  // Scene 1: 0 - 75 (0 - 2.5s)
  // Scene 2: 75 - 150 (2.5 - 5s)
  // Scene 3: 150 - 270 (5 - 9s)
  // Scene 4: 270 - 390 (9 - 13s)
  // Scene 5: 390 - 525 (13 - 17.5s)
  // Scene 6: 525 - 630 (17.5 - 21s)
  // Scene 7: 630 - 750 (21 - 25s)

  let CurrentSceneComponent = HookScene;
  if (frame >= 75 && frame < 150) {
    CurrentSceneComponent = ProblemScene;
  } else if (frame >= 150 && frame < 270) {
    CurrentSceneComponent = ShoppingScene;
  } else if (frame >= 270 && frame < 390) {
    CurrentSceneComponent = WarehouseScene;
  } else if (frame >= 390 && frame < 525) {
    CurrentSceneComponent = RouteScene;
  } else if (frame >= 525 && frame < 630) {
    CurrentSceneComponent = TrackingScene;
  } else if (frame >= 630) {
    CurrentSceneComponent = CtaScene;
  }

  const bgVariant = frame >= 630 ? 'yellow' : 'dark';

  return (
    <div className="relative w-[1080px] h-[1920px] overflow-hidden font-sans text-white select-none">
      {/* Background Layer */}
      <MotionBackground frame={frame} variant={bgVariant} />

      {/* Main Scene Layer */}
      <CurrentSceneComponent frame={frame} />

      {/* Kinetic Subtitles Layer */}
      <AnimatedSubtitle currentFrame={frame} subtitles={subtitles} />
    </div>
  );
};
