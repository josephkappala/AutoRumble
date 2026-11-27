import type {
  PassengerProfile,
  ReactionEventType,
  RoutePlan,
  TurnPoint,
} from '../types/rideDirector';
import { rideDirectorClient } from '../services/rideDirectorClient';
import { rickshawAudio } from './audio';
import {
  computeRoadMetrics,
  renderGameFrame,
  type ActiveObstacle,
  type FloatingCallout,
  type Particle,
  type SpeechBubbleState,
} from './renderer';
import {
  clamp,
  computeFinalMood,
  evaluateObstacleInteraction,
  evaluateTurnPoint,
  getObstacleSpec,
  laneIndexToName,
  mpsToKmh,
  sanitizeRoutePlan,
} from './rules';

export interface HudTelemetry {
  fare: number;
  timerSeconds: number;
  mood: number;
  distanceRemaining: number;
  progressRatio: number;
  speedKmh: number;
  crashes: number;
  nearMisses: number;
  upcomingTurn: {
    landmark: string;
    distanceMeters: number;
    directionHint: string | null;
  } | null;
  turnMarkers: Array<{ ratio: number; status: 'pending' | 'correct' | 'wrong' }>;
  weather: string;
  currentLane: 0 | 1 | 2;
}

export interface RideCompletionPayload {
  completed: boolean;
  timeElapsedSeconds: number;
  timeRemainingSeconds: number;
  crashes: number;
  nearMisses: number;
  wrongTurns: number;
  correctTurns: number;
  avgSpeedKmh: number;
  fare: number;
  finalMood: number;
}

interface EngineCallbacks {
  onHudUpdate: (hud: HudTelemetry) => void;
  onRideComplete: (result: RideCompletionPayload) => void;
}

const PARTICLE_POOL_SIZE = 120;
const BASE_CRUISE_MPS = 20; // ~72 km/h arcade feel
const MIN_SPEED_MPS = 8.5; // ~31 km/h braking
const MAX_SPEED_MPS = 30.5; // ~110 km/h full throttle

