import React from 'react';

interface Props {
  scale?: number;
  opacity?: number;
}

export const LogoReveal: React.FC<Props> = ({ scale = 1, opacity = 1 }) => {
  return (
    <div
      className="flex flex-col items-center justify-center space-y-4"
      style={{ transform: `scale(${scale})`, opacity }}
    >
      <div className="w-36 h-36 bg-[#FFCC00] rounded-3xl border-4 border-black shadow-2xl flex items-center justify-center relative overflow-hidden">
        <span className="font-mono text-5xl font-black text-black tracking-tighter">
          SNG
        </span>
        <div className="absolute top-0 right-0 w-8 h-8 bg-black transform rotate-45 translate-x-4 -translate-y-4" />
      </div>
      <div className="text-center">
        <h1 className="font-mono text-4xl font-black text-[#FFCC00] tracking-wider">
          SNG EXPRESS
        </h1>
        <p className="font-mono text-lg text-gray-300 tracking-wide mt-1">
          ขนส่งไทย–ลาว ส่งด่วนถึงมือ 100%
        </p>
      </div>
    </div>
  );
};
