# Rickshaw Rumble 🛺

Drive an auto-rickshaw through Bengaluru traffic while a Gemini-powered **Ride Director** agent creates every passenger, real Bengaluru route, live voice bargain, and ride story in real time.

Built for the **Gemini 4 Sprint** (Google DeepMind × Google Cloud, Bengaluru) — Gaming track.

- **Live game:** https://rickshawrumble-163534516494.asia-south1.run.app
- **Demo video:** [YOUR_YOUTUBE_URL]
- **Source code:** https://github.com/josephkappala/rickshawrumble (mirror: https://github.com/josephkappala/AutoRumble)

## Features

- **Generative Bengaluru passengers:** unique personas speaking **English** or **Kannada-English**, with their opening greeting spoken aloud via Gemini TTS and popped onto screen in English (`openingLineEnglish`) with a replay button.
- **Gemini Live real-time voice bargaining & backseat passenger:** click **Hold to bargain** (or **LIVE** in the HUD) to open a full-duplex WebSocket session to `gemini-2.5-flash-native-audio-latest` (`/api/live`). Talk naturally with your passenger in English or Kannada — Gemini calls `agree_fare` to lock in the negotiated fare, uses an echo gate so replies never cut off, and stays live in the backseat reacting to turns, crashes, chaos spikes, and combos while you drive.
- **Persona-matched Gemini text-to-speech:** verbatim speech synthesis (`gemini-3.8-flash-lite-tts` with `gemini-2.5-flash-preview-tts` fallback) assigning a consistent voice per passenger (`Kore`, `Zephyr`, `Aoede`, `Puck`, `Charon`, `Fenrir`).
- **Real Bengaluru routes via Google Maps grounding:** `gemini-3.1-flash-lite` + `googleMaps` grounding returns real consecutive road segments, landmarks, and turns (`100 Feet Road`, `HAL Old Airport Road`, `Kasturba Road`, `MG Road`), displayed on a top green highway road-sign banner and per-segment roadside signboards — with route caching and a fast timeout fallback.
- **Today in Bengaluru hotspots via Google Search grounding:** 30-minute cached Search grounding matches live city traffic hotspots to your route segments and injects extra traffic.
- **Auto Mayhem arcade gameplay:**
  - `SAFE PASS +N` green floating popups, combo multiplier (`x1, x2, x3…`), and `SCORE` / `COMBO` / `HIGH SCORE` persisted in `localStorage`.
  - **Chaos meter (0–100%)** sent to the Ride Director: crosses 50% and 80% trigger live passenger reactions (plus a **Bengaluru Traffic Police `BTP`** checkpoint at 80%); low chaos earns praise and tips.
  - **5 hearts** per run with a **Game Over** screen showing final score, high score, and the passenger's last ride story.
  - **Bengaluru traffic & roadside:** red BMTC buses, other autos, crossing pedestrians, cows, scooters, potholes, speed breakers, rain patches, and colourful scrolling shop strips (**DOSA, JUICE, BAKERY, PETROL, TEA, METRO, OFFICE**).
  - **Bottom cockpit HUD:** animated steering wheel, `SPEED`, `LIVES`, `CHAOS`, `TRAFFIC`, and steer/brake/boost controls.
- **Ride Director log:** collapsible side panel streaming every live Gemini JSON call and latency.

## Tech stack

React 19 · TypeScript · Vite 8 · Tailwind CSS v4 · Motion · HTML5 Canvas 2D · Express · WebSockets (`ws`) · Bun · `@google/genai` (Gemini Flash-Lite, Gemini Live Native Audio, Gemini TTS, Google Maps & Google Search grounding) · Google Cloud Run

## Project structure

```
Dockerfile                          Multi-stage production build for Cloud Run (port 8080)
server.ts                           Express API, /api/live WebSocket upgrade (+ Vite dev middleware)
server/rideDirector.ts              Gemini calls: JSON, multimodal audio, TTS, Maps & Search grounding
server/liveBridge.ts                Server-side WebSocket bridge to Gemini Live API + agree_fare tool
src/game/engine.ts                  60fps game loop, scoring, combo, chaos, lives, Live event streaming
src/game/renderer.ts                Canvas rendering (road, red BMTC buses, autos, pedestrians, shop strips)
src/game/rules.ts                   Route sanitization, turn evaluation, obstacle physics
src/game/audio.ts                   Web Audio API sound effects
src/components/                     Cockpit HUD, Bargain modal, Summary/Game Over modal, Agent log panel
src/services/geminiLiveClient.ts    Browser 16kHz/24kHz PCM WebSocket client with echo gate
src/services/rideDirectorClient.ts  REST client for Ride Director endpoints
src/services/passengerVoice.ts      Gemini TTS WAV playback
```

## Run locally

Requirements: [Bun](https://bun.sh) (or Node.js 22+) and a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/josephkappala/rickshawrumble
cd rickshawrumble
bun install
cp .env.example .env        # then set GEMINI_API_KEY="your_key_here"
bun --watch server.ts       # open http://localhost:3000
```

## Deploy to Google Cloud Run

```bash
gcloud run deploy rickshaw-rumble \
  --source . \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "NODE_ENV=production,GEMINI_API_KEY=your_key_here"
```

*(For production, you can also store `GEMINI_API_KEY` in Google Secret Manager and pass `--set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest"`.)*

## Controls

| Action | Keyboard | Mobile / Touch |
|---|---|---|
| Steer lanes | `←` / `→` or `A` / `D` | Tap left / right half of screen (or cockpit buttons) |
| Speed / brake | `↑` / `↓` or `W` / `S` | Cockpit boost / brake buttons |
| Horn | `H` | — |
| Pause | `P` or `Esc` | Pause button |
| Mute audio & voices | `M` | Speaker icon |
| Toggle visual effects | `E` | FX icon |
| Live voice bargain & chat | Click **Hold to bargain** / **LIVE** | Tap **Hold to bargain** / **LIVE** |

## Security

In production (`NODE_ENV=production`), `GEMINI_API_KEY` is read strictly from server environment variables (`dotenv` and `/api/settings/api-key` are disabled, and `.env` is excluded by both `.gitignore` and `.dockerignore`). All Gemini REST, TTS, and Live WebSocket connections terminate on the server — the API key is never sent to the browser.

## License

MIT
