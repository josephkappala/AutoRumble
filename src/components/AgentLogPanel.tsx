import React from 'react';
import { X, AlertCircle, Clock, Trash2 } from 'lucide-react';
import type { AgentLogEntry } from '../types/rideDirector';

interface AgentLogPanelProps {
  open: boolean;
  entries: AgentLogEntry[];
  onClose: () => void;
  onClear: () => void;
}

export const AgentLogPanel: React.FC<AgentLogPanelProps> = ({
  open,
  entries,
  onClose,
  onClear,
}) => {
  if (!open) return null;

  return (
    <aside
      aria-label="Ride Director log"
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[390px] flex-col border-l-2 border-slate-900 bg-slate-950 text-slate-100 shadow-2xl lg:static lg:z-10 lg:w-[390px] lg:shrink-0 lg:shadow-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3.5">
        <div>
          <h2 className="font-display text-base font-bold text-white">
            Ride Director log
          </h2>
          <p className="text-xs text-slate-400">
            Live Gemini JSON calls · {entries.length}{' '}
            {entries.length === 1 ? 'event' : 'events'}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {entries.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear log entries"
              title="Clear log"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Ride Director log"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Log Stream */}
      <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-3.5">
        {entries.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-xs leading-relaxed text-slate-400">
            Every live Gemini call (`ride_start`, `bargain`, `turn`, `crash`,
            `near_miss`, `pothole`, `halfway`, `slow_driving`, `ride_end`) appears
            here with its input summary, structured JSON payload, and latency.
          </div>
        ) : (
          entries.map((entry) => {
            const isError = entry.status === 'error';
            const isPending = entry.status === 'pending';

            return (
              <div
                key={entry.id}
                className={`rounded-xl border p-3 text-xs ${
                  isError
                    ? 'border-red-500/70 bg-red-950/45 text-red-100'
                    : 'border-slate-800 bg-slate-900/90 text-slate-200'
                }`}
              >
                {/* Row 1: trigger + latency */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-mono-tabular font-bold">
                    <span
                      className={
                        isError
                          ? 'text-red-400'
                          : isPending
                            ? 'text-amber-300'
                            : 'text-emerald-400'
                      }
                    >
                      {entry.trigger}
                    </span>
                    {entry.prefetched && (
                      <span className="text-[10px] font-medium text-sky-400">
                        · prefetched
                      </span>
                    )}
                    <span className="text-[10px] font-normal text-slate-500">
                      {entry.timestamp}
                    </span>
                  </div>

                  <div className="font-mono-tabular flex items-center gap-1 text-[11px] font-semibold text-slate-300">
                    <Clock className="h-3 w-3 text-slate-400" aria-hidden="true" />
                    <span>
                      {entry.latencyMs !== null ? `${entry.latencyMs} ms` : '…'}
                    </span>
                  </div>
                </div>

                {/* Row 2: short input summary */}
                <p
                  className={`mt-1.5 text-[11px] leading-snug ${
                    isError ? 'text-red-200' : 'text-slate-400'
                  }`}
                >
                  {entry.inputSummary}
                </p>

                {/* Row 3: JSON response or red error */}
                {isError ? (
                  <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-red-500/40 bg-red-950/70 p-2 font-mono-tabular text-[11px] text-red-300">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                    <span className="break-words">{entry.error}</span>
                  </div>
                ) : isPending ? (
                  <div className="mt-2 rounded-lg bg-slate-950/80 px-2.5 py-2 font-mono-tabular text-[11px] text-amber-300">
                    Awaiting Gemini JSON response…
                  </div>
                ) : (
                  <pre className="custom-scrollbar mt-2 max-h-48 overflow-auto rounded-lg bg-slate-950 p-2.5 font-mono-tabular text-[11px] leading-relaxed text-emerald-200">
                    {JSON.stringify(entry.responseJson, null, 2)}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
