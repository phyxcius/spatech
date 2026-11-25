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

  const conicGradient = isEmergency
    ? 'conic-gradient(from 0deg, #EA4335, #FBBC04, #FF2E63, #4285F4, #EA4335)'
    : isWarning
    ? 'conic-gradient(from 0deg, #FBBC04, #4285F4, #EA4335, #34A853, #FBBC04)'
    : 'conic-gradient(from 0deg, #4285F4, #EA4335, #FBBC04, #34A853, #D4AF37, #4285F4)';

  const blurHalo = isEmergency
    ? 'linear-gradient(120deg, #EA4335, #FBBC04, #FF2E63)'
    : isWarning
    ? 'linear-gradient(120deg, #FBBC04, #4285F4, #EA4335)'
    : 'linear-gradient(120deg, #4285F4, #EA4335, #FBBC04, #34A853)';

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 pointer-events-none bg-black/40 backdrop-blur-[3px]"
    >
      <div className="pointer-events-auto relative w-full max-w-md rounded-[28px] p-[3px] overflow-hidden shadow-[0_0_65px_rgba(66,133,244,0.42)] animate-in fade-in zoom-in-95 duration-200">
        {/* Borde resplandeciente rotatorio con destellos de los 4 colores Google + Luxury Gold */}
        <div
          aria-hidden="true"
          className="absolute inset-[-160%] chuspa-aistudio-glow"
          style={{ background: conicGradient }}
        />

        {/* Halo externo difuminado multi-color */}
        <div
          aria-hidden="true"
          className="absolute -inset-3 rounded-[34px] opacity-65 blur-2xl pointer-events-none"
          style={{ background: blurHalo }}
        />

        {/* Tarjeta central interior */}
        <div className="relative rounded-[26px] bg-[#090D16]/98 text-white p-5 sm:p-6 space-y-3 border border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 chuspa-google-border ${
                  isEmergency
                    ? 'bg-[#EA4335]/20 text-red-400'
                    : isWarning
                    ? 'bg-[#FBBC04]/20 text-amber-300'
                    : current.tone === 'success'
                    ? 'bg-[#34A853]/20 text-emerald-400'
                    : 'bg-[#4285F4]/20 text-sky-300'
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
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.18em] bg-gradient-to-r from-[#4285F4] via-[#FBBC04] to-[#34A853] bg-clip-text text-transparent">
                  <Sparkles className="w-3 h-3 text-[#FBBC04]" />
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
              className="w-8 h-8 rounded-xl bg-white/8 hover:bg-white/15 flex items-center justify-center text-slate-200 shrink-0 chuspa-google-btn"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
            {current.detail || current.message}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5 font-mono-tabular text-sky-300">
              <Timer className="w-3.5 h-3.5 text-[#34A853]" />
              {(current.responseTimeMs ?? current.responseMs) !== undefined
                ? `Tiempo real · ${Math.max(12, current.responseTimeMs ?? current.responseMs ?? 12)} ms`
                : 'Sincronizado al instante'}
            </span>
            {current.meta && (
              <span className="font-mono-tabular text-[#FBBC04] font-semibold">{current.meta}</span>
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
