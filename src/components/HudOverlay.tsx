import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Pause,
  Terminal,
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
  logOpen: boolean;
  logCount: number;
  onToggleMute: () => void;
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
  logOpen,
  logCount,
  onToggleMute,
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

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 sm:p-4">
      {/* Top Perimeter Clusters (>= 85% viewport unobstructed) */}
      <div className="flex items-start justify-between gap-2">
        {/* Top-Left: Bengaluru Auto Meter Cluster */}
        <div className="pointer-events-auto rounded-xl border-2 border-slate-900 bg-slate-950/92 px-3.5 py-2.5 text-white shadow-[3px_3px_0px_#0f172a]">
          <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-300">
            <span>Ride #{rideNumber}</span>
            <span aria-hidden="true">·</span>
            <span className="max-w-[120px] truncate text-amber-300">
              {passengerName}
            </span>
          </div>

          <div className="mt-1.5 flex items-baseline gap-4">
            {/* Fare */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Fare
              </div>
              <div className="font-mono-tabular text-xl font-bold leading-none text-amber-400">
                ₹{hud.fare}
              </div>
            </div>

            {/* Timer */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Timer
              </div>
              <div
                className={`font-mono-tabular text-xl font-bold leading-none ${
                  timerUrgent ? 'text-red-400' : 'text-white'
                }`}
              >
                {hud.timerSeconds}s
              </div>
            </div>

            {/* Speed */}
            <div className="hidden sm:block">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Speed
              </div>
              <div className="font-mono-tabular text-lg font-bold leading-none text-emerald-400">
                {hud.speedKmh}
                <span className="ml-0.5 text-[10px] font-medium text-slate-400">
                  km/h
                </span>
              </div>
            </div>
          </div>

          {/* Passenger Mood Bar (0-100) */}
          <div className="mt-2.5">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className="text-slate-300">Mood · {moodLabel}</span>
              <span className="font-mono-tabular text-white">{hud.mood}/100</span>
            </div>
            <div className="mt-1 h-2 w-44 overflow-hidden rounded-full bg-slate-800 sm:w-48">
              <div
                className={`h-full transition-all duration-150 ${moodColor}`}
                style={{ width: `${Math.max(2, hud.mood)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Top-Center: Upcoming Junction Signboard (only shown when approaching a turn) */}
        {hud.upcomingTurn && (
          <div className="hidden max-w-xs flex-col items-center rounded-xl border-2 border-white bg-emerald-800 px-4 py-2 text-center text-white shadow-[3px_3px_0px_#0f172a] md:flex">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
              Upcoming Turn · {hud.upcomingTurn.distanceMeters}m
            </div>
            <div className="font-display text-sm font-bold leading-tight">
              {hud.upcomingTurn.landmark}
            </div>
          </div>
        )}

        {/* Top-Right: Distance & Utility Controls */}
        <div className="flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex items-center gap-1.5">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              title="Toggle audio (M)"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border-2 border-slate-900 bg-white text-slate-900 shadow-[2px_2px_0px_#0f172a] hover:bg-slate-50 cursor-pointer"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border-2 border-slate-900 bg-white text-slate-900 shadow-[2px_2px_0px_#0f172a] hover:bg-slate-50 cursor-pointer"
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
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border-2 border-slate-900 bg-white px-3 text-xs font-bold text-slate-900 shadow-[2px_2px_0px_#0f172a] hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <Terminal className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              <span className="hidden sm:inline">Ride Director log</span>
              <span className="font-mono-tabular text-emerald-800">({logCount})</span>
            </button>
          </div>

          {/* Distance to Destination Card */}
          <div className="pointer-events-auto rounded-xl border-2 border-slate-900 bg-[#FFFDF7] px-3.5 py-2 text-right shadow-[3px_3px_0px_#0f172a]">
            <div className="max-w-[155px] truncate text-[11px] font-semibold text-slate-600">
              To {destination}
            </div>
            <div className="font-mono-tabular text-xl font-extrabold leading-tight text-slate-900">
              {hud.distanceRemaining}m
            </div>
            {/* Mini route progress bar with turn dots */}
            <div className="relative mt-1.5 h-2 w-36 rounded-full bg-slate-200 sm:w-40">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-100"
                style={{ width: `${Math.round(hud.progressRatio * 100)}%` }}
              />
              {hud.turnMarkers.map((tm, idx) => (
                <span
                  key={idx}
                  style={{ left: `${Math.round(tm.ratio * 100)}%` }}
                  className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-900 ${
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

      {/* Bottom Corner On-Screen Controls (Mobile + Mouse Friendly) */}
      <div className="flex items-end justify-between pb-1">
        {/* Left & Right Steering Controls */}
        <div className="pointer-events-auto flex items-center gap-2.5">
          <button
            type="button"
            tabIndex={-1}
            onPointerDown={(e) => {
              e.preventDefault();
              onSteerLeft();
            }}
            aria-label="Steer Left"
            className="inline-flex h-14 w-16 items-center justify-center rounded-xl border-2 border-slate-900 bg-amber-400 text-slate-950 shadow-[3px_3px_0px_#0f172a] active:translate-y-0.5 active:bg-amber-300 cursor-pointer"
          >
            <ChevronLeft className="h-8 w-8 stroke-[2.5]" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onPointerDown={(e) => {
              e.preventDefault();
              onSteerRight();
            }}
            aria-label="Steer Right"
            className="inline-flex h-14 w-16 items-center justify-center rounded-xl border-2 border-slate-900 bg-amber-400 text-slate-950 shadow-[3px_3px_0px_#0f172a] active:translate-y-0.5 active:bg-amber-300 cursor-pointer"
          >
            <ChevronRight className="h-8 w-8 stroke-[2.5]" />
          </button>
        </div>

        {/* Speed Up / Brake Controls */}
        <div className="pointer-events-auto flex items-center gap-2">
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
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-slate-900 bg-white text-slate-900 shadow-[3px_3px_0px_#0f172a] active:translate-y-0.5 active:bg-slate-100 cursor-pointer"
          >
            <ChevronDown className="h-6 w-6 stroke-[2.5]" />
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
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-slate-900 bg-emerald-600 text-white shadow-[3px_3px_0px_#0f172a] active:translate-y-0.5 active:bg-emerald-500 cursor-pointer"
          >
            <ChevronUp className="h-6 w-6 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};
