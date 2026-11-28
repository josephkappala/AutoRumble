# Rickshaw Rumble 🛺 — Every ride writes a new story

**Track:** Gaming — Generative NPC dialogue, procedural world-building and adaptive gameplay  
**Built by:** Joseph Chaitanya Kappala (solo) · Gemini 4 Sprint, Bengaluru

- **Live game:** https://rickshawrumble-163534516494.asia-south1.run.app
- **Demo video:** [YOUR_YOUTUBE_URL]
- **Source code:** https://github.com/josephkappala/rickshawrumble (mirror: https://github.com/josephkappala/AutoRumble)

---

## 1. The problem

Casual mobile games are built on scripted content: the same lines, the same maps, the same difficulty curve. Players see everything in a few sessions and leave. Hand-writing enough dialogue, levels and characters to keep a game fresh is expensive, so small indie teams can't do it.

There is also very little casual gaming content that reflects everyday Indian life in Indian languages. Almost every Indian has an auto-rickshaw story — the bargaining, the shortcuts, the traffic — but no game captures that experience with real places and real voices.

**Who it's for:** casual players in India (especially Bengaluru) who want a quick, funny game that feels local, and indie game developers looking for a pattern to make small games feel alive with AI.

## 2. What Rickshaw Rumble does

Rickshaw Rumble is a 3-lane arcade game where you drive an auto-rickshaw through Bengaluru traffic. A Gemini-powered **Ride Director** agent runs the world around you. Nothing is scripted — every ride is created live:

- **Talking Bengaluru passengers (generative NPCs):** each passenger has a persona and speaks **English** or **Kannada-English**. Their opening greeting is spoken out loud in their language while popping onto the screen in English (`openingLineEnglish`) so every player understands the banter immediately.
- **Gemini Live voice bargaining & backseat companion:** click **Hold to bargain** to open a real-time full-duplex **Gemini Live** (`gemini-2.5-flash-native-audio-latest`) voice session. Haggle naturally in English or Kannada ("Anna, 140 rupees, OK?") — Gemini calls `agree_fare` to lock in the negotiated fare live in the UI, and stays connected in the backseat while you drive, calling out real turns, reacting to crashes, chaos spikes, and combos, and chatting back if you talk while steering. (If mic access is denied, **Accept** and **Counter +20** buttons work as a fallback.)
- **Real Bengaluru routes (procedural world-building):** routes are grounded in Google Maps — real road segments (`100 Feet Road`, `HAL Old Airport Road`, `Kasturba Road`, `MG Road`), a live green highway road-sign banner at the top of the HUD, real per-segment landmarks on roadside signboards, and real junctions in passenger directions.
- **Today in Bengaluru:** Google Search grounding (cached 30 minutes) finds today's real traffic hotspots and events; matching hotspots on your route boost traffic density and inject extra obstacles on those segments.
- **Adaptive gameplay & Chaos Meter:** a live **Chaos Meter (0–100%)**, safe-pass combos, and trip stats feed back to the Ride Director. Crossing 50% and 80% chaos triggers live passenger panic and spawns a **Bengaluru Traffic Police (`BTP`)** checkpoint; hitting a `x3` safe-pass combo earns praise; calm driving brings tips and higher ratings.
- **Ride stories & Game Over:** every trip ends with a custom star rating and funny story written in the passenger's voice from your actual stats — or a **Game Over** recap when you lose all 5 hearts.

**Arcade layer:** `SAFE PASS +N` green popups with combo multiplier (`x1, x2, x3…`), `localStorage` high scores, 5 hearts, red BMTC buses, other autos, crossing pedestrians, cows, rain patches, colourful scrolling roadside shop strips (**DOSA, JUICE, BAKERY, PETROL, TEA, METRO, OFFICE**), and a bottom cockpit dashboard HUD with an animated steering wheel. Works with keyboard (`←/→`, `↑/↓`, `H`, `P`, `M`, `E`) and mobile touch (tap left/right half of screen).

## 3. How it's built

### Architecture

```
┌────────────────────────── Browser (React + Canvas) ──────────────────────────┐
│  Game engine (engine.ts) · Renderer (renderer.ts) · Cockpit HUD · Bargain    │
│  Gemini Live PCM Client (16kHz mic -> 24kHz audio + echo gate)               │
│  Ride Director log panel (shows every Gemini JSON call + latency)            │
└───────┬───────────────────────────────────────────────▲───────────▲──────────┘
        │ REST: ride-start, bargain, voice-bargain,     │ JSON /    │ WSS /api/live
        │ reaction, turn, ride-end, tts                 │ WAV audio │ (PCM16 + tools)
┌───────▼───────────────────────────────────────────────┴───────────▼──────────┐
│     Express + WebSocket server on Google Cloud Run (API key server-side)     │
│       Ride Director (rideDirector.ts) · Live Bridge (liveBridge.ts)          │
└───┬──────────────┬─────────────────┬──────────────────┬──────────────────┬───┘
    │              │                 │                  │                  │
Gemini 3.1     Gemini + Google   Gemini + Google   Gemini 3.8 TTS   Gemini 2.5 Live
Flash-Lite     Maps grounding    Search grounding  (verbatim voice) (native audio +
JSON output    (real routes)     (today's hotspots)                  agree_fare tool)
```

