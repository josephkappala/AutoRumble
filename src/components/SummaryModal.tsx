import React from 'react';
import {
  ArrowRight,
  RotateCcw,
  Star,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import type {
  DifficultyConfig,
  PassengerProfile,
  RideEndResponse,
} from '../types/rideDirector';
import type { RideCompletionPayload } from '../game/engine';

interface SummaryModalProps {
  rideNumber: number;
  passenger: PassengerProfile;
  stats: RideCompletionPayload;
  summary: RideEndResponse | null;
  loadingSummary: boolean;
  summaryError: string | null;
  loadingNextRide: boolean;
  nextDifficulty: DifficultyConfig;
  totalEarnings: number;
  onNextRide: () => void;
  onRetrySummary: () => void;
}

export const SummaryModal: React.FC<SummaryModalProps> = ({
  rideNumber,
  passenger,
  stats,
  summary,
  loadingSummary,
  summaryError,
  loadingNextRide,
  nextDifficulty,
  totalEarnings,
  onNextRide,
  onRetrySummary,
}) => {
  const rating = summary ? Math.max(1, Math.min(5, Math.round(summary.rating))) : 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-labelledby="summary-heading"
        className="pointer-events-auto max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border-2 border-slate-900 bg-[#FFFDF7] p-6 shadow-[6px_6px_0px_#0f172a] custom-scrollbar"
      >
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>
            Ride #{rideNumber} · {stats.completed ? 'Drop-off Reached' : 'Time Expired'}
          </span>
          <span className="font-mono-tabular text-emerald-800">
            Session Total ₹{totalEarnings}
          </span>
        </div>

        <h2
          id="summary-heading"
          className="font-display mt-1.5 text-2xl font-extrabold text-slate-900"
        >
          {stats.completed
            ? `Dropped ${passenger.name} at ${passenger.destination}`
            : `${passenger.name} hopped out early!`}
        </h2>

        {/* Star Rating + Passenger Voice Story from Gemini */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          {loadingSummary ? (
            <div className="flex items-center gap-2.5 py-2 text-sm font-semibold text-slate-600">
              <RotateCcw className="h-4 w-4 animate-spin text-emerald-700" />
              <span>{passenger.name} is leaving a ride review…</span>
            </div>
          ) : summaryError ? (
            <div className="space-y-2.5">
              <div className="flex items-start gap-2 text-xs font-medium text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{summaryError}</span>
              </div>
              <button
                type="button"
                onClick={onRetrySummary}
                className="rounded-lg border border-slate-900 bg-amber-300 px-3 py-1.5 text-xs font-bold text-slate-950 cursor-pointer"
              >
                Retry Review Call
              </button>
            </div>
          ) : summary ? (
            <>
              <div
                className="flex items-center gap-1"
                aria-label={`${rating} out of 5 stars`}
              >
                {[1, 2, 3, 4, 5].map((starIdx) => (
                  <Star
                    key={starIdx}
                    className={`h-5 w-5 ${
                      starIdx <= rating
                        ? 'fill-amber-400 text-amber-500'
                        : 'text-slate-300'
                    }`}
                  />
                ))}
                <span className="font-mono-tabular ml-2 text-sm font-bold text-slate-800">
                  {rating}.0 / 5
                </span>
              </div>
              <p className="mt-2.5 text-sm font-medium leading-relaxed text-slate-800">
                “{summary.story}”
              </p>
              <p className="mt-1.5 text-xs font-semibold text-slate-500">
                — {passenger.name} ({passenger.languageStyle})
              </p>
            </>
          ) : null}
        </div>

        {/* Ride Metrics Grid */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[11px] font-semibold text-slate-500">Fare Earned</div>
            <div className="font-mono-tabular mt-0.5 text-lg font-bold text-emerald-700">
              ₹{stats.fare}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[11px] font-semibold text-slate-500">Mood</div>
            <div className="font-mono-tabular mt-0.5 text-lg font-bold text-slate-900">
              {stats.finalMood}/100
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[11px] font-semibold text-slate-500">Crashes</div>
            <div className="font-mono-tabular mt-0.5 text-lg font-bold text-slate-900">
              {stats.crashes}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[11px] font-semibold text-slate-500">Turns</div>
            <div className="font-mono-tabular mt-0.5 text-lg font-bold text-slate-900">
              {stats.correctTurns}/{stats.correctTurns + stats.wrongTurns}
            </div>
          </div>
        </div>

        {/* Next Ride Adaptive Difficulty & Fare Level */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-white">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Next Ride Forecast</span>
            </span>
            <span className="font-mono-tabular">
              Fare Level {nextDifficulty.fareMultiplier.toFixed(2)}x
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
            <span>Traffic {nextDifficulty.trafficDensity}/10</span>
            <span aria-hidden="true">·</span>
            <span>Timer {nextDifficulty.timerSeconds}s</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-200">{nextDifficulty.obstacleMix}</span>
          </div>
        </div>

        {/* Next Ride CTA */}
        <button
          type="button"
          data-start="true"
          disabled={loadingSummary || loadingNextRide}
          onClick={onNextRide}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-amber-400 px-6 py-3.5 text-base font-bold text-slate-950 shadow-[4px_4px_0px_#0f172a] transition-transform hover:-translate-y-0.5 hover:bg-amber-300 active:translate-y-0 disabled:cursor-wait disabled:opacity-65 cursor-pointer whitespace-nowrap"
        >
          {loadingNextRide ? (
            <>
              <RotateCcw className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Dispatching Ride #{rideNumber + 1}…</span>
            </>
          ) : (
            <>
              <span>Start Ride #{rideNumber + 1}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
