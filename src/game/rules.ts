import type {
  DifficultyConfig,
  ObstacleType,
  RouteEvent,
  RoutePlan,
  RouteSegment,
  TurnPoint,
  WeatherType,
} from '../types/rideDirector';

export const INITIAL_DIFFICULTY: DifficultyConfig = {
  trafficDensity: 4,
  timerSeconds: 55,
  obstacleMix: 'commuter cars, bikes, stray cows, and Koramangala potholes',
  fareMultiplier: 1.0,
};

export interface ObstacleSpec {
  type: ObstacleType;
  label: string;
  halfLengthMeters: number;
  widthFraction: number; // fraction of lane width (0..1)
  speedMps: number; // forward speed along road in m/s
  moodPenalty: number;
  timePenaltySec: number;
  severity: 'heavy' | 'bump' | 'splash';
  countsAsCrash: boolean;
}

const OBSTACLE_SPECS: Record<ObstacleType, ObstacleSpec> = {
  car: {
    type: 'car',
    label: 'hatchback car',
    halfLengthMeters: 3.1,
    widthFraction: 0.64,
    speedMps: 7.5,
    moodPenalty: 14,
    timePenaltySec: 3,
    severity: 'heavy',
    countsAsCrash: true,
  },
  bus: {
    type: 'bus',
    label: 'red BMTC bus',
    halfLengthMeters: 5.8,
    widthFraction: 0.8,
    speedMps: 4.4,
    moodPenalty: 18,
    timePenaltySec: 4,
    severity: 'heavy',
    countsAsCrash: true,
  },
  auto: {
    type: 'auto',
    label: 'other auto-rickshaw',
    halfLengthMeters: 2.6,
    widthFraction: 0.52,
    speedMps: 7.0,
    moodPenalty: 13,
    timePenaltySec: 2.5,
    severity: 'heavy',
    countsAsCrash: true,
  },
  bike: {
    type: 'bike',
    label: 'scooter',
    halfLengthMeters: 2.0,
    widthFraction: 0.4,
    speedMps: 9.2,
    moodPenalty: 11,
    timePenaltySec: 2,
    severity: 'heavy',
    countsAsCrash: true,
  },
  pedestrian: {
    type: 'pedestrian',
    label: 'crossing pedestrian',
    halfLengthMeters: 1.4,
    widthFraction: 0.36,
    speedMps: 0.2,
    moodPenalty: 20,
    timePenaltySec: 4,
    severity: 'heavy',
    countsAsCrash: true,
  },
  cow: {
    type: 'cow',
    label: 'roadside cow',
    halfLengthMeters: 2.2,
    widthFraction: 0.56,
    speedMps: 0.5,
    moodPenalty: 16,
    timePenaltySec: 3.5,
    severity: 'heavy',
    countsAsCrash: true,
  },
  pothole: {
    type: 'pothole',
    label: 'deep pothole',
    halfLengthMeters: 1.8,
    widthFraction: 0.62,
    speedMps: 0,
    moodPenalty: 8,
    timePenaltySec: 1.5,
    severity: 'bump',
    countsAsCrash: false,
  },
  speed_breaker: {
    type: 'speed_breaker',
    label: 'speed breaker',
    halfLengthMeters: 1.4,
    widthFraction: 0.88,
    speedMps: 0,
    moodPenalty: 7,
    timePenaltySec: 1,
    severity: 'bump',
    countsAsCrash: false,
  },
  traffic_jam: {
    type: 'traffic_jam',
    label: 'traffic jam',
    halfLengthMeters: 6.0,
    widthFraction: 0.76,
    speedMps: 1.4,
    moodPenalty: 15,
    timePenaltySec: 4,
    severity: 'heavy',
    countsAsCrash: true,
  },
  traffic_cop: {
    type: 'traffic_cop',
    label: 'Bengaluru traffic cop',
    halfLengthMeters: 2.2,
    widthFraction: 0.56,
    speedMps: 0,
    moodPenalty: 18,
    timePenaltySec: 5,
    severity: 'heavy',
    countsAsCrash: true,
  },
  rain_patch: {
    type: 'rain_patch',
    label: 'waterlogged rain patch',
    halfLengthMeters: 4.5,
    widthFraction: 0.84,
    speedMps: 0,
    moodPenalty: 4,
    timePenaltySec: 1,
    severity: 'splash',
    countsAsCrash: false,
  },
};

export const VALID_OBSTACLE_TYPES: ReadonlyArray<ObstacleType> = Object.keys(
  OBSTACLE_SPECS
) as ObstacleType[];

export const SAFE_SPEED_BREAKER_MPS = 16.5; // ~59 km/h

