import React from 'react';
import { PhoneMockup } from '../components/PhoneMockup';

interface Props {
  frame: number; // 150 to 270
}

export const ShoppingScene: React.FC<Props> = ({ frame }) => {
  const localFrame = frame - 150;
  const progress = Math.min(1, Math.max(0, localFrame / 120));
  const cardOffsetY = (1 - progress) * 300;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between py-24 px-8 z-20">
      {/* Step Banner */}
      <div className="text-center space-y-3 z-30">
        <span className="bg-[#FFCC00] text-black font-mono text-xl font-black px-6 py-2 rounded-full shadow-lg">
          STEP 1
        </span>
        <h2 className="font-mono text-4xl font-black text-white leading-tight">
          1. สั่งสินค้าจากร้านค้าออนไลน์ในไทย
        </h2>
        <p className="font-mono text-xl text-[#FFCC00] font-bold">
          Shopee • Lazada • ร้านค้าออนไลน์
        </p>
      </div>

      {/* Phone Mockup with Interactive Product Cards */}
      <div className="relative my-auto">
        <PhoneMockup scale={0.95}>
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-800">
              <span className="font-mono text-xs text-gray-400">ค้นหา: สินค้าออนไลน์ในไทย</span>
              <span className="text-sm">🔍</span>
            </div>

            {/* Parallax Floating Cards */}
            <div
              className="space-y-3"
              style={{ transform: `translateY(${cardOffsetY}px)` }}
            >
              <div className="bg-[#EE4D2D]/10 border border-[#EE4D2D] p-3 rounded-2xl flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-[#EE4D2D] flex items-center justify-center text-2xl">
                  👗
                </div>
                <div>
                  <div className="font-mono text-xs font-bold text-white">เสื้อผ้าแฟชั่นชิ้นเล็ก</div>
                  <div className="font-mono text-xs text-[#EE4D2D]">Shopee Thailand • 290 ฿</div>
                </div>
              </div>

              <div className="bg-blue-900/20 border border-blue-600 p-3 rounded-2xl flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-blue-600 flex items-center justify-center text-2xl">
                  📺
                </div>
                <div>
                  <div className="font-mono text-xs font-bold text-white">เครื่องใช้ไฟฟ้ากล่องใหญ่</div>
                  <div className="font-mono text-xs text-blue-400">Lazada Thailand • 4,500 ฿</div>
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500 p-3 rounded-2xl flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-amber-500 text-black flex items-center justify-center text-2xl font-black">
                  SNG
                </div>
                <div>
                  <div className="font-mono text-xs font-bold text-[#FFCC00]">ที่อยู่จัดส่ง: คลัง SNG EXPRESS</div>
                  <div className="font-mono text-[10px] text-gray-400">จังหวัดหนองคาย / อุดรธานี</div>
                </div>
              </div>
            </div>
          </div>
        </PhoneMockup>
      </div>

      <div className="font-mono text-xl text-gray-300">
        ใส่ที่อยู่คลัง SNG EXPRESS ประเทศไทย แล้วกดสั่งได้เลย!
      </div>
    </div>
  );
};
