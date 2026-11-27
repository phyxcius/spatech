const SOUND_PREF_KEY = 'lachuspa_sound_enabled';

let sharedAudioCtx: AudioContext | null = null;
let audioUnlocked = false;
const soundListeners = new Set<(enabled: boolean) => void>();

function readSoundPref(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    const saved = window.localStorage.getItem(SOUND_PREF_KEY);
    return saved !== 'false';
  } catch {
    return true;
  }
}

let soundEnabled = readSoundPref();

export function isNotificationSoundEnabled(): boolean {
  return soundEnabled;
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SOUND_PREF_KEY, enabled ? 'true' : 'false');
    }
  } catch {
    // ignore storage errors
  }
  if (enabled) {
    unlockNotificationAudio();
  }
  soundListeners.forEach((cb) => cb(soundEnabled));
}

export function subscribeNotificationSoundToggle(cb: (enabled: boolean) => void): () => void {
  soundListeners.add(cb);
  return () => soundListeners.delete(cb);
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function unlockNotificationAudio(): void {
  if (typeof window === 'undefined') return;
  const ctx = getOrCreateAudioContext();
  if (!ctx || audioUnlocked) return;
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    audioUnlocked = true;
  } catch {
    // Wait for next user gesture
  }
}

function scheduleTone(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  peakGain: number,
  type: OscillatorType = 'sine'
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  const start = ctx.currentTime + startOffset;
  osc.frequency.setValueAtTime(freq, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/**
 * Tono tipo notificación WhatsApp (doble pulso cristalino B5 -> E6)
 */
export function playWhatsAppNotificationSound(): void {
  if (!soundEnabled) return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    scheduleTone(ctx, 987.77, 0, 0.14, 0.14, 'triangle');
    scheduleTone(ctx, 1318.51, 0.09, 0.24, 0.16, 'sine');
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([70, 40, 70]);
    }
  } catch {
    // Ignore autoplay errors
  }
}

/**
 * Tono tipo inDrive para alertas entrantes de carreras y pedidos de negocios
 */
export function playInDriveNotificationSound(): void {
  if (!soundEnabled) return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    // Doble ráfaga ascendente distintiva (E5 -> A5 -> D6, pausa breve, E5 -> A5 -> D6)
    scheduleTone(ctx, 659.25, 0.0, 0.12, 0.14, 'triangle');
    scheduleTone(ctx, 880.0, 0.08, 0.14, 0.16, 'triangle');
    scheduleTone(ctx, 1174.66, 0.16, 0.22, 0.15, 'sine');

    scheduleTone(ctx, 659.25, 0.44, 0.12, 0.13, 'triangle');
    scheduleTone(ctx, 880.0, 0.52, 0.14, 0.15, 'triangle');
    scheduleTone(ctx, 1174.66, 0.60, 0.28, 0.16, 'sine');

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([120, 60, 120, 60, 160]);
    }
  } catch {
    // Ignore autoplay errors
  }
}

/**
 * Tono de confirmación de pago Yape/Plin/Transferencia aprobado
 */
export function playPaymentSuccessSound(): void {
  if (!soundEnabled) return;
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    scheduleTone(ctx, 783.99, 0.0, 0.13, 0.12, 'sine');
    scheduleTone(ctx, 987.77, 0.09, 0.15, 0.14, 'sine');
    scheduleTone(ctx, 1318.51, 0.18, 0.34, 0.16, 'triangle');
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([80, 40, 120]);
    }
  } catch {
    // Ignore autoplay errors
  }
}