export function getObstacleSpec(type: ObstacleType): ObstacleSpec {
  return OBSTACLE_SPECS[type] ?? OBSTACLE_SPECS.car;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampLane(lane: number): 0 | 1 | 2 {
  const rounded = Math.round(Number.isFinite(lane) ? lane : 1);
  if (rounded <= 0) return 0;
  if (rounded >= 2) return 2;
  return 1;
}

export function normalizeWeather(raw: string): WeatherType {
  const lower = (raw || '').toLowerCase();
  if (lower.includes('monsoon') || lower.includes('heavy') || lower.includes('storm')) {
    return 'monsoon';
  }
  if (lower.includes('drizzle') || lower.includes('rain') || lower.includes('shower')) {
    return 'drizzle';
  }
  if (lower.includes('cloud') || lower.includes('overcast')) {
    return 'overcast';
  }
  return 'sunny';
}

export function sanitizeRoutePlan(raw: RoutePlan): RoutePlan {
  const lengthMeters = Math.round(clamp(raw.lengthMeters || 900, 680, 1250));
  const trafficDensity = Math.round(clamp(raw.trafficDensity || 5, 1, 10));
  const weather = normalizeWeather(raw.weather);
  const landmarks =
    Array.isArray(raw.landmarks) && raw.landmarks.length > 0
      ? raw.landmarks.map((s) => String(s).trim()).filter(Boolean)
      : ['Silk Board', 'Koramangala', 'Forum Mall', 'Indiranagar'];

  // Sanitize turn points: keep 2-3 evenly spaced inside safe driving window
  const rawTurns = Array.isArray(raw.turnPoints) ? raw.turnPoints : [];
  const sortedTurns: TurnPoint[] = rawTurns
    .map((tp, idx) => {
      const correctLane = clampLane(tp.correctLane);
      const direction: 'left' | 'straight' | 'right' =
        tp.direction === 'left' || tp.direction === 'straight' || tp.direction === 'right'
          ? tp.direction
          : correctLane === 0
            ? 'left'
            : correctLane === 2
              ? 'right'
              : 'straight';
      return {
        atMeters: Math.round(
          clamp(
            Number.isFinite(tp.atMeters)
              ? tp.atMeters
              : Math.round(lengthMeters * ((idx + 1) / (rawTurns.length + 1))),
            230,
            lengthMeters - 100
          )
        ),
        correctLane,
        direction,
        landmark: String(tp.landmark || landmarks[idx % landmarks.length]).trim(),
      };
    })
    .sort((a, b) => a.atMeters - b.atMeters)
    .slice(0, 3);

  // Enforce minimum 170m spacing between turn points
  const spacedTurns: TurnPoint[] = [];
  for (const tp of sortedTurns) {
    const prev = spacedTurns[spacedTurns.length - 1];
    if (!prev || tp.atMeters - prev.atMeters >= 170) {
      spacedTurns.push(tp);
    } else {
      const shifted = Math.min(lengthMeters - 95, prev.atMeters + 180);
      if (shifted - prev.atMeters >= 140) {
        spacedTurns.push({ ...tp, atMeters: shifted });
      }
    }
  }

  // Sanitize obstacles: keep inside safe spawn window [145, lengthMeters - 65]
  const rawEvents = Array.isArray(raw.events) ? raw.events : [];
  const normalizedEvents: RouteEvent[] = rawEvents
    .map((ev) => ({
      type: VALID_OBSTACLE_TYPES.includes(ev.type) ? ev.type : 'car',
      atMeters: Math.round(clamp(ev.atMeters || 200, 145, lengthMeters - 65)),
      lane: clampLane(ev.lane),
    }))
    .sort((a, b) => a.atMeters - b.atMeters);

  // Deduplicate same-lane overlaps and ensure never all 3 lanes blocked in a 30m window
  const safeEvents: RouteEvent[] = [];
  for (const ev of normalizedEvents) {
    // Keep the required turn lane clear around each turn point
    const conflictsWithTurn = spacedTurns.some(
      (tp) => Math.abs(ev.atMeters - tp.atMeters) < 26 && ev.lane === tp.correctLane
    );
    if (conflictsWithTurn) continue;

    // Prevent same-lane pileups within 28m
    const sameLaneConflict = safeEvents.some(
      (other) => other.lane === ev.lane && Math.abs(other.atMeters - ev.atMeters) < 28
    );
    if (sameLaneConflict) continue;

    // Ensure at least 1 open escape lane across every 32m band
    const lanesOccupiedNearby = new Set<number>([ev.lane]);
    for (const other of safeEvents) {
      if (Math.abs(other.atMeters - ev.atMeters) < 32) {
        lanesOccupiedNearby.add(other.lane);
      }
    }
    if (lanesOccupiedNearby.size >= 3) {
      continue;
    }

    safeEvents.push(ev);
  }

  // Normalize road segments so startMeters..endMeters span [0, lengthMeters]
  let segments: RouteSegment[] | undefined;
  if (Array.isArray(raw.segments) && raw.segments.length > 0) {
    const cleaned = raw.segments
      .map((seg) => ({
        roadName: String(seg.roadName || '').trim(),
        lengthMeters: Math.max(50, Number(seg.lengthMeters) || 200),
        landmarks: Array.isArray(seg.landmarks)
          ? seg.landmarks.map((l) => String(l).trim()).filter(Boolean)
          : [],
        hotspot: seg.hotspot ?? null,
      }))
      .filter((seg) => seg.roadName.length > 0);

    if (cleaned.length > 0) {
      const totalSegLen = cleaned.reduce((sum, s) => sum + s.lengthMeters, 0) || 1;
      let cursor = 0;
      segments = cleaned.map((seg, idx) => {
        const startMeters = Math.round(cursor);
        const scaledLen =
          idx === cleaned.length - 1
            ? Math.max(40, lengthMeters - startMeters)
            : Math.max(60, Math.round((seg.lengthMeters / totalSegLen) * lengthMeters));
        cursor = Math.min(lengthMeters, startMeters + scaledLen);
        return {
          ...seg,
          startMeters,
          endMeters: idx === cleaned.length - 1 ? lengthMeters : Math.round(cursor),
        };
      });
    }
  }

  return {
    landmarks,
    lengthMeters,
    weather,
    trafficDensity,
    events: safeEvents,
    turnPoints: spacedTurns,
    segments,
    mapsGrounded: raw.mapsGrounded,
    mapsError: raw.mapsError ?? null,
    todayHotspots: raw.todayHotspots,
    mapsSources: raw.mapsSources,
  };
}

export type InteractionOutcome = 'hit' | 'near_miss' | 'speed_breaker_safe' | 'none';

export interface ObstacleCheckInput {
  playerMeters: number;
  playerLanePos: number; // continuous 0..2
  playerSpeedMps: number;
  obstacleMeters: number;
  obstacleLane: number; // 0..2
  obstacleType: ObstacleType;
  alreadyHit: boolean;
  alreadyNearMissed: boolean;
}

export function evaluateObstacleInteraction(
  input: ObstacleCheckInput
): InteractionOutcome {
  if (input.alreadyHit) return 'none';

  const spec = getObstacleSpec(input.obstacleType);
  const playerHalfLength = 2.05;
  const longitudinalDist = Math.abs(input.playerMeters - input.obstacleMeters);
  const laneDist = Math.abs(input.playerLanePos - input.obstacleLane);

  const hitLongitudinal = playerHalfLength + spec.halfLengthMeters * 0.85;
  const hitLateral = 0.24 + spec.widthFraction * 0.42;

  if (longitudinalDist < hitLongitudinal && laneDist < hitLateral) {
    if (
      input.obstacleType === 'speed_breaker' &&
      input.playerSpeedMps <= SAFE_SPEED_BREAKER_MPS
    ) {
      return 'speed_breaker_safe';
    }
    return 'hit';
  }

  // Near miss: vehicle/cow passed closely in an adjacent lane as player overtakes it
  const isNearMissEligible =
    spec.countsAsCrash &&
    !input.alreadyNearMissed &&
    input.playerMeters > input.obstacleMeters + 1.2 &&
    input.playerMeters < input.obstacleMeters + spec.halfLengthMeters + 5.5 &&
    laneDist >= hitLateral &&
    laneDist <= 1.18;

  if (isNearMissEligible) {
    return 'near_miss';
  }

  return 'none';
}

export interface TurnEvaluation {
  correct: boolean;
  moodDelta: number;
  timeDelta: number;
  laneName: 'Left' | 'Middle' | 'Right';
}

export function laneIndexToName(lane: 0 | 1 | 2): 'Left' | 'Middle' | 'Right' {
  if (lane === 0) return 'Left';
  if (lane === 2) return 'Right';
  return 'Middle';
}

export function evaluateTurnPoint(
  playerLanePos: number,
  turnPoint: TurnPoint
): TurnEvaluation {
  const activeLane = clampLane(playerLanePos);
  const correct = activeLane === turnPoint.correctLane;
  return {
    correct,
    moodDelta: correct ? 6 : -14,
    timeDelta: correct ? 0 : -4,
    laneName: laneIndexToName(turnPoint.correctLane),
  };
}

export function normalizeDifficulty(raw: Partial<DifficultyConfig>): DifficultyConfig {
  return {
    trafficDensity: Math.round(clamp(raw.trafficDensity ?? 5, 1, 10)),
    timerSeconds: Math.round(clamp(raw.timerSeconds ?? 52, 36, 68)),
    obstacleMix:
      typeof raw.obstacleMix === 'string' && raw.obstacleMix.trim().length > 0
        ? raw.obstacleMix.trim()
        : INITIAL_DIFFICULTY.obstacleMix,
    fareMultiplier: Number(clamp(raw.fareMultiplier ?? 1.0, 0.75, 2.5).toFixed(2)),
  };
}

export function computeFinalMood(currentMood: number, delta: number): number {
  return Math.round(clamp(currentMood + delta, 0, 100));
}

export function mpsToKmh(mps: number): number {
  return Math.round(mps * 3.6);
}
