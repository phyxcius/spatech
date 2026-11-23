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

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 pointer-events-none bg-black/35 backdrop-blur-[2px]"
    >
      <div className="pointer-events-auto relative w-full max-w-md rounded-[28px] p-[2.5px] overflow-hidden shadow-[0_0_55px_rgba(99,102,241,0.45)] animate-in fade-in zoom-in-95 duration-200">
        {/* Borde resplandeciente estilo Google AI Studio con colores llamativos */}
        <div
          aria-hidden="true"
          className="absolute inset-[-150%] chuspa-aistudio-glow"
          style={{
            background: isEmergency
              ? 'conic-gradient(from 0deg, #EF4444, #F97316, #FACC15, #EC4899, #EF4444)'
              : isWarning
              ? 'conic-gradient(from 0deg, #F59E0B, #4285F4, #EC4899, #FBBF24, #4285F4, #F59E0B)'
              : 'conic-gradient(from 0deg, #4285F4, #A855F7, #EC4899, #F59E0B, #10B981, #4285F4)',
          }}
        />

        {/* Halo externo difuminado */}
        <div
          aria-hidden="true"
          className="absolute -inset-2 rounded-[32px] opacity-60 blur-xl pointer-events-none"
          style={{
            background: isEmergency
              ? 'linear-gradient(120deg, #EF4444, #F59E0B, #EC4899)'
              : isWarning
              ? 'linear-gradient(120deg, #F59E0B, #4285F4, #EC4899)'
              : 'linear-gradient(120deg, #4285F4, #A855F7, #EC4899, #10B981)',
          }}
        />

        {/* Tarjeta central interior */}
        <div className="relative rounded-[26px] bg-[#0B0E14]/98 text-white p-5 sm:p-6 space-y-3 border border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  isEmergency
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                    : isWarning
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-400/45'
                    : current.tone === 'success'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : current.tone === 'ai'
                    ? 'bg-violet-500/20 text-sky-300 border border-violet-400/40'
                    : 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
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
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.18em] bg-gradient-to-r from-[#60A5FA] via-[#E879F9] to-[#FBBF24] bg-clip-text text-transparent">
                  <Sparkles className="w-3 h-3 text-[#60A5FA]" />
                  {current.badge || 'Notificación Instantánea La Chuspa'}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white leading-tight mt-0.5">
                  {current.title}
                </h3>
                {current.subtitle && (
                  <p className="text-xs font-semibold text-sky-300 mt-0.5">{current.subtitle}</p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setQueue((prev) => prev.slice(1))}
              aria-label="Cerrar notificación"
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 flex items-center justify-center text-slate-300 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
            {current.detail || current.message}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5 font-mono-tabular text-sky-300">
              <Timer className="w-3.5 h-3.5" />
              {(current.responseTimeMs ?? current.responseMs) !== undefined
                ? `Tiempo real · ${Math.max(12, current.responseTimeMs ?? current.responseMs ?? 12)} ms`
                : 'Sincronizado al instante'}
            </span>
            {current.meta && (
              <span className="font-mono-tabular text-[#E5C158] font-semibold">{current.meta}</span>
            )}
          </div>

          {queue.length > 1 && (
            <p className="text-[10px] text-center text-slate-400">
              +{queue.length - 1} notificación(es) pendiente(s) · Toca X para continuar
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
