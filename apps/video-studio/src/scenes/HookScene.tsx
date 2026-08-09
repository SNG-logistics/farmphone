import React from 'react';
import { PhoneMockup } from '../components/PhoneMockup';
import { ParcelBox } from '../components/ParcelBox';

interface Props {
  frame: number;
}

export const HookScene: React.FC<Props> = ({ frame }) => {
  // 0 - 75 frames
  const progress = Math.min(1, Math.max(0, frame / 75));
  // Camera Punch-In
  const cameraScale = 0.8 + progress * 0.4;
  const phoneScale = 0.9 + Math.sin(progress * Math.PI) * 0.1;
  const textScale = Math.min(1.2, 0.5 + progress * 0.7);

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-between py-24 px-8"
      style={{ transform: `scale(${cameraScale})` }}
    >
      {/* Top Hook Banner */}
      <div className="z-30 text-center space-y-3">
        <span className="bg-[#FFCC00] text-black font-mono text-xl font-black px-6 py-2 rounded-full shadow-xl inline-block uppercase tracking-wider">
          🔥 ด่วนที่สุด!
        </span>
        <h2
          className="font-mono text-5xl font-black text-white leading-tight drop-shadow-2xl"
          style={{ transform: `scale(${textScale})` }}
        >
          เจอของถูกใจจากไทย <br />
          <span className="text-[#FF1744] bg-white/10 px-3 py-1 rounded inline-block mt-2 border-2 border-[#FF1744]">
            แต่ร้านไม่ส่งลาว?
          </span>
        </h2>
      </div>

      {/* Center Phone Punch-In */}
      <div className="relative z-20 my-auto">
        <PhoneMockup scale={phoneScale}>
          <div className="flex flex-col h-full items-center justify-center space-y-6 text-center">
            <div className="w-20 h-20 rounded-3xl bg-[#EE4D2D] flex items-center justify-center text-4xl shadow-lg">
              🛍️
            </div>
            <div className="font-mono text-xl font-bold text-white">Shopee & Lazada ไทย</div>
            <div className="bg-red-500/20 text-red-400 font-mono text-sm px-4 py-2 rounded-xl border border-red-500/40">
              ❌ ไม่พบการจัดส่งไปยัง ประเทศลาว
            </div>
          </div>
        </PhoneMockup>

        {/* Flying Parcel Pop */}
        <div
          className="absolute -right-16 top-1/3 z-30"
          style={{
            transform: `translateY(${-Math.sin(progress * Math.PI) * 80}px) rotate(${progress * 20}deg)`,
          }}
        >
          <ParcelBox size={140} label="SNG BOX" />
        </div>
      </div>

      {/* Subtext */}
      <div className="z-30 font-mono text-2xl text-amber-300 font-bold">
        ชิ้นเล็ก ชิ้นใหญ่ ส่งด่วนถึงมือ 100%!
      </div>
    </div>
  );
};
