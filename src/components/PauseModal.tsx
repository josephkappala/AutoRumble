import React from 'react';
import { Play, RotateCcw, Home } from 'lucide-react';

interface PauseModalProps {
  rideNumber: number;
  onResume: () => void;
  onRestartRide: () => void;
  onReturnTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  rideNumber,
  onResume,
  onRestartRide,
  onReturnTitle,
}) => {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/55 p-4">
      <div
        role="dialog"
        aria-labelledby="pause-heading"
        className="pointer-events-auto w-full max-w-sm rounded-2xl border-2 border-slate-900 bg-[#FFFDF7] p-6 text-center shadow-[6px_6px_0px_#0f172a]"
      >
        <p className="text-xs font-semibold text-slate-500">Ride #{rideNumber}</p>
        <h2
          id="pause-heading"
          className="font-display mt-1 text-3xl font-extrabold text-slate-900"
        >
          Auto Parked
        </h2>
        <p className="mt-1.5 text-sm text-slate-600">
          Press P or Escape anytime to get back into Bengaluru traffic.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-[3px_3px_0px_#0f172a] hover:bg-amber-300 cursor-pointer whitespace-nowrap"
          >
            <Play className="h-4 w-4 fill-slate-950" aria-hidden="true" />
            <span>Resume Ride</span>
          </button>

          <button
            type="button"
            onClick={onRestartRide}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-white px-5 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Restart This Ride</span>
          </button>

          <button
            type="button"
            onClick={onReturnTitle}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-transparent px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            <span>Main Menu</span>
          </button>
        </div>
      </div>
    </div>
  );
};
