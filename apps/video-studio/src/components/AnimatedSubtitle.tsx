import React from 'react';
import { SubtitleItem } from '../types';

interface Props {
  currentFrame: number;
  subtitles: SubtitleItem[];
}

export const AnimatedSubtitle: React.FC<Props> = ({ currentFrame, subtitles }) => {
  const activeSub = subtitles.find(
    (s) => currentFrame >= s.startFrame && currentFrame <= s.endFrame
  );

  if (!activeSub) return null;

  return (
    <div className="absolute bottom-28 left-0 right-0 px-8 flex justify-center z-40 pointer-events-none">
      <div className="bg-black/90 border-2 border-[#FFCC00]/50 rounded-2xl px-6 py-4 shadow-2xl backdrop-blur max-w-[900px] text-center">
        <div className="flex flex-wrap justify-center gap-2 font-mono text-2xl font-bold leading-relaxed">
          {activeSub.words.map((w, idx) => {
            const isWordActive = currentFrame >= w.startFrame && currentFrame <= w.endFrame;
            return (
              <span
                key={idx}
                className={`transition-all duration-150 rounded px-1.5 py-0.5 ${
                  isWordActive
                    ? 'bg-[#FFCC00] text-black scale-110 shadow-lg font-black'
                    : 'text-white opacity-90'
                }`}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
