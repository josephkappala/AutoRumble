import { GoogleGenAI, Modality, ThinkingLevel, Type, type ContentListUnion, type Schema } from '@google/genai';
import type {
  BargainRequest,
  BargainResponse,
  ObstacleType,
  PassengerProfile,
  RideEndRequest,
  RideEndResponse,
  RideReactionRequest,
  RideReactionResponse,
  RideStartRequest,
  RideStartResponse,
  RouteEvent,
  RouteSegment,
  TodayHotspot,
  TtsRequest,
  TtsResponse,
  TurnDirectionRequest,
  TurnDirectionResponse,
  TurnPoint,
  VoiceBargainRequest,
  VoiceBargainResponse,
} from '../src/types/rideDirector.ts';

const MODEL_NAME = 'gemini-3.1-flash-lite';
const GROUNDING_MODEL = 'gemini-3.8-flash';
const TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-preview-tts'];
const BENGALURU_LAT_LNG = { latitude: 12.9716, longitude: 77.5946 };

interface CachedHotspots {
  fetchedAt: number;
  hotspots: TodayHotspot[];
}

let cachedHotspots: CachedHotspots | null = null;
const HOTSPOT_CACHE_TTL_MS = 30 * 60 * 1000;

let cachedClient: GoogleGenAI | null = null;
let cachedTtsClient: GoogleGenAI | null = null;

export function resetCachedClient(): void {
  cachedClient = null;
  cachedTtsClient = null;
}

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

function getTtsClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Set it in Settings > Secrets.'
    );
  }
  if (!cachedTtsClient) {
    cachedTtsClient = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedTtsClient;
}

async function callGeminiJson<T>(
  systemInstruction: string,
  contents: ContentListUnion,
  responseSchema: Schema
): Promise<T> {
  const ai = getClient();
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents,
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
          description:
            'Punchy 1-2 sentence opening line spoken in languageStyle (authentic Kannada-English, Hinglish, or Bengaluru English) asking for a ride and stating the fare',
        },
        openingLineEnglish: {
          type: Type.STRING,
          description:
            'Clear, natural English translation of openingLine for on-screen display',
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
        'openingLineEnglish',
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
                  'auto',
                  'bike',
                  'pedestrian',
                  'cow',
                  'pothole',
                  'speed_breaker',
                  'traffic_jam',
                  'traffic_cop',
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

const VOICE_BARGAIN_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    heardText: {
      type: Type.STRING,
      description:
        'Accurate transcription of what the auto-rickshaw driver said in the audio clip (keep natural English, Kannada-English, or Hinglish phrasing). If silent or unintelligible, return "(inaudible)".',
    },
    reply: {
      type: Type.STRING,
      description:
        'Short witty passenger response to the driver spoken counter-offer in the passenger languageStyle (max 22 words)',
    },
    acceptedFare: {
      type: Type.INTEGER,
      description:
        'Final agreed fare in Indian Rupees based on the driver spoken counter-offer and passenger persona',
    },
    outcome: {
      type: Type.STRING,
      enum: ['accepted', 'halfway', 'refused'],
    },
  },
  required: ['heardText', 'reply', 'acceptedFare', 'outcome'],
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

interface RawMapsRoute {
  segments: Array<{
    roadName: string;
    lengthMeters: number;
    landmarks: string[];
  }>;
  turnPoints: Array<{
    atMeters: number;
    direction: string;
    landmark: string;
  }>;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function extractJsonObject<T>(rawText: string): T {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as T;
  }
  return JSON.parse(candidate) as T;
}

function directionToLane(dir: string): {
  correctLane: 0 | 1 | 2;
  direction: 'left' | 'straight' | 'right';
} {
  const lower = (dir || '').toLowerCase();
  if (lower.includes('left')) return { correctLane: 0, direction: 'left' };
  if (lower.includes('right')) return { correctLane: 2, direction: 'right' };
  return { correctLane: 1, direction: 'straight' };
}

