import { GoogleGenAI, Modality, Type, type FunctionDeclaration } from '@google/genai';
import type { IncomingMessage, Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { PassengerProfile } from '../src/types/rideDirector.ts';
import { selectVoiceForPassenger } from './rideDirector.ts';

const LIVE_MODEL = 'gemini-2.5-flash-native-audio-latest';

const AGREE_FARE_TOOL: FunctionDeclaration = {
  name: 'agree_fare',
  description:
    'Call this tool during fare bargaining as soon as you accept, meet halfway, or firmly finalize a fare with the auto-rickshaw driver.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      acceptedFare: {
        type: Type.INTEGER,
        description: 'The finalized agreed fare in Indian Rupees (INR).',
      },
      outcome: {
        type: Type.STRING,
        enum: ['accepted', 'halfway', 'refused'],
        description: 'Whether you accepted the driver ask, met halfway, or held firm.',
      },
    },
    required: ['acceptedFare', 'outcome'],
  },
};

interface StartMessage {
  type: 'start';
  passenger: PassengerProfile;
  currentFare: number;
  routeSummary?: string;
}

interface AudioMessage {
  type: 'audio';
  data: string; // base64 PCM16 16kHz mono
}

interface EventMessage {
  type: 'event';
  text: string;
}

interface StopMessage {
  type: 'stop';
}

type ClientMessage = StartMessage | AudioMessage | EventMessage | StopMessage;

