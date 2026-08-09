import React from 'react';

interface TrackingStep {
  status: string;
  location: string;
  completed: boolean;
  time: string;
}

interface Props {
  steps: TrackingStep[];
  activeStepIndex: number;
}

export const TrackingCard: React.FC<Props> = ({ steps, activeStepIndex }) => {
  return (
    <div className="w-[700px] bg-slate-900/95 border-2 border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <span className="font-mono text-sm text-gray-400">TRACKING NO. #SNG-889921</span>
        <span className="bg-[#00E676]/20 text-[#00E676] px-3 py-1 rounded-full text-xs font-mono font-bold">
          LIVE STATUS
        </span>
      </div>

      <div className="space-y-4">
        {steps.map((step, index) => {
          const isActive = index === activeStepIndex;
          const isDone = index <= activeStepIndex;

          return (
            <div
              key={index}
              className={`flex items-center justify-between p-3.5 rounded-2xl transition-all duration-300 ${
                isActive
                  ? 'bg-[#FFCC00]/10 border border-[#FFCC00] scale-[1.02]'
                  : isDone
                  ? 'bg-slate-800/60 opacity-90'
                  : 'opacity-40'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                    isDone ? 'bg-[#00E676] text-black' : 'bg-slate-700 text-gray-400'
                  }`}
                >
                  {isDone ? '✓' : index + 1}
                </div>
                <div>
                  <div className={`font-mono text-sm font-bold ${isActive ? 'text-[#FFCC00]' : 'text-white'}`}>
                    {step.status}
                  </div>
                  <div className="text-xs text-gray-400">{step.location}</div>
                </div>
              </div>
              <div className="font-mono text-xs text-gray-500">{step.time}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
