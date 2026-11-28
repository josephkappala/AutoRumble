export type LanguageStyle = 'English' | 'Kannada-English';

export type ObstacleType =
  | 'car'
  | 'bus'
  | 'auto'
  | 'bike'
  | 'pedestrian'
  | 'cow'
  | 'pothole'
  | 'speed_breaker'
  | 'traffic_jam'
  | 'traffic_cop'
  | 'rain_patch';

export type WeatherType = 'sunny' | 'overcast' | 'drizzle' | 'monsoon';

export interface PassengerProfile {
  name: string;
  persona: string;
  languageStyle: LanguageStyle;
  pickup: string;
  destination: string;
  openingLine: string;
  openingLineEnglish?: string;
  fareOffer: number;
}

export interface RouteEvent {
  type: ObstacleType;
  atMeters: number;
  lane: 0 | 1 | 2;
}

export interface RouteSegment {
  roadName: string;
  lengthMeters: number;
  startMeters?: number;
  endMeters?: number;
  landmarks: string[];
  hotspot?: string | null;
}

export interface TodayHotspot {
  location: string;
  reason: string;
  matchedRoad?: string;
}

export interface TurnPoint {
  atMeters: number;
  correctLane: 0 | 1 | 2;
  direction?: 'left' | 'straight' | 'right';
  landmark: string;
}

export interface RoutePlan {
  landmarks: string[];
  lengthMeters: number;
  weather: WeatherType;
  trafficDensity: number; // 1-10
  events: RouteEvent[];
  turnPoints: TurnPoint[];
  segments?: RouteSegment[];
  mapsGrounded?: boolean;
  mapsError?: string | null;
  todayHotspots?: TodayHotspot[];
  mapsSources?: Array<{ title: string; uri: string }>;
}

export interface DifficultyConfig {
  trafficDensity: number; // 1-10
  timerSeconds: number;
  obstacleMix: string;
  fareMultiplier: number;
}

export interface PreviousRideStats {
  rideNumber: number;
  completed: boolean;
  timeElapsedSeconds: number;
  timeRemainingSeconds: number;
  crashes: number;
  nearMisses: number;
  wrongTurns: number;
  correctTurns: number;
  avgSpeedKmh: number;
  fareEarned: number;
  finalMood: number;
  rating?: number;
}

// 1. Ride Start
export interface RideStartRequest {
  rideNumber: number;
  currentDifficulty: DifficultyConfig;
  previousRideStats: PreviousRideStats | null;
}

export interface RideStartResponse {
  passenger: PassengerProfile;
  route: RoutePlan;
}

// 2. Fare Bargaining
export interface BargainRequest {
  passenger: PassengerProfile;
  currentFare: number;
  counterFare: number;
  rideNumber: number;
}

export interface VoiceBargainRequest {
  passenger: PassengerProfile;
  currentFare: number;
  rideNumber: number;
  audioBase64: string;
  mimeType: string;
}

export interface BargainResponse {
  heardText?: string;
  reply: string;
  acceptedFare: number;
  outcome: 'accepted' | 'halfway' | 'refused';
}

export interface VoiceBargainResponse extends BargainResponse {
  heardText: string;
}

// 2b. Passenger Text-to-Speech
export interface TtsRequest {
  text: string;
  passenger: Pick<PassengerProfile, 'name' | 'persona' | 'languageStyle'>;
  urgent?: boolean;
}

export interface TtsResponse {
  audioBase64: string;
  mimeType: string;
  voiceName: string;
}

// 3. Turn Direction
export interface TurnDirectionRequest {
  passenger: PassengerProfile;
  landmark: string;
  correctLane: 0 | 1 | 2;
  mood: number;
  distanceToTurnMeters: number;
}

export interface TurnDirectionResponse {
  direction: string;
}

// 4. Live Ride Reaction
export type ReactionEventType =
  | 'crash'
  | 'near_miss'
  | 'pothole'
  | 'speed_breaker'
  | 'halfway'
  | 'slow_driving'
  | 'wrong_turn'
  | 'chaos_50'
  | 'chaos_80'
  | 'combo_x3'
  | 'traffic_cop';

export interface RideReactionRequest {
  passenger: PassengerProfile;
  eventType: ReactionEventType;
  detail: string;
  mood: number;
  chaos?: number;
  combo?: number;
  speedKmh: number;
  remainingMeters: number;
  timeRemainingSeconds: number;
}

export interface RideReactionResponse {
  line: string;
}

// 5. Ride End
export interface RideEndRequest {
  rideNumber: number;
  passenger: PassengerProfile;
  completed: boolean;
  gameOver?: boolean;
  timeElapsedSeconds: number;
  timeRemainingSeconds: number;
  crashes: number;
  nearMisses: number;
  wrongTurns: number;
  correctTurns: number;
  avgSpeedKmh: number;
  fare: number;
  finalMood: number;
  avgChaos?: number;
  peakChaos?: number;
  score?: number;
  livesRemaining?: number;
  currentDifficulty: DifficultyConfig;
}

export interface RideEndResponse {
  story: string;
  rating: number;
  nextDifficulty: DifficultyConfig;
}

// Agent Log Entry
export type AgentTrigger =
  | 'ride_start'
  | 'bargain'
  | 'voice_bargain'
  | 'turn'
  | 'crash'
  | 'near_miss'
  | 'pothole'
  | 'speed_breaker'
  | 'halfway'
  | 'slow_driving'
  | 'wrong_turn'
  | 'chaos_50'
  | 'chaos_80'
  | 'combo_x3'
  | 'traffic_cop'
  | 'ride_end';

export interface AgentLogEntry {
  id: string;
  timestamp: string;
  trigger: AgentTrigger;
  prefetched?: boolean;
  inputSummary: string;
  responseJson: unknown | null;
  error: string | null;
  latencyMs: number | null;
  status: 'pending' | 'success' | 'error';
}

export type GamePhase =
  | 'title'
  | 'loading_ride'
  | 'bargaining'
  | 'playing'
  | 'paused'
  | 'summary';
