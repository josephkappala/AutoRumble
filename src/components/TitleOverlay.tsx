import React from 'react';
import { Play, Terminal, AlertTriangle, RotateCcw, KeyRound } from 'lucide-react';

interface TitleOverlayProps {
  loading: boolean;
  error: string | null;
  logCount: number;
  logOpen: boolean;
  hasApiKey: boolean | null;
  canConfigureApiKey: boolean;
  onStartRide: () => void;
  onToggleLog: () => void;
  onOpenApiKeyModal: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  loading,
  error,
  logCount,
  logOpen,
  hasApiKey,
  canConfigureApiKey,
  onStartRide,
  onToggleLog,
  onOpenApiKeyModal,
}) => {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-6">
      {/* Top utility actions: Gemini API key (dev only) & Ride Director log */}
      <div className={`flex items-start gap-3 ${canConfigureApiKey ? 'justify-between' : 'justify-end'}`}>
        {canConfigureApiKey && (
          <button
            type="button"
            onClick={onOpenApiKeyModal}
            className={`pointer-events-auto inline-flex items-center gap-2 rounded-lg border-2 border-slate-900 px-3.5 py-2 text-xs font-semibold shadow-[3px_3px_0px_#0f172a] transition-transform hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap shrink-0 cursor-pointer ${
              hasApiKey === false
                ? 'bg-amber-300 text-slate-950'
                : 'bg-white text-slate-900'
            }`}
          >
            <KeyRound
              className={`h-4 w-4 ${hasApiKey === false ? 'text-slate-950' : 'text-emerald-700'}`}
              aria-hidden="true"
            />
            <span>{hasApiKey ? 'Gemini Key ✓' : 'Set Gemini Key'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleLog}
          aria-expanded={logOpen}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-lg border-2 border-slate-900 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 shadow-[3px_3px_0px_#0f172a] transition-transform hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Terminal className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          <span>Ride Director log</span>
          {logCount > 0 && (
            <span className="font-mono-tabular text-emerald-800">({logCount})</span>
          )}
        </button>
      </div>

      {/* Upper-Center Hero Lockup leaving lower road & cruising auto clearly framed */}
      <div className="mx-auto -mt-12 flex w-full max-w-md flex-col items-center text-center sm:-mt-16">
        <div className="pointer-events-auto w-full rounded-2xl border-2 border-slate-900 bg-[#FFFDF7] px-6 py-7 shadow-[6px_6px_0px_#0f172a] sm:px-8 sm:py-8">
          {/* Bespoke inline SVG Auto-Rickshaw Crest & Title Lockup */}
          <div className="mx-auto mb-4 flex justify-center">
            <svg
              viewBox="0 0 120 76"
              className="h-16 w-28"
              role="img"
              aria-label="Bengaluru yellow and green auto-rickshaw emblem"
            >
              {/* Road shadow */}
              <ellipse cx="60" cy="67" rx="44" ry="6" fill="#CBD5E1" />
              {/* Rear wheel */}
              <circle cx="34" cy="58" r="10" fill="#0F172A" />
              <circle cx="34" cy="58" r="4.5" fill="#F8FAFC" />
              {/* Front wheel */}
              <circle cx="92" cy="58" r="10" fill="#0F172A" />
              <circle cx="92" cy="58" r="4.5" fill="#F8FAFC" />
              {/* Emerald green auto lower chassis */}
              <path
                d="M18 40 L94 40 Q104 40 105 52 L105 58 L20 58 Q16 58 16 52 Z"
                fill="#059669"
                stroke="#0F172A"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              {/* Yellow roof canopy */}
              <path
                d="M22 40 L26 16 Q28 10 38 10 L76 10 Q85 10 89 22 L95 40 Z"
                fill="#FACC15"
                stroke="#0F172A"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              {/* Passenger cabin cutout */}
              <rect
                x="33"
                y="18"
                width="26"
                height="21"
                rx="4"
                fill="#1E293B"
              />
              {/* Driver windshield */}
              <path
                d="M65 18 L81 18 L86 38 L65 38 Z"
                fill="#BAE6FD"
                stroke="#0F172A"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              {/* Yellow waist stripe */}
              <rect x="20" y="45" width="76" height="4.5" fill="#FACC15" />
              {/* Headlight */}
              <circle
                cx="104"
                cy="47"
                r="4.5"
                fill="#FEF08A"
                stroke="#0F172A"
                strokeWidth="2"
              />
            </svg>
          </div>

          <h1 className="font-display text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl [text-wrap:balance]">
            Rickshaw Rumble
          </h1>

          <p className="mt-2.5 text-sm font-medium text-slate-600">
            Bengaluru 3-lane traffic · Live Gemini Ride Director
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 p-3 text-left text-xs font-medium text-red-800"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div className="flex-1">
                <p className="font-semibold text-red-900">Ride Director error</p>
                <p className="mt-0.5 break-words">{error}</p>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col items-center gap-3">
            <button
              type="button"
              data-start="true"
              disabled={loading}
              onClick={onStartRide}
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-slate-900 bg-amber-400 px-6 py-3.5 text-base font-bold text-slate-950 shadow-[4px_4px_0px_#0f172a] transition-transform hover:-translate-y-0.5 hover:bg-amber-300 active:translate-y-0 disabled:cursor-wait disabled:opacity-75 cursor-pointer whitespace-nowrap"
            >
              {loading ? (
                <>
                  <RotateCcw className="h-5 w-5 animate-spin" aria-hidden="true" />
                  <span>Finding Bengaluru passenger…</span>
                </>
              ) : (
                <>
                  <Play className="h-5 w-5 fill-slate-950" aria-hidden="true" />
                  <span>{error ? 'Retry Start Ride' : 'Start Ride'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Flat borderless bottom safe-margin control hint */}
      <div className="flex justify-center pb-1">
        <p className="rounded-md bg-slate-950/80 px-3.5 py-1.5 text-xs font-medium tracking-wide text-slate-100">
          ← → Steer (or Tap Left/Right) · ↑ ↓ Speed · H Horn · P Pause · M Mute · E Effects
        </p>
      </div>
    </div>
  );
};
