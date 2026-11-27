import React from 'react';
import {
  ArrowRight,
  Check,
  IndianRupee,
  MapPin,
  MessageSquare,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import type {
  BargainResponse,
  PassengerProfile,
  RoutePlan,
} from '../types/rideDirector';

interface BargainModalProps {
  rideNumber: number;
  passenger: PassengerProfile;
  route: RoutePlan;
  currentFare: number;
  bargainReply: BargainResponse | null;
  bargaining: boolean;
  bargainError: string | null;
  onAccept: () => void;
  onCounter: () => void;
}

export const BargainModal: React.FC<BargainModalProps> = ({
  rideNumber,
  passenger,
  route,
  currentFare,
  bargainReply,
  bargaining,
  bargainError,
  onAccept,
  onCounter,
}) => {
  const hasCountered = bargainReply !== null;
  const counterTarget = currentFare + 20;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-labelledby="bargain-heading"
        className="pointer-events-auto w-full max-w-lg rounded-2xl border-2 border-slate-900 bg-[#FFFDF7] p-6 shadow-[6px_6px_0px_#0f172a]"
      >
        {/* Clean unboxed metadata header */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
          <span>
            Ride #{rideNumber} · {passenger.languageStyle} · {route.lengthMeters}m ·{' '}
            {route.weather}
          </span>
          <span className="font-mono-tabular text-emerald-800">
            Traffic {route.trafficDensity}/10
          </span>
        </div>

        {/* Passenger identity */}
        <h2
          id="bargain-heading"
          className="font-display mt-2 text-2xl font-extrabold text-slate-900"
        >
          {passenger.name}
        </h2>
        <p className="mt-0.5 text-sm text-slate-600">{passenger.persona}</p>

        {/* Route Pickup -> Destination */}
        <div className="mt-4 border-y border-slate-200 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
            <MapPin className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <span>{passenger.pickup}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="text-emerald-900">{passenger.destination}</span>
          </div>
          {route.landmarks.length > 0 && (
            <p className="mt-1.5 text-xs font-medium text-slate-500">
              Via {route.landmarks.slice(0, 5).join(' · ')}
            </p>
          )}
        </div>

        {/* Passenger dialogue */}
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{passenger.name} says</span>
            </div>
            <p className="mt-1.5 text-base font-semibold leading-snug text-slate-900">
              “{passenger.openingLine}”
            </p>
          </div>

          {bargaining && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-sm font-semibold text-amber-950">
              Asking {passenger.name} for ₹{counterTarget}…
            </div>
          )}

          {bargainReply && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
                <span>Counter response</span>
                <span>
                  {bargainReply.outcome === 'accepted'
                    ? 'Accepted your +₹20'
                    : bargainReply.outcome === 'halfway'
                      ? 'Met halfway'
                      : 'Held firm on fare'}
                </span>
              </div>
              <p className="mt-1.5 text-base font-semibold leading-snug text-slate-900">
                “{bargainReply.reply}”
              </p>
            </div>
          )}

          {bargainError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs font-medium text-red-800"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>{bargainError}</span>
            </div>
          )}
        </div>

        {/* Auto Meter Fare Display */}
        <div className="mt-5 flex items-center justify-between rounded-xl border-2 border-slate-900 bg-slate-900 px-4 py-3 text-white">
          <div>
            <p className="text-xs font-medium text-slate-300">
              {hasCountered ? 'Final Agreed Fare' : 'Passenger Fare Offer'}
            </p>
            <p className="text-xs text-amber-300">
              {route.turnPoints.length} junctions · listen for directions
            </p>
          </div>
          <div className="font-mono-tabular flex items-center text-3xl font-bold text-amber-400">
            <IndianRupee className="h-6 w-6" aria-hidden="true" />
            <span>{currentFare}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          {!hasCountered ? (
            <>
              <button
                type="button"
                disabled={bargaining}
                onClick={onAccept}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-[3px_3px_0px_#0f172a] transition-transform hover:-translate-y-0.5 hover:bg-emerald-500 active:translate-y-0 disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>Accept ₹{currentFare}</span>
              </button>

              <button
                type="button"
                disabled={bargaining}
                onClick={onCounter}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-[3px_3px_0px_#0f172a] transition-transform hover:-translate-y-0.5 hover:bg-amber-300 active:translate-y-0 disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                {bargaining ? (
                  <>
                    <RotateCcw className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Negotiating…</span>
                  </>
                ) : (
                  <span>Counter +20 (₹{counterTarget})</span>
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onAccept}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-amber-400 px-6 py-3.5 text-base font-bold text-slate-950 shadow-[4px_4px_0px_#0f172a] transition-transform hover:-translate-y-0.5 hover:bg-amber-300 active:translate-y-0 cursor-pointer whitespace-nowrap"
            >
              <span>Start Driving · ₹{currentFare}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
