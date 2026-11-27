import {
  handleFirebaseRtdbRequest,
  isFirebaseRtdbMode,
} from './firebaseRtdb.ts';
import { playWhatsAppNotificationSound } from './notificationSounds.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const ENV_VARS = (import.meta as { env?: Record<string, string | undefined> }).env;
export const VITE_API_URL = (ENV_VARS?.VITE_API_URL || ENV_VARS?.VITE_API_BASE_URL || '')
  .trim()
  .replace(/\/$/, '');

export async function apiFetch<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    token?: string | null;
  } = {}
): Promise<T> {
  const { method = 'GET', body, token } = options;

  const isGitHubPages =
    typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io');

  if (!VITE_API_URL && path.startsWith('/api/') && (isFirebaseRtdbMode() || isGitHubPages)) {
    try {
      return await handleFirebaseRtdbRequest<T>(path, method, body, token);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : 'Error al conectar con Firebase RTDB');
    }
  }

  const targetUrl = path.startsWith('/') && VITE_API_URL ? `${VITE_API_URL}${path}` : path;
  let res: Response;
  try {
    res = await fetch(targetUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (networkErr) {
    if (!VITE_API_URL && path.startsWith('/api/') && isGitHubPages) {
      try {
        return await handleFirebaseRtdbRequest<T>(path, method, body, token);
      } catch (err) {
        throw new ApiError(400, err instanceof Error ? err.message : 'Error conectando con Firebase RTDB');
      }
    }
    throw networkErr;
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text();
  const looksLikeHtmlOrStatic405 =
    res.status === 405 ||
    contentType.includes('text/html') ||
    text.trim().startsWith('<');

  if (
    path.startsWith('/api/') &&
    (looksLikeHtmlOrStatic405 || (!res.ok && (res.status === 404 || res.status === 405 || res.status === 501)))
  ) {
    if (!VITE_API_URL) {
      try {
        return await handleFirebaseRtdbRequest<T>(path, method, body, token);
      } catch (err) {
        throw new ApiError(res.status || 502, err instanceof Error ? err.message : 'Error consultando Firebase RTDB');
      }
    }
    throw new ApiError(
      res.status || 502,
      'El servidor backend (/api) no está disponible en este hosting estático. Configura VITE_API_URL o abre la app en Node.js.'
    );
  }

  let parsed: any = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    if (res.ok && path.startsWith('/api/')) {
      throw new ApiError(502, 'Respuesta inválida del servidor API');
    }
    parsed = { error: text };
  }

  if (!res.ok) {
    throw new ApiError(res.status, parsed?.error || `Error HTTP ${res.status}`);
  }
  return parsed as T;
}

export function playLuxuryChime(): void {
  playWhatsAppNotificationSound();
}

let cachedVoices: SpeechSynthesisVoice[] = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const refreshVoices = () => {
    try {
      cachedVoices = window.speechSynthesis.getVoices();
    } catch {
      cachedVoices = [];
    }
  };
  refreshVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
}

function pickGoogleSpanishVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
  const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
  const spanishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('es'));
  if (spanishVoices.length === 0) return undefined;

  const scoreVoice = (v: SpeechSynthesisVoice): number => {
    const name = v.name.toLowerCase();
    const lang = v.lang.toLowerCase();
    let score = 0;
    if (name.includes('google')) score += 100;
    if (name.includes('natural') || name.includes('neural') || name.includes('online')) score += 40;
    if (lang === 'es-us' || lang === 'es-419') score += 30;
    else if (lang === 'es-pe' || lang === 'es-mx') score += 28;
    else if (lang === 'es-es') score += 22;
    if (!v.localService) score += 10;
    return score;
  };

  return [...spanishVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
}

type SpeechCadenceListener = (ev: { speaking: boolean; level: number }) => void;
const speechCadenceListeners = new Set<SpeechCadenceListener>();
let speechFallbackTimer: number | null = null;

export function subscribeSpeechCadence(cb: SpeechCadenceListener): () => void {
  speechCadenceListeners.add(cb);
  return () => speechCadenceListeners.delete(cb);
}

function emitSpeechCadence(ev: { speaking: boolean; level: number }): void {
  speechCadenceListeners.forEach((cb) => cb(ev));
}

function stopSpeechCadenceTimer(): void {
  if (speechFallbackTimer !== null && typeof window !== 'undefined') {
    window.clearInterval(speechFallbackTimer);
    speechFallbackTimer = null;
  }
}

export function stopSpeaking(): void {
  stopSpeechCadenceTimer();
  emitSpeechCadence({ speaking: false, level: 0 });
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // ignore
  }
}

export function speakSpanish(text: string): void {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) return;
    const synth = window.speechSynthesis;
    const wasBusy = synth.speaking || synth.pending;
    if (wasBusy) {
      stopSpeechCadenceTimer();
      synth.cancel();
    }

    const trigger = () => {
      try {
        if (synth.paused) synth.resume();
        const utter = new SpeechSynthesisUtterance(text);
        const voice = pickGoogleSpanishVoice();
        if (voice) {
          utter.voice = voice;
          utter.lang = voice.lang;
        } else {
          utter.lang = 'es-US';
        }
        utter.rate = 1.0;
        utter.pitch = 1.0;
        utter.volume = 1.0;

        let tick = 0;
        const approxMs = Math.min(12000, Math.max(1600, text.length * 64));
        const startTs = Date.now();

        const startFallbackLoop = () => {
          stopSpeechCadenceTimer();
          speechFallbackTimer = window.setInterval(() => {
            const elapsed = Date.now() - startTs;
            if (elapsed > approxMs || (!synth.speaking && elapsed > 800)) {
              stopSpeechCadenceTimer();
              emitSpeechCadence({ speaking: false, level: 0 });
              return;
            }
            tick += 1;
            const amp = 0.32 + ((tick * 37) % 55) / 100;
            emitSpeechCadence({ speaking: true, level: amp });
          }, 110);
        };

        utter.onstart = () => {
          emitSpeechCadence({ speaking: true, level: 0.7 });
          startFallbackLoop();
        };
        utter.onboundary = (ev) => {
          const ch = text[ev.charIndex] || 'a';
          const open = /[aeoáéó]/i.test(ch);
          emitSpeechCadence({ speaking: true, level: open ? 0.88 : 0.48 });
        };
        utter.onend = () => {
          stopSpeechCadenceTimer();
          emitSpeechCadence({ speaking: false, level: 0 });
        };
        utter.onerror = () => {
          stopSpeechCadenceTimer();
          emitSpeechCadence({ speaking: false, level: 0 });
        };

        synth.speak(utter);
        startFallbackLoop();
      } catch {
        stopSpeechCadenceTimer();
        emitSpeechCadence({ speaking: false, level: 0 });
      }
    };

    if (wasBusy) {
      window.setTimeout(trigger, 50);
    } else {
      trigger();
    }
  } catch {
    // ignore speech errors
  }
}
