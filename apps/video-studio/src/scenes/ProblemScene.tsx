import React from 'react';
import { ParcelBox } from '../components/ParcelBox';

interface Props {
  frame: number; // 75 to 150
}

export const ProblemScene: React.FC<Props> = ({ frame }) => {
  const localFrame = frame - 75;
  const progress = Math.min(1, Math.max(0, localFrame / 75));
  const swipeX = (1 - progress) * 1080;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between py-28 px-8 z-20">
      {/* Title */}
      <div className="text-center space-y-4 z-30">
        <span className="bg-[#00E676] text-black font-mono text-lg font-black px-6 py-1.5 rounded-full shadow-lg">
          ✅ มีทางออกแล้ว!
        </span>
        <h2 className="font-mono text-5xl font-black text-[#FFCC00] leading-tight">
          ปัญหานี้ SNG EXPRESS <br />
          <span className="text-white">ช่วยคุณได้ทันที!</span>
        </h2>
      </div>

      {/* Center Animated Problem Graphic & Resolution */}
      <div className="relative w-[700px] h-[550px] bg-slate-900/90 border-2 border-slate-700 rounded-3xl p-8 flex flex-col items-center justify-center space-y-8 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-center gap-12">
          <div className="flex flex-col items-center space-y-3">
            <div className="w-24 h-24 rounded-2xl bg-[#EE4D2D] flex items-center justify-center text-4xl shadow-xl">
              🛒
            </div>
            <span className="font-mono text-sm text-gray-300">สั่งของในไทย</span>
          </div>

          <div className="text-4xl text-amber-400 font-bold animate-pulse">➡️</div>

          <div className="flex flex-col items-center space-y-3">
            <div className="w-28 h-28 rounded-2xl bg-[#FFCC00] text-black flex items-center justify-center text-5xl font-black shadow-2xl border-4 border-black">
              SNG
            </div>
            <span className="font-mono text-sm text-[#FFCC00] font-bold">คลัง SNG ไทย</span>
          </div>

          <div className="text-4xl text-amber-400 font-bold animate-pulse">➡️</div>

          <div className="flex flex-col items-center space-y-3">
            <div className="w-24 h-24 rounded-2xl bg-emerald-600 flex items-center justify-center text-4xl shadow-xl">
              🏠
            </div>
            <span className="font-mono text-sm text-gray-300">ถึงบ้านที่ลาว</span>
          </div>
        </div>

        <div className="w-full bg-slate-800/80 p-4 rounded-xl text-center font-mono text-lg text-emerald-400 border border-emerald-500/30">
          ⚡ พนักงานลุยส่งด่วน ไม่ว่าชิ้นเล็กหรือชิ้นใหญ่ ถึงมือ 100%!
        </div>
      </div>

      {/* Swipe Transition Parcel Box */}
      <div
        className="absolute top-1/2 left-0 z-40"
        style={{ transform: `translate(${swipeX}px, -50%)` }}
      >
        <ParcelBox size={260} label="SNG EXPRESS" />
      </div>

      <div className="font-mono text-xl text-gray-300">
        สะดวก รวดเร็ว ตรวจสอบสถานะได้ตลอด 24 ชั่วโมง
      </div>
    </div>
  );
};
