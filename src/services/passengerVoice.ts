import type { PassengerProfile } from '../types/rideDirector';
import { rideDirectorClient } from './rideDirectorClient';

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

class PassengerVoicePlayer {
  private muted = false;
  private playbackToken = 0;
  private activeAudio: HTMLAudioElement | null = null;
  private activeObjectUrl: string | null = null;
  private activeAbort: AbortController | null = null;

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stop();
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  stop() {
    this.playbackToken++;
    if (this.activeAbort) {
      this.activeAbort.abort();
      this.activeAbort = null;
    }
    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio.currentTime = 0;
      this.activeAudio = null;
    }
    if (this.activeObjectUrl) {
      URL.revokeObjectURL(this.activeObjectUrl);
      this.activeObjectUrl = null;
    }
  }

  async speak(
    text: string,
    passenger: Pick<PassengerProfile, 'name' | 'persona' | 'languageStyle'>,
    options?: { urgent?: boolean }
  ): Promise<void> {
    const cleanText = text.trim();
    if (this.muted || !cleanText || typeof window === 'undefined') {
      return;
    }

    // Cancel any previous in-flight request or currently playing line
    this.stop();
    const token = ++this.playbackToken;
    const controller = new AbortController();
    this.activeAbort = controller;

    try {
      const tts = await rideDirectorClient.synthesizeSpeech(
        {
          text: cleanText,
          passenger: {
            name: passenger.name,
            persona: passenger.persona,
            languageStyle: passenger.languageStyle,
          },
          urgent: options?.urgent,
        },
        controller.signal
      );

      if (this.muted || this.playbackToken !== token) {
        return;
      }

      const blob = base64ToBlob(tts.audioBase64, tts.mimeType || 'audio/wav');
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      this.activeAudio = audio;
      this.activeObjectUrl = objectUrl;

      const cleanup = () => {
        if (this.activeAudio === audio) {
          this.activeAudio = null;
        }
        if (this.activeObjectUrl === objectUrl) {
          URL.revokeObjectURL(objectUrl);
          this.activeObjectUrl = null;
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      };

      audio.addEventListener('ended', cleanup, { once: true });
      audio.addEventListener('error', cleanup, { once: true });

      await audio.play().catch(() => {
        cleanup();
      });
    } catch {
      // Silently ignore aborted or failed TTS so gameplay is never interrupted
    } finally {
      if (this.activeAbort === controller) {
        this.activeAbort = null;
      }
    }
  }
}

export const passengerVoice = new PassengerVoicePlayer();
