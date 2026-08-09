import React from 'react';
import { RouteMap } from '../components/RouteMap';

interface Props {
  frame: number; // 390 to 525
}

export const RouteScene: React.FC<Props> = ({ frame }) => {
  const localFrame = frame - 390;
  const progress = Math.min(1, Math.max(0, localFrame / 135));

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between py-24 px-8 z-20">
      {/* Step Banner */}
      <div className="text-center space-y-3 z-30">
        <span className="bg-[#FFCC00] text-black font-mono text-xl font-black px-6 py-2 rounded-full shadow-lg">
          STEP 3
        </span>
        <h2 className="font-mono text-4xl font-black text-white leading-tight">
          3. ขนส่งไทย–ลาวอย่างเป็นระบบ
        </h2>
        <p className="font-mono text-xl text-[#FFCC00] font-bold">
          มีรอบรถข้ามแดนทุกวัน ถึงตรงเวลา!
        </p>
      </div>

      {/* Animated Route Map Component */}
      <div className="my-auto z-20">
        <RouteMap progress={progress} />
      </div>

      <div className="font-mono text-xl text-gray-300">
        ขนส่งด้วยระบบมาตรฐานสากล รวดเร็ว มั่นใจได้ 100%
      </div>
    </div>
  );
};