### How Gemini is used

| Moment in the game | Gemini capability | Model & Output |
|---|---|---|
| Ride start | Structured JSON output | `gemini-3.1-flash-lite`: Passenger (`English` or `Kannada-English`, `openingLine`, `openingLineEnglish`, `fareOffer`) + route events |
| Route generation | Google Maps grounding (cached) | `gemini-3.1-flash-lite` + `googleMaps`: Real road segments, landmarks and turn points |
| City conditions | Google Search grounding (cached 30m) | `gemini-3.1-flash-lite` + `googleSearch`: Today's Bengaluru traffic hotspots |
| Opening & fallback voice | Verbatim Gemini text-to-speech | `gemini-3.8-flash-lite-tts` (`v1beta`): Persona-matched voices (`Kore`, `Zephyr`, `Aoede`, `Puck`, `Charon`, `Fenrir`) |
| Live bargaining & backseat chat | Gemini Live API + Function Calling | `gemini-2.5-flash-native-audio-latest`: Full-duplex real-time voice, live transcripts, `agree_fare` tool call, and live in-ride event reactions |
| Non-live reactions & turns | Short structured JSON | `gemini-3.1-flash-lite`: Turn directions, crashes, chaos at 50% / 80%, `x3` combo |
| Ride end / Game Over | Structured JSON output | `gemini-3.1-flash-lite`: Story, star rating, next difficulty and fare multiplier |

**Design choices**

- **Agent, not a script:** the Ride Director receives live game telemetry (speed, crashes, chaos, combo, distance, hotspots) and adapts routes, reactions, and difficulty. The collapsible *Ride Director log* exposes every live call, JSON response, and latency.
- **Low-latency & non-blocking:** the canvas loop runs at 60fps independently of network calls; Maps grounding uses `gemini-3.1-flash-lite` with `ThinkingLevel.MINIMAL`, in-memory route caching, and a fast `4.5s` timeout fallback; Gemini Live streams audio over WebSockets with an echo gate so laptop speakers never cut off the passenger mid-sentence.
- **Production-ready on Cloud Run:** multi-stage Bun `Dockerfile` serves both the Vite bundle and Express + WebSocket API on `PORT=8080`. In production (`NODE_ENV=production`), `GEMINI_API_KEY` is read strictly from environment variables and never exposed to the browser.

### Tech stack

React 19, TypeScript, Vite 8, Tailwind CSS v4, Motion, HTML5 Canvas 2D, Express, `ws`, Bun, `@google/genai`, Gemini 3.1 Flash-Lite, Gemini 2.5 Flash Native Audio (Live API), Gemini 3.8 Flash-Lite TTS, Google Maps & Google Search grounding, Google Cloud Run. Built with Google AI Studio and Antigravity.

## 4. How to test it

1. Open the **live game**: https://rickshawrumble-163534516494.asia-south1.run.app (no login needed; Chrome on desktop or mobile recommended).
2. Allow microphone access to try **Gemini Live** bargaining & backseat chat (optional — **Accept** / **Counter +20** buttons also work).
3. Press **Start Ride**, hear the passenger's greeting in Kannada-English or English alongside the English pop-up bubble, then click **Hold to bargain** and haggle live.
4. Click **Start Driving** — the Gemini Live session stays connected in the backseat!
5. Drive: `←`/`→` steer, `↑`/`↓` speed, `H` horn, `P` pause, `M` mute, `E` toggle VFX. On mobile, tap the left or right half of the screen.
6. Weave close to vehicles for `SAFE PASS +N` combos, watch the green road-sign banner update across real Bengaluru roads, push Chaos past 50% / 80% to trigger passenger panic and a `BTP` traffic cop, and finish the ride to read your custom ride story.

## 5. Screenshots

[ADD 3–4 SCREENSHOTS: fare bargaining screen with English pop-up & Live button · gameplay with green road-sign banner, cockpit HUD & shop strips · Ride Director log · ride story / Game Over screen]

## 6. What's next

Passenger portraits with image generation, returning passengers who remember your last ride, a driver reputation system, time-of-day lighting and traffic, visual curves and flyovers, and more Indian cities (Hyderabad with Telugu passengers, Chennai with Tamil passengers).