async function fetchMapsGroundedRoute(
  pickup: string,
  destination: string
): Promise<{
  route: RawMapsRoute;
  sources: Array<{ title: string; uri: string }>;
}> {
  const ai = getClient();
  const prompt = `Using Google Maps in Bengaluru, India, give the real driving route from "${pickup}" to "${destination}".
Return ONLY a single raw JSON object (no markdown fences, no commentary) with this exact shape:
{
  "segments": [
    { "roadName": "Hosur Road", "lengthMeters": 1800, "landmarks": ["Forum Mall", "St. John's Hospital"] }
  ],
  "turnPoints": [
    { "atMeters": 1800, "direction": "left", "landmark": "Marathahalli Bridge" }
  ]
}
Rules:
- Provide 2 to 4 real consecutive road segments (actual Bengaluru road names like "Hosur Road", "Outer Ring Road", "100 Feet Road", "MG Road", "HAL Old Airport Road", "Bannerghatta Road", "Bellary Road", "Sarjapur Road").
- Each segment must include 2 to 3 real Bengaluru landmarks located along that road.
- Provide 2 or 3 real turnPoints along the route with cumulative atMeters, direction ("left", "straight", or "right"), and real junction/landmark name.`;

  const response = await ai.models.generateContent({
    model: GROUNDING_MODEL,
    contents: prompt,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: BENGALURU_LAT_LNG,
        },
      },
    },
  });

  const text = (response.text ?? '').trim();
  if (!text) {
    throw new Error('Google Maps grounding returned an empty response.');
  }

  const parsed = extractJsonObject<RawMapsRoute>(text);
  if (!Array.isArray(parsed.segments) || parsed.segments.length === 0) {
    throw new Error('Google Maps grounding returned no valid road segments.');
  }

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources: Array<{ title: string; uri: string }> = [];
  for (const chunk of chunks) {
    const maps = (chunk as { maps?: { title?: string; uri?: string } }).maps;
    if (maps?.uri) {
      sources.push({
        title: maps.title || 'Google Maps',
        uri: maps.uri,
      });
    }
  }

  return { route: parsed, sources };
}

