import type { PassengerProfile } from '../types/rideDirector';

export type LiveConnectionState = 'idle' | 'connecting' | 'live' | 'error';

export interface LiveSessionHandlers {
  onStateChange?: (state: LiveConnectionState) => void;
  onInputTranscript?: (text: string) => void;
  onOutputTranscript?: (text: string) => void;
  onTurnComplete?: () => void;
  onFareAgreed?: (payload: {
    acceptedFare: number;
    outcome: 'accepted' | 'halfway' | 'refused';
  }) => void;
  onError?: (message: string) => void;
}

function downsampleToPcm16(
  float32: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000
): Int16Array {
  if (inputSampleRate === targetSampleRate) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.max(1, Math.round(float32.length / ratio));
  const result = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.min(
      float32.length,
      Math.round((offsetResult + 1) * ratio)
    );
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer; i++) {
      accum += float32[i];
      count++;
    }
    const avg = count > 0 ? accum / count : 0;
    const clamped = Math.max(-1, Math.min(1, avg));
    result[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const byteLen = binary.length;
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(byteLen / 2);
  const floats = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    floats[i] = view.getInt16(i * 2, true) / 32768;
  }
  return floats;
}

class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private state: LiveConnectionState = 'idle';
  private muted = false;
  private handlers: LiveSessionHandlers = {};

  // Microphone capture
  private mediaStream: MediaStream | null = null;
  private captureCtx: AudioContext | null = null;
  private captureSource: MediaStreamAudioSourceNode | null = null;
  private captureProcessor: ScriptProcessorNode | null = null;

  // 24kHz PCM playback queue
  private playbackCtx: AudioContext | null = null;
  private nextPlayTime = 0;
  private scheduledSources = new Set<AudioBufferSourceNode>();

  // Rolling transcript buffers for current turn
  private currentInputTurn = '';
  private currentOutputTurn = '';

  isActive(): boolean {
    return this.state === 'live' || this.state === 'connecting';
  }

  getState(): LiveConnectionState {
    return this.state;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.flushPlayback();
    }
  }

  private setState(next: LiveConnectionState) {
    this.state = next;
    this.handlers.onStateChange?.(next);
  }

  private flushPlayback() {
    for (const src of this.scheduledSources) {
      try {
        src.stop();
      } catch {
        // ignore
      }
    }
    this.scheduledSources.clear();
    if (this.playbackCtx) {
      this.nextPlayTime = this.playbackCtx.currentTime;
    } else {
      this.nextPlayTime = 0;
    }
  }

  private enqueueAudioChunk(base64Pcm: string) {
    if (this.muted || typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.playbackCtx) {
      this.playbackCtx = new AudioCtx({ sampleRate: 24000 });
    }
    if (this.playbackCtx.state === 'suspended') {
      this.playbackCtx.resume().catch(() => {});
    }

    const floats = base64Pcm16ToFloat32(base64Pcm);
    if (floats.length === 0) return;

    const buffer = this.playbackCtx.createBuffer(1, floats.length, 24000);
    buffer.getChannelData(0).set(floats);

    const source = this.playbackCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.playbackCtx.destination);

    const now = this.playbackCtx.currentTime;
    const startAt = Math.max(now + 0.015, this.nextPlayTime);
    this.nextPlayTime = startAt + buffer.duration;

    this.scheduledSources.add(source);
    source.onended = () => {
      this.scheduledSources.delete(source);
    };
    source.start(startAt);
  }

  async connect(params: {
    passenger: PassengerProfile;
    currentFare: number;
    routeSummary?: string;
    handlers?: LiveSessionHandlers;
  }): Promise<void> {
    this.disconnect();
    this.handlers = params.handlers ?? {};
    this.currentInputTurn = '';
    this.currentOutputTurn = '';
    this.setState('connecting');

    // Create & unlock playback AudioContext immediately during the user's click gesture
    // so Chrome/Safari autoplay policies never mute incoming Gemini Live audio.
    if (typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        if (!this.playbackCtx || this.playbackCtx.state === 'closed') {
          this.playbackCtx = new AudioCtx({ sampleRate: 24000 });
        }
        if (this.playbackCtx.state === 'suspended') {
          await this.playbackCtx.resume().catch(() => {});
        }
        this.nextPlayTime = this.playbackCtx.currentTime;
      }
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const msg = 'Microphone is not supported in this browser.';
      this.setState('error');
      this.handlers.onError?.(msg);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      const msg = 'Microphone permission denied — use Accept or Counter +20 instead.';
      this.setState('error');
      this.handlers.onError?.(msg);
      return;
    }

    this.mediaStream = stream;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/live`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'start',
          passenger: params.passenger,
          currentFare: params.currentFare,
          routeSummary: params.routeSummary,
        })
      );
    };

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (msg.type === 'ready') {
        this.setState('live');
        this.startMicStreaming(stream);
      } else if (msg.type === 'audio' && typeof msg.data === 'string') {
        this.enqueueAudioChunk(msg.data);
      } else if (msg.type === 'interrupted') {
        this.flushPlayback();
        this.currentOutputTurn = '';
      } else if (msg.type === 'input_transcript' && typeof msg.text === 'string') {
        this.currentInputTurn = `${this.currentInputTurn} ${msg.text}`.replace(/\s+/g, ' ').trim();
        this.handlers.onInputTranscript?.(this.currentInputTurn);
      } else if (msg.type === 'output_transcript' && typeof msg.text === 'string') {
        this.currentOutputTurn = `${this.currentOutputTurn} ${msg.text}`.replace(/\s+/g, ' ').trim();
        this.handlers.onOutputTranscript?.(this.currentOutputTurn);
      } else if (msg.type === 'turn_complete') {
        this.handlers.onTurnComplete?.();
        this.currentInputTurn = '';
        this.currentOutputTurn = '';
      } else if (msg.type === 'fare_agreed') {
        this.handlers.onFareAgreed?.({
          acceptedFare: Number(msg.acceptedFare),
          outcome: (msg.outcome as 'accepted' | 'halfway' | 'refused') || 'accepted',
        });
      } else if (msg.type === 'error') {
        const message =
          typeof msg.message === 'string' ? msg.message : 'Gemini Live error';
        this.handlers.onError?.(message);
        this.disconnect();
      } else if (msg.type === 'closed') {
        if (this.state !== 'idle') {
          this.disconnect();
        }
      }
    };

    ws.onerror = () => {
      this.handlers.onError?.('Could not connect to Gemini Live WebSocket.');
      this.disconnect();
    };

    ws.onclose = () => {
      if (this.state !== 'idle') {
        this.disconnect();
      }
    };
  }

  private startMicStreaming(stream: MediaStream) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    this.captureCtx = ctx;

    const source = ctx.createMediaStreamSource(stream);
    this.captureSource = source;

    // 4096 samples @ 48kHz ~= 85ms chunks
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    this.captureProcessor = processor;

    processor.onaudioprocess = (e) => {
      if (this.state !== 'live' || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = downsampleToPcm16(inputData, ctx.sampleRate, 16000);
      const base64 = int16ToBase64(pcm16);
      this.ws.send(JSON.stringify({ type: 'audio', data: base64 }));
    };

    // Route through a silent gain node so mic audio isn't echoed to speakers
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(ctx.destination);
  }

  sendGameEvent(text: string) {
    if (this.state !== 'live' || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify({ type: 'event', text }));
  }

  updateHandlers(handlers: Partial<LiveSessionHandlers>) {
    this.handlers = { ...this.handlers, ...handlers };
  }

  disconnect() {
    this.flushPlayback();

    if (this.captureProcessor) {
      this.captureProcessor.disconnect();
      this.captureProcessor.onaudioprocess = null;
      this.captureProcessor = null;
    }
    if (this.captureSource) {
      this.captureSource.disconnect();
      this.captureSource = null;
    }
    if (this.captureCtx) {
      this.captureCtx.close().catch(() => {});
      this.captureCtx = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'stop' }));
        }
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    this.currentInputTurn = '';
    this.currentOutputTurn = '';
    if (this.state !== 'idle') {
      this.setState('idle');
    }
  }
}

export const geminiLiveClient = new GeminiLiveClient();
