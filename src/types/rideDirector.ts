export type LanguageStyle = 'English' | 'Kannada-English' | 'Hinglish';

export type ObstacleType =
  | 'car'
  | 'bus'
  | 'bike'
  | 'cow'
  | 'pothole'
  | 'speed_breaker'
  | 'traffic_jam'
  | 'rain_patch';

export type WeatherType = 'sunny' | 'overcast' | 'drizzle' | 'monsoon';

export interface PassengerProfile {
  name: string;
  persona: string;
  languageStyle: LanguageStyle;
  pickup: string;
  destination: string;
  openingLine: string;
  fareOffer: number;
}

export interface RouteEvent {
  type: ObstacleType;
  atMeters: number;
  lane: 0 | 1 | 2;
}

export interface TurnPoint {
  atMeters: number;
  correctLane: 0 | 1 | 2;
  landmark: string;
}

export interface RoutePlan {
  landmarks: string[];
  lengthMeters: number;
  weather: WeatherType;
  trafficDensity: number; // 1-10
  events: RouteEvent[];
  turnPoints: TurnPoint[];
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

export interface BargainResponse {
  reply: string;
  acceptedFare: number;
  outcome: 'accepted' | 'halfway' | 'refused';
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
  | 'wrong_turn';

export interface RideReactionRequest {
  passenger: PassengerProfile;
  eventType: ReactionEventType;
  detail: string;
  mood: number;
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
  timeElapsedSeconds: number;
  timeRemainingSeconds: number;
  crashes: number;
  nearMisses: number;
  wrongTurns: number;
  correctTurns: number;
  avgSpeedKmh: number;
  fare: number;
  finalMood: number;
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
  | 'turn'
  | 'crash'
  | 'near_miss'
  | 'pothole'
  | 'speed_breaker'
  | 'halfway'
  | 'slow_driving'
  | 'wrong_turn'
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