export class RickshawGameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: EngineCallbacks;

  private rafId: number | null = null;
  private lastFrameMs = 0;
  private timeSec = 0;

  private mode: 'ambient' | 'playing' | 'paused' | 'finished' = 'ambient';
  private rideSessionId = 0;

  // World state
  private passenger: PassengerProfile | null = null;
  private route: RoutePlan | null = null;
  private fare = 120;
  private timerSeconds = 55;
  private totalTimeAllowed = 55;
  private timeElapsed = 0;
  private mood = 82;

  private playerMeters = 0;
  private targetLane: 0 | 1 | 2 = 1;
  private playerLanePos = 1;
  private playerLean = 0;
  private playerSpeedMps = BASE_CRUISE_MPS;

  private crashes = 0;
  private nearMisses = 0;
  private wrongTurns = 0;
  private correctTurns = 0;
  private speedAccumulator = 0;
  private speedSamples = 0;

  // Feel & juice
  private hitstopSec = 0;
  private hitFlashSec = 0;
  private bouncePhase = 0;
  private trauma = 0;
  private rainSlowTimer = 0;
  private exhaustTimer = 0;
  private slowDrivingSec = 0;
  private slowReactionFired = false;

  // Entities
  private obstacles: ActiveObstacle[] = [];
  private ambientObstacles: ActiveObstacle[] = [];
  private turnPoints: Array<
    TurnPoint & {
      passed: boolean;
      result?: 'correct' | 'wrong';
      announced: boolean;
      prefetchedDirection: string | null;
      prefetchStarted: boolean;
    }
  > = [];

  private halfwayPrefetchStarted = false;
  private halfwayPrefetchedLine: string | null = null;
  private halfwayTriggered = false;

  private speechBubble: SpeechBubbleState | null = null;
  private speechToken = 0;
  private lastReactionAtSec = -10;
  private callouts: FloatingCallout[] = [];
  private particles: Particle[] = [];
  private particleCursor = 0;

  // Input state
  private keysHeld = new Set<string>();
  private touchBoost = false;
  private touchBrake = false;
  private hudEmitAccum = 0;

  // Canvas dimensions
  private width = 800;
  private height = 600;
  private resizeObserver: ResizeObserver | null = null;
  private needsStaticRedraw = true;
  private ambientFrameAccum = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D rendering context');
    }
    this.ctx = ctx;
    this.callbacks = callbacks;

    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 3,
        color: '#FFFFFF',
        life: 0,
        maxLife: 0.4,
      });
    }

    this.initAmbientRoad();
    this.handleResize();
    this.attachListeners();
    this.startLoop();
  }

  private initAmbientRoad() {
    this.ambientObstacles = [
      { id: 1, type: 'car', atMeters: 40, lane: 0, colorVariant: 0, hit: false, nearMissed: false, wobblePhase: 0.2 },
      { id: 2, type: 'bus', atMeters: 95, lane: 2, colorVariant: 1, hit: false, nearMissed: false, wobblePhase: 1.1 },
      { id: 3, type: 'bike', atMeters: 140, lane: 0, colorVariant: 2, hit: false, nearMissed: false, wobblePhase: 2.3 },
      { id: 4, type: 'cow', atMeters: 185, lane: 2, colorVariant: 0, hit: false, nearMissed: false, wobblePhase: 0.7 },
      { id: 5, type: 'car', atMeters: 235, lane: 0, colorVariant: 3, hit: false, nearMissed: false, wobblePhase: 1.8 },
    ];
  }

  private attachListeners() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearHeldInputs);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.canvas.parentElement);
    } else {
      window.addEventListener('resize', this.handleResize);
    }
  }

  destroy() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearHeldInputs);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('resize', this.handleResize);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private handleResize = () => {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(320, Math.floor(rect.width));
    this.height = Math.max(320, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.needsStaticRedraw = true;
  };

  private onVisibilityChange = () => {
    if (document.hidden) {
      this.clearHeldInputs();
    }
  };

  clearHeldInputs = () => {
    this.keysHeld.clear();
    this.touchBoost = false;
    this.touchBrake = false;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== 'playing') return;
    const key = e.key;
    if (
      key === 'ArrowLeft' ||
      key === 'ArrowRight' ||
      key === 'ArrowUp' ||
      key === 'ArrowDown' ||
      key === ' '
    ) {
      e.preventDefault();
    }

    if (!this.keysHeld.has(key)) {
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
        this.steerLeft();
      } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        this.steerRight();
      } else if (key === 'h' || key === 'H') {
        rickshawAudio.playHorn();
      }
    }
    this.keysHeld.add(key);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysHeld.delete(e.key);
  };

  steerLeft() {
    if (this.mode !== 'playing') return;
    if (this.targetLane > 0) {
      this.targetLane = (this.targetLane - 1) as 0 | 1 | 2;
      rickshawAudio.playSteer();
    }
  }

  steerRight() {
    if (this.mode !== 'playing') return;
    if (this.targetLane < 2) {
      this.targetLane = (this.targetLane + 1) as 0 | 1 | 2;
      rickshawAudio.playSteer();
    }
  }

  setTouchBoost(active: boolean) {
    this.touchBoost = active;
  }

  setTouchBrake(active: boolean) {
    this.touchBrake = active;
  }

  setAmbientMode() {
    this.rideSessionId++;
    this.mode = 'ambient';
    this.clearHeldInputs();
    this.speechBubble = null;
    this.callouts = [];
    this.playerLanePos = 1;
    this.targetLane = 1;
    this.playerSpeedMps = 14;
  }

  setPaused(paused: boolean) {
    if (this.mode === 'playing' && paused) {
      this.mode = 'paused';
      this.clearHeldInputs();
    } else if (this.mode === 'paused' && !paused) {
      this.mode = 'playing';
      this.lastFrameMs = performance.now();
    }
  }

  startRide(
    passenger: PassengerProfile,
    rawRoute: RoutePlan,
    agreedFare: number,
    timerSeconds: number
  ) {
    this.rideSessionId++;
    const sessionId = this.rideSessionId;
    const cleanRoute = sanitizeRoutePlan(rawRoute);

    this.passenger = passenger;
    this.route = cleanRoute;
    this.fare = agreedFare;
    this.timerSeconds = timerSeconds;
    this.totalTimeAllowed = timerSeconds;
    this.timeElapsed = 0;
    this.mood = 82;

    this.playerMeters = 0;
    this.targetLane = 1;
    this.playerLanePos = 1;
    this.playerLean = 0;
    this.playerSpeedMps = BASE_CRUISE_MPS;

    this.crashes = 0;
    this.nearMisses = 0;
    this.wrongTurns = 0;
    this.correctTurns = 0;
    this.speedAccumulator = 0;
    this.speedSamples = 0;

    this.hitstopSec = 0;
    this.hitFlashSec = 0;
    this.bouncePhase = 0;
    this.trauma = 0;
    this.rainSlowTimer = 0;
    this.slowDrivingSec = 0;
    this.slowReactionFired = false;

    this.obstacles = cleanRoute.events.map((ev, idx) => ({
      id: idx + 1,
      type: ev.type,
      atMeters: ev.atMeters,
      lane: ev.lane,
      colorVariant: (idx * 7 + ev.lane) % 6,
      hit: false,
      nearMissed: false,
      wobblePhase: idx * 1.3,
    }));

    this.turnPoints = cleanRoute.turnPoints.map((tp) => ({
      ...tp,
      passed: false,
      announced: false,
      prefetchedDirection: null,
      prefetchStarted: false,
    }));

    this.halfwayPrefetchStarted = false;
    this.halfwayPrefetchedLine = null;
    this.halfwayTriggered = false;
    this.lastReactionAtSec = -10;
    this.callouts = [];
    this.speechBubble = {
      speaker: passenger.name,
      text: passenger.openingLine,
      loading: false,
      urgent: false,
      remainingSec: 4.0,
    };

    this.clearHeldInputs();
    this.mode = 'playing';
    this.lastFrameMs = performance.now();
    rickshawAudio.playHorn();

    // Immediately prefetch Turn #1 direction so it appears with zero delay!
    if (this.turnPoints.length > 0) {
      this.prefetchTurnDirection(0, sessionId);
    }

    this.emitHud();
  }

  private prefetchTurnDirection(turnIdx: number, sessionId: number) {
    const tp = this.turnPoints[turnIdx];
    if (!tp || tp.prefetchStarted || !this.passenger) return;
    tp.prefetchStarted = true;

    rideDirectorClient
      .getTurnDirection(
        {
          passenger: this.passenger,
          landmark: tp.landmark,
          correctLane: tp.correctLane,
          mood: this.mood,
          distanceToTurnMeters: Math.max(40, tp.atMeters - this.playerMeters),
        },
        true
      )
      .then((res) => {
        if (this.rideSessionId !== sessionId) return;
        tp.prefetchedDirection = res.direction;
        // If we already announced this turn with "...", swap it in immediately!
        if (tp.announced && !tp.passed) {
          this.showSpeech(res.direction, true, 5.2);
        }
      })
      .catch(() => {
        // Error is logged in red in Ride Director log; keep driving non-blocking
      });
  }

  private prefetchHalfwayLine(sessionId: number) {
    if (this.halfwayPrefetchStarted || !this.passenger || !this.route) return;
    this.halfwayPrefetchStarted = true;

    rideDirectorClient
      .getRideReaction(
        {
          passenger: this.passenger,
          eventType: 'halfway',
          detail: `Reached halfway point on the way to ${this.passenger.destination}`,
          mood: this.mood,
          speedKmh: mpsToKmh(this.playerSpeedMps),
          remainingMeters: Math.round(this.route.lengthMeters * 0.5),
          timeRemainingSeconds: Math.round(this.timerSeconds),
        },
        true
      )
      .then((res) => {
        if (this.rideSessionId !== sessionId) return;
        this.halfwayPrefetchedLine = res.line;
        if (this.halfwayTriggered && this.speechBubble?.loading) {
          this.showSpeech(res.line, false, 4.2);
        }
      })
      .catch(() => {});
  }

  private showSpeech(text: string, urgent: boolean, durationSec = 4.2) {
    if (!this.passenger) return;
    this.speechToken++;
    this.speechBubble = {
      speaker: this.passenger.name,
      text,
      loading: false,
      urgent,
      remainingSec: durationSec,
    };
  }

  private triggerLiveReaction(
    eventType: ReactionEventType,
    detail: string,
    urgent: boolean
  ) {
    if (!this.passenger || !this.route) return;
    const isPriority = eventType === 'crash' || eventType === 'wrong_turn';
    if (!isPriority && this.timeSec - this.lastReactionAtSec < 2.6) {
      return;
    }
    this.lastReactionAtSec = this.timeSec;
    const sessionId = this.rideSessionId;
    const token = ++this.speechToken;

    // Non-blocking: show "…" immediately while Gemini generates the reaction
    this.speechBubble = {
      speaker: this.passenger.name,
      text: '…',
      loading: true,
      urgent,
      remainingSec: 5.5,
    };

    rideDirectorClient
      .getRideReaction(
        {
          passenger: this.passenger,
          eventType,
          detail,
          mood: this.mood,
          speedKmh: mpsToKmh(this.playerSpeedMps),
          remainingMeters: Math.max(0, this.route.lengthMeters - this.playerMeters),
          timeRemainingSeconds: Math.max(0, this.timerSeconds),
        },
        false
      )
      .then((res) => {
        if (this.rideSessionId !== sessionId || this.speechToken !== token) return;
        this.speechBubble = {
          speaker: this.passenger!.name,
          text: res.line,
          loading: false,
          urgent,
          remainingSec: 4.4,
        };
      })
      .catch(() => {
        if (this.rideSessionId !== sessionId || this.speechToken !== token) return;
        this.speechBubble = null;
      });
  }

  private spawnParticles(
    x: number,
    y: number,
    count: number,
    color: string,
    spreadSpeed: number,
    size = 3.5
  ) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.35 + Math.random() * 0.65) * spreadSpeed;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = size * (0.7 + Math.random() * 0.6);
      p.color = color;
      p.maxLife = 0.25 + Math.random() * 0.35;
      p.life = p.maxLife;
    }
  }

  private addCallout(text: string, color: string) {
    this.callouts.push({
      text,
      color,
      yOffset: 0,
      life: 1.15,
      maxLife: 1.15,
    });
  }

  private startLoop() {
    this.lastFrameMs = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastFrameMs) / 1000;
      this.lastFrameMs = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      if (this.mode === 'playing') {
        this.update(dt);
        this.render();
      } else if (this.mode === 'ambient') {
        this.update(dt);
        this.ambientFrameAccum += dt;
        if (this.ambientFrameAccum >= 1 / 30 || this.needsStaticRedraw) {
          this.ambientFrameAccum = 0;
          this.needsStaticRedraw = false;
          this.render();
        }
      } else if (this.needsStaticRedraw) {
        this.needsStaticRedraw = false;
        this.render();
      }

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private update(dt: number) {
    this.timeSec += dt;

    // Update particles & camera shake even during hitstop
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 2.1);
    }
    if (this.hitFlashSec > 0) {
      this.hitFlashSec = Math.max(0, this.hitFlashSec - dt);
    }
    if (this.bouncePhase > 0) {
      this.bouncePhase = Math.max(0, this.bouncePhase - dt * 3.5);
    }

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) p.active = false;
    }

    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const c = this.callouts[i];
      c.yOffset -= 34 * dt;
      c.life -= dt;
      if (c.life <= 0) this.callouts.splice(i, 1);
    }

    if (this.mode === 'ambient') {
      this.playerMeters += 14 * dt;
      this.playerLanePos = 1 + Math.sin(this.timeSec * 0.55) * 0.14;
      this.playerLean = Math.cos(this.timeSec * 0.55) * 0.12;
      for (const obs of this.ambientObstacles) {
        obs.atMeters += getObstacleSpec(obs.type).speedMps * dt;
        if (obs.atMeters < this.playerMeters - 30) {
          obs.atMeters = this.playerMeters + 140 + Math.random() * 90;
        }
      }
      return;
    }

    if (this.mode !== 'playing' || !this.route || !this.passenger) {
      return;
    }

    if (this.hitstopSec > 0) {
      this.hitstopSec = Math.max(0, this.hitstopSec - dt);
      return;
    }

    // Countdown timer
    this.timeElapsed += dt;
    this.timerSeconds = Math.max(0, this.timerSeconds - dt);

    // Speech bubble countdown
    if (this.speechBubble) {
      this.speechBubble.remainingSec -= dt;
      if (this.speechBubble.remainingSec <= 0 && !this.speechBubble.loading) {
        this.speechBubble = null;
      }
    }

    // Speed control (Up/W boost, Down/S brake, smooth return to cruise)
    const accelHeld =
      this.keysHeld.has('ArrowUp') ||
      this.keysHeld.has('w') ||
      this.keysHeld.has('W') ||
      this.touchBoost;
    const brakeHeld =
      this.keysHeld.has('ArrowDown') ||
      this.keysHeld.has('s') ||
      this.keysHeld.has('S') ||
      this.touchBrake;

    let targetSpeed = BASE_CRUISE_MPS;
    if (accelHeld) targetSpeed = MAX_SPEED_MPS;
    else if (brakeHeld) targetSpeed = MIN_SPEED_MPS;

    if (this.rainSlowTimer > 0) {
      this.rainSlowTimer = Math.max(0, this.rainSlowTimer - dt);
      targetSpeed *= 0.72;
    }

    this.playerSpeedMps += (targetSpeed - this.playerSpeedMps) * Math.min(1, dt * 5.5);

    // Smooth lane steering with crisp lean
    const laneDiff = this.targetLane - this.playerLanePos;
    this.playerLanePos += laneDiff * Math.min(1, dt * 13.5);
    this.playerLean = clamp(laneDiff * 1.4, -1, 1);

    // Advance auto along route
    const prevMeters = this.playerMeters;
    this.playerMeters += this.playerSpeedMps * dt;

    // Track avg speed
    this.speedAccumulator += mpsToKmh(this.playerSpeedMps);
    this.speedSamples++;

    // Exhaust puffs
    this.exhaustTimer += dt;
    if (this.exhaustTimer > 0.085) {
      this.exhaustTimer = 0;
      const { roadLeft, laneWidth, playerScreenY } = computeRoadMetrics(
        this.width,
        this.height
      );
      const px = roadLeft + (this.playerLanePos + 0.5) * laneWidth;
      this.spawnParticles(px - 6, playerScreenY + 34, 1, 'rgba(226, 232, 240, 0.55)', 24, 4);
    }

    // Slow driving detection -> triggers Gemini reaction
    if (mpsToKmh(this.playerSpeedMps) < 42 && this.playerMeters > 100) {
      this.slowDrivingSec += dt;
      if (this.slowDrivingSec > 3.6 && !this.slowReactionFired) {
        this.slowReactionFired = true;
        this.mood = computeFinalMood(this.mood, -4);
        this.triggerLiveReaction(
          'slow_driving',
          `Crawling slowly at ${mpsToKmh(this.playerSpeedMps)} km/h with ${Math.round(this.timerSeconds)}s left`,
          false
        );
      }
    } else {
      this.slowDrivingSec = Math.max(0, this.slowDrivingSec - dt * 1.5);
    }

    // Halfway prefetch (at 34%) & trigger (at 50%)
    const halfMeters = this.route.lengthMeters * 0.5;
    if (this.playerMeters >= this.route.lengthMeters * 0.34 && !this.halfwayPrefetchStarted) {
      this.prefetchHalfwayLine(this.rideSessionId);
    }
    if (this.playerMeters >= halfMeters && !this.halfwayTriggered) {
      this.halfwayTriggered = true;
      if (this.halfwayPrefetchedLine) {
        this.showSpeech(this.halfwayPrefetchedLine, false, 4.2);
      } else {
        this.triggerLiveReaction(
          'halfway',
          `Halfway to ${this.passenger.destination} with ${Math.round(this.timerSeconds)}s left`,
          false
        );
      }
    }

    // Turn points announcement & evaluation
    for (let i = 0; i < this.turnPoints.length; i++) {
      const tp = this.turnPoints[i];
      const dist = tp.atMeters - this.playerMeters;

      if (!tp.announced && dist <= 165 && dist > 15) {
        tp.announced = true;
        if (tp.prefetchedDirection) {
          this.showSpeech(tp.prefetchedDirection, true, 5.2);
        } else {
          // Non-blocking fallback while prefetch settles
          this.speechBubble = {
            speaker: this.passenger.name,
            text: '…',
            loading: true,
            urgent: true,
            remainingSec: 5.2,
          };
          if (!tp.prefetchStarted) {
            this.prefetchTurnDirection(i, this.rideSessionId);
          }
        }
      }

      if (!tp.passed && prevMeters < tp.atMeters && this.playerMeters >= tp.atMeters) {
        tp.passed = true;
        const evalResult = evaluateTurnPoint(this.playerLanePos, tp);
        tp.result = evalResult.correct ? 'correct' : 'wrong';

        this.mood = computeFinalMood(this.mood, evalResult.moodDelta);
        this.timerSeconds = Math.max(0, this.timerSeconds + evalResult.timeDelta);

        if (evalResult.correct) {
          this.correctTurns++;
          rickshawAudio.playCleanTurn();
          this.addCallout(`CLEAN TURN! +${evalResult.moodDelta} MOOD`, '#4ADE80');
        } else {
          this.wrongTurns++;
          this.trauma = Math.min(1, this.trauma + 0.55);
          rickshawAudio.playWrongTurn();
          this.addCallout(
            `WRONG LANE! ${evalResult.timeDelta}s · ${evalResult.moodDelta} MOOD`,
            '#F87171'
          );
          this.triggerLiveReaction(
            'wrong_turn',
            `Missed the ${evalResult.laneName} lane turn at ${tp.landmark}`,
            true
          );
        }

        // Prefetch the NEXT turn direction right away!
        if (i + 1 < this.turnPoints.length) {
          this.prefetchTurnDirection(i + 1, this.rideSessionId);
        }
      }
    }

    // Move dynamic obstacles slowly along the road & check interactions
    const { roadLeft, laneWidth, playerScreenY } = computeRoadMetrics(
      this.width,
      this.height
    );
    const px = roadLeft + (this.playerLanePos + 0.5) * laneWidth;

    for (const obs of this.obstacles) {
      const spec = getObstacleSpec(obs.type);
      // Only move traffic obstacles when within 130m ahead so route pacing matches Gemini's plan
      if (spec.speedMps > 0 && obs.atMeters - this.playerMeters < 115 && obs.atMeters > this.playerMeters - 40) {
        obs.atMeters += spec.speedMps * 0.45 * dt;
      }

      const outcome = evaluateObstacleInteraction({
        playerMeters: this.playerMeters,
        playerLanePos: this.playerLanePos,
        playerSpeedMps: this.playerSpeedMps,
        obstacleMeters: obs.atMeters,
        obstacleLane: obs.lane,
        obstacleType: obs.type,
        alreadyHit: obs.hit,
        alreadyNearMissed: obs.nearMissed,
      });

      if (outcome === 'speed_breaker_safe') {
        obs.hit = true;
        this.bouncePhase = 0.55;
        this.addCallout('SMOOTH BUMP', '#FACC15');
      } else if (outcome === 'hit') {
        obs.hit = true;
        this.mood = computeFinalMood(this.mood, -spec.moodPenalty);
        this.timerSeconds = Math.max(0, this.timerSeconds - spec.timePenaltySec);

        if (obs.type === 'rain_patch') {
          this.rainSlowTimer = 1.4;
          this.spawnParticles(px, playerScreenY, 14, '#38BDF8', 130, 4);
          this.addCallout('SPLASH! SLIPPERY', '#38BDF8');
          rickshawAudio.playPothole();
        } else if (obs.type === 'pothole' || obs.type === 'speed_breaker') {
          this.bouncePhase = 1.0;
          this.trauma = Math.min(1, this.trauma + 0.48);
          this.playerSpeedMps = Math.max(MIN_SPEED_MPS, this.playerSpeedMps * 0.65);
          this.spawnParticles(px, playerScreenY + 12, 12, '#94A3B8', 110, 4);
          this.addCallout(
            obs.type === 'pothole' ? `POTHOLE! -${spec.moodPenalty} MOOD` : `HARD BUMP! -${spec.moodPenalty} MOOD`,
            '#FB923C'
          );
          rickshawAudio.playPothole();
          this.triggerLiveReaction(
            obs.type === 'pothole' ? 'pothole' : 'speed_breaker',
            obs.type === 'pothole'
              ? 'Slammed straight into a giant Bengaluru pothole'
              : `Flew too fast (${mpsToKmh(this.playerSpeedMps)} km/h) over a speed breaker`,
            false
          );
        } else {
          // Heavy crash into car, bus, bike, cow, or traffic_jam
          this.crashes++;
          this.hitstopSec = 0.055;
          this.hitFlashSec = 0.24;
          this.trauma = Math.min(1, this.trauma + 0.85);
          this.playerSpeedMps = MIN_SPEED_MPS;
          this.spawnParticles(px, playerScreenY - 12, 22, '#FACC15', 190, 4.5);
          this.spawnParticles(px, playerScreenY - 12, 10, '#EF4444', 150, 3.5);
          this.addCallout(
            `CRASH! -${spec.timePenaltySec}s · -${spec.moodPenalty} MOOD`,
            '#EF4444'
          );
          rickshawAudio.playCrash();
          this.triggerLiveReaction(
            'crash',
            `Crashed right into a ${spec.label} in the ${laneIndexToName(obs.lane)} lane`,
            true
          );
        }
      } else if (outcome === 'near_miss') {
        obs.nearMissed = true;
        this.nearMisses++;
        this.mood = computeFinalMood(this.mood, 2);
        rickshawAudio.playNearMiss();
        this.addCallout('NEAR MISS! +2 MOOD', '#38BDF8');
        this.triggerLiveReaction(
          'near_miss',
          `Squeezed past a ${spec.label} by inches at ${mpsToKmh(this.playerSpeedMps)} km/h`,
          false
        );
      }
    }

    // Check finish / timeout
    if (this.playerMeters >= this.route.lengthMeters) {
      this.finishRide(true);
      return;
    }
    if (this.timerSeconds <= 0) {
      this.finishRide(false);
      return;
    }

    // Throttled HUD updates (~15Hz) so React never reconciles at 60Hz
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.065) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }
  }

  private finishRide(completed: boolean) {
    this.mode = 'finished';
    this.clearHeldInputs();
    rickshawAudio.playFinish(completed);

    if (completed) {
      const { roadLeft, laneWidth, playerScreenY } = computeRoadMetrics(
        this.width,
        this.height
      );
      const px = roadLeft + (this.playerLanePos + 0.5) * laneWidth;
      this.spawnParticles(px, playerScreenY - 20, 32, '#FACC15', 220, 5);
      this.spawnParticles(px, playerScreenY - 20, 24, '#22C55E', 200, 4.5);
    }

    this.emitHud();
    const avgSpeedKmh =
      this.speedSamples > 0 ? this.speedAccumulator / this.speedSamples : 65;

    this.callbacks.onRideComplete({
      completed,
      timeElapsedSeconds: this.timeElapsed,
      timeRemainingSeconds: Math.max(0, this.timerSeconds),
      crashes: this.crashes,
      nearMisses: this.nearMisses,
      wrongTurns: this.wrongTurns,
      correctTurns: this.correctTurns,
      avgSpeedKmh,
      fare: completed ? this.fare : Math.round(this.fare * 0.4),
      finalMood: this.mood,
    });
  }

  private emitHud() {
    if (!this.route) return;
    const distanceRemaining = Math.max(
      0,
      Math.round(this.route.lengthMeters - this.playerMeters)
    );
    const progressRatio = clamp(this.playerMeters / this.route.lengthMeters, 0, 1);

    // Next unpassed turn within 200m
    const nextTp = this.turnPoints.find(
      (tp) => !tp.passed && tp.atMeters - this.playerMeters <= 200
    );

    this.callbacks.onHudUpdate({
      fare: this.fare,
      timerSeconds: Math.ceil(this.timerSeconds),
      mood: Math.round(this.mood),
      distanceRemaining,
      progressRatio,
      speedKmh: mpsToKmh(this.playerSpeedMps),
      crashes: this.crashes,
      nearMisses: this.nearMisses,
      upcomingTurn: nextTp
        ? {
            landmark: nextTp.landmark,
            distanceMeters: Math.max(0, Math.round(nextTp.atMeters - this.playerMeters)),
            directionHint: nextTp.announced ? nextTp.prefetchedDirection : null,
          }
        : null,
      turnMarkers: this.turnPoints.map((tp) => ({
        ratio: clamp(tp.atMeters / this.route!.lengthMeters, 0.05, 0.95),
        status: !tp.passed ? 'pending' : tp.result === 'correct' ? 'correct' : 'wrong',
      })),
      weather: this.route.weather,
      currentLane: this.targetLane,
    });
  }

  private render() {
    const shakeMag = this.trauma * this.trauma * 12;
    const shakeX = shakeMag > 0.1 ? (Math.random() * 2 - 1) * shakeMag : 0;
    const shakeY = shakeMag > 0.1 ? (Math.random() * 2 - 1) * shakeMag : 0;

    const isAmbient = this.mode === 'ambient';
    const brakeHeld =
      this.keysHeld.has('ArrowDown') ||
      this.keysHeld.has('s') ||
      this.keysHeld.has('S') ||
      this.touchBrake;

    renderGameFrame(this.ctx, {
      width: this.width,
      height: this.height,
      timeSec: this.timeSec,
      isAmbient,
      playerMeters: this.playerMeters,
      playerLanePos: this.playerLanePos,
      playerSpeedMps: this.playerSpeedMps,
      playerLean: this.playerLean,
      braking: brakeHeld && !isAmbient,
      hitFlashSec: this.hitFlashSec,
      bouncePhase: this.bouncePhase,
      shakeX,
      shakeY,
      routeLengthMeters: this.route?.lengthMeters ?? 900,
      destinationName: this.passenger?.destination ?? 'Indiranagar',
      weather: this.route?.weather ?? 'sunny',
      landmarks: isAmbient
        ? ['Silk Board', 'Koramangala', 'Forum Mall', 'Indiranagar', 'MG Road']
        : this.route?.landmarks ?? [],
      obstacles: isAmbient ? this.ambientObstacles : this.obstacles,
      turnPoints: isAmbient ? [] : this.turnPoints,
      speechBubble: isAmbient ? null : this.speechBubble,
      callouts: this.callouts,
      particles: this.particles,
    });
  }
}
