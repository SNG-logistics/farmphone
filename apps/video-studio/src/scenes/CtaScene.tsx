import React from 'react';
import { LogoReveal } from '../components/LogoReveal';
import { ParcelBox } from '../components/ParcelBox';

interface Props {
  frame: number; // 630 to 750
}

export const CtaScene: React.FC<Props> = ({ frame }) => {
  const localFrame = frame - 630;
  const progress = Math.min(1, Math.max(0, localFrame / 120));
  const logoScale = 0.8 + Math.min(0.2, progress * 0.3);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between py-24 px-8 z-20">
      {/* Customer Handover Animation & Logo */}
      <div className="my-auto text-center space-y-8 z-30 flex flex-col items-center">
        {/* Floating Box Delivered */}
        <div className="relative">
          <ParcelBox size={220} label="SNG EXPRESS" scale={1 + Math.sin(progress * 4) * 0.05} />
          <div className="absolute -top-4 -right-4 bg-[#00E676] text-black font-mono text-xs font-black px-3 py-1 rounded-full shadow-lg border border-black animate-bounce">
            ✓ DELIVERED 100%
          </div>
        </div>

        {/* Logo Reveal */}
        <LogoReveal scale={logoScale} />

        {/* Main CTA Headlines */}
        <div className="space-y-3 pt-4">
          <h2 className="font-mono text-4xl font-black text-white leading-tight">
            ช้อปจากไทย ส่งถึงลาวง่ายขึ้น!
          </h2>
          <p className="font-mono text-2xl text-[#FFCC00] font-bold">
            ชิ้นเล็ก ชิ้นใหญ่ ส่งด่วนถึงมือแน่นอน 100%
          </p>
        </div>

        {/* CTA Button */}
        <div className="pt-4">
          <button className="bg-[#FFCC00] hover:bg-amber-400 text-black font-mono text-2xl font-black px-10 py-5 rounded-3xl border-4 border-black shadow-[0_10px_30px_rgba(255,204,0,0.4)] transform hover:scale-105 transition-all">
            👉 สอบถาม SNG EXPRESS 👈
          </button>
        </div>
      </div>

      <div className="font-mono text-lg text-gray-400 z-30">
        ทักสอบถามค่าขนส่งและเช็ครอบรถด่วนได้เลยตอนนี้!
      </div>
    </div>
  );
};
