import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Flame,
  Heart,
  Pause,
  Sparkles,
  Terminal,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { HudTelemetry } from '../game/engine';

interface HudOverlayProps {
  rideNumber: number;
  passengerName: string;
  destination: string;
  hud: HudTelemetry;
  muted: boolean;
  vfxEnabled: boolean;
  logOpen: boolean;
  logCount: number;
  onToggleMute: () => void;
  onToggleVfx: () => void;
  onPause: () => void;
  onToggleLog: () => void;
  onSteerLeft: () => void;
  onSteerRight: () => void;
  onBoostStart: () => void;
  onBoostEnd: () => void;
  onBrakeStart: () => void;
  onBrakeEnd: () => void;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  rideNumber,
  passengerName,
  destination,
  hud,
  muted,
  vfxEnabled,
  logOpen,
  logCount,
  onToggleMute,
  onToggleVfx,
  onPause,
  onToggleLog,
  onSteerLeft,
  onSteerRight,
  onBoostStart,
  onBoostEnd,
  onBrakeStart,
  onBrakeEnd,
}) => {
  const timerUrgent = hud.timerSeconds <= 12;
  const moodColor =
    hud.mood >= 65
      ? 'bg-emerald-500'
      : hud.mood >= 35
        ? 'bg-amber-400'
        : 'bg-red-500';

  const moodLabel =
    hud.mood >= 65 ? 'Happy' : hud.mood >= 35 ? 'Tense' : 'Furious';

  const chaosBarColor =
    hud.chaos >= 80
      ? 'bg-red-500 animate-pulse'
      : hud.chaos >= 50
        ? 'bg-amber-400'
        : 'bg-emerald-400';

  const wheelDeg = Math.max(-34, Math.min(34, hud.steeringLean * 32));

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-2.5 sm:p-4">
      {/* Top Perimeter Clusters */}
      <div className="flex items-start justify-between gap-2">
        {/* Top-Left: Score, Combo, High Score & Auto Meter */}
        <div className="pointer-events-auto rounded-xl border-2 border-slate-900 bg-slate-950/92 px-3 py-2 text-white shadow-[3px_3px_0px_#0f172a]">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-300">
            <span>Ride #{rideNumber}</span>
            <span aria-hidden="true">·</span>
            <span className="max-w-[110px] truncate text-amber-300">
              {passengerName}
            </span>
          </div>

          {/* Score / Combo / High Score */}
          <div className="mt-1.5 flex items-baseline gap-3 border-b border-slate-800 pb-1.5">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Score
              </div>
              <div className="font-mono-tabular text-lg font-extrabold leading-none text-emerald-400">
                {hud.score}
              </div>
            </div>

            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Combo
              </div>
              <div
                className={`font-mono-tabular text-lg font-extrabold leading-none ${
                  hud.combo >= 3
                    ? 'text-amber-300'
                    : hud.combo >= 2
                      ? 'text-sky-300'
                      : 'text-slate-200'
                }`}
              >
                x{hud.combo}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                <Trophy className="h-2.5 w-2.5 text-amber-400" aria-hidden="true" />
                <span>High</span>
              </div>
              <div className="font-mono-tabular text-base font-bold leading-none text-amber-300">
                {hud.highScore}
              </div>
            </div>
          </div>

          {/* Fare, Timer & Mood */}
          <div className="mt-1.5 flex items-baseline gap-3.5">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                Fare
              </div>
              <div className="font-mono-tabular text-base font-bold leading-none text-amber-400">
                ₹{hud.fare}
              </div>
            </div>

            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                Timer
              </div>
              <div
                className={`font-mono-tabular text-base font-bold leading-none ${
                  timerUrgent ? 'text-red-400' : 'text-white'
                }`}
              >
                {hud.timerSeconds}s
              </div>
            </div>

            <div className="flex-1 min-w-[78px]">
              <div className="flex items-center justify-between text-[9px] font-semibold text-slate-300">
                <span>{moodLabel}</span>
                <span className="font-mono-tabular">{hud.mood}</span>
              </div>
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full transition-all duration-150 ${moodColor}`}
                  style={{ width: `${Math.max(2, hud.mood)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Top-Center: Green Bengaluru Road-Sign Banner & Upcoming Junction */}
        <div className="flex max-w-xs flex-col items-center gap-1.5">
          {hud.currentRoadName && (
            <div
              aria-label={`Current road: ${hud.currentRoadName}`}
              className="flex items-center gap-2 rounded-lg border-2 border-white bg-emerald-800 px-3.5 py-1 text-center text-white shadow-[3px_3px_0px_#0f172a]"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-300" aria-hidden="true" />
              <span className="font-display max-w-[200px] truncate text-xs font-extrabold tracking-wide uppercase sm:text-sm">
                {hud.currentRoadName}
              </span>
            </div>
          )}

          {hud.activeHotspot && (
            <div className="rounded-md border border-amber-300 bg-amber-950/90 px-2.5 py-0.5 text-center text-[10px] font-bold text-amber-200 shadow">
              Today in Bengaluru · Heavy Traffic
            </div>
          )}

          {hud.upcomingTurn && (
            <div className="hidden flex-col items-center rounded-xl border-2 border-white bg-emerald-900 px-4 py-1.5 text-center text-white shadow-[3px_3px_0px_#0f172a] md:flex">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                Upcoming Turn · {hud.upcomingTurn.distanceMeters}m
              </div>
              <div className="font-display text-sm font-bold leading-tight">
                {hud.upcomingTurn.landmark}
              </div>
            </div>
          )}
        </div>

        {/* Top-Right: Utility Controls (VFX E, Voice M, Pause P, Log) & Distance */}
        <div className="flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex items-center gap-1.5">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleVfx();
              }}
              aria-pressed={vfxEnabled}
              aria-label={vfxEnabled ? 'Disable visual effects' : 'Enable visual effects'}
              title={vfxEnabled ? 'Visual effects ON (E)' : 'Visual effects OFF (E)'}
              className={`inline-flex h-9 items-center justify-center gap-1 rounded-lg border-2 border-slate-900 px-2 text-xs font-bold shadow-[2px_2px_0px_#0f172a] cursor-pointer ${
                vfxEnabled
                  ? 'bg-amber-100 text-slate-900 hover:bg-amber-200'
                  : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden md:inline">{vfxEnabled ? 'FX' : 'FX Off'}</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              aria-pressed={muted}
              aria-label={muted ? 'Unmute speaker and passenger voice' : 'Mute speaker and passenger voice'}
              title={muted ? 'Unmute speaker & voice (M)' : 'Mute speaker & voice (M)'}
              className={`inline-flex h-9 items-center justify-center gap-1 rounded-lg border-2 border-slate-900 px-2 text-xs font-bold shadow-[2px_2px_0px_#0f172a] cursor-pointer ${
                muted
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-white text-slate-900 hover:bg-slate-50'
              }`}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-emerald-700" />}
              <span className="hidden md:inline">{muted ? 'Muted' : 'Voice'}</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              aria-label="Pause game"
              title="Pause (P)"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-slate-900 bg-white text-slate-900 shadow-[2px_2px_0px_#0f172a] hover:bg-slate-50 cursor-pointer"
            >
              <Pause className="h-4 w-4" />
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-expanded={logOpen}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleLog();
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-slate-900 bg-white px-2.5 text-xs font-bold text-slate-900 shadow-[2px_2px_0px_#0f172a] hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <Terminal className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              <span className="hidden sm:inline">Log</span>
              <span className="font-mono-tabular text-emerald-800">({logCount})</span>
            </button>
          </div>

          {/* Distance to Destination Card */}
          <div className="pointer-events-auto rounded-xl border-2 border-slate-900 bg-[#FFFDF7] px-3 py-1.5 text-right shadow-[3px_3px_0px_#0f172a]">
            <div className="max-w-[145px] truncate text-[10px] font-semibold text-slate-600">
              To {destination}
            </div>
            <div className="font-mono-tabular text-lg font-extrabold leading-tight text-slate-900">
              {hud.distanceRemaining}m
            </div>
            <div className="relative mt-1 h-1.5 w-32 rounded-full bg-slate-200 sm:w-36">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-100"
                style={{ width: `${Math.round(hud.progressRatio * 100)}%` }}
              />
              {hud.turnMarkers.map((tm, idx) => (
                <span
                  key={idx}
                  style={{ left: `${Math.round(tm.ratio * 100)}%` }}
                  className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-900 ${
                    tm.status === 'correct'
                      ? 'bg-emerald-400'
                      : tm.status === 'wrong'
                        ? 'bg-red-500'
                        : 'bg-amber-400'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile compact upcoming turn banner */}
      {hud.upcomingTurn && (
        <div className="mx-auto mt-1 flex items-center gap-2 rounded-lg border-2 border-white bg-emerald-800 px-3 py-1 text-xs font-bold text-white shadow md:hidden">
          <span>{hud.upcomingTurn.landmark}</span>
          <span className="font-mono-tabular text-amber-300">
            {hud.upcomingTurn.distanceMeters}m
          </span>
        </div>
      )}

      {/* Bottom Auto-Rickshaw Cockpit Dashboard HUD */}
      <div className="mx-auto flex w-full max-w-2xl items-end justify-center pb-0.5">
        <div className="pointer-events-auto flex w-full items-center justify-between gap-2 rounded-2xl border-2 border-slate-900 bg-slate-950/95 px-3 py-2 text-white shadow-[0_6px_0_#0f172a] sm:gap-4 sm:px-4">
          {/* Left: Steer Buttons + Animated Steering Wheel */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={(e) => {
                e.preventDefault();
                onSteerLeft();
              }}
              aria-label="Steer Left"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border-2 border-slate-900 bg-amber-400 text-slate-950 shadow-[2px_2px_0px_#0f172a] active:translate-y-0.5 active:bg-amber-300 cursor-pointer"
            >
              <ChevronLeft className="h-6 w-6 stroke-[2.5]" />
            </button>

            {/* Cockpit Steering Wheel SVG */}
            <div
              aria-hidden="true"
              className="hidden h-12 w-12 shrink-0 items-center justify-center sm:flex"
            >
              <svg
                viewBox="0 0 64 64"
                className="h-12 w-12 transition-transform duration-75"
                style={{ transform: `rotate(${wheelDeg}deg)` }}
              >
                <circle cx="32" cy="32" r="26" fill="none" stroke="#334155" strokeWidth="7" />
                <circle cx="32" cy="32" r="26" fill="none" stroke="#FACC15" strokeWidth="2" strokeDasharray="10 154" strokeDashoffset="36" />
                <line x1="10" y1="32" x2="54" y2="32" stroke="#475569" strokeWidth="5" strokeLinecap="round" />
                <line x1="32" y1="32" x2="32" y2="54" stroke="#475569" strokeWidth="5" strokeLinecap="round" />
                <circle cx="32" cy="32" r="8" fill="#059669" stroke="#FACC15" strokeWidth="2" />
              </svg>
            </div>

            <button
              type="button"
              tabIndex={-1}
              onPointerDown={(e) => {
                e.preventDefault();
                onSteerRight();
              }}
              aria-label="Steer Right"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border-2 border-slate-900 bg-amber-400 text-slate-950 shadow-[2px_2px_0px_#0f172a] active:translate-y-0.5 active:bg-amber-300 cursor-pointer"
            >
              <ChevronRight className="h-6 w-6 stroke-[2.5]" />
            </button>
          </div>

          {/* Center Gauges: SPEED, LIVES, CHAOS, TRAFFIC */}
          <div className="grid flex-1 grid-cols-2 items-center gap-x-3 gap-y-1.5 sm:grid-cols-4">
            {/* SPEED */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Speed
              </div>
              <div className="font-mono-tabular text-base font-extrabold leading-none text-emerald-400">
                {hud.speedKmh}
                <span className="ml-0.5 text-[9px] font-semibold text-slate-400">km/h</span>
              </div>
            </div>

            {/* LIVES (5 Hearts) */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Lives
              </div>
              <div
                className="mt-0.5 flex items-center gap-0.5"
                aria-label={`${hud.lives} of ${hud.maxLives} hearts remaining`}
              >
                {Array.from({ length: hud.maxLives }).map((_, idx) => (
                  <Heart
                    key={idx}
                    className={`h-3.5 w-3.5 ${
                      idx < hud.lives
                        ? 'fill-red-500 text-red-500'
                        : 'text-slate-700'
                    }`}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>

            {/* CHAOS METER (0-100%) */}
            <div>
              <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider">
                <span className="inline-flex items-center gap-0.5 text-slate-400">
                  <Flame className="h-2.5 w-2.5 text-amber-400" aria-hidden="true" />
                  Chaos
                </span>
                <span
                  className={`font-mono-tabular ${
                    hud.chaos >= 80
                      ? 'text-red-400'
                      : hud.chaos >= 50
                        ? 'text-amber-300'
                        : 'text-emerald-300'
                  }`}
                >
                  {hud.chaos}%
                </span>
              </div>
              <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full transition-all duration-150 ${chaosBarColor}`}
                  style={{ width: `${Math.max(2, hud.chaos)}%` }}
                />
              </div>
            </div>

            {/* TRAFFIC LEVEL */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Traffic
              </div>
              <div className="font-mono-tabular text-sm font-extrabold leading-none text-amber-300">
                {hud.trafficDensity}/10
              </div>
            </div>
          </div>

          {/* Right: Brake / Boost Pedals */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={(e) => {
                e.preventDefault();
                onBrakeStart();
              }}
              onPointerUp={onBrakeEnd}
              onPointerLeave={onBrakeEnd}
              onPointerCancel={onBrakeEnd}
              aria-label="Brake slower"
              className="inline-flex h-10 w-9 items-center justify-center rounded-lg border-2 border-slate-900 bg-white text-slate-900 shadow-[2px_2px_0px_#0f172a] active:translate-y-0.5 cursor-pointer"
            >
              <ChevronDown className="h-5 w-5 stroke-[2.5]" />
            </button>

            <button
              type="button"
              tabIndex={-1}
              onPointerDown={(e) => {
                e.preventDefault();
                onBoostStart();
              }}
              onPointerUp={onBoostEnd}
              onPointerLeave={onBoostEnd}
              onPointerCancel={onBoostEnd}
              aria-label="Accelerate faster"
              className="inline-flex h-10 w-9 items-center justify-center rounded-lg border-2 border-slate-900 bg-emerald-600 text-white shadow-[2px_2px_0px_#0f172a] active:translate-y-0.5 cursor-pointer"
            >
              <ChevronUp className="h-5 w-5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
