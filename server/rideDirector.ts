import { GoogleGenAI, ThinkingLevel, Type, type Schema } from '@google/genai';
import type {
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
} from '../src/types/rideDirector.ts';

const MODEL_NAME = 'gemini-3.1-flash-lite';

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Set it in Settings > Secrets.'
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

async function callGeminiJson<T>(
  systemInstruction: string,
  userPrompt: string,
  responseSchema: Schema
): Promise<T> {
  const ai = getClient();
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        throw new Error('Empty JSON response returned by Gemini.');
      }
      return JSON.parse(rawText) as T;
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const isTransient =
        message.includes('503') ||
        message.includes('500') ||
        message.includes('DEADLINE_EXCEEDED') ||
        message.includes('fetch failed');
      if (!isTransient || attempt === 1) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  throw lastError;
}

const RIDE_START_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    passenger: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Realistic Bengaluru passenger name' },
        persona: {
          type: Type.STRING,
          description: 'Short colorful persona, e.g. stressed Koramangala startup founder or cheerful Malleswaram auntie',
        },
        languageStyle: {
          type: Type.STRING,
          enum: ['English', 'Kannada-English', 'Hinglish'],
        },
        pickup: { type: Type.STRING, description: 'Bengaluru pickup locality or landmark' },
        destination: { type: Type.STRING, description: 'Bengaluru drop-off locality or landmark' },
        openingLine: {
          type: Type.STRING,
          description: 'Punchy 1-2 sentence opening line in languageStyle asking for a ride and stating the fare',
        },
        fareOffer: {
          type: Type.INTEGER,
          description: 'Initial fare offered in Indian Rupees (e.g. 80 to 320)',
        },
      },
      required: [
        'name',
        'persona',
        'languageStyle',
        'pickup',
        'destination',
        'openingLine',
        'fareOffer',
      ],
    },
    route: {
      type: Type.OBJECT,
      properties: {
        landmarks: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '4 to 6 real Bengaluru landmarks passed along the road (e.g. Silk Board, Forum Mall, Sony World, Indiranagar 100ft Rd, MG Road)',
        },
        lengthMeters: {
          type: Type.INTEGER,
          description: 'Route distance in meters between 700 and 1200',
        },
        weather: {
          type: Type.STRING,
          enum: ['sunny', 'overcast', 'drizzle', 'monsoon'],
        },
        trafficDensity: {
          type: Type.INTEGER,
          description: 'Traffic intensity from 1 to 10',
        },
        events: {
          type: Type.ARRAY,
          description: '14 to 28 road obstacles spaced between 140m and lengthMeters-80m across lanes 0, 1, 2',
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                enum: [
                  'car',
                  'bus',
                  'bike',
                  'cow',
                  'pothole',
                  'speed_breaker',
                  'traffic_jam',
                  'rain_patch',
                ],
              },
              atMeters: { type: Type.INTEGER },
              lane: { type: Type.INTEGER, description: '0 = left, 1 = middle, 2 = right' },
            },
            required: ['type', 'atMeters', 'lane'],
          },
        },
        turnPoints: {
          type: Type.ARRAY,
          description: '2 or 3 major junction turn points evenly spaced along the route',
          items: {
            type: Type.OBJECT,
            properties: {
              atMeters: { type: Type.INTEGER },
              correctLane: { type: Type.INTEGER, description: '0 = left, 1 = middle, 2 = right' },
              landmark: { type: Type.STRING, description: 'Bengaluru junction or landmark name' },
            },
            required: ['atMeters', 'correctLane', 'landmark'],
          },
        },
      },
      required: [
        'landmarks',
        'lengthMeters',
        'weather',
        'trafficDensity',
        'events',
        'turnPoints',
      ],
    },
  },
  required: ['passenger', 'route'],
};

const BARGAIN_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description: 'Short witty passenger response to the +₹20 counter-offer in their languageStyle (max 22 words)',
    },
    acceptedFare: {
      type: Type.INTEGER,
      description: 'Final agreed fare in INR (either original fare, halfway +10, or full counter +20)',
    },
    outcome: {
      type: Type.STRING,
      enum: ['accepted', 'halfway', 'refused'],
    },
  },
  required: ['reply', 'acceptedFare', 'outcome'],
};

const TURN_DIRECTION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    direction: {
      type: Type.STRING,
      description: 'Ultra-short clear lane instruction (max 12 words) in the passenger languageStyle mentioning left/middle/right and the landmark',
    },
  },
  required: ['direction'],
};

