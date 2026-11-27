import type { ObstacleType, RouteSegment, TurnPoint, WeatherType } from '../types/rideDirector';
import { getObstacleSpec } from './rules';

export interface ActiveObstacle {
  id: number;
  type: ObstacleType;
  atMeters: number;
  lane: 0 | 1 | 2;
  lanePos?: number; // continuous lane position for crossing pedestrians
  crossDir?: 1 | -1; // lateral walking direction for pedestrians
  colorVariant: number;
  hit: boolean;
  nearMissed: boolean;
  wobblePhase: number;
}

export interface SpeechBubbleState {
  speaker: string;
  text: string;
  loading: boolean;
  urgent: boolean; // true for turn directions or crashes
  remainingSec: number;
}

export interface FloatingCallout {
  text: string;
  color: string;
  yOffset: number;
  life: number;
  maxLife: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface RenderSnapshot {
  width: number;
  height: number;
  timeSec: number;
  isAmbient: boolean;
  playerMeters: number;
  playerLanePos: number; // continuous 0..2
  playerSpeedMps: number;
  playerLean: number; // -1..1
  braking: boolean;
  hitFlashSec: number;
  bouncePhase: number;
  shakeX: number;
  shakeY: number;
  routeLengthMeters: number;
  destinationName: string;
  weather: WeatherType;
  landmarks: string[];
  segments?: RouteSegment[];
  obstacles: ActiveObstacle[];
  turnPoints: Array<TurnPoint & { passed: boolean; result?: 'correct' | 'wrong' }>;
  speechBubble: SpeechBubbleState | null;
  callouts: FloatingCallout[];
  particles: Particle[];
  vfxEnabled?: boolean;
}

const CAR_COLORS = ['#EF4444', '#2563EB', '#F97316', '#0D9488', '#DB2777', '#6366F1'];

const BENGALURU_SHOPS: ReadonlyArray<{
  label: string;
  wall: string;
  awning: string;
  signBg: string;
  signText: string;
}> = [
  { label: 'DOSA', wall: '#FFEDD5', awning: '#EA580C', signBg: '#C2410C', signText: '#FFF7ED' },
  { label: 'JUICE', wall: '#DCFCE7', awning: '#16A34A', signBg: '#15803D', signText: '#F0FDF4' },
  { label: 'BAKERY', wall: '#FCE7F3', awning: '#DB2777', signBg: '#BE185D', signText: '#FDF2F8' },
  { label: 'PETROL', wall: '#FEE2E2', awning: '#DC2626', signBg: '#1D4ED8', signText: '#FEF08A' },
  { label: 'TEA', wall: '#FEF3C7', awning: '#D97706', signBg: '#92400E', signText: '#FEF3C7' },
  { label: 'METRO', wall: '#EDE9FE', awning: '#7C3AED', signBg: '#5B21B6', signText: '#FFFFFF' },
  { label: 'OFFICE', wall: '#DBEAFE', awning: '#2563EB', signBg: '#1E3A8A', signText: '#E0F2FE' },
];

export function computeRoadMetrics(width: number, height: number) {
  const roadWidth = Math.max(248, Math.min(440, width * 0.54));
  const roadLeft = (width - roadWidth) * 0.5;
  const laneWidth = roadWidth / 3;
  const pxPerMeter = Math.max(11, Math.min(16, height / 56));
  const playerScreenY = height * 0.75;
  return { roadWidth, roadLeft, laneWidth, pxPerMeter, playerScreenY };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number) {
  const r = 24 + (seed % 10);
  // Ground shadow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
  ctx.beginPath();
  ctx.arc(x + 5, y + 6, r, 0, Math.PI * 2);
  ctx.fill();

  // Outer lush foliage
  ctx.fillStyle = seed % 2 === 0 ? '#15803D' : '#166534';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Inner bright canopy
  ctx.fillStyle = seed % 2 === 0 ? '#22C55E' : '#16A34A';
  ctx.beginPath();
  ctx.arc(x - 4, y - 4, r * 0.72, 0, Math.PI * 2);
  ctx.fill();

  // Gulmohar coral-orange blossoms on every 3rd tree (classic Bengaluru avenue)
  if (seed % 3 === 0) {
    ctx.fillStyle = '#FB923C';
    ctx.beginPath();
    ctx.arc(x + 7, y - 6, 5.5, 0, Math.PI * 2);
    ctx.arc(x - 8, y + 5, 4.5, 0, Math.PI * 2);
    ctx.arc(x + 2, y + 8, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBengaluruSignboard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  alignRight: boolean
) {
  const text = label.toUpperCase().slice(0, 18);
  ctx.font = '700 11px "Plus Jakarta Sans", system-ui, sans-serif';
  const textWidth = ctx.measureText(text).width;
  const boardW = Math.max(82, textWidth + 22);
  const boardH = 26;
  const bx = alignRight ? x - boardW : x;

  // Metal post
  ctx.fillStyle = '#64748B';
  ctx.fillRect(alignRight ? x - 6 : x + 2, y + boardH - 2, 4, 14);

  // Drop shadow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
  drawRoundedRect(ctx, bx + 2, y + 3, boardW, boardH, 5);
  ctx.fill();

  // Highway green Bengaluru board
  ctx.fillStyle = '#047857';
  drawRoundedRect(ctx, bx, y, boardW, boardH, 5);
  ctx.fill();

  // Crisp white reflective border
  ctx.strokeStyle = '#F8FAFC';
  ctx.lineWidth = 1.8;
  drawRoundedRect(ctx, bx + 2, y + 2, boardW - 4, boardH - 4, 3);
  ctx.stroke();

  // Text
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + boardW / 2, y + boardH / 2 + 0.5);
}

function drawAutoRickshaw(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  laneWidth: number,
  lean: number,
  braking: boolean,
  hitFlash: boolean,
  bouncePhase: number,
  timeSec: number
) {
  const w = Math.min(46, laneWidth * 0.44);
  const h = w * 1.48;
  const vibX = Math.sin(timeSec * 45) * 0.45;
  const bounceScale = bouncePhase > 0 ? 1 + Math.sin(bouncePhase * Math.PI) * 0.16 : 1;

  ctx.save();
  ctx.translate(cx + vibX, cy);
  ctx.rotate(lean * 0.14);
  ctx.scale(bounceScale, bounceScale);

  // Soft ground shadow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
  drawRoundedRect(ctx, -w * 0.5 + 4, -h * 0.46 + 6, w, h * 0.96, 12);
  ctx.fill();

  // Headlight beams (fast flat translucent cones, zero per-frame gradient allocation)
  ctx.fillStyle = 'rgba(254, 240, 138, 0.24)';
  ctx.beginPath();
  ctx.moveTo(-w * 0.28, -h * 0.46);
  ctx.lineTo(-w * 0.62, -h * 1.38);
  ctx.lineTo(w * 0.62, -h * 1.38);
  ctx.lineTo(w * 0.28, -h * 0.46);
  ctx.closePath();
  ctx.fill();

  // Front wheel fender poking out nose
  ctx.fillStyle = '#1E293B';
  drawRoundedRect(ctx, -5, -h * 0.56, 10, 12, 4);
  ctx.fill();

  // Rear wheels
  ctx.fillStyle = '#0F172A';
  drawRoundedRect(ctx, -w * 0.54, h * 0.16, 6, 15, 2);
  ctx.fill();
  drawRoundedRect(ctx, w * 0.54 - 6, h * 0.16, 6, 15, 2);
  ctx.fill();

  // Iconic Bengaluru Emerald Green lower body
  ctx.fillStyle = hitFlash ? '#FFFFFF' : '#059669';
  drawRoundedRect(ctx, -w * 0.5, -h * 0.48, w, h * 0.96, 11);
  ctx.fill();
  ctx.strokeStyle = '#064E3B';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Side mirrors
  ctx.fillStyle = '#111827';
  ctx.fillRect(-w * 0.62, -h * 0.24, 6, 3);
  ctx.fillRect(w * 0.62 - 6, -h * 0.24, 6, 3);

  // Dark front windshield visor
  ctx.fillStyle = '#1E293B';
  drawRoundedRect(ctx, -w * 0.38, -h * 0.38, w * 0.76, h * 0.18, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(186, 230, 253, 0.55)';
  drawRoundedRect(ctx, -w * 0.31, -h * 0.35, w * 0.62, h * 0.11, 3);
  ctx.fill();

  // Sunny Yellow Auto-Rickshaw Canopy Roof (classic Bengaluru yellow-top)
  ctx.fillStyle = hitFlash ? '#FEF08A' : '#FACC15';
  drawRoundedRect(ctx, -w * 0.43, -h * 0.2, w * 0.86, h * 0.62, 8);
  ctx.fill();
  ctx.strokeStyle = '#CA8A04';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Roof canvas ribs
  ctx.strokeStyle = 'rgba(161, 98, 7, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-w * 0.38, -h * 0.02);
  ctx.lineTo(w * 0.38, -h * 0.02);
  ctx.moveTo(-w * 0.38, h * 0.18);
  ctx.lineTo(w * 0.38, h * 0.18);
  ctx.stroke();

  // Classic black-and-yellow front bumper accent
  ctx.fillStyle = '#FACC15';
  drawRoundedRect(ctx, -w * 0.34, -h * 0.47, w * 0.68, 5, 2);
  ctx.fill();

  // Headlight bulbs
  ctx.fillStyle = '#FEF9C3';
  ctx.beginPath();
  ctx.arc(-w * 0.28, -h * 0.45, 3, 0, Math.PI * 2);
  ctx.arc(w * 0.28, -h * 0.45, 3, 0, Math.PI * 2);
  ctx.fill();

  // Tail / brake lights
  ctx.fillStyle = braking ? '#FF2E2E' : '#B91C1C';
  drawRoundedRect(ctx, -w * 0.36, h * 0.42, 8, 4.5, 2);
  ctx.fill();
  drawRoundedRect(ctx, w * 0.36 - 8, h * 0.42, 8, 4.5, 2);
  ctx.fill();

  ctx.restore();
}

function drawObstacle(
  ctx: CanvasRenderingContext2D,
  obs: ActiveObstacle,
  cx: number,
  cy: number,
  laneWidth: number,
  pxPerMeter: number,
  timeSec: number
) {
  const spec = getObstacleSpec(obs.type);
  const w = laneWidth * spec.widthFraction;
  const h = spec.halfLengthMeters * 2 * pxPerMeter;

  ctx.save();
  ctx.translate(cx, cy);
  if (obs.hit && spec.countsAsCrash) {
    ctx.globalAlpha = 0.6;
  }

  switch (obs.type) {
    case 'car': {
      const color = CAR_COLORS[obs.colorVariant % CAR_COLORS.length];
      // Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
      drawRoundedRect(ctx, -w / 2 + 4, -h / 2 + 5, w, h, 10);
      ctx.fill();
      // Body
      ctx.fillStyle = color;
      drawRoundedRect(ctx, -w / 2, -h / 2, w, h, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // Roof & glass
      ctx.fillStyle = '#1E293B';
      drawRoundedRect(ctx, -w * 0.38, -h * 0.26, w * 0.76, h * 0.54, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
      drawRoundedRect(ctx, -w * 0.3, -h * 0.14, w * 0.6, h * 0.3, 4);
      ctx.fill();
      // Tail lights
      ctx.fillStyle = '#FCA5A5';
      ctx.fillRect(-w * 0.36, h * 0.43, 8, 3.5);
      ctx.fillRect(w * 0.36 - 8, h * 0.43, 8, 3.5);
      break;
    }

    case 'bus': {
      // Classic Red BMTC Bengaluru Bus (large & slow)
      const primary = '#DC2626';
      const trim = '#FEF08A';
      const stripe = '#FEE2E2';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      drawRoundedRect(ctx, -w / 2 + 5, -h / 2 + 6, w, h, 9);
      ctx.fill();
      // Red BMTC chassis
      ctx.fillStyle = primary;
      drawRoundedRect(ctx, -w / 2, -h / 2, w, h, 8);
      ctx.fill();
      ctx.strokeStyle = '#7F1D1D';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      // White/cream roof strip with yellow border
      ctx.fillStyle = stripe;
      drawRoundedRect(ctx, -w * 0.36, -h * 0.38, w * 0.72, h * 0.76, 5);
      ctx.fill();
      ctx.strokeStyle = trim;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // Roof vents / AC pods
      ctx.fillStyle = '#991B1B';
      drawRoundedRect(ctx, -w * 0.24, -h * 0.25, w * 0.48, h * 0.14, 4);
      ctx.fill();
      drawRoundedRect(ctx, -w * 0.24, h * 0.12, w * 0.48, h * 0.14, 4);
      ctx.fill();
      // Front glass
      ctx.fillStyle = '#0F172A';
      drawRoundedRect(ctx, -w * 0.42, -h * 0.47, w * 0.84, 11, 3);
      ctx.fill();
      // Bold BMTC label on roof
      ctx.fillStyle = primary;
      ctx.font = '800 10px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BMTC', 0, -h * 0.01);
      break;
    }

    case 'auto': {
      // Other Bengaluru Auto-Rickshaw in traffic
      const aw = Math.min(42, w * 0.96);
      const ah = Math.min(62, h * 0.96);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
      drawRoundedRect(ctx, -aw / 2 + 3, -ah / 2 + 4, aw, ah, 9);
      ctx.fill();
      // Lower green body
      ctx.fillStyle = obs.colorVariant % 2 === 0 ? '#047857' : '#0F766E';
      drawRoundedRect(ctx, -aw / 2, -ah / 2, aw, ah, 9);
      ctx.fill();
      ctx.strokeStyle = '#064E3B';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // Windshield
      ctx.fillStyle = '#1E293B';
      drawRoundedRect(ctx, -aw * 0.36, -ah * 0.36, aw * 0.72, ah * 0.18, 4);
      ctx.fill();
      // Yellow canopy roof
      ctx.fillStyle = obs.colorVariant % 2 === 0 ? '#FBBF24' : '#EAB308';
      drawRoundedRect(ctx, -aw * 0.4, -ah * 0.16, aw * 0.8, ah * 0.56, 6);
      ctx.fill();
      ctx.strokeStyle = '#A16207';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // Rear tail lights
      ctx.fillStyle = '#FCA5A5';
      ctx.fillRect(-aw * 0.34, ah * 0.42, 6, 3.5);
      ctx.fillRect(aw * 0.34 - 6, ah * 0.42, 6, 3.5);
      break;
    }

    case 'pedestrian': {
      // Animated pedestrian crossing the road
      const stride = Math.sin(timeSec * 10 + obs.wobblePhase) * 4.5;
      const shirtColors = ['#EC4899', '#8B5CF6', '#06B6D4', '#F59E0B', '#10B981'];
      const shirt = shirtColors[obs.colorVariant % shirtColors.length];
      // Ground shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.26)';
      ctx.beginPath();
      ctx.ellipse(2, 4, 11, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      // Stepping feet
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.ellipse(-4 + stride * 0.6, 5, 3.5, 2.5, 0, 0, Math.PI * 2);
      ctx.ellipse(4 - stride * 0.6, -4, 3.5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Shoulders / shirt
      ctx.fillStyle = shirt;
      drawRoundedRect(ctx, -10, -7, 20, 14, 6);
      ctx.fill();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Head
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'traffic_cop': {
      // Bengaluru Traffic Police (BTP) checkpoint during high chaos
      const flash = Math.floor(timeSec * 8) % 2 === 0;
      // Barricade
      ctx.fillStyle = '#FACC15';
      drawRoundedRect(ctx, -w * 0.48, -10, w * 0.96, 12, 3);
      ctx.fill();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // Blinking beacon
      ctx.fillStyle = flash ? '#EF4444' : '#3B82F6';
      ctx.beginPath();
      ctx.arc(-w * 0.34, -4, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? '#3B82F6' : '#EF4444';
      ctx.beginPath();
      ctx.arc(w * 0.34, -4, 4.5, 0, Math.PI * 2);
      ctx.fill();
      // Cop in crisp white Bengaluru Traffic Police uniform
      ctx.fillStyle = '#F8FAFC';
      drawRoundedRect(ctx, -9, 3, 18, 13, 5);
      ctx.fill();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Hat
      ctx.fillStyle = '#1E3A8A';
      ctx.beginPath();
      ctx.arc(0, 9, 5, 0, Math.PI * 2);
      ctx.fill();
      // BTP tag
      ctx.fillStyle = '#0F172A';
      ctx.font = '800 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BTP', 0, -4);
      break;
    }

    case 'bike': {
      const sway = Math.sin(timeSec * 3.5 + obs.wobblePhase) * 3.5;
      ctx.translate(sway, 0);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.26)';
      drawRoundedRect(ctx, -w * 0.4 + 3, -h * 0.45 + 4, w * 0.8, h * 0.9, 8);
      ctx.fill();
      // Scooter body
      ctx.fillStyle = obs.colorVariant % 2 === 0 ? '#F97316' : '#3B82F6';
      drawRoundedRect(ctx, -w * 0.34, -h * 0.44, w * 0.68, h * 0.88, 7);
      ctx.fill();
      // Handlebar
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-w * 0.56, -h * 0.24);
      ctx.lineTo(w * 0.56, -h * 0.24);
      ctx.stroke();
      // Rider helmet
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(0, 1, w * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.arc(-2, -1, w * 0.14, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'cow': {
      const sway = Math.sin(timeSec * 2 + obs.wobblePhase) * 3;
      ctx.translate(sway, 0);
      // Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.beginPath();
      ctx.ellipse(3, 4, w * 0.48, h * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      // Cow body (cream white, sideways slightly angled like wandering Bengaluru cow)
      ctx.rotate(0.28);
      ctx.fillStyle = '#FEF3C7';
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.46, h * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // Brown patches
      ctx.fillStyle = '#92400E';
      ctx.beginPath();
      ctx.ellipse(-5, -3, w * 0.16, h * 0.12, 0.4, 0, Math.PI * 2);
      ctx.ellipse(6, 5, w * 0.13, h * 0.1, -0.3, 0, Math.PI * 2);
      ctx.fill();
      // Head & horns
      ctx.fillStyle = '#FDE68A';
      ctx.beginPath();
      ctx.ellipse(w * 0.44, 0, 9, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.44, -6);
      ctx.lineTo(w * 0.56, -11);
      ctx.moveTo(w * 0.44, 6);
      ctx.lineTo(w * 0.56, 11);
      ctx.stroke();
      break;
    }

    case 'pothole': {
      // Cracked asphalt outer lip
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.54, h * 0.48, 0.15, 0, Math.PI * 2);
      ctx.fill();
      // Deep dark crater
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.ellipse(1, 2, w * 0.42, h * 0.36, -0.1, 0, Math.PI * 2);
      ctx.fill();
      // Muddy water gleam
      ctx.fillStyle = 'rgba(56, 189, 248, 0.32)';
      ctx.beginPath();
      ctx.ellipse(-4, -2, w * 0.2, h * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'speed_breaker': {
      const bh = Math.max(16, h * 0.46);
      // Base bevel
      ctx.fillStyle = '#1E293B';
      drawRoundedRect(ctx, -w / 2, -bh / 2, w, bh, 5);
      ctx.fill();
      // Bold yellow hazard stripes
      ctx.fillStyle = '#FACC15';
      const stripes = 5;
      const sw = w / (stripes * 2);
      for (let i = 0; i < stripes; i++) {
        ctx.fillRect(-w / 2 + i * sw * 2 + 2, -bh / 2 + 2, sw, bh - 4);
      }
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.5;
      drawRoundedRect(ctx, -w / 2, -bh / 2, w, bh, 5);
      ctx.stroke();
      break;
    }

    case 'traffic_jam': {
      const blink = Math.floor(timeSec * 4) % 2 === 0;
      const carH = h * 0.44;
      const offsets = [-h * 0.26, h * 0.26];
      offsets.forEach((oy, idx) => {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.3)';
        drawRoundedRect(ctx, -w * 0.44 + 3, oy - carH / 2 + 4, w * 0.88, carH, 8);
        ctx.fill();
        ctx.fillStyle = idx === 0 ? '#64748B' : '#DC2626';
        drawRoundedRect(ctx, -w * 0.44, oy - carH / 2, w * 0.88, carH, 8);
        ctx.fill();
        ctx.fillStyle = '#1E293B';
        drawRoundedRect(ctx, -w * 0.32, oy - carH * 0.25, w * 0.64, carH * 0.5, 4);
        ctx.fill();
        if (blink) {
          ctx.fillStyle = '#FBBF24';
          ctx.beginPath();
          ctx.arc(-w * 0.34, oy + carH * 0.44, 3.5, 0, Math.PI * 2);
          ctx.arc(w * 0.34, oy + carH * 0.44, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      break;
    }

    case 'rain_patch': {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.36)';
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.5, h * 0.45, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.65)';
      ctx.lineWidth = 1.5;
      const pulse = (timeSec * 1.4 + obs.wobblePhase) % 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.22 * (0.4 + pulse), h * 0.2 * (0.4 + pulse), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  anchorX: number,
  anchorY: number,
  canvasWidth: number,
  bubble: SpeechBubbleState,
  timeSec: number
) {
  const maxWidth = Math.min(280, canvasWidth - 32);
  const padX = 14;
  const padY = 10;

  const displayText = bubble.loading
    ? '…'.repeat(1) + (Math.floor(timeSec * 3) % 2 === 0 ? '' : ' ')
    : bubble.text;

  ctx.save();
  ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';

  // Word wrap
  const words = displayText.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth - padX * 2 && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0) lines.push('…');

  const speakerLabel = bubble.speaker.toUpperCase();
  ctx.font = '700 10px "Plus Jakarta Sans", system-ui, sans-serif';
  const speakerW = ctx.measureText(speakerLabel).width;

  ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
  const maxLineW = Math.max(
    speakerW + 12,
    ...lines.map((l) => ctx.measureText(l).width)
  );

  const boxW = Math.min(maxWidth, Math.max(110, maxLineW + padX * 2));
  const lineH = 18;
  const boxH = padY * 2 + 14 + lines.length * lineH;

  // Clamp box horizontally so it never clips off-screen
  const rawLeft = anchorX - boxW / 2;
  const boxLeft = Math.max(14, Math.min(canvasWidth - boxW - 14, rawLeft));
  const boxTop = Math.max(76, anchorY - boxH - 22);

  // Drop shadow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
  drawRoundedRect(ctx, boxLeft + 3, boxTop + 4, boxW, boxH, 12);
  ctx.fill();

  // Bubble background
  ctx.fillStyle = bubble.urgent ? '#FEF9C3' : '#FFFFFF';
  drawRoundedRect(ctx, boxLeft, boxTop, boxW, boxH, 12);
  ctx.fill();
  ctx.strokeStyle = bubble.urgent ? '#CA8A04' : '#0F172A';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Speech tail pointing toward auto
  const tailX = Math.max(boxLeft + 18, Math.min(boxLeft + boxW - 18, anchorX));
  ctx.fillStyle = bubble.urgent ? '#FEF9C3' : '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(tailX - 8, boxTop + boxH - 1);
  ctx.lineTo(tailX, boxTop + boxH + 10);
  ctx.lineTo(tailX + 8, boxTop + boxH - 1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = bubble.urgent ? '#CA8A04' : '#0F172A';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tailX - 8, boxTop + boxH);
  ctx.lineTo(tailX, boxTop + boxH + 10);
  ctx.lineTo(tailX + 8, boxTop + boxH);
  ctx.stroke();

  // Speaker kicker
  ctx.fillStyle = bubble.urgent ? '#A16207' : '#047857';
  ctx.font = '800 10px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(speakerLabel, boxLeft + padX, boxTop + padY - 1);

  // Dialogue lines
  ctx.fillStyle = '#0F172A';
  ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
  lines.forEach((line, idx) => {
    ctx.fillText(line, boxLeft + padX, boxTop + padY + 14 + idx * lineH);
  });

  ctx.restore();
}

export function renderGameFrame(ctx: CanvasRenderingContext2D, snap: RenderSnapshot) {
  const { width, height, playerMeters, weather, timeSec } = snap;
  const { roadWidth, roadLeft, laneWidth, pxPerMeter, playerScreenY } =
    computeRoadMetrics(width, height);

  ctx.save();
  ctx.translate(snap.shakeX, snap.shakeY);

  // 1. Lush Bengaluru avenue verges
  const vergeColor =
    weather === 'monsoon'
      ? '#166534'
      : weather === 'drizzle'
        ? '#15803D'
        : '#22C55E';
  ctx.fillStyle = vergeColor;
  ctx.fillRect(-12, -12, width + 24, height + 24);

  // Sidewalks flanking the road
  const sidewalkW = Math.min(48, Math.max(20, (roadLeft) * 0.42));
  ctx.fillStyle = weather === 'monsoon' ? '#CBD5E1' : '#E2E8F0';
  ctx.fillRect(roadLeft - sidewalkW, -12, sidewalkW, height + 24);
  ctx.fillRect(roadLeft + roadWidth, -12, sidewalkW, height + 24);

  // Classic Bengaluru yellow-and-black painted curbstones
  const curbStripePx = 28;
  const curbOffset = (playerMeters * pxPerMeter) % (curbStripePx * 2);
  for (let y = -curbStripePx * 2 + curbOffset; y < height + curbStripePx; y += curbStripePx) {
    const isYellow = Math.floor((y - curbOffset) / curbStripePx) % 2 === 0;
    ctx.fillStyle = isYellow ? '#FACC15' : '#1E293B';
    ctx.fillRect(roadLeft - 7, y, 7, curbStripePx);
    ctx.fillRect(roadLeft + roadWidth, y, 7, curbStripePx);
  }

  // 2. Main 3-lane tarmac
  ctx.fillStyle =
    weather === 'monsoon'
      ? '#1E293B'
      : weather === 'drizzle'
        ? '#293548'
        : '#334155';
  ctx.fillRect(roadLeft, -12, roadWidth, height + 24);

  // Subtle shoulder white lines
  ctx.fillStyle = 'rgba(248, 250, 252, 0.72)';
  ctx.fillRect(roadLeft + 5, -12, 3, height + 24);
  ctx.fillRect(roadLeft + roadWidth - 8, -12, 3, height + 24);

  // Dashed lane dividers (between lanes 0-1 and 1-2)
  const dashStep = 58;
  const dashOffset = (playerMeters * pxPerMeter) % dashStep;
  ctx.fillStyle = 'rgba(248, 250, 252, 0.85)';
  for (let laneDiv = 1; laneDiv <= 2; laneDiv++) {
    const x = roadLeft + laneDiv * laneWidth - 2;
    for (let y = -dashStep + dashOffset; y < height + dashStep; y += dashStep) {
      ctx.fillRect(x, y, 4, 28);
    }
  }

  // 3. Scrolling Bengaluru urban avenue: sidewalks, shops, terraces, side-lanes & Gulmohar clusters
  // Footpath paving seams
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.25)';
  ctx.lineWidth = 1;
  const tileStep = 34;
  const tileOff = (playerMeters * pxPerMeter) % tileStep;
  ctx.beginPath();
  for (let y = -tileStep + tileOff; y < height + tileStep; y += tileStep) {
    ctx.moveTo(roadLeft - sidewalkW, y);
    ctx.lineTo(roadLeft - 7, y);
    ctx.moveTo(roadLeft + roadWidth + 7, y);
    ctx.lineTo(roadLeft + roadWidth + sidewalkW, y);
  }
  ctx.stroke();

  const sceneryStepMeters = 16;
  const firstPropIdx = Math.floor((playerMeters - 30) / sceneryStepMeters);
  const lastPropIdx = Math.ceil((playerMeters + 95) / sceneryStepMeters);

  const drawBengaluruBuilding = (
    bx: number,
    by: number,
    bw: number,
    bh: number,
    seed: number,
    facingRight: boolean
  ) => {
    const shop = BENGALURU_SHOPS[seed % BENGALURU_SHOPS.length];

    // Ground shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
    drawRoundedRect(ctx, bx + 6, by + 7, bw, bh, 6);
    ctx.fill();

    // Colourful Bengaluru shop strip rooftop base
    ctx.fillStyle = shop.wall;
    drawRoundedRect(ctx, bx, by, bw, bh, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.28)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Inner parapet terrace
    ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
    drawRoundedRect(ctx, bx + 7, by + 7, bw - 14, bh - 14, 3);
    ctx.fill();

    // Striped colourful shop awning facing the road
    const awningW = 13;
    const awningX = facingRight ? bx + bw - awningW : bx;
    ctx.fillStyle = shop.awning;
    ctx.fillRect(awningX, by + 5, awningW, bh - 10);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (let sy = by + 9; sy < by + bh - 10; sy += 11) {
      ctx.fillRect(awningX, sy, awningW, 4.5);
    }

    // Bold painted shop signboard (DOSA, JUICE, BAKERY, PETROL, TEA, METRO, OFFICE)
    const signW = Math.max(46, bw - awningW - 14);
    const signH = 20;
    const signX = facingRight ? bx + 6 : bx + awningW + 7;
    const signY = by + (bh - signH) * 0.5;
    ctx.fillStyle = shop.signBg;
    drawRoundedRect(ctx, signX, signY, signW, signH, 4);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = shop.signText;
    ctx.font = '800 10px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shop.label, signX + signW * 0.5, signY + signH * 0.5 + 0.5);
  };

  for (let idx = firstPropIdx; idx <= lastPropIdx; idx++) {
    const worldM = idx * sceneryStepMeters;
    const sy = playerScreenY - (worldM - playerMeters) * pxPerMeter;
    if (sy < -110 || sy > height + 110) continue;
    const seed = Math.abs(idx * 31 + 7);

    // Occasional cross-street alley on outer flanks
    const isCrossStreet = idx % 5 === 0;
    const leftOuterEdge = roadLeft - sidewalkW;
    const rightOuterEdge = roadLeft + roadWidth + sidewalkW;

    if (isCrossStreet) {
      ctx.fillStyle = '#475569';
      if (leftOuterEdge > 20) {
        ctx.fillRect(-10, sy - 16, leftOuterEdge + 10, 32);
        ctx.fillStyle = 'rgba(248, 250, 252, 0.55)';
        for (let cx = 12; cx < leftOuterEdge - 14; cx += 34) {
          ctx.fillRect(cx, sy - 1.5, 16, 3);
        }
      }
      ctx.fillStyle = '#475569';
      if (width - rightOuterEdge > 20) {
        ctx.fillRect(rightOuterEdge, sy - 16, width - rightOuterEdge + 10, 32);
        ctx.fillStyle = 'rgba(248, 250, 252, 0.55)';
        for (let cx = rightOuterEdge + 14; cx < width - 12; cx += 34) {
          ctx.fillRect(cx, sy - 1.5, 16, 3);
        }
      }
      continue;
    }

    // Left avenue trees & layered Bengaluru neighborhood blocks
    const leftTreeX = leftOuterEdge - 26;
    if (leftTreeX > 18) {
      drawTree(ctx, leftTreeX, sy, seed);
    }
    if (leftOuterEdge > 110) {
      drawBengaluruBuilding(leftOuterEdge - 140, sy - 34, 86, 68, seed, true);
    }
    if (leftOuterEdge > 250) {
      drawBengaluruBuilding(leftOuterEdge - 255, sy - 26, 94, 72, seed + 3, true);
      if (idx % 2 === 0) {
        drawTree(ctx, leftOuterEdge - 295, sy + 18, seed + 9);
      }
    }
    if (leftOuterEdge > 380) {
      drawBengaluruBuilding(leftOuterEdge - 405, sy - 38, 102, 74, seed + 1, true);
    }

    // Right avenue trees & layered Bengaluru neighborhood blocks
    const rightTreeX = rightOuterEdge + 26;
    if (rightTreeX < width - 18) {
      drawTree(ctx, rightTreeX, sy + 14, seed + 5);
    }
    if (width - rightOuterEdge > 110) {
      drawBengaluruBuilding(rightOuterEdge + 56, sy - 28, 86, 68, seed + 2, false);
    }
    if (width - rightOuterEdge > 250) {
      drawBengaluruBuilding(rightOuterEdge + 165, sy - 36, 94, 72, seed + 4, false);
      if (idx % 2 === 1) {
        drawTree(ctx, rightOuterEdge + 295, sy + 12, seed + 11);
      }
    }
    if (width - rightOuterEdge > 380) {
      drawBengaluruBuilding(rightOuterEdge + 310, sy - 22, 102, 74, seed + 6, false);
    }
  }

  // 4. Bengaluru roadside landmark signboards from Gemini / Google Maps route segments
  const signboardItems: Array<{ label: string; atMeters: number }> = [];
  if (snap.segments && snap.segments.length > 0) {
    for (const seg of snap.segments) {
      const segStart = seg.startMeters ?? 0;
      const segEnd = seg.endMeters ?? snap.routeLengthMeters;
      const segLandmarks = seg.landmarks.length > 0 ? seg.landmarks : [seg.roadName];
      const segSpan = Math.max(80, segEnd - segStart);
      segLandmarks.forEach((lm, lmIdx) => {
        const lmMeters = segStart + ((lmIdx + 0.65) / (segLandmarks.length + 0.35)) * segSpan;
        signboardItems.push({ label: lm, atMeters: lmMeters });
      });
    }
  } else if (snap.landmarks.length > 0) {
    const spacing = Math.max(130, Math.floor(snap.routeLengthMeters / (snap.landmarks.length + 1)));
    snap.landmarks.forEach((lm, idx) => {
      signboardItems.push({ label: lm, atMeters: (idx + 1) * spacing });
    });
  }

  signboardItems.forEach((item, idx) => {
    const sy = playerScreenY - (item.atMeters - playerMeters) * pxPerMeter;
    if (sy > -50 && sy < height + 50) {
      const onRight = idx % 2 === 0;
      const sx = onRight ? roadLeft + roadWidth + 12 : roadLeft - 12;
      drawBengaluruSignboard(ctx, sx, sy, item.label, !onRight);
    }
  });

  // 5. Turn Point Junction Markings & Overhead Sign Gantries
  for (const tp of snap.turnPoints) {
    const sy = playerScreenY - (tp.atMeters - playerMeters) * pxPerMeter;
    if (sy < -140 || sy > height + 140) continue;

    // Painted lane directional arrows 22m before the junction
    const arrowY = sy + 20 * pxPerMeter;
    if (arrowY > -40 && arrowY < height + 40) {
      const arrows = ['←', '↑', '→'];
      const labels = ['L', 'M', 'R'];
      ctx.save();
      for (let lane = 0; lane < 3; lane++) {
        const lx = roadLeft + (lane + 0.5) * laneWidth;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        drawRoundedRect(ctx, lx - 20, arrowY - 26, 40, 52, 8);
        ctx.fill();
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '800 22px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(arrows[lane], lx, arrowY - 5);
        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.fillStyle = '#FEF08A';
        ctx.fillText(labels[lane], lx, arrowY + 15);
      }
      ctx.restore();
    }

    // Zebra crossing junction band
    const stripes = 9;
    const stripeW = roadWidth / (stripes * 2);
    ctx.fillStyle =
      tp.result === 'correct'
        ? 'rgba(34, 197, 94, 0.85)'
        : tp.result === 'wrong'
          ? 'rgba(239, 68, 68, 0.85)'
          : 'rgba(248, 250, 252, 0.82)';
    for (let s = 0; s < stripes; s++) {
      ctx.fillRect(roadLeft + s * stripeW * 2 + 4, sy - 10, stripeW, 20);
    }

    // Overhead Bengaluru green signal gantry bar
    ctx.fillStyle = '#065F46';
    drawRoundedRect(ctx, roadLeft - 6, sy - 38, roadWidth + 12, 24, 6);
    ctx.fill();
    ctx.strokeStyle = '#F8FAFC';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`JUNCTION · ${tp.landmark.toUpperCase()}`, roadLeft + roadWidth / 2, sy - 26);
  }

  // 6. Destination Checkered Finish Line & Arch
  if (!snap.isAmbient) {
    const finishY = playerScreenY - (snap.routeLengthMeters - playerMeters) * pxPerMeter;
    if (finishY > -120 && finishY < height + 100) {
      const cells = 12;
      const cellW = roadWidth / cells;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < cells; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#FACC15' : '#0F172A';
          ctx.fillRect(roadLeft + c * cellW, finishY - 12 + r * 12, cellW, 12);
        }
      }
      // Destination banner
      ctx.fillStyle = '#111827';
      drawRoundedRect(ctx, roadLeft + 10, finishY - 42, roadWidth - 20, 26, 6);
      ctx.fill();
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#FACC15';
      ctx.font = '800 12px "Bricolage Grotesque", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `DROP-OFF · ${snap.destinationName.toUpperCase().slice(0, 24)}`,
        roadLeft + roadWidth / 2,
        finishY - 29
      );
    }
  }

  // 7. Flat ground hazards first (rain_patch, pothole, speed_breaker)
  const groundTypes: ObstacleType[] = ['rain_patch', 'pothole', 'speed_breaker'];
  for (const obs of snap.obstacles) {
    if (!groundTypes.includes(obs.type)) continue;
    const sy = playerScreenY - (obs.atMeters - playerMeters) * pxPerMeter;
    if (sy < -120 || sy > height + 120) continue;
    const cx = roadLeft + (obs.lane + 0.5) * laneWidth;
    drawObstacle(ctx, obs, cx, sy, laneWidth, pxPerMeter, timeSec);
  }

  // 8. Solid vehicles, pedestrians, cows & traffic cops
  for (const obs of snap.obstacles) {
    if (groundTypes.includes(obs.type)) continue;
    const sy = playerScreenY - (obs.atMeters - playerMeters) * pxPerMeter;
    if (sy < -150 || sy > height + 150) continue;
    const effectiveLane = typeof obs.lanePos === 'number' ? obs.lanePos : obs.lane;
    const cx = roadLeft + (effectiveLane + 0.5) * laneWidth;
    drawObstacle(ctx, obs, cx, sy, laneWidth, pxPerMeter, timeSec);
  }

  // 9. Pooled particles (exhaust, sparks, splashes, confetti) — toggled by E (vfxEnabled)
  const vfxOn = snap.vfxEnabled !== false;
  if (vfxOn) {
    for (let i = 0; i < snap.particles.length; i++) {
      const p = snap.particles[i];
      if (!p.active) continue;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 10. Player Yellow-and-Green Bengaluru Auto-Rickshaw
  const playerX = roadLeft + (snap.playerLanePos + 0.5) * laneWidth;
  drawAutoRickshaw(
    ctx,
    playerX,
    playerScreenY,
    laneWidth,
    snap.playerLean,
    snap.braking,
    vfxOn && snap.hitFlashSec > 0,
    vfxOn ? snap.bouncePhase : 0,
    timeSec
  );

  // 11. Floating callout cues near auto
  for (const c of snap.callouts) {
    const alpha = Math.min(1, c.life / (c.maxLife * 0.45));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '800 13px "Bricolage Grotesque", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0F172A';
    ctx.strokeText(c.text, playerX, playerScreenY - 46 + c.yOffset);
    ctx.fillStyle = c.color;
    ctx.fillText(c.text, playerX, playerScreenY - 46 + c.yOffset);
    ctx.restore();
  }

  // 12. Weather rain streaks overlay (drizzle / monsoon)
  if (vfxOn && (weather === 'drizzle' || weather === 'monsoon')) {
    const dropCount = weather === 'monsoon' ? 68 : 28;
    ctx.strokeStyle =
      weather === 'monsoon'
        ? 'rgba(186, 230, 253, 0.55)'
        : 'rgba(224, 242, 254, 0.38)';
    ctx.lineWidth = weather === 'monsoon' ? 1.8 : 1.2;
    ctx.beginPath();
    for (let i = 0; i < dropCount; i++) {
      const rx = ((i * 97 + timeSec * 120) % (width + 60)) - 30;
      const ry = ((i * 151 + timeSec * 720) % (height + 60)) - 30;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 4, ry + (weather === 'monsoon' ? 18 : 11));
    }
    ctx.stroke();
  }

  // 13. Speech bubble right above the auto-rickshaw
  if (!snap.isAmbient && snap.speechBubble) {
    drawSpeechBubble(
      ctx,
      playerX,
      playerScreenY - 34,
      width,
      snap.speechBubble,
      timeSec
    );
  }

  ctx.restore();
}
