import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from 'lucide-react';
import { AgentLogPanel } from './components/AgentLogPanel';
import { BargainModal } from './components/BargainModal';
import { HudOverlay } from './components/HudOverlay';
import { PauseModal } from './components/PauseModal';
import { SummaryModal } from './components/SummaryModal';
import { TitleOverlay } from './components/TitleOverlay';
import { rickshawAudio } from './game/audio';
import {
  RickshawGameEngine,
  type HudTelemetry,
  type RideCompletionPayload,
} from './game/engine';
import { INITIAL_DIFFICULTY, normalizeDifficulty } from './game/rules';
import { rideDirectorClient } from './services/rideDirectorClient';
import type {
  AgentLogEntry,
  BargainResponse,
  DifficultyConfig,
  GamePhase,
  PreviousRideStats,
  RideEndResponse,
  RideStartResponse,
} from './types/rideDirector';

const DEFAULT_HUD: HudTelemetry = {
  fare: 120,
  timerSeconds: 55,
  mood: 82,
  distanceRemaining: 900,
  progressRatio: 0,
  speedKmh: 72,
  crashes: 0,
  nearMisses: 0,
  upcomingTurn: null,
  turnMarkers: [],
  weather: 'sunny',
  currentLane: 1,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<RickshawGameEngine | null>(null);

  const [phase, setPhase] = useState<GamePhase>('title');
  const [rideNumber, setRideNumber] = useState(1);
  const [difficulty, setDifficulty] = useState<DifficultyConfig>(INITIAL_DIFFICULTY);
  const [previousStats, setPreviousStats] = useState<PreviousRideStats | null>(null);
  const [totalEarnings, setTotalEarnings] = useState(0);

  // Active ride payload from Gemini
  const [activeRide, setActiveRide] = useState<RideStartResponse | null>(null);
  const [agreedFare, setAgreedFare] = useState(120);
  const [startError, setStartError] = useState<string | null>(null);

  // Bargaining state
  const [bargaining, setBargaining] = useState(false);
  const [bargainReply, setBargainReply] = useState<BargainResponse | null>(null);
  const [bargainError, setBargainError] = useState<string | null>(null);

  // HUD telemetry (updated ~15Hz by engine)
  const [hud, setHud] = useState<HudTelemetry>(DEFAULT_HUD);
  const [muted, setMuted] = useState(false);

  // End-of-ride summary state
  const [rideStats, setRideStats] = useState<RideCompletionPayload | null>(null);
  const [rideSummary, setRideSummary] = useState<RideEndResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [loadingNextRide, setLoadingNextRide] = useState(false);

  // Collapsible Ride Director Log
  const [logOpen, setLogOpen] = useState(false);
  const [logEntries, setLogEntries] = useState<AgentLogEntry[]>([]);

  // Refs for latest values inside stable engine callbacks
  const rideNumberRef = useRef(rideNumber);
  rideNumberRef.current = rideNumber;
  const activeRideRef = useRef(activeRide);
  activeRideRef.current = activeRide;
  const difficultyRef = useRef(difficulty);
  difficultyRef.current = difficulty;

  // Mirror state to document.body.dataset.state
  useEffect(() => {
    const bodyState =
      phase === 'summary'
        ? 'gameover'
        : phase === 'loading_ride' || phase === 'bargaining'
          ? 'playing'
          : phase;
    document.body.dataset.state = bodyState;
  }, [phase]);

  // Subscribe to Ride Director client logs
  useEffect(() => {
    return rideDirectorClient.subscribe((entry) => {
      setLogEntries((prev) => {
        const idx = prev.findIndex((item) => item.id === entry.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = entry;
          return next;
        }
        return [entry, ...prev].slice(0, 80);
      });
    });
  }, []);

  const requestRideSummary = useCallback(
    async (
      completedRideNum: number,
      rideData: RideStartResponse,
      stats: RideCompletionPayload,
      currentDiff: DifficultyConfig
    ) => {
      setLoadingSummary(true);
      setSummaryError(null);
      try {
        const summary = await rideDirectorClient.finishRide({
          rideNumber: completedRideNum,
          passenger: rideData.passenger,
          completed: stats.completed,
          timeElapsedSeconds: stats.timeElapsedSeconds,
          timeRemainingSeconds: stats.timeRemainingSeconds,
          crashes: stats.crashes,
          nearMisses: stats.nearMisses,
          wrongTurns: stats.wrongTurns,
          correctTurns: stats.correctTurns,
          avgSpeedKmh: stats.avgSpeedKmh,
          fare: stats.fare,
          finalMood: stats.finalMood,
          currentDifficulty: currentDiff,
        });

        const nextDiff = normalizeDifficulty(summary.nextDifficulty);
        setRideSummary(summary);
        setDifficulty(nextDiff);
        setPreviousStats({
          rideNumber: completedRideNum,
          completed: stats.completed,
          timeElapsedSeconds: stats.timeElapsedSeconds,
          timeRemainingSeconds: stats.timeRemainingSeconds,
          crashes: stats.crashes,
          nearMisses: stats.nearMisses,
          wrongTurns: stats.wrongTurns,
          correctTurns: stats.correctTurns,
          avgSpeedKmh: stats.avgSpeedKmh,
          fareEarned: stats.fare,
          finalMood: stats.finalMood,
          rating: summary.rating,
        });
      } catch (err) {
        setSummaryError(
          err instanceof Error ? err.message : 'Could not fetch ride review from Gemini.'
        );
      } finally {
        setLoadingSummary(false);
      }
    },
    []
  );

  // Mount HTML5 Canvas Engine ONCE (decoupled from React re-renders)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new RickshawGameEngine(canvas, {
      onHudUpdate: (nextHud) => {
        setHud(nextHud);
      },
      onRideComplete: (stats) => {
        setRideStats(stats);
        setRideSummary(null);
        setSummaryError(null);
        setTotalEarnings((prev) => prev + stats.fare);
        setPhase('summary');

        const currentRide = activeRideRef.current;
        if (currentRide) {
          requestRideSummary(
            rideNumberRef.current,
            currentRide,
            stats,
            difficultyRef.current
          );
        }
      },
    });

    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [requestRideSummary]);

  // Dispatch a new ride via Gemini ride_start
  const dispatchNewRide = useCallback(
    async (
      nextRideNum: number,
      targetDifficulty: DifficultyConfig,
      prevStats: PreviousRideStats | null,
      fromSummary = false
    ) => {
      setStartError(null);
      setBargainReply(null);
      setBargainError(null);
      if (fromSummary) {
        setLoadingNextRide(true);
      } else {
        setPhase('loading_ride');
      }

      try {
        const res = await rideDirectorClient.startRide({
          rideNumber: nextRideNum,
          currentDifficulty: targetDifficulty,
          previousRideStats: prevStats,
        });

        setRideNumber(nextRideNum);
        setActiveRide(res);
        setAgreedFare(Math.max(40, Math.round(res.passenger.fareOffer)));
        setPhase('bargaining');
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to start ride via Gemini.';
        setStartError(msg);
        if (!fromSummary) {
          setPhase('title');
        } else {
          setSummaryError(msg);
        }
      } finally {
        setLoadingNextRide(false);
      }
    },
    []
  );

  const handleStartFromTitle = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    dispatchNewRide(1, INITIAL_DIFFICULTY, null, false);
  }, [dispatchNewRide]);

  // Support ?autostart=1 for immediate start
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      dispatchNewRide(1, INITIAL_DIFFICULTY, null, false);
    }
  }, [dispatchNewRide]);

  // Handle fare counter +20 via Gemini bargain
  const handleCounterFare = useCallback(async () => {
    if (!activeRide || bargaining) return;
    setBargaining(true);
    setBargainError(null);
    try {
      const reply = await rideDirectorClient.bargainFare({
        passenger: activeRide.passenger,
        currentFare: agreedFare,
        counterFare: agreedFare + 20,
        rideNumber,
      });
      setBargainReply(reply);
      if (Number.isFinite(reply.acceptedFare) && reply.acceptedFare > 0) {
        setAgreedFare(Math.round(reply.acceptedFare));
      }
    } catch (err) {
      setBargainError(
        err instanceof Error
          ? err.message
          : 'Passenger negotiation call failed. You can accept the current fare to drive.'
      );
    } finally {
      setBargaining(false);
    }
  }, [activeRide, agreedFare, bargaining, rideNumber]);

  const handleStartDriving = useCallback(() => {
    if (!activeRide || !engineRef.current) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setPhase('playing');
    engineRef.current.startRide(
      activeRide.passenger,
      activeRide.route,
      agreedFare,
      difficulty.timerSeconds
    );
  }, [activeRide, agreedFare, difficulty.timerSeconds]);

  const handlePauseToggle = useCallback(() => {
    if (phase === 'playing') {
      engineRef.current?.setPaused(true);
      setPhase('paused');
    } else if (phase === 'paused') {
      engineRef.current?.setPaused(false);
      setPhase('playing');
    }
  }, [phase]);

  const handleRestartCurrentRide = useCallback(() => {
    if (!activeRide || !engineRef.current) return;
    setPhase('playing');
    engineRef.current.startRide(
      activeRide.passenger,
      activeRide.route,
      agreedFare,
      difficulty.timerSeconds
    );
  }, [activeRide, agreedFare, difficulty.timerSeconds]);

  const handleReturnTitle = useCallback(() => {
    engineRef.current?.setAmbientMode();
    setActiveRide(null);
    setRideStats(null);
    setRideSummary(null);
    setStartError(null);
    setPhase('title');
  }, []);

  const handleNextRide = useCallback(() => {
    dispatchNewRide(rideNumber + 1, difficulty, previousStats, true);
  }, [dispatchNewRide, rideNumber, difficulty, previousStats]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      rickshawAudio.setMuted(next);
      return next;
    });
  }, []);

  // Global keyboard shortcuts (Title Enter/Space, Pause P/Esc, Mute M)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (phase === 'title' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handleStartFromTitle();
      } else if ((phase === 'playing' || phase === 'paused') && (e.key === 'p' || e.key === 'P' || e.key === 'Escape')) {
        e.preventDefault();
        handlePauseToggle();
      } else if (e.key === 'm' || e.key === 'M') {
        handleToggleMute();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, handleStartFromTitle, handlePauseToggle, handleToggleMute]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950">
      {/* Main Full-Bleed Game Canvas & Overlays */}
      <main className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          data-testid="rickshaw-canvas"
          className="block h-full w-full"
        />

        {/* Floating Ride Director Log button during Bargaining / Summary when closed */}
        {(phase === 'bargaining' || phase === 'summary') && !logOpen && (
          <div className="absolute top-4 right-4 z-30">
            <button
              type="button"
              onClick={() => setLogOpen(true)}
              aria-expanded={logOpen}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-slate-900 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 shadow-[3px_3px_0px_#0f172a] hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <Terminal className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              <span>Ride Director log</span>
              <span className="font-mono-tabular text-emerald-800">
                ({logEntries.length})
              </span>
            </button>
          </div>
        )}

        {/* Phase 1: Title / Loading Ride */}
        {(phase === 'title' || phase === 'loading_ride') && (
          <TitleOverlay
            loading={phase === 'loading_ride'}
            error={startError}
            logCount={logEntries.length}
            logOpen={logOpen}
            onStartRide={handleStartFromTitle}
            onToggleLog={() => setLogOpen((v) => !v)}
          />
        )}

        {/* Phase 2: Fare Bargaining */}
        {phase === 'bargaining' && activeRide && (
          <BargainModal
            rideNumber={rideNumber}
            passenger={activeRide.passenger}
            route={activeRide.route}
            currentFare={agreedFare}
            bargainReply={bargainReply}
            bargaining={bargaining}
            bargainError={bargainError}
            onAccept={handleStartDriving}
            onCounter={handleCounterFare}
          />
        )}

        {/* Phase 3: Active Driving HUD */}
        {(phase === 'playing' || phase === 'paused') && activeRide && (
          <HudOverlay
            rideNumber={rideNumber}
            passengerName={activeRide.passenger.name}
            destination={activeRide.passenger.destination}
            hud={hud}
            muted={muted}
            logOpen={logOpen}
            logCount={logEntries.length}
            onToggleMute={handleToggleMute}
            onPause={handlePauseToggle}
            onToggleLog={() => setLogOpen((v) => !v)}
            onSteerLeft={() => engineRef.current?.steerLeft()}
            onSteerRight={() => engineRef.current?.steerRight()}
            onBoostStart={() => engineRef.current?.setTouchBoost(true)}
            onBoostEnd={() => engineRef.current?.setTouchBoost(false)}
            onBrakeStart={() => engineRef.current?.setTouchBrake(true)}
            onBrakeEnd={() => engineRef.current?.setTouchBrake(false)}
          />
        )}

        {/* Phase 4: Pause Overlay */}
        {phase === 'paused' && (
          <PauseModal
            rideNumber={rideNumber}
            onResume={handlePauseToggle}
            onRestartRide={handleRestartCurrentRide}
            onReturnTitle={handleReturnTitle}
          />
        )}

        {/* Phase 5: Ride Summary */}
        {phase === 'summary' && activeRide && rideStats && (
          <SummaryModal
            rideNumber={rideNumber}
            passenger={activeRide.passenger}
            stats={rideStats}
            summary={rideSummary}
            loadingSummary={loadingSummary}
            summaryError={summaryError}
            loadingNextRide={loadingNextRide}
            nextDifficulty={difficulty}
            totalEarnings={totalEarnings}
            onNextRide={handleNextRide}
            onRetrySummary={() =>
              requestRideSummary(rideNumber, activeRide, rideStats, difficulty)
            }
          />
        )}
      </main>

      {/* Collapsible Side Panel: Ride Director log */}
      <AgentLogPanel
        open={logOpen}
        entries={logEntries}
        onClose={() => setLogOpen(false)}
        onClear={() => setLogEntries([])}
      />
    </div>
  );
}