function sendJson(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function buildLiveSystemInstruction(
  passenger: PassengerProfile,
  currentFare: number,
  routeSummary?: string
): string {
  const langRule =
    passenger.languageStyle === 'Kannada-English'
      ? 'Speak in natural Bengaluru Kannada-English (mixing natural Kannada words like anna, macha, guru, swalpa, banni, left thogo, right thogo, ayyo with English). NEVER speak Hindi or Hinglish.'
      : 'Speak in lively, natural Bengaluru English ONLY. NEVER speak Hindi or Hinglish.';

  return `You are roleplaying ${passenger.name}, a Bengaluru auto-rickshaw passenger (${passenger.persona}).
Pickup: ${passenger.pickup}
Destination: ${passenger.destination}
Initial fare offer: ₹${currentFare}
${routeSummary ? `Route roads: ${routeSummary}` : ''}

LANGUAGE & STYLE:
- ${langRule}
- Keep EVERY spoken reply ultra-short, punchy, and natural (1 to 2 short sentences max).
- Never read stage directions or metadata aloud.

PHASE 1 — FARE BARGAINING:
- You are talking live with the auto driver before starting the ride.
- Negotiate realistically in character. If the driver proposes a reasonable fare (within +₹40 of ₹${currentFare} or lower), accept or meet halfway; if outrageous, push back playfully.
- As soon as a fare is agreed or you make your final offer, ALWAYS call the \`agree_fare\` tool with \`acceptedFare\` and \`outcome\`, and confirm it aloud in one short line.

PHASE 2 — LIVE BACKSEAT PASSENGER (after you receive [RIDE_STARTED]):
- You are now sitting in the back of the moving auto-rickshaw!
- React immediately in 1 short sentence to [TURN], [CRASH], [CHAOS_50], [CHAOS_80], [COMBO_X3], [POTHOLE], [TRAFFIC_COP], or [WRONG_TURN] cues.
- For [TURN] cues, ALWAYS clearly say LEFT, STRAIGHT, or RIGHT and the landmark name.
- If the driver talks to you while driving, chat back naturally in character!`;
}

export function attachGeminiLiveServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname !== '/api/live') {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    type LiveSession = Awaited<ReturnType<GoogleGenAI['live']['connect']>>;
    let liveSession: LiveSession | null = null;
    let activeFare = 120;

    const closeLive = () => {
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // ignore
        }
        liveSession = null;
      }
    };

    ws.on('message', async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'start') {
        closeLive();
        const apiKey = process.env.GEMINI_API_KEY?.trim();
        if (!apiKey) {
          sendJson(ws, { type: 'error', message: 'GEMINI_API_KEY is not configured on the server.' });
          return;
        }

        activeFare = Math.max(40, Math.round(msg.currentFare || 120));
        const voiceName = selectVoiceForPassenger(msg.passenger);

        try {
          const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
          const session = await ai.live.connect({
            model: LIVE_MODEL,
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName,
                  },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: buildLiveSystemInstruction(
                msg.passenger,
                activeFare,
                msg.routeSummary
              ),
              tools: [{ functionDeclarations: [AGREE_FARE_TOOL] }],
            },
            callbacks: {
              onopen: () => {
                // Wait for setupComplete before notifying client
              },
              onmessage: (serverMsg) => {
                if (serverMsg.setupComplete) {
                  sendJson(ws, { type: 'ready', voiceName, model: LIVE_MODEL });
                }

                const sc = serverMsg.serverContent;
                if (sc) {
                  if (sc.interrupted) {
                    sendJson(ws, { type: 'interrupted' });
                  }
                  if (sc.inputTranscription?.text) {
                    sendJson(ws, {
                      type: 'input_transcript',
                      text: sc.inputTranscription.text,
                    });
                  }
                  if (sc.outputTranscription?.text) {
                    sendJson(ws, {
                      type: 'output_transcript',
                      text: sc.outputTranscription.text,
                    });
                  }
                  const parts = sc.modelTurn?.parts ?? [];
                  for (const part of parts) {
                    if (part.inlineData?.data) {
                      sendJson(ws, {
                        type: 'audio',
                        data: part.inlineData.data,
                        mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                      });
                    }
                  }
                  if (sc.turnComplete) {
                    sendJson(ws, { type: 'turn_complete' });
                  }
                }

                const toolCalls = serverMsg.toolCall?.functionCalls ?? [];
                if (toolCalls.length > 0 && liveSession) {
                  const functionResponses = [];
                  for (const call of toolCalls) {
                    if (call.name === 'agree_fare') {
                      const args = (call.args ?? {}) as {
                        acceptedFare?: number;
                        outcome?: 'accepted' | 'halfway' | 'refused';
                      };
                      const rawFare = Number(args.acceptedFare);
                      const safeFare = Number.isFinite(rawFare)
                        ? Math.max(30, Math.min(Math.max(activeFare + 200, 600), Math.round(rawFare)))
                        : activeFare;
                      const outcome =
                        args.outcome === 'accepted' ||
                        args.outcome === 'halfway' ||
                        args.outcome === 'refused'
                          ? args.outcome
                          : 'accepted';
                      activeFare = safeFare;

                      sendJson(ws, {
                        type: 'fare_agreed',
                        acceptedFare: safeFare,
                        outcome,
                      });

                      functionResponses.push({
                        id: call.id,
                        name: call.name,
                        response: { ok: true, acceptedFare: safeFare, outcome },
                      });
                    }
                  }

                  if (functionResponses.length > 0) {
                    try {
                      liveSession.sendToolResponse({ functionResponses });
                    } catch {
                      // ignore if session closed
                    }
                  }
                }
              },
              onerror: (err) => {
                const message =
                  (err as { message?: string } | undefined)?.message ||
                  'Gemini Live connection error';
                sendJson(ws, { type: 'error', message });
              },
              onclose: (event) => {
                if (event?.code && event.code !== 1000) {
                  console.warn(`[Gemini Live] Closed (${event.code}): ${event.reason || ''}`);
                }
                liveSession = null;
                sendJson(ws, { type: 'closed', code: event?.code, reason: event?.reason });
              },
            },
          });

          liveSession = session;
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Failed to connect to Gemini Live';
          sendJson(ws, { type: 'error', message });
        }
        return;
      }

      if (msg.type === 'audio' && liveSession && msg.data) {
        try {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } catch {
          // ignore transient send errors during disconnect
        }
        return;
      }

      if (msg.type === 'event' && liveSession && msg.text) {
        try {
          liveSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: msg.text }] }],
            turnComplete: true,
          });
        } catch {
          // ignore
        }
        return;
      }

      if (msg.type === 'stop') {
        closeLive();
        sendJson(ws, { type: 'closed' });
      }
    });

    ws.on('close', () => {
      closeLive();
    });

    ws.on('error', () => {
      closeLive();
    });
  });
}
