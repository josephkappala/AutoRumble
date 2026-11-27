import type {
  AgentLogEntry,
  AgentTrigger,
  BargainRequest,
  BargainResponse,
  RideEndRequest,
  RideEndResponse,
  RideReactionRequest,
  RideReactionResponse,
  RideStartRequest,
  RideStartResponse,
  TurnDirectionRequest,
  TurnDirectionResponse,
} from '../types/rideDirector';

type LogListener = (entry: AgentLogEntry) => void;

class RideDirectorClient {
  private listeners = new Set<LogListener>();
  private counter = 0;

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(entry: AgentLogEntry) {
    for (const listener of this.listeners) {
      listener(entry);
    }
  }

  private async post<TReq, TRes>(
    endpoint: string,
    trigger: AgentTrigger,
    inputSummary: string,
    body: TReq,
    prefetched = false
  ): Promise<TRes> {
    const id = `rd-${Date.now()}-${++this.counter}`;
    const timestamp = new Date().toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const pendingEntry: AgentLogEntry = {
      id,
      timestamp,
      trigger,
      prefetched,
      inputSummary,
      responseJson: null,
      error: null,
      latencyMs: null,
      status: 'pending',
    };
    this.emit(pendingEntry);

    const t0 = performance.now();
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => ({}));
      const latencyMs =
        typeof payload.latencyMs === 'number'
          ? payload.latencyMs
          : Math.round(performance.now() - t0);

      if (!response.ok || payload.error) {
        const errMsg =
          payload.error || `HTTP ${response.status} from Ride Director API`;
        this.emit({
          ...pendingEntry,
          error: errMsg,
          latencyMs,
          status: 'error',
        });
        throw new Error(errMsg);
      }

      this.emit({
        ...pendingEntry,
        responseJson: payload.data,
        latencyMs,
        status: 'success',
      });

      return payload.data as TRes;
    } catch (err) {
      const latencyMs = Math.round(performance.now() - t0);
      const errMsg = err instanceof Error ? err.message : String(err);
      this.emit({
        ...pendingEntry,
        error: errMsg,
        latencyMs,
        status: 'error',
      });
      throw err;
    }
  }

  startRide(req: RideStartRequest): Promise<RideStartResponse> {
    const summary = `Ride #${req.rideNumber} · traffic ${req.currentDifficulty.trafficDensity}/10 · ${req.currentDifficulty.fareMultiplier.toFixed(2)}x fare`;
    return this.post('/api/ride-director/start', 'ride_start', summary, req);
  }

  bargainFare(req: BargainRequest): Promise<BargainResponse> {
    const summary = `${req.passenger.name} (${req.passenger.languageStyle}) · ₹${req.currentFare} -> ₹${req.counterFare}`;
    return this.post('/api/ride-director/bargain', 'bargain', summary, req);
  }

  getTurnDirection(
    req: TurnDirectionRequest,
    prefetched = false
  ): Promise<TurnDirectionResponse> {
    const laneTxt =
      req.correctLane === 0 ? 'Left' : req.correctLane === 1 ? 'Middle' : 'Right';
    const summary = `${req.landmark} -> ${laneTxt} lane · mood ${Math.round(req.mood)}`;
    return this.post(
      '/api/ride-director/turn',
      'turn',
      summary,
      req,
      prefetched
    );
  }

  getRideReaction(
    req: RideReactionRequest,
    prefetched = false
  ): Promise<RideReactionResponse> {
    const summary = `${req.detail} · mood ${Math.round(req.mood)} · ${Math.round(req.speedKmh)} km/h`;
    return this.post(
      '/api/ride-director/reaction',
      req.eventType,
      summary,
      req,
      prefetched
    );
  }

  finishRide(req: RideEndRequest): Promise<RideEndResponse> {
    const summary = `Ride #${req.rideNumber} ${req.completed ? 'completed' : 'timed out'} · ${req.crashes} crashes · ₹${req.fare}`;
    return this.post('/api/ride-director/end', 'ride_end', summary, req);
  }
}

export const rideDirectorClient = new RideDirectorClient();
