import React from 'react';
import { TrackingCard } from '../components/TrackingCard';

interface Props {
  frame: number; // 525 to 630
}

export const TrackingScene: React.FC<Props> = ({ frame }) => {
  const localFrame = frame - 525;
  const activeStepIndex = Math.min(3, Math.floor((localFrame / 105) * 4));

  const steps = [
    { status: '1. รับเข้าคลังเรียบร้อย', location: 'คลัง SNG หนองคาย / อุดรฯ', completed: true, time: '09:30 น.' },
    { status: '2. กำลังขนส่งข้ามแดน', location: 'เส้นทางขนส่ง TH ➡️ LA', completed: true, time: '13:15 น.' },
    { status: '3. ถึงปลายทางจุดรับสินค้า', location: 'ศูนย์กระจายสินค้า นครหลวงเวียงจันทน์', completed: true, time: '16:45 น.' },
    { status: '4. ส่งมอบถึงมือลูกค้าเรียบร้อย', location: 'ถึงหน้าบ้านลูกค้า ประเทศลาว', completed: true, time: '17:30 น.' },
  ];

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between py-24 px-8 z-20">
      {/* Title */}
      <div className="text-center space-y-3 z-30">
        <span className="bg-[#00E676] text-black font-mono text-xl font-black px-6 py-2 rounded-full shadow-lg">
          📱 REALTIME TRACKING
        </span>
        <h2 className="font-mono text-4xl font-black text-white leading-tight">
          ติดตามสถานะได้ตลอด 24 ชม.
        </h2>
        <p className="font-mono text-xl text-[#FFCC00] font-bold">
          มีทีมงานคอยดูแลและให้คำปรึกษาตลอดการจัดส่ง
        </p>
      </div>

      {/* Animated Tracking Card Component */}
      <div className="my-auto z-20">
        <TrackingCard steps={steps} activeStepIndex={activeStepIndex} />
      </div>

      <div className="font-mono text-xl text-gray-300">
        เช็คสถานะพัสดุง่ายๆ สบายใจทุกขั้นตอน!
      </div>
    </div>
  );
};
