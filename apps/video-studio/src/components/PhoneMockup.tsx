import React from 'react';

interface Props {
  scale?: number;
  rotation?: number;
  offsetY?: number;
  children?: React.ReactNode;
}

export const PhoneMockup: React.FC<Props> = ({
  scale = 1,
  rotation = 0,
  offsetY = 0,
  children,
}) => {
  return (
    <div
      className="relative w-[540px] h-[1000px] rounded-[60px] border-[14px] border-[#2A2A32] bg-slate-950 shadow-2xl overflow-hidden flex flex-col items-center"
      style={{
        transform: `scale(${scale}) rotate(${rotation}deg) translateY(${offsetY}px)`,
        boxShadow: '0 25px 60px -15px rgba(255, 204, 0, 0.25), 0 0 40px rgba(0,0,0,0.8)',
      }}
    >
      {/* Dynamic Island / Notch */}
      <div className="w-40 h-6 bg-[#2A2A32] rounded-b-2xl z-20 flex items-center justify-center">
        <div className="w-4 h-4 rounded-full bg-slate-900 border border-slate-700" />
      </div>

      {/* Screen Content */}
      <div className="relative w-full flex-1 bg-[#121218] p-4 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
};
