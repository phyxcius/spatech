import React, { useEffect, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, ShieldAlert, Sparkles, Timer, X } from 'lucide-react';
import { playLuxuryChime, speakSpanish } from '../lib/api.ts';
import {
  subscribeCenterNotifications,
  type CenterNotificationPayload,
} from '../lib/notifications.ts';

export const GlowingNotificationCardHost: React.FC = () => {
  const [queue, setQueue] = useState<CenterNotificationPayload[]>([]);

  useEffect(() => {
    return subscribeCenterNotifications((item) => {
      setQueue((prev) => [item, ...prev.slice(0, 3)]);
      playLuxuryChime();
      if (item.speakText) {
        speakSpanish(item.speakText);
      }
    });
  }, []);

  const current = queue[0];

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => {
      setQueue((prev) => prev.slice(1));
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [current?.id]);

  if (!current) return null;

  const isEmergency = current.tone === 'emergency';
  const isWarning = current.tone === 'warning';

  const borderAccent = isEmergency
    ? 'border-rose-500/70'
    : isWarning
    ? 'border-[#F5C400]/75'
    : 'border-[#1565F5]/60';

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 pointer-events-none bg-[#04334B]/45 backdrop-blur-[3px]"
    >
      <div
        className={`pointer-events-auto relative w-full max-w-md rounded-3xl border-2 ${borderAccent} bg-white dark:bg-[#052030] text-[#0B2538] dark:text-white shadow-2xl p-5 sm:p-6 space-y-3 animate-in fade-in zoom-in-95 duration-200`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                isEmergency
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  : isWarning
                  ? 'bg-[#F5C400]/25 text-[#04334B] dark:text-[#F5C400]'
                  : current.tone === 'success'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-[#1565F5]/15 text-[#1565F5] dark:text-[#60A5FA]'
              }`}
            >
              {isEmergency ? (
                <ShieldAlert className="w-5 h-5" />
              ) : isWarning ? (
                <AlertTriangle className="w-5 h-5" />
              ) : current.tone === 'success' ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : current.tone === 'ai' ? (
                <Sparkles className="w-5 h-5" />
              ) : (
                <BellRing className="w-5 h-5" />
              )}
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#1565F5] dark:text-[#F5C400]">
                <Sparkles className="w-3 h-3 text-[#F5C400]" />
                {current.badge || 'Notificación Instantánea La Chuspa'}
              </span>
              <h3 className="text-base sm:text-lg font-bold text-[#0B2538] dark:text-white leading-tight mt-0.5">
                {current.title}
              </h3>
              {current.subtitle && (
                <p className="text-xs font-semibold text-[#1565F5] dark:text-[#60A5FA] mt-0.5">
                  {current.subtitle}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setQueue((prev) => prev.slice(1))}
            aria-label="Cerrar notificación"
            className="w-8 h-8 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-[#F7FAFC] dark:bg-[#04334B] hover:bg-[#EBF3FF] flex items-center justify-center text-[#0B2538] dark:text-slate-200 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs sm:text-sm text-[#516478] dark:text-slate-200 leading-relaxed">
          {current.detail || current.message}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#D8E2EC] dark:border-white/10 text-[11px] text-[#516478] dark:text-slate-400">
          <span className="flex items-center gap-1.5 font-mono-tabular text-[#1565F5] dark:text-[#60A5FA]">
            <Timer className="w-3.5 h-3.5" />
            {(current.responseTimeMs ?? current.responseMs) !== undefined
              ? `Tiempo real · ${Math.max(12, current.responseTimeMs ?? current.responseMs ?? 12)} ms`
              : 'Sincronizado al instante'}
          </span>
          {current.meta && (
            <span className="font-mono-tabular text-[#04334B] dark:text-[#F5C400] font-bold">
              {current.meta}
            </span>
          )}
        </div>

        {queue.length > 1 && (
          <p className="text-[10px] text-center text-[#516478] dark:text-slate-400">
            +{queue.length - 1} notificación(es) pendiente(s) · Toca X para continuar
          </p>
        )}
      </div>
    </div>
  );
};
