import { apiFetch, speakSpanish, stopSpeaking } from './api.ts';

export interface AvatarStatusResponse {
  configured: boolean;
  provider: 'heygen-webrtc' | 'realistic-local';
  avatar_id?: string;
}

export type AvatarConnectionState =
  | 'idle'
  | 'connecting'
  | 'webrtc-live'
  | 'local-realistic';

export interface AvatarSpeakEvent {
  text: string;
  speaking: boolean;
  level: number;
}

type SpeakListener = (ev: AvatarSpeakEvent) => void;
const speakListeners = new Set<SpeakListener>();

export function subscribeAvatarSpeech(cb: SpeakListener): () => void {
  speakListeners.add(cb);
  return () => speakListeners.delete(cb);
}

function notifySpeakListeners(ev: AvatarSpeakEvent): void {
  speakListeners.forEach((cb) => cb(ev));
}

let activeCadenceTimer: number | null = null;

function stopCadenceTimer(): void {
  if (activeCadenceTimer !== null && typeof window !== 'undefined') {
    window.clearInterval(activeCadenceTimer);
    activeCadenceTimer = null;
  }
}

export function speakWithAvatarLipSync(text: string): void {
  const clean = text.trim();
  if (!clean) return;

  stopCadenceTimer();
  speakSpanish(clean);

  // Impulsa la sincronización labial y gestos orgánicos acorde a las sílabas del texto
  const tokens = clean.split(/[\s,.;:!?]+/).filter(Boolean);
  let step = 0;
  const approxDurationMs = Math.min(11000, Math.max(1800, clean.length * 64));
  const startedAt = Date.now();

  notifySpeakListeners({ text: clean, speaking: true, level: 0.72 });

  if (typeof window !== 'undefined') {
    activeCadenceTimer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const synthSpeaking =
        typeof window !== 'undefined' &&
        'speechSynthesis' in window &&
        window.speechSynthesis.speaking;

      if (elapsed > approxDurationMs || (!synthSpeaking && elapsed > 900)) {
        stopCadenceTimer();
        notifySpeakListeners({ text: clean, speaking: false, level: 0 });
        return;
      }

      const token = tokens[step % Math.max(1, tokens.length)] || '';
      step += 1;
      const hasOpenVowel = /[aeoáéó]/i.test(token);
      const level = hasOpenVowel
        ? 0.65 + (step % 3) * 0.14
        : 0.3 + (step % 2) * 0.18;
      notifySpeakListeners({ text: clean, speaking: true, level });
    }, 115);
  }
}

export function stopAvatarSpeech(): void {
  stopCadenceTimer();
  stopSpeaking();
  notifySpeakListeners({ text: '', speaking: false, level: 0 });
}

export class HeygenWebRtcController {
  private pc: RTCPeerConnection | null = null;
  private sessionId: string | null = null;
  private sessionToken: string | null = null;
  private state: AvatarConnectionState = 'idle';

  getState(): AvatarConnectionState {
    return this.state;
  }

  async checkProvider(): Promise<AvatarStatusResponse> {
    try {
      return await apiFetch<AvatarStatusResponse>('/api/public/avatar/status');
    } catch {
      return { configured: false, provider: 'realistic-local' };
    }
  }

  async connect(
    onStream: (stream: MediaStream) => void,
    onStateChange: (state: AvatarConnectionState) => void
  ): Promise<AvatarConnectionState> {
    if (this.state === 'webrtc-live' && this.sessionId) {
      return 'webrtc-live';
    }
    this.state = 'connecting';
    onStateChange('connecting');

    try {
      const status = await this.checkProvider();
      if (!status.configured || typeof RTCPeerConnection === 'undefined') {
        this.state = 'local-realistic';
        onStateChange('local-realistic');
        return 'local-realistic';
      }

      const session = await apiFetch<{
        session_id: string;
        session_token: string;
        sdp: RTCSessionDescriptionInit;
        ice_servers?: RTCIceServer[];
      }>('/api/public/avatar/session', { method: 'POST', body: {} });

      this.sessionId = session.session_id;
      this.sessionToken = session.session_token;

      const pc = new RTCPeerConnection({
        iceServers:
          Array.isArray(session.ice_servers) && session.ice_servers.length > 0
            ? session.ice_servers
            : [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      this.pc = pc;

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          onStream(event.streams[0]);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && this.sessionId) {
          void apiFetch('/api/public/avatar/ice', {
            method: 'POST',
            body: {
              session_id: this.sessionId,
              session_token: this.sessionToken,
              candidate: event.candidate,
            },
          }).catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'disconnected' ||
          pc.connectionState === 'closed'
        ) {
          this.state = 'local-realistic';
          onStateChange('local-realistic');
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(session.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await apiFetch('/api/public/avatar/start', {
        method: 'POST',
        body: {
          session_id: this.sessionId,
          session_token: this.sessionToken,
          sdp: answer,
        },
      });

      this.state = 'webrtc-live';
      onStateChange('webrtc-live');
      return 'webrtc-live';
    } catch {
      await this.disconnect();
      this.state = 'local-realistic';
      onStateChange('local-realistic');
      return 'local-realistic';
    }
  }

  async speak(text: string): Promise<boolean> {
    const clean = text.trim();
    if (!clean) return false;

    if (this.state === 'webrtc-live' && this.sessionId) {
      try {
        await apiFetch('/api/public/avatar/speak', {
          method: 'POST',
          body: {
            session_id: this.sessionId,
            session_token: this.sessionToken,
            text: clean,
          },
        });
        return true;
      } catch {
        // Si el stream remoto cae, continúa con voz realista local sincronizada
      }
    }

    speakWithAvatarLipSync(clean);
    return false;
  }

  async disconnect(): Promise<void> {
    const sid = this.sessionId;
    const tok = this.sessionToken;
    this.sessionId = null;
    this.sessionToken = null;
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        // ignore
      }
      this.pc = null;
    }
    this.state = 'idle';
    if (sid) {
      void apiFetch('/api/public/avatar/stop', {
        method: 'POST',
        body: { session_id: sid, session_token: tok },
      }).catch(() => {});
    }
  }
}
