import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronDown,
  MessageCircle,
  ShieldAlert,
  Sparkles,
  Timer,
  X,
} from 'lucide-react';
import { speakSpanish } from '../lib/api.ts';
import {
  playInDriveNotificationSound,
  playPaymentSuccessSound,
  playWhatsAppNotificationSound,
} from '../lib/notificationSounds.ts';
import {
  subscribeCenterNotifications,
  type CenterNotificationPayload,
} from '../lib/notifications.ts';

function resolvePlacement(item: CenterNotificationPayload): 'top' | 'center' | 'both' {
  if (item.placement) return item.placement;
  if (item.tone === 'emergency') return 'center';
  return 'top';
}

export const GlowingNotificationCardHost: React.FC = () => {
  const [topQueue, setTopQueue] = useState<CenterNotificationPayload[]>([]);
  const [centerQueue, setCenterQueue] = useState<CenterNotificationPayload[]>([]);
  const [topExpanded, setTopExpanded] = useState(false);

  useEffect(() => {
    return subscribeCenterNotifications((item) => {
      const placement = resolvePlacement(item);
      if (placement === 'top' || placement === 'both') {
        setTopQueue((prev) => [item, ...prev.slice(0, 3)]);
        setTopExpanded(false);
      }
      if (placement === 'center' || placement === 'both') {
        setCenterQueue((prev) => [item, ...prev.slice(0, 3)]);
      }

      if (item.sound === 'indriver') {
        playInDriveNotificationSound();
      } else if (item.sound === 'payment') {
        playPaymentSuccessSound();
      } else if (item.sound !== 'none') {
        playWhatsAppNotificationSound();
      }

      if (item.speakText) {
        speakSpanish(item.speakText);
      }
    });
  }, []);

  const currentTop = topQueue[0];
  const currentCenter = centerQueue[0];

  useEffect(() => {
    if (!currentTop) return;
    const timer = window.setTimeout(() => {
      setTopQueue((prev) => prev.slice(1));
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [currentTop?.id]);

  useEffect(() => {
    if (!currentCenter) return;
    const timer = window.setTimeout(() => {
      setCenterQueue((prev) => prev.slice(1));
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [currentCenter?.id]);

  return (
    <>
      {/* Notificación superior flotante estilo WhatsApp Android */}
      {currentTop && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[150] w-[calc(100%-1.5rem)] max-w-md pointer-events-none"
        >
          <div className="pointer-events-auto rounded-[26px] border border-[#D8E2EC] dark:border-white/15 bg-white/95 dark:bg-[#052030]/95 backdrop-blur-md shadow-[0_14px_38px_-10px_rgba(4,51,75,0.45)] px-3.5 py-2.5 animate-in fade-in slide-in-from-top-3 duration-200">
            <div className="flex items-center gap-3">
              {/* Icono circular verde estilo WhatsApp / alerta inDrive */}
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-xs ${
                  currentTop.sound === 'indriver'
                    ? 'bg-[#B2F52C] text-[#04334B]'
                    : currentTop.tone === 'emergency'
                    ? 'bg-rose-600 text-white'
                    : currentTop.tone === 'warning'
                    ? 'bg-[#F5C400] text-[#04334B]'
                    : 'bg-[#25D366] text-white'
                }`}
              >
                {currentTop.sound === 'indriver' ? (
                  <BellRing className="w-4.5 h-4.5" />
                ) : currentTop.tone === 'emergency' ? (
                  <ShieldAlert className="w-4.5 h-4.5" />
                ) : (
                  <MessageCircle className="w-4.5 h-4.5" />
                )}
              </div>

              <button
                type="button"
                onClick={() => setTopExpanded((v) => !v)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-[#0B2538] dark:text-white truncate">
                    {currentTop.sender || currentTop.badge || 'LA CHUSPA WHATSAPP'}
                  </span>
                  <span className="text-[10px] text-[#516478] dark:text-slate-400 shrink-0">· ahora</span>
                </div>
                <p className="text-xs font-semibold text-[#0B2538] dark:text-slate-100 truncate">
                  {currentTop.title}
                  {currentTop.subtitle ? ` — ${currentTop.subtitle}` : ''}
                </p>
                {!topExpanded && (currentTop.detail || currentTop.message) && (
                  <p className="text-[11px] text-[#516478] dark:text-slate-300 truncate">
                    {currentTop.detail || currentTop.message}
                  </p>
                )}
              </button>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setTopExpanded((v) => !v)}
                  aria-label="Expandir notificación"
                  className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center text-[#516478] dark:text-slate-300"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${topExpanded ? 'rotate-180' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setTopQueue((prev) => prev.slice(1))}
                  aria-label="Cerrar aviso superior"
                  className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center text-[#516478] dark:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {topExpanded && (
              <div className="mt-2 pt-2 border-t border-[#E2E8F0] dark:border-white/10 pl-12 pr-1 space-y-1">
                <p className="text-xs text-[#516478] dark:text-slate-200 leading-relaxed">
                  {currentTop.detail || currentTop.message}
                </p>
                {currentTop.meta && (
                  <p className="text-[11px] font-mono-tabular font-bold text-[#1565F5] dark:text-[#F5C400]">
                    {currentTop.meta}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tarjeta Central Resplandeciente (Emergencias o alertas críticas explícitas) */}
      {currentCenter && (
        <div
          role="status"
          aria-live="assertive"
          className="fixed inset-0 z-[130] flex items-center justify-center p-4 pointer-events-none bg-[#04334B]/45 backdrop-blur-[3px]"
        >
          <div
            className={`pointer-events-auto relative w-full max-w-md rounded-3xl border-2 ${
              currentCenter.tone === 'emergency'
                ? 'border-rose-500/70'
                : currentCenter.tone === 'warning'
                ? 'border-[#F5C400]/75'
                : 'border-[#1565F5]/60'
            } bg-white dark:bg-[#052030] text-[#0B2538] dark:text-white shadow-2xl p-5 sm:p-6 space-y-3 animate-in fade-in zoom-in-95 duration-200`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                    currentCenter.tone === 'emergency'
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                      : currentCenter.tone === 'warning'
                      ? 'bg-[#F5C400]/25 text-[#04334B] dark:text-[#F5C400]'
                      : currentCenter.tone === 'success'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-[#1565F5]/15 text-[#1565F5] dark:text-[#60A5FA]'
                  }`}
                >
                  {currentCenter.tone === 'emergency' ? (
                    <ShieldAlert className="w-5 h-5" />
                  ) : currentCenter.tone === 'warning' ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : currentCenter.tone === 'success' ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : currentCenter.tone === 'ai' ? (
                    <Sparkles className="w-5 h-5" />
                  ) : (
                    <BellRing className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#1565F5] dark:text-[#F5C400]">
                    <Sparkles className="w-3 h-3 text-[#F5C400]" />
                    {currentCenter.badge || 'Notificación Instantánea La Chuspa'}
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-[#0B2538] dark:text-white leading-tight mt-0.5">
                    {currentCenter.title}
                  </h3>
                  {currentCenter.subtitle && (
                    <p className="text-xs font-semibold text-[#1565F5] dark:text-[#60A5FA] mt-0.5">
                      {currentCenter.subtitle}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCenterQueue((prev) => prev.slice(1))}
                aria-label="Cerrar notificación"
                className="w-8 h-8 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-[#F7FAFC] dark:bg-[#04334B] hover:bg-[#EBF3FF] flex items-center justify-center text-[#0B2538] dark:text-slate-200 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-[#516478] dark:text-slate-200 leading-relaxed">
              {currentCenter.detail || currentCenter.message}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#D8E2EC] dark:border-white/10 text-[11px] text-[#516478] dark:text-slate-400">
              <span className="flex items-center gap-1.5 font-mono-tabular text-[#1565F5] dark:text-[#60A5FA]">
                <Timer className="w-3.5 h-3.5" />
                {(currentCenter.responseTimeMs ?? currentCenter.responseMs) !== undefined
                  ? `Tiempo real · ${Math.max(12, currentCenter.responseTimeMs ?? currentCenter.responseMs ?? 12)} ms`
                  : 'Sincronizado al instante'}
              </span>
              {currentCenter.meta && (
                <span className="font-mono-tabular text-[#04334B] dark:text-[#F5C400] font-bold">
                  {currentCenter.meta}
                </span>
              )}
            </div>

            {centerQueue.length > 1 && (
              <p className="text-[10px] text-center text-[#516478] dark:text-slate-400">
                +{centerQueue.length - 1} notificación(es) pendiente(s) · Toca X para continuar
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
};
