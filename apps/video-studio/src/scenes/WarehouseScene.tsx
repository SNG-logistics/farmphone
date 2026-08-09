import React from 'react';
import { ParcelBox } from '../components/ParcelBox';

interface Props {
  frame: number; // 270 to 390
}

export const WarehouseScene: React.FC<Props> = ({ frame }) => {
  const localFrame = frame - 270;
  const progress = Math.min(1, Math.max(0, localFrame / 120));
  const boxX = (progress * 400) - 200;
  const isScanned = progress > 0.4;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between py-24 px-8 z-20">
      {/* Step Banner */}
      <div className="text-center space-y-3 z-30">
        <span className="bg-[#FFCC00] text-black font-mono text-xl font-black px-6 py-2 rounded-full shadow-lg">
          STEP 2
        </span>
        <h2 className="font-mono text-4xl font-black text-white leading-tight">
          2. ส่งสินค้าเข้าคลัง SNG EXPRESS
        </h2>
        <p className="font-mono text-xl text-[#00E676] font-bold">
          พนักงานรับพัสดุ สแกนบาร์โค้ด และจัดเก็บทันที
        </p>
      </div>

      {/* Warehouse Motion Canvas */}
      <div className="relative w-[750px] h-[600px] bg-slate-900/90 border-2 border-slate-700 rounded-3xl p-8 flex flex-col items-center justify-between shadow-2xl overflow-hidden">
        <div className="w-full flex items-center justify-between font-mono text-sm text-gray-400 border-b border-slate-800 pb-3">
          <span>🏢 SNG WAREHOUSE THAILAND</span>
          <span className="text-[#FFCC00] font-bold">BARCODE SCANNER ACTIVE</span>
        </div>

        {/* Conveyor Belt & Box Motion */}
        <div className="relative w-full h-64 flex items-center justify-center">
          {/* Conveyor Belt */}
          <div className="w-full h-10 bg-slate-800 border-y-4 border-slate-700 absolute bottom-4 flex items-center justify-around overflow-hidden">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="w-4 h-full bg-slate-700 transform -skew-x-12"
                style={{ transform: `translateX(${-(progress * 100) % 50}px)` }}
              />
            ))}
          </div>

          {/* Moving Parcel Box with Scan Line */}
          <div
            className="absolute bottom-12 transition-all duration-75"
            style={{ transform: `translateX(${boxX}px)` }}
          >
            <ParcelBox
              size={220}
              label="SNG PARCEL"
              hasScanLine={true}
              scanProgress={(localFrame % 30) / 30}
            />
          </div>

          {/* Scan Status Badge */}
          {isScanned && (
            <div className="absolute top-4 bg-[#00E676] text-black font-mono text-base font-black px-4 py-2 rounded-xl border-2 border-black shadow-xl animate-bounce">
              ✓ CHECKED & SCANNED OK
            </div>
          )}
        </div>

        <div className="w-full bg-slate-800/80 p-4 rounded-xl text-center font-mono text-base text-gray-200 border border-slate-700">
          📦 ไม่ว่าจะกล่องเล็กหรือกล่องใหญ่ ทีมงานดูแลทุกชิ้นอย่างปลอดภัย!
        </div>
      </div>

      <div className="font-mono text-xl text-gray-300">
        สแกนรับพัสดุไว ปลอดภัย ไม่ตกค้าง
      </div>
    </div>
  );
};
