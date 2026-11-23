export type NotificationTone = 'info' | 'success' | 'warning' | 'emergency' | 'ai';

export interface CenterNotificationPayload {
  id: string;
  title: string;
  subtitle?: string;
  message?: string;
  detail?: string;
  badge?: string;
  tone?: NotificationTone;
  responseTimeMs?: number;
  responseMs?: number;
  meta?: string;
  speakText?: string;
}

type Listener = (item: CenterNotificationPayload) => void;
const listeners = new Set<Listener>();

const CHANNEL_NAME = 'lachuspa-realtime-notifications';
let channel: BroadcastChannel | null = null;
const seenIds = new Set<string>();

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (ev: MessageEvent<CenterNotificationPayload>) => {
      if (ev.data && ev.data.id && !seenIds.has(ev.data.id)) {
        seenIds.add(ev.data.id);
        if (seenIds.size > 200) {
          const first = seenIds.values().next().value;
          if (first) seenIds.delete(first);
        }
        listeners.forEach((cb) => cb(ev.data));
      }
    };
  }
  return channel;
}

if (typeof window !== 'undefined') {
  getChannel();
}

export function emitCenterNotification(
  payload: Omit<CenterNotificationPayload, 'id'> & { id?: string }
): void {
  const full: CenterNotificationPayload = {
    ...payload,
    id: payload.id || `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tone: payload.tone || 'info',
  };
  if (seenIds.has(full.id)) return;
  seenIds.add(full.id);
  if (seenIds.size > 200) {
    const first = seenIds.values().next().value;
    if (first) seenIds.delete(first);
  }
  listeners.forEach((cb) => cb(full));
  try {
    getChannel()?.postMessage(full);
  } catch {
    // ignore channel errors
  }
}

export function subscribeCenterNotifications(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
