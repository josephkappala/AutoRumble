import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Check,
  IndianRupee,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Radio,
  RotateCcw,
  AlertTriangle,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { LiveConnectionState } from '../services/geminiLiveClient';
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
  muted: boolean;
  liveState: LiveConnectionState;
  liveInputTranscript: string;
  liveOutputTranscript: string;
  liveError: string | null;
  onToggleLive: () => void;
  onToggleMute: () => void;
  onReplayOpening: () => void;
  onAccept: () => void;
  onCounter: () => void;
  onVoiceBargain: (audioBase64: string, mimeType: string) => void;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export const BargainModal: React.FC<BargainModalProps> = ({
  rideNumber,
  passenger,
  route,
  currentFare,
  bargainReply,
  bargaining,
  bargainError,
  muted,
  liveState,
  liveInputTranscript,
  liveOutputTranscript,
  liveError,
  onToggleLive,
  onToggleMute,
  onReplayOpening,
  onAccept,
  onCounter,
  onVoiceBargain,
}) => {
  const hasCountered = bargainReply !== null;
  const isLive = liveState === 'live';
  const isLiveConnecting = liveState === 'connecting';
  const counterTarget = currentFare + 20;
  const englishOpening =
    (passenger.openingLineEnglish || '').trim() || passenger.openingLine;

  const [recording, setRecording] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [micHint, setMicHint] = useState<string | null>(null);
  const [recordElapsedMs, setRecordElapsedMs] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartedAtRef = useRef<number>(0);
  const holdingRef = useRef<boolean>(false);
  const timerRef = useRef<number | null>(null);

  const stopTracks = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      holdingRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      stopTracks();
    };
  }, [stopTracks]);

  const stopRecording = useCallback(() => {
    holdingRef.current = false;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
    setRecording(false);
  }, []);

  // Ensure releasing pointer anywhere on the window stops recording cleanly
  useEffect(() => {
    if (!recording) return;
    const onGlobalRelease = () => stopRecording();
    window.addEventListener('pointerup', onGlobalRelease);
    window.addEventListener('pointercancel', onGlobalRelease);
    return () => {
      window.removeEventListener('pointerup', onGlobalRelease);
      window.removeEventListener('pointercancel', onGlobalRelease);
    };
  }, [recording, stopRecording]);

  const startRecording = useCallback(async () => {
    if (bargaining || recording) return;
    setMicHint(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setMicDenied(true);
      setMicHint('Microphone recording is not supported in this browser. Use Accept or Counter +20 below.');
      return;
    }

    holdingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // User already released while permission prompt was open
      if (!holdingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      setMicDenied(false);
      mediaStreamRef.current = stream;
      chunksRef.current = [];

      const mimeType = pickSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      recordStartedAtRef.current = Date.now();
      setRecordElapsedMs(0);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const elapsed = Date.now() - recordStartedAtRef.current;
        const resolvedMime = recorder.mimeType || mimeType || 'audio/webm';
        const recordedChunks = chunksRef.current;
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        stopTracks();

        if (elapsed < 250 || recordedChunks.length === 0) {
          setMicHint('Hold the mic button while speaking, then release.');
          return;
        }

        try {
          const blob = new Blob(recordedChunks, { type: resolvedMime });
          const base64 = await blobToBase64(blob);
          if (!base64) {
            setMicHint('No audio captured. Try holding a bit longer.');
            return;
          }
          onVoiceBargain(base64, resolvedMime);
        } catch {
          setMicHint('Could not process audio clip. You can still use Accept or Counter +20.');
        }
      };

      recorder.start(100);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setRecordElapsedMs(Date.now() - recordStartedAtRef.current);
      }, 100);
    } catch (err) {
      holdingRef.current = false;
      stopTracks();
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
        setMicDenied(true);
        setMicHint('Microphone permission denied — use Accept or Counter +20 below.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setMicDenied(true);
        setMicHint('No microphone found — use Accept or Counter +20 below.');
      } else {
        setMicHint('Could not start microphone — use Accept or Counter +20 below.');
      }
    }
  }, [bargaining, recording, onVoiceBargain, stopTracks]);

  const elapsedSec = (recordElapsedMs / 1000).toFixed(1);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-labelledby="bargain-heading"
        className="pointer-events-auto my-auto w-full max-w-lg rounded-2xl border-2 border-slate-900 bg-[#FFFDF7] p-5 sm:p-6 shadow-[6px_6px_0px_#0f172a]"
      >
        {/* Clean unboxed metadata header + speaker toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
          <span>
            Ride #{rideNumber} · {passenger.languageStyle} · {route.lengthMeters}m ·{' '}
            {route.weather}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono-tabular text-emerald-800">
              Traffic {route.trafficDensity}/10
            </span>
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute speaker' : 'Mute speaker'}
              title={muted ? 'Unmute speaker (M)' : 'Mute speaker (M)'}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-900 cursor-pointer ${
                muted ? 'bg-red-100 text-red-700' : 'bg-white text-slate-900 hover:bg-slate-100'
              }`}
            >
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
          </div>
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
        <div className="mt-3.5 border-y border-slate-200 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
            <MapPin className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <span>{passenger.pickup}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="text-emerald-900">{passenger.destination}</span>
          </div>
          {route.segments && route.segments.length > 0 ? (
            <p className="mt-1 text-xs font-semibold text-emerald-800">
              {route.mapsGrounded ? 'Google Maps · ' : ''}
              {route.segments.map((s) => s.roadName).join(' → ')}
            </p>
          ) : (
            route.landmarks.length > 0 && (
              <p className="mt-1 text-xs font-medium text-slate-500">
                Via {route.landmarks.slice(0, 5).join(' · ')}
              </p>
            )
          )}
          {route.todayHotspots && route.todayHotspots.length > 0 && (
            <p className="mt-1 text-xs font-semibold text-amber-800">
              Today in Bengaluru hotspot: {route.todayHotspots[0].location} ({route.todayHotspots[0].reason}) — extra traffic!
            </p>
          )}
        </div>

        {/* Passenger dialogue */}
        <div className="mt-3.5 space-y-3">
          {/* Animated English Pop-Up Speech Bubble for Rider's First Message */}
          <motion.div
            key={`${rideNumber}-${passenger.name}`}
            initial={{ opacity: 0, scale: 0.86, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            className="relative rounded-2xl border-2 border-slate-900 bg-amber-100 p-3.5 shadow-[4px_4px_0px_#0f172a]"
          >
            <span
              aria-hidden="true"
              className="absolute -bottom-2 left-7 h-3.5 w-3.5 rotate-45 border-b-2 border-r-2 border-slate-900 bg-amber-100"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-900">
              <div className="flex items-center gap-1.5 text-emerald-900">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{passenger.name} says (English)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-full border border-slate-900/20 bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  Spoken in {passenger.languageStyle}
                </span>
                <button
                  type="button"
                  onClick={onReplayOpening}
                  disabled={muted}
                  title={muted ? 'Unmute speaker to replay' : `Replay in ${passenger.languageStyle}`}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-900 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-900 hover:bg-amber-50 disabled:opacity-50 cursor-pointer"
                >
                  <Volume2 className="h-3 w-3 text-emerald-700" aria-hidden="true" />
                  <span>Replay</span>
                </button>
              </div>
            </div>
            <p className="mt-1.5 text-base font-bold leading-snug text-slate-950">
              “{englishOpening}”
            </p>
          </motion.div>

          {/* Single Gemini Live Voice Button */}
          <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-amber-50/50 px-4 py-3.5">
            <button
              type="button"
              disabled={bargaining}
              onClick={onToggleLive}
              className={`inline-flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-slate-900 px-5 py-3.5 text-sm sm:text-base font-extrabold shadow-[4px_4px_0px_#0f172a] transition-all cursor-pointer ${
                isLive
                  ? 'bg-emerald-600 text-white ring-4 ring-emerald-300/80 hover:bg-emerald-500'
                  : isLiveConnecting
                    ? 'bg-emerald-200 text-slate-900 cursor-wait'
                    : 'bg-amber-400 text-slate-950 hover:-translate-y-0.5 hover:bg-amber-300 active:translate-y-0'
              }`}
            >
              {isLive ? (
                <>
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-80" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
                  </span>
                  <Mic className="h-5 w-5" aria-hidden="true" />
                  <span>Listening… Speak to bargain (Stop)</span>
                </>
              ) : isLiveConnecting ? (
                <>
                  <RotateCcw className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Connecting…</span>
                </>
              ) : (
                <>
                  <Mic className="h-5 w-5" aria-hidden="true" />
                  <span>Hold to bargain</span>
                </>
              )}
            </button>

            {liveInputTranscript ? (
              <p className="text-center text-sm font-semibold text-slate-800">
                <span className="text-emerald-700">You (Live):</span> “{liveInputTranscript}”
              </p>
            ) : liveError ? (
              <p className="text-center text-xs font-semibold text-red-700">
                {liveError}
              </p>
            ) : (
              <p className="text-center text-xs font-medium text-slate-500">
                {isLive
                  ? `Speak freely in English or Kannada — stays live while driving!`
                  : `Click to talk live with ${passenger.name} — e.g. “Anna, ₹${counterTarget} OK?”`}
              </p>
            )}
          </div>

          {/* Live Streaming Passenger Speech Bubble (always shown when Gemini Live speaks) */}
          {liveOutputTranscript && !bargainReply && (
            <div className="relative rounded-2xl border-2 border-slate-900 bg-emerald-50 p-3.5 shadow-[3px_3px_0px_#0f172a]">
              <span
                aria-hidden="true"
                className="absolute -top-2 left-6 h-3.5 w-3.5 rotate-45 border-l-2 border-t-2 border-slate-900 bg-emerald-50"
              />
              <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                <span className="inline-flex items-center gap-1.5">
                  <Radio className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>{passenger.name} (Gemini Live)</span>
                </span>
                <span className="text-emerald-700">Live Audio</span>
              </div>
              <p className="mt-1.5 text-base font-semibold leading-snug text-slate-900">
                “{liveOutputTranscript}”
              </p>
            </div>
          )}

          {/* Passenger Reply Speech Bubble */}
          {bargainReply && (
            <div className="relative rounded-2xl border-2 border-slate-900 bg-emerald-50 p-3.5 shadow-[3px_3px_0px_#0f172a]">
              {/* Speech bubble tail */}
              <span
                aria-hidden="true"
                className="absolute -top-2 left-6 h-3.5 w-3.5 rotate-45 border-l-2 border-t-2 border-slate-900 bg-emerald-50"
              />
              <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                <span className="inline-flex items-center gap-1.5">
                  <Volume2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                  <span>{passenger.name} replies</span>
                </span>
                <span>
                  {bargainReply.outcome === 'accepted'
                    ? 'Accepted your offer'
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
        <div className="mt-4 flex items-center justify-between rounded-xl border-2 border-slate-900 bg-slate-900 px-4 py-3 text-white">
          <div>
            <p className="text-xs font-medium text-slate-300">
              {hasCountered ? 'Agreed Fare' : 'Passenger Fare Offer'}
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

        {/* Action Buttons (Accept / Counter +20 always available as fallback) */}
        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
          {!hasCountered ? (
            <>
              <button
                type="button"
                disabled={bargaining || recording}
                onClick={onAccept}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-[3px_3px_0px_#0f172a] transition-transform hover:-translate-y-0.5 hover:bg-emerald-500 active:translate-y-0 disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>Accept ₹{currentFare}</span>
              </button>

              <button
                type="button"
                disabled={bargaining || recording}
                onClick={onCounter}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-white px-5 py-3 text-sm font-bold text-slate-950 shadow-[3px_3px_0px_#0f172a] transition-transform hover:-translate-y-0.5 hover:bg-slate-100 active:translate-y-0 disabled:opacity-60 cursor-pointer whitespace-nowrap"
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
              disabled={bargaining || recording}
              onClick={onAccept}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-emerald-600 px-6 py-3.5 text-base font-bold text-white shadow-[4px_4px_0px_#0f172a] transition-transform hover:-translate-y-0.5 hover:bg-emerald-500 active:translate-y-0 disabled:opacity-60 cursor-pointer whitespace-nowrap"
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
