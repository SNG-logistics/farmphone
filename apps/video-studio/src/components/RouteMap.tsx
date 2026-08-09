import React from 'react';

interface Props {
  progress?: number; // 0 to 1
}

export const RouteMap: React.FC<Props> = ({ progress = 0 }) => {
  return (
    <div className="relative w-[800px] h-[500px] bg-slate-900/90 rounded-3xl border-2 border-slate-700 shadow-2xl overflow-hidden p-6 flex flex-col justify-between">
      {/* Map Header */}
      <div className="flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🇹🇭</span>
          <span className="font-mono text-xl font-bold text-white">ประเทศไทย</span>
        </div>
        <div className="font-mono text-amber-400 text-sm font-semibold">
          เส้นทางขนส่งด่วน TH ➡️ LA
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xl font-bold text-white">ประเทศลาว</span>
          <span className="text-3xl">🇱🇦</span>
        </div>
      </div>

      {/* Route Motion Line */}
      <div className="relative w-full h-40 flex items-center justify-center my-auto">
        <svg className="w-full h-full overflow-visible">
          {/* Path background */}
          <path
            d="M 50 80 Q 400 10 750 80"
            fill="none"
            stroke="#334155"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Glowing Animated Route Path */}
          <path
            d="M 50 80 Q 400 10 750 80"
            fill="none"
            stroke="#FFCC00"
            strokeWidth="12"
            strokeDasharray="800"
            strokeDashoffset={800 * (1 - progress)}
            strokeLinecap="round"
            className="filter drop-shadow-[0_0_12px_#FFCC00]"
          />
        </svg>

        {/* Moving Truck Icon */}
        <div
          className="absolute z-20 transition-all duration-75"
          style={{
            left: `${50 + progress * 700}px`,
            top: `${80 - Math.sin(progress * Math.PI) * 70}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="bg-[#FFCC00] text-black font-bold p-3 rounded-full shadow-2xl border-2 border-black flex items-center justify-center text-2xl">
            🚚
          </div>
        </div>
      </div>

      {/* Map Footer Pins */}
      <div className="flex justify-between items-center text-xs font-mono text-gray-400 z-10">
        <div>📍 คลังสินค้า SNG ประเทศไทย</div>
        <div className="text-amber-400 font-bold">กำลังเดินทาง...</div>
        <div>📍 จุดรับสินค้า ประเทศลาว</div>
      </div>
    </div>
  );
};
