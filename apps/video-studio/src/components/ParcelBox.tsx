import React from 'react';

interface Props {
  size?: number;
  scale?: number;
  rotation?: number;
  label?: string;
  hasScanLine?: boolean;
  scanProgress?: number; // 0 to 1
}

export const ParcelBox: React.FC<Props> = ({
  size = 200,
  scale = 1,
  rotation = 0,
  label = 'SNG EXPRESS',
  hasScanLine = false,
  scanProgress = 0,
}) => {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: size,
        height: size,
        transform: `scale(${scale}) rotate(${rotation}deg)`,
      }}
    >
      {/* 3D-styled Box Graphic */}
      <div className="w-full h-full bg-[#E5A93C] rounded-2xl border-4 border-[#C4841D] shadow-xl flex flex-col items-center justify-between p-4 relative overflow-hidden">
        {/* Tape */}
        <div className="w-full h-8 bg-[#D4932B] border-y-2 border-[#B3761B] absolute top-12 left-0" />
        
        {/* Brand Tag */}
        <div className="z-10 bg-black text-[#FFCC00] text-xs font-mono font-bold px-3 py-1 rounded shadow">
          {label}
        </div>

        {/* Barcode Graphic */}
        <div className="z-10 w-24 h-10 bg-white rounded p-1 flex items-center justify-between">
          {[4, 2, 6, 2, 8, 3, 5, 2, 7, 2, 4].map((w, i) => (
            <div key={i} className="bg-black h-full" style={{ width: w }} />
          ))}
        </div>

        {/* Scanner Glow Line */}
        {hasScanLine && (
          <div
            className="absolute inset-x-0 h-2 bg-[#00E676] shadow-[0_0_15px_#00E676] z-20"
            style={{ top: `${scanProgress * 100}%` }}
          />
        )}
      </div>
    </div>
  );
};