async function fetchTodayBengaluruHotspots(): Promise<TodayHotspot[]> {
  if (cachedHotspots && Date.now() - cachedHotspots.fetchedAt < HOTSPOT_CACHE_TTL_MS) {
    return cachedHotspots.hotspots;
  }

  try {
    const ai = getClient();
    const todayIso = new Date().toISOString().slice(0, 10);
    const prompt = `Search for today's (${todayIso}) traffic jams, roadblocks, metro construction, rain waterlogging, or major events in Bengaluru, India.
Return ONLY a raw JSON object (no markdown):
{ "hotspots": [{ "location": "Outer Ring Road", "reason": "Heavy IT corridor traffic & metro work" }] }
Include 4 to 6 major Bengaluru traffic hotspots relevant today.`;

    const response = await ai.models.generateContent({
      model: GROUNDING_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = (response.text ?? '').trim();
    if (!text) return [];
    const parsed = extractJsonObject<{ hotspots?: TodayHotspot[] }>(text);
    const hotspots = Array.isArray(parsed.hotspots)
      ? parsed.hotspots
          .filter((h) => h && typeof h.location === 'string' && h.location.trim().length > 0)
          .map((h) => ({
            location: h.location.trim(),
            reason: (h.reason || 'Heavy traffic').trim(),
          }))
          .slice(0, 6)
      : [];

    cachedHotspots = { fetchedAt: Date.now(), hotspots };
    return hotspots;
  } catch (err) {
    console.warn('[Today in Bengaluru] Hotspot search skipped:', err instanceof Error ? err.message : err);
    return [];
  }
}

function hotspotMatchesSegment(hotspotLocation: string, haystack: string): boolean {
  const hNorm = hotspotLocation.toLowerCase();
  const sNorm = haystack.toLowerCase();
  if (sNorm.includes(hNorm) || hNorm.includes(sNorm)) return true;

  const stopWords = new Set(['road', 'rd', 'main', 'cross', 'layout', 'nagar', 'circle', 'junction', 'bridge', 'flyover', 'bengaluru', 'bangalore', 'area', 'the', 'and', 'near']);
  const tokens = hNorm
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !stopWords.has(t));

  return tokens.some((tok) => sNorm.includes(tok));
}

function injectHotspotTraffic(
  existingEvents: RouteEvent[],
  startMeters: number,
  endMeters: number,
  seed: number
): RouteEvent[] {
  const extra: RouteEvent[] = [];
  const hotspotTypes: ObstacleType[] = ['traffic_jam', 'bus', 'car', 'bike'];
  const span = Math.max(80, endMeters - startMeters);
  const count = Math.min(4, Math.max(2, Math.floor(span / 85)));

  for (let i = 0; i < count; i++) {
    const ratio = (i + 0.5) / count;
    const atMeters = Math.round(startMeters + ratio * span);
    const lane = ((seed + i * 2) % 3) as 0 | 1 | 2;
    const type = hotspotTypes[(seed + i) % hotspotTypes.length];
    extra.push({ type, atMeters, lane });
  }

  return [...existingEvents, ...extra];
}

export async function generateRideStart(
  req: RideStartRequest
): Promise<RideStartResponse> {
  const baseFare = Math.round(120 * req.currentDifficulty.fareMultiplier);
  const systemInstruction = `You are the Ride Director AI for "Rickshaw Rumble", a lively arcade auto-rickshaw driving game set in Bengaluru, India.
Create vivid, authentic, witty Bengaluru passengers and playable 3-lane routes.
Rules:
- Vary passenger personas and languageStyle across rides ("English", "Kannada-English" with natural Kannada/Kannada-English phrases like anna/macha/guru/swalpa/banni/eshtu/hogbeku, or "Hinglish" with natural Hindi-English like bhaiya/chalo/kitna/jaldi/yaar).
- openingLine MUST be written in the passenger's languageStyle so it sounds authentic when spoken aloud by TTS; openingLineEnglish MUST be a clear, natural English translation of openingLine.
- Choose real, well-known, distinct Bengaluru pickup and destination places (e.g. Koramangala Forum Mall, Indiranagar 100ft Rd, Marathahalli Bridge, Silk Board, MG Road Metro, Domlur Flyover, HSR Layout, Electronic City, Jayanagar 4th Block, Whitefield ITPL, Hebbal Flyover, Malleswaram, Bellandur).
- Scale fareOffer near ₹${baseFare} (±25 INR) using the current fareMultiplier (${req.currentDifficulty.fareMultiplier.toFixed(2)}x).
- Route lengthMeters should be 750 to 1100.
- Place 16 to 26 varied obstacles in events between atMeters 150 and lengthMeters - 90. Include a mix of Bengaluru traffic: red BMTC buses ('bus'), other autos ('auto'), crossing pedestrians ('pedestrian'), cars, bikes, cows, potholes, and speed_breakers. Never block all 3 lanes at the same meter! Space obstacles at least 25m apart in the same lane.
- Place 2 or 3 turnPoints evenly spaced (e.g., around 32%, 65%, 86% of lengthMeters) with real Bengaluru junction names.
- Return strictly valid JSON matching the schema.`;

  const userPrompt = JSON.stringify({
    rideNumber: req.rideNumber,
    currentDifficulty: req.currentDifficulty,
    previousRideStats: req.previousRideStats,
    instruction:
      'Generate the next unique passenger, fareOffer, and full Bengaluru route with obstacles and turnPoints.',
  });

  const baseRide = await callGeminiJson<RideStartResponse>(
    systemInstruction,
    userPrompt,
    RIDE_START_SCHEMA
  );

  // Ground the route with Google Maps + fetch Today in Bengaluru traffic hotspots in parallel (bounded by fast timeouts so ride_start never hangs)
  const [mapsResult, hotspots] = await Promise.all([
    withTimeout(
      fetchMapsGroundedRoute(baseRide.passenger.pickup, baseRide.passenger.destination),
      7000,
      'Google Maps grounding'
    )
      .then((res) => ({ ok: true as const, ...res }))
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[Maps Grounding] Failed for ${baseRide.passenger.pickup} -> ${baseRide.passenger.destination}:`,
          message
        );
        return { ok: false as const, error: message };
      }),
    withTimeout(fetchTodayBengaluruHotspots(), 5000, 'Today in Bengaluru hotspots').catch(
      () => [] as TodayHotspot[]
    ),
  ]);

  const playableLength = Math.max(780, Math.min(1150, Math.round(baseRide.route.lengthMeters || 920)));
  let finalRoute = { ...baseRide.route, lengthMeters: playableLength };

  if (mapsResult.ok) {
    const rawSegments = mapsResult.route.segments
      .map((s) => ({
        roadName: String(s.roadName || '').trim(),
        lengthMeters: Math.max(100, Number(s.lengthMeters) || 500),
        landmarks: Array.isArray(s.landmarks)
          ? s.landmarks.map((l) => String(l).trim()).filter(Boolean)
          : [],
      }))
      .filter((s) => s.roadName.length > 0);

    if (rawSegments.length > 0) {
      const totalRealMeters = rawSegments.reduce((sum, s) => sum + s.lengthMeters, 0) || 1;
      let cursor = 0;
      const segments: RouteSegment[] = rawSegments.map((seg, idx) => {
        const startMeters = Math.round(cursor);
        const scaledLen =
          idx === rawSegments.length - 1
            ? Math.max(60, playableLength - startMeters)
            : Math.max(90, Math.round((seg.lengthMeters / totalRealMeters) * playableLength));
        cursor = Math.min(playableLength, startMeters + scaledLen);
        return {
          roadName: seg.roadName,
          lengthMeters: seg.lengthMeters,
          startMeters,
          endMeters: idx === rawSegments.length - 1 ? playableLength : Math.round(cursor),
          landmarks: seg.landmarks,
          hotspot: null,
        };
      });

      // Scale real turnPoints proportionally into playableLength
      const rawTurns = Array.isArray(mapsResult.route.turnPoints)
        ? mapsResult.route.turnPoints
        : [];
      const mappedTurns: TurnPoint[] = rawTurns
        .filter((tp) => tp && typeof tp.landmark === 'string' && tp.landmark.trim().length > 0)
        .slice(0, 3)
        .map((tp, idx) => {
          const { correctLane, direction } = directionToLane(tp.direction);
          const rawAt = Number(tp.atMeters);
          const scaledAt =
            Number.isFinite(rawAt) && rawAt > 0
              ? Math.round((rawAt / totalRealMeters) * playableLength)
              : Math.round(playableLength * ((idx + 1) / (rawTurns.length + 1)));
          return {
            atMeters: Math.max(230, Math.min(playableLength - 100, scaledAt)),
            correctLane,
            direction,
            landmark: tp.landmark.trim(),
          };
        });

      const flattenedLandmarks = segments.flatMap((s) => s.landmarks).filter(Boolean);

      finalRoute = {
        ...finalRoute,
        segments,
        landmarks: flattenedLandmarks.length > 0 ? flattenedLandmarks : finalRoute.landmarks,
        turnPoints: mappedTurns.length > 0 ? mappedTurns : finalRoute.turnPoints,
        mapsGrounded: true,
        mapsError: null,
        mapsSources: mapsResult.sources,
      };
    } else {
      console.error('[Maps Grounding] Parsed segments array was empty; falling back to generated route.');
      finalRoute = {
        ...finalRoute,
        mapsGrounded: false,
        mapsError: 'Google Maps grounding returned empty segments; used fallback route.',
      };
    }
  } else {
    finalRoute = {
      ...finalRoute,
      mapsGrounded: false,
      mapsError: mapsResult.error,
    };
  }

  // Combine with Today in Bengaluru: hotspots on the route add extra traffic
  if (hotspots.length > 0) {
    const matchedHotspots: TodayHotspot[] = [];
    let updatedEvents = [...finalRoute.events];
    let densityBoost = 0;

    if (finalRoute.segments && finalRoute.segments.length > 0) {
      finalRoute.segments = finalRoute.segments.map((seg, idx) => {
        const haystack = `${seg.roadName} ${seg.landmarks.join(' ')}`;
        const match = hotspots.find((h) => hotspotMatchesSegment(h.location, haystack));
        if (match) {
          matchedHotspots.push({ ...match, matchedRoad: seg.roadName });
          densityBoost += 2;
          updatedEvents = injectHotspotTraffic(
            updatedEvents,
            seg.startMeters ?? 150,
            seg.endMeters ?? playableLength - 80,
            idx + req.rideNumber
          );
          return { ...seg, hotspot: `${match.location}: ${match.reason}` };
        }
        return seg;
      });
    } else {
      const routeText = `${baseRide.passenger.pickup} ${baseRide.passenger.destination} ${finalRoute.landmarks.join(' ')}`;
      const match = hotspots.find((h) => hotspotMatchesSegment(h.location, routeText));
      if (match) {
        matchedHotspots.push(match);
        densityBoost += 2;
        updatedEvents = injectHotspotTraffic(updatedEvents, 180, playableLength - 90, req.rideNumber);
      }
    }

    if (matchedHotspots.length > 0) {
      finalRoute = {
        ...finalRoute,
        events: updatedEvents,
        trafficDensity: Math.min(10, finalRoute.trafficDensity + densityBoost),
        todayHotspots: matchedHotspots,
      };
    }
  }

  return {
    passenger: baseRide.passenger,
    route: finalRoute,
  };
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

export async function generateVoiceBargainReply(
  req: VoiceBargainRequest
): Promise<VoiceBargainResponse> {
  if (!req.audioBase64 || typeof req.audioBase64 !== 'string') {
    throw new Error('No recorded audio was provided for voice bargaining.');
  }

  // Strip codec suffixes such as ";codecs=opus" for Gemini inlineData compatibility
  const cleanMimeType = (req.mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';

  const systemInstruction = `You are roleplaying a Bengaluru auto-rickshaw passenger listening to the driver's spoken fare counter-offer before starting the ride.
Listen carefully to the audio clip, transcribe what the driver said into heardText, and reply strictly in the passenger's persona and languageStyle.
Rules:
- heardText: transcribe what the driver spoke naturally (e.g. "Anna, 150 rupees, OK?"). If nothing intelligible was spoken, set heardText to "(inaudible)" and keep currentFare.
- Understand any rupee amount or negotiation phrase spoken in English, Kannada-English, or Hinglish.
- Decide realistically based on the passenger's persona and currentFare (₹${req.currentFare}):
  - "accepted": agree to the driver's spoken fare (if reasonable, e.g. within +₹40 of currentFare or lower).
  - "halfway": meet in the middle between currentFare and the driver's ask.
  - "refused": stick firmly to currentFare (₹${req.currentFare}) if the driver asks for something outrageous or didn't state a clear fare.
- Keep reply punchy, witty, authentic Bengaluru banter (max 22 words).
- Return strictly valid JSON matching the schema.`;

  const contextPrompt = JSON.stringify({
    passenger: {
      name: req.passenger.name,
      persona: req.passenger.persona,
      languageStyle: req.passenger.languageStyle,
      pickup: req.passenger.pickup,
      destination: req.passenger.destination,
    },
    currentFare: req.currentFare,
    rideNumber: req.rideNumber,
    instruction:
      'Transcribe the attached driver audio into heardText, negotiate realistically, and return { heardText, reply, acceptedFare, outcome }.',
  });

  const result = await callGeminiJson<VoiceBargainResponse>(
    systemInstruction,
    [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: cleanMimeType,
              data: req.audioBase64,
            },
          },
          { text: contextPrompt },
        ],
      },
    ],
    VOICE_BARGAIN_SCHEMA
  );

  const safeFare = Number.isFinite(result.acceptedFare)
    ? Math.max(30, Math.min(Math.max(req.currentFare + 200, 600), Math.round(result.acceptedFare)))
    : req.currentFare;

  return {
    heardText: (result.heardText || '').trim() || '(inaudible)',
    reply: (result.reply || '').trim(),
    acceptedFare: safeFare,
    outcome: result.outcome,
  };
}

function selectVoiceForPassenger(
  passenger: Pick<PassengerProfile, 'name' | 'persona' | 'languageStyle'>
): string {
  const combined = `${passenger.name} ${passenger.persona}`.toLowerCase();

  const femaleSignals =
    /\b(auntie|aunty|lady|woman|girl|mother|mom|mama|ma'am|madam|sister|akka|didi|actress|bride|grandma|ajji|daughter|wife|miss|mrs|ms|priya|ananya|kavya|lakshmi|meera|deepa|shreya|nisha|rekha|divya|pooja|sneha|rashmi|vidya|geetha|padma|aishwarya|nandini|swati|sunita|sowmya|keerti|revathi|usha|meghana|aparna|shruti|sindhu|radha|sita)\b/i;
  const maleSignals =
    /\b(uncle|anna|bhaiya|guy|man|boy|dad|father|sir|grandpa|ajja|bro|macha|son|husband|mr|rohan|arjun|vikram|karthik|suresh|ramesh|rahul|aditya|nikhil|pradeep|siddharth|kiran|manoj|vijay|rajesh|deepak|varun|akash|harish|girish|ashwin|prashanth|naveen|santhosh|ganesh|shiva)\b/i;

  const isFemale = femaleSignals.test(combined) && !maleSignals.test(combined);
  const isMale = maleSignals.test(combined) && !femaleSignals.test(combined);
  const isOlderOrCalm = /\b(auntie|aunty|uncle|professor|grandpa|grandma|ajji|ajja|retired|senior|classical|calm|exec|executive|doctor)\b/i.test(
    combined
  );
  const isEnergetic = /\b(stressed|startup|founder|student|college|intern|influencer|techie|hurry|late|excited|party|dj|gamer)\b/i.test(
    combined
  );

  if (isFemale) {
    if (isEnergetic) return 'Zephyr';
    if (isOlderOrCalm) return 'Kore';
    return 'Aoede';
  }
  if (isMale) {
    if (isOlderOrCalm) return 'Charon';
    if (isEnergetic) return 'Puck';
    return 'Fenrir';
  }

  // Deterministic persona-consistent fallback by name hash
  const pool = ['Kore', 'Puck', 'Zephyr', 'Charon', 'Aoede', 'Fenrir'];
  let hash = 0;
  for (let i = 0; i < passenger.name.length; i++) {
    hash = (hash * 31 + passenger.name.charCodeAt(i)) >>> 0;
  }
  return pool[hash % pool.length];
}

function wrapPcm16ToWav(pcmBuffer: Buffer, sampleRate = 24000, channels = 1): Buffer {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

export async function generatePassengerSpeech(
  req: TtsRequest
): Promise<TtsResponse> {
  const text = (req.text || '').trim();
  if (!text) {
    throw new Error('No text provided for speech synthesis.');
  }

  const ai = getTtsClient();
  const voiceName = selectVoiceForPassenger(req.passenger);
  const delivery = req.urgent
    ? 'urgent, animated, expressive'
    : 'lively, natural, conversational';
  const prompt = `Speak the following line as ${req.passenger.name} (${req.passenger.persona}, ${req.passenger.languageStyle}) in a ${delivery} Bengaluru tone. Output only the spoken line:\n${text}`;

  let lastError: unknown;
  for (const model of TTS_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const audioPart = parts.find((p) => p.inlineData?.data);
      const inlineData = audioPart?.inlineData;

      if (!inlineData?.data) {
        throw new Error(`No audio data returned by ${model}`);
      }

      const rawMime = (inlineData.mimeType || 'audio/L16;rate=24000').toLowerCase();
      if (rawMime.includes('l16') || rawMime.includes('pcm')) {
        const rateMatch = rawMime.match(/rate=(\d+)/);
        const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
        const pcmBytes = Buffer.from(inlineData.data, 'base64');
        const wavBytes = wrapPcm16ToWav(pcmBytes, sampleRate, 1);
        return {
          audioBase64: wavBytes.toString('base64'),
          mimeType: 'audio/wav',
          voiceName,
        };
      }

      return {
        audioBase64: inlineData.data,
        mimeType: inlineData.mimeType || 'audio/wav',
        voiceName,
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to synthesize passenger speech with Gemini TTS');
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

  const systemInstruction = `You are a passenger sitting in the back of a Bengaluru auto-rickshaw giving an urgent, crystal-clear real-world turn direction for an upcoming Bengaluru junction.
Rules:
- Maximum 12 words!
- MUST clearly state whether to go LEFT, STRAIGHT/MIDDLE, or RIGHT at the exact landmark (e.g., "Left at Marathahalli bridge, macha!" or "Take right at Sony World!").
- Mention the exact landmark name.
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
  const chaos = Math.round(req.chaos ?? 20);
  const chaosGuidance =
    chaos >= 80
      ? 'CHAOS IS EXTREME (80%+): Passenger is panicking, yelling about reckless driving or warning about Bengaluru traffic police!'
      : chaos >= 50
        ? 'CHAOS IS HIGH (50%+): Passenger is nervous, complaining about the wild weaving and speed!'
        : 'CHAOS IS LOW (<50%): Passenger is impressed by the smooth/skilled driving and offers praise or hints at a good tip!';

  const systemInstruction = `You are a passenger in a moving Bengaluru auto-rickshaw reacting live to what just happened on the road.
Rules:
- Output ONE sharp, funny line — MAXIMUM 15 words!
- React specifically to the exact eventType and detail provided (including chaos_50, chaos_80, combo_x3 safe-pass streaks, or traffic_cop sightings).
- ${chaosGuidance}
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
    chaosPercent: chaos,
    comboMultiplier: req.combo ?? 1,
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
  const systemInstruction = `You are the Ride Director AI for "Rickshaw Rumble" wrapping up a completed, timed-out, or crashed-out (gameOver) Bengaluru auto-rickshaw ride.
Rules:
- Write a hilarious 2-3 sentence story in the passenger's own voice and languageStyle referencing their actual trip stats (crashes, near-misses, chaos level, score, wrong turns, speed, mood, destination).
- High chaos (>= 65%) -> mention panicking, wild driving, or dodging traffic cops. Low chaos (<= 35%) and clean ride -> praise the smooth ride and mention giving a generous tip!
- Assign a fair star rating (1 to 5): 5 for clean fast arrival with high mood/low chaos, 1-2 for gameOver, timeout, or heavy crashes.
- Compute nextDifficulty adaptively:
  - Good ride (completed, rating >= 4): increase fareMultiplier by +0.15 to +0.25 (up to 2.2), nudge trafficDensity up (+1, max 10), tighten timer slightly (min 40s), spice up obstacleMix.
  - Average ride (rating 3): keep fareMultiplier steady or +0.05, moderate traffic.
  - Rough ride (gameOver, timed out, or rating <= 2): lower fareMultiplier by -0.15 (min 0.8), ease trafficDensity (-1, min 2), add a few timer seconds (max 62s).`;

  const userPrompt = JSON.stringify({
    rideNumber: req.rideNumber,
    passenger: req.passenger,
    stats: {
      completed: req.completed,
      gameOver: Boolean(req.gameOver),
      timeElapsedSeconds: Number(req.timeElapsedSeconds.toFixed(1)),
      timeRemainingSeconds: Number(req.timeRemainingSeconds.toFixed(1)),
      crashes: req.crashes,
      nearMisses: req.nearMisses,
      wrongTurns: req.wrongTurns,
      correctTurns: req.correctTurns,
      avgSpeedKmh: Math.round(req.avgSpeedKmh),
      fare: req.fare,
      finalMood: Math.round(req.finalMood),
      avgChaosPercent: Math.round(req.avgChaos ?? 25),
      peakChaosPercent: Math.round(req.peakChaos ?? 40),
      score: Math.round(req.score ?? 0),
      livesRemaining: req.livesRemaining ?? 5,
    },
    currentDifficulty: req.currentDifficulty,
  });

  return callGeminiJson<RideEndResponse>(
    systemInstruction,
    userPrompt,
    RIDE_END_SCHEMA
  );
}