const REACTION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    line: {
      type: Type.STRING,
      description: 'Exactly ONE short funny reaction line (max 15 words) in the passenger languageStyle reacting specifically to the event',
    },
  },
  required: ['line'],
};

const RIDE_END_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    story: {
      type: Type.STRING,
      description: '2 to 3 funny sentences in the passenger voice recapping this Bengaluru auto ride and referencing actual stats',
    },
    rating: {
      type: Type.INTEGER,
      description: 'Passenger star rating from 1 to 5 based on mood, crashes, turns, and completion',
    },
    nextDifficulty: {
      type: Type.OBJECT,
      properties: {
        trafficDensity: { type: Type.INTEGER, description: 'Next ride traffic density 1-10' },
        timerSeconds: { type: Type.INTEGER, description: 'Next ride countdown timer in seconds (38-65)' },
        obstacleMix: {
          type: Type.STRING,
          description: 'Short description of next ride road hazards (e.g. BMTC buses, stray cows, Silk Board jams)',
        },
        fareMultiplier: {
          type: Type.NUMBER,
          description: 'Fare multiplier for next ride (0.8 to 2.2). Higher after good rides, lower after bad rides',
        },
      },
      required: ['trafficDensity', 'timerSeconds', 'obstacleMix', 'fareMultiplier'],
    },
  },
  required: ['story', 'rating', 'nextDifficulty'],
};

export async function generateRideStart(
  req: RideStartRequest
): Promise<RideStartResponse> {
  const baseFare = Math.round(120 * req.currentDifficulty.fareMultiplier);
  const systemInstruction = `You are the Ride Director AI for "Rickshaw Rumble", a lively arcade auto-rickshaw driving game set in Bengaluru, India.
Create vivid, authentic, witty Bengaluru passengers and playable 3-lane routes.
Rules:
- Vary passenger personas and languageStyle across rides ("English", "Kannada-English" with natural words like macha/guru/swalpa/left thogo/ayyo, or "Hinglish" with bhaiya/yaar/arre/jaldi).
- Scale fareOffer near ₹${baseFare} (±25 INR) using the current fareMultiplier (${req.currentDifficulty.fareMultiplier.toFixed(2)}x).
- Route lengthMeters should be 750 to 1100.
- Place 16 to 26 varied obstacles in events between atMeters 150 and lengthMeters - 90. Never block all 3 lanes at the same meter! Space obstacles at least 25m apart in the same lane.
- Place 2 or 3 turnPoints evenly spaced (e.g., around 32%, 65%, 86% of lengthMeters) with real Bengaluru junction names (Silk Board, Forum Mall Signal, Sony World, Domlur Flyover, Trinity Circle, Mekhri Circle, Indiranagar 100ft Rd, Koramangala BDA, MG Road Metro, Tin Factory).
- Return strictly valid JSON matching the schema.`;

  const userPrompt = JSON.stringify({
    rideNumber: req.rideNumber,
    currentDifficulty: req.currentDifficulty,
    previousRideStats: req.previousRideStats,
    instruction:
      'Generate the next unique passenger, fareOffer, and full Bengaluru route with obstacles and turnPoints.',
  });

  return callGeminiJson<RideStartResponse>(
    systemInstruction,
    userPrompt,
    RIDE_START_SCHEMA
  );
}

export async function generateBargainReply(
  req: BargainRequest
): Promise<BargainResponse> {
  const halfwayFare = Math.round((req.currentFare + req.counterFare) / 2);
  const systemInstruction = `You are roleplaying a Bengaluru auto-rickshaw passenger bargaining with the driver before starting the ride.
Stay strictly in the passenger's persona and languageStyle.
Decide realistically based on the persona whether to:
- "accepted": agree to the counterFare (₹${req.counterFare})
- "halfway": meet in the middle at ₹${halfwayFare}
- "refused": stick firmly to currentFare (₹${req.currentFare})
Keep the reply punchy, witty, authentic Bengaluru banter (max 22 words). Return valid JSON.`;

  const userPrompt = JSON.stringify({
    passenger: {
      name: req.passenger.name,
      persona: req.passenger.persona,
      languageStyle: req.passenger.languageStyle,
      pickup: req.passenger.pickup,
      destination: req.passenger.destination,
    },
    currentFare: req.currentFare,
    driverCounterFare: req.counterFare,
    halfwayOption: halfwayFare,
    rideNumber: req.rideNumber,
  });

  return callGeminiJson<BargainResponse>(
    systemInstruction,
    userPrompt,
    BARGAIN_SCHEMA
  );
}

