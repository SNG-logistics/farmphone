import React from 'react';

interface Props {
  frame: number;
  variant?: 'dark' | 'yellow' | 'gradient';
}

export const MotionBackground: React.FC<Props> = ({ frame, variant = 'dark' }) => {
  const offsetY = (frame * 3) % 1920;
  const pulseScale = 1 + Math.sin(frame / 15) * 0.05;

  if (variant === 'yellow') {
    return (
      <div className="absolute inset-0 bg-[#FFCC00] overflow-hidden flex items-center justify-center">
        <div
          className="absolute w-[1600px] h-[1600px] rounded-full border-[40px] border-black/10"
          style={{ transform: `scale(${pulseScale})` }}
        />
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'radial-gradient(#000 2px, transparent 2px)',
            backgroundSize: '40px 40px',
            transform: `translateY(${offsetY}px)`,
          }}
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-[#111111] overflow-hidden flex items-center justify-center">
      {/* Animated Glowing Light Sweeps */}
      <div
        className="absolute w-[800px] h-[800px] rounded-full bg-amber-500/10 blur-[120px]"
        style={{
          transform: `translate(${Math.sin(frame / 20) * 100}px, ${Math.cos(frame / 20) * 100}px)`,
        }}
      />
      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px)',
          backgroundSize: '80px 80px',
          transform: `translateY(${offsetY * 0.5}px)`,
        }}
      />
      {/* Floating Particles */}
      {[...Array(12)].map((_, i) => {
        const speed = (i + 1) * 1.5;
        const pY = (1920 - ((frame * speed + i * 150) % 1920));
        const pX = (i * 90) % 1080;
        return (
          <div
            key={i}
            className="absolute rounded-full bg-[#FFCC00]/40 blur-[1px]"
            style={{
              width: 8 + (i % 3) * 6,
              height: 8 + (i % 3) * 6,
              left: pX,
              top: pY,
            }}
          />
        );
      })}
    </div>
  );
};
