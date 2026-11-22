import {
  handleFirebaseRtdbRequest,
  isFirebaseRtdbMode,
} from './firebaseRtdb.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const API_BASE = ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

export async function apiFetch<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    token?: string | null;
  } = {}
): Promise<T> {
  const { method = 'GET', body, token } = options;

  if (!API_BASE && isFirebaseRtdbMode() && path.startsWith('/api/')) {
    try {
      return await handleFirebaseRtdbRequest<T>(path, method, body, token);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : 'Error al conectar con Firebase RTDB');
    }
  }

  const targetUrl = path.startsWith('/') && API_BASE ? `${API_BASE}${path}` : path;
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
    if (!API_BASE && path.startsWith('/api/') && typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')) {
      try {
        return await handleFirebaseRtdbRequest<T>(path, method, body, token);
      } catch (err) {
        throw new ApiError(400, err instanceof Error ? err.message : 'Error conectando con Firebase RTDB');
      }
    }
    throw networkErr;
  }

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!res.ok && (res.status === 404 || res.status === 405) && contentType.includes('text/html')) {
    if (!API_BASE && path.startsWith('/api/')) {
      try {
        return await handleFirebaseRtdbRequest<T>(path, method, body, token);
      } catch (err) {
        throw new ApiError(res.status, err instanceof Error ? err.message : 'Error consultando Firebase RTDB');
      }
    }
    throw new ApiError(
      res.status,
      'El servidor backend (/api) no está disponible en este hosting estático. Configura VITE_API_BASE_URL o abre la app en Node.js.'
    );
  }

  let parsed: any = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { error: text };
  }

  if (!res.ok) {
    throw new ApiError(res.status, parsed?.error || `Error HTTP ${res.status}`);
  }
  return parsed as T;
}

export function playLuxuryChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [587.33, 880]; // D5 -> A5 refined two-tone chime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + idx * 0.12;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.35);
    });
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([100, 50, 100]);
    }
  } catch {
    // Audio playback blocked before interaction
  }
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

export function stopSpeaking(): void {
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
        synth.speak(utter);
      } catch {
        // ignore speech errors
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