export async function generateTurnDirection(
  req: TurnDirectionRequest
): Promise<TurnDirectionResponse> {
  const laneLabel =
    req.correctLane === 0
      ? 'LEFT lane'
      : req.correctLane === 1
        ? 'MIDDLE (straight) lane'
        : 'RIGHT lane';

  const systemInstruction = `You are a passenger sitting in the back of a Bengaluru auto-rickshaw giving an urgent, crystal-clear lane direction for an upcoming junction.
Rules:
- Maximum 12 words!
- MUST clearly state whether to take LEFT, MIDDLE/STRAIGHT, or RIGHT so the player knows which lane to steer into.
- Mention the landmark name.
- Match the passenger's exact languageStyle ("English", "Kannada-English", or "Hinglish") and current mood (0-100).`;

  const userPrompt = JSON.stringify({
    passenger: {
      name: req.passenger.name,
      persona: req.passenger.persona,
      languageStyle: req.passenger.languageStyle,
    },
    upcomingLandmark: req.landmark,
    requiredLane: laneLabel,
    passengerMood: req.mood,
  });

  return callGeminiJson<TurnDirectionResponse>(
    systemInstruction,
    userPrompt,
    TURN_DIRECTION_SCHEMA
  );
}

export async function generateRideReaction(
  req: RideReactionRequest
): Promise<RideReactionResponse> {
  const systemInstruction = `You are a passenger in a moving Bengaluru auto-rickshaw reacting live to what just happened on the road.
Rules:
- Output ONE sharp, funny line — MAXIMUM 15 words!
- React specifically to the exact eventType and detail provided.
- Match the passenger's persona, languageStyle ("English", "Kannada-English", or "Hinglish"), and current mood (0-100).
- Never use hashtags or emojis.`;

  const userPrompt = JSON.stringify({
    passenger: {
      name: req.passenger.name,
      persona: req.passenger.persona,
      languageStyle: req.passenger.languageStyle,
    },
    eventType: req.eventType,
    detail: req.detail,
    mood: Math.round(req.mood),
    speedKmh: Math.round(req.speedKmh),
    remainingMeters: Math.round(req.remainingMeters),
    timeRemainingSeconds: Math.round(req.timeRemainingSeconds),
  });

  return callGeminiJson<RideReactionResponse>(
    systemInstruction,
    userPrompt,
    REACTION_SCHEMA
  );
}

export async function generateRideEnd(
  req: RideEndRequest
): Promise<RideEndResponse> {
  const systemInstruction = `You are the Ride Director AI for "Rickshaw Rumble" wrapping up a completed (or timed-out) Bengaluru auto-rickshaw ride.
Rules:
- Write a hilarious 2-3 sentence story in the passenger's own voice and languageStyle referencing their actual trip stats (crashes, near-misses, wrong turns, speed, mood, destination).
- Assign a fair star rating (1 to 5): 5 for clean fast arrival with high mood, 1-2 for timeout or heavy crashes/wrong turns.
- Compute nextDifficulty adaptively:
  - Good ride (completed, rating >= 4): increase fareMultiplier by +0.15 to +0.25 (up to 2.2), nudge trafficDensity up (+1, max 10), tighten timer slightly (min 40s), spice up obstacleMix.
  - Average ride (rating 3): keep fareMultiplier steady or +0.05, moderate traffic.
  - Rough ride (timed out or rating <= 2): lower fareMultiplier by -0.15 (min 0.8), ease trafficDensity (-1, min 2), add a few timer seconds (max 62s).`;

  const userPrompt = JSON.stringify({
    rideNumber: req.rideNumber,
    passenger: req.passenger,
    stats: {
      completed: req.completed,
      timeElapsedSeconds: Number(req.timeElapsedSeconds.toFixed(1)),
      timeRemainingSeconds: Number(req.timeRemainingSeconds.toFixed(1)),
      crashes: req.crashes,
      nearMisses: req.nearMisses,
      wrongTurns: req.wrongTurns,
      correctTurns: req.correctTurns,
      avgSpeedKmh: Math.round(req.avgSpeedKmh),
      fare: req.fare,
      finalMood: Math.round(req.finalMood),
    },
    currentDifficulty: req.currentDifficulty,
  });

  return callGeminiJson<RideEndResponse>(
    systemInstruction,
    userPrompt,
    RIDE_END_SCHEMA
  );
}
