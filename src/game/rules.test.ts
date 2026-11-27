import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFinalMood,
  evaluateObstacleInteraction,
  evaluateTurnPoint,
  normalizeDifficulty,
  SAFE_SPEED_BREAKER_MPS,
  sanitizeRoutePlan,
} from './rules';
import type { RoutePlan } from '../types/rideDirector';

test('sanitizeRoutePlan never blocks all 3 lanes in the same band and protects spawn zone', () => {
  const raw: RoutePlan = {
    landmarks: ['Silk Board', 'Forum Mall'],
    lengthMeters: 900,
    weather: 'drizzle',
    trafficDensity: 12,
    events: [
      // Too early (spawn zone) should be clamped to >= 145
      { type: 'car', atMeters: 20, lane: 1 },
      // 3-lane wall around 400m
      { type: 'bus', atMeters: 400, lane: 0 },
      { type: 'car', atMeters: 405, lane: 1 },
      { type: 'cow', atMeters: 410, lane: 2 },
    ],
    turnPoints: [{ atMeters: 500, correctLane: 2, landmark: 'Forum Mall' }],
  };

  const clean = sanitizeRoutePlan(raw);
  assert.equal(clean.trafficDensity, 10);
  assert.ok(clean.events.every((ev) => ev.atMeters >= 145));

  // Verify around 400m at most 2 lanes are occupied
  const wallEvents = clean.events.filter(
    (ev) => ev.atMeters >= 380 && ev.atMeters <= 430
  );
  const occupied = new Set(wallEvents.map((e) => e.lane));
  assert.ok(occupied.size <= 2, `Expected <= 2 occupied lanes, got ${occupied.size}`);
});

test('sanitizeRoutePlan clears obstacles inside the required turn lane near turnPoints', () => {
  const raw: RoutePlan = {
    landmarks: ['Sony World'],
    lengthMeters: 850,
    weather: 'sunny',
    trafficDensity: 5,
    events: [
      { type: 'bus', atMeters: 505, lane: 0 }, // blocks correct lane 0 at turn 500
      { type: 'car', atMeters: 505, lane: 2 }, // safe in other lane
    ],
    turnPoints: [{ atMeters: 500, correctLane: 0, landmark: 'Sony World' }],
  };

  const clean = sanitizeRoutePlan(raw);
  assert.equal(
    clean.events.some((ev) => ev.lane === 0 && Math.abs(ev.atMeters - 500) < 26),
    false
  );
  assert.equal(
    clean.events.some((ev) => ev.lane === 2 && ev.atMeters === 505),
    true
  );
});

test('evaluateObstacleInteraction distinguishes hit, near_miss, and safe speed breaker', () => {
  const directHit = evaluateObstacleInteraction({
    playerMeters: 300,
    playerLanePos: 1.0,
    playerSpeedMps: 22,
    obstacleMeters: 301,
    obstacleLane: 1,
    obstacleType: 'car',
    alreadyHit: false,
    alreadyNearMissed: false,
  });
  assert.equal(directHit, 'hit');

  const nearMiss = evaluateObstacleInteraction({
    playerMeters: 303.5,
    playerLanePos: 1.0,
    playerSpeedMps: 22,
    obstacleMeters: 300,
    obstacleLane: 0,
    obstacleType: 'bus',
    alreadyHit: false,
    alreadyNearMissed: false,
  });
  assert.equal(nearMiss, 'near_miss');

  const slowSpeedBreaker = evaluateObstacleInteraction({
    playerMeters: 300,
    playerLanePos: 1.0,
    playerSpeedMps: SAFE_SPEED_BREAKER_MPS - 1,
    obstacleMeters: 300.5,
    obstacleLane: 1,
    obstacleType: 'speed_breaker',
    alreadyHit: false,
    alreadyNearMissed: false,
  });
  assert.equal(slowSpeedBreaker, 'speed_breaker_safe');

  const fastSpeedBreaker = evaluateObstacleInteraction({
    playerMeters: 300,
    playerLanePos: 1.0,
    playerSpeedMps: SAFE_SPEED_BREAKER_MPS + 6,
    obstacleMeters: 300.5,
    obstacleLane: 1,
    obstacleType: 'speed_breaker',
    alreadyHit: false,
    alreadyNearMissed: false,
  });
  assert.equal(fastSpeedBreaker, 'hit');
});

test('evaluateTurnPoint rewards right lane and penalizes wrong lane', () => {
  const tp = { atMeters: 450, correctLane: 2 as const, landmark: 'MG Road' };
  const ok = evaluateTurnPoint(1.85, tp);
  assert.equal(ok.correct, true);
  assert.ok(ok.moodDelta > 0);
  assert.equal(ok.timeDelta, 0);

  const wrong = evaluateTurnPoint(0.1, tp);
  assert.equal(wrong.correct, false);
  assert.ok(wrong.moodDelta < 0);
  assert.ok(wrong.timeDelta < 0);
});

test('normalizeDifficulty and computeFinalMood stay within safe bounds', () => {
  const diff = normalizeDifficulty({
    trafficDensity: 99,
    timerSeconds: 10,
    fareMultiplier: 5.5,
    obstacleMix: 'heavy traffic',
  });
  assert.equal(diff.trafficDensity, 10);
  assert.equal(diff.timerSeconds, 36);
  assert.equal(diff.fareMultiplier, 2.5);

  assert.equal(computeFinalMood(95, 20), 100);
  assert.equal(computeFinalMood(5, -20), 0);
});
