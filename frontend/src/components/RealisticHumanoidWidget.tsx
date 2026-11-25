import React, { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Send,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  HeygenWebRtcController,
  speakWithAvatarLipSync,
  stopAvatarSpeech,
  subscribeAvatarSpeech,
} from '../lib/heygenAvatar.ts';
import { apiFetch, playLuxuryChime, subscribeSpeechCadence } from '../lib/api.ts';
import { detectIntentFromQuery } from '../lib/cuscoMarkets.ts';
import { formatSoles, type ConciergeOpcion, type Rubro } from '../types.ts';

export interface AssistantDispatchEvent {
  query: string;
  intent: 'TAXI' | 'MARKET' | 'DIVISAS' | 'OTHER';
  categoria?: Rubro;
  reply: string;
  responseMs: number;
  opciones?: ConciergeOpcion[];
}

interface RealisticAvatarPortraitProps {
  sizeClass?: string;
  listening?: boolean;
  speaking?: boolean;
  mouthLevel?: number;
  webrtcStream?: MediaStream | null;
  onClick?: () => void;
  ariaLabel?: string;
  title?: string;
}

export const RealisticAvatarPortrait: React.FC<RealisticAvatarPortraitProps> = ({
  sizeClass = 'w-32 h-32',
  listening = false,
  speaking = false,
  mouthLevel = 0,
  onClick,
  ariaLabel = 'Activar boca digital La Chuspa',
  title = 'Presiona la boca digital para hablar y activar ondas de parlante',
}) => {
  const [pulseWaveActive, setPulseWaveActive] = useState(false);
  const pulseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) {
        window.clearTimeout(pulseTimerRef.current);
      }
    };
  }, []);

  function triggerSpeakerRipple() {
    setPulseWaveActive(true);
    playLuxuryChime();
    if (pulseTimerRef.current) {
      window.clearTimeout(pulseTimerRef.current);
    }
    pulseTimerRef.current = window.setTimeout(() => {
      setPulseWaveActive(false);
    }, 2200);
    onClick?.();
  }

  const wavesOn = listening || speaking || pulseWaveActive;
  const activeEnergy = speaking
    ? Math.max(0.32, mouthLevel)
    : pulseWaveActive
    ? 0.72
    : listening
    ? 0.45
    : 0.14;

  const eqHeights = [0.42, 0.78, 1.0, 0.85, 1.0, 0.76, 0.44];

  return (
    <button
      type="button"
      onClick={triggerSpeakerRipple}
      aria-label={ariaLabel}
      title={title}
      className={`relative group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4285F4] transition-transform duration-200 active:scale-95 ${sizeClass}`}
      style={{
        filter: wavesOn
          ? 'drop-shadow(0 0 26px rgba(66, 133, 244, 0.52))'
          : 'drop-shadow(0 16px 30px rgba(0, 0, 0, 0.55))',
      }}
    >
      {/* Ondas expansivas de parlante al presionar, escuchar o responder por voz */}
      {wavesOn && (
        <>
          <span
            aria-hidden="true"
            className="chuspa-sound-wave-1 absolute -inset-2 rounded-full border-2 border-[#4285F4]/80 pointer-events-none"
          />
          <span
            aria-hidden="true"
            className="chuspa-sound-wave-2 absolute -inset-3 rounded-full border-2 border-[#FBBC04]/75 pointer-events-none"
          />
          <span
            aria-hidden="true"
            className="chuspa-sound-wave-3 absolute -inset-4 rounded-full border-2 border-[#34A853]/70 pointer-events-none"
          />
        </>
      )}

      {/* Halo circular Google AI Studio sin marco cuadrado */}
      <span
        aria-hidden="true"
        className="absolute -inset-[3px] rounded-full chuspa-aistudio-glow opacity-90 pointer-events-none"
        style={{
          background:
            'conic-gradient(from 0deg, #4285F4, #EA4335, #FBBC04, #34A853, #D4AF37, #4285F4)',
        }}
      />

      {/* Medallón circular obsidiana con boca digital del futuro */}
      <span className="relative flex items-center justify-center w-full h-full rounded-full bg-gradient-to-b from-[#0C1222] via-[#070B14] to-[#04070D] overflow-hidden border border-white/15">
        <span
          aria-hidden="true"
          className="absolute inset-0 opacity-45 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 50% 45%, rgba(66,133,244,0.34), rgba(52,168,83,0.12) 55%, transparent 78%)',
          }}
        />

        {/* SVG de Boca Digital Futurista + Arcos laterales de Parlante */}
        <svg
          viewBox="0 0 160 120"
          className="relative w-[86%] h-[68%] overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="chuspaLipGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4285F4" />
              <stop offset="33%" stopColor="#EA4335" />
              <stop offset="66%" stopColor="#FBBC04" />
              <stop offset="100%" stopColor="#34A853" />
            </linearGradient>
            <linearGradient id="chuspaMouthCore" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#FBBC04" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#34A853" stopOpacity="0.95" />
            </linearGradient>
          </defs>

          {/* Arcos laterales de onda de sonido tipo parlante */}
          <path
            d="M 18 44 Q 8 60 18 76"
            fill="none"
            stroke="#4285F4"
            strokeWidth={wavesOn ? '3' : '2'}
            strokeLinecap="round"
            opacity={wavesOn ? 0.95 : 0.32}
          />
          <path
            d="M 10 34 Q -2 60 10 86"
            fill="none"
            stroke="#34A853"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity={wavesOn ? 0.85 : 0.14}
          />
          <path
            d="M 142 44 Q 152 60 142 76"
            fill="none"
            stroke="#FBBC04"
            strokeWidth={wavesOn ? '3' : '2'}
            strokeLinecap="round"
            opacity={wavesOn ? 0.95 : 0.32}
          />
          <path
            d="M 150 34 Q 162 60 150 86"
            fill="none"
            stroke="#EA4335"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity={wavesOn ? 0.85 : 0.14}
          />

          {/* Labio superior futurista esculpido */}
          <path
            d={`M 30 60 Q 54 ${38 - activeEnergy * 8} 80 ${45 - activeEnergy * 5} Q 106 ${
              38 - activeEnergy * 8
            } 130 60`}
            fill="none"
            stroke="url(#chuspaLipGrad)"
            strokeWidth="4.2"
            strokeLinecap="round"
          />

          {/* Labio inferior futurista sincronizado con voz/ondas */}
          <path
            d={`M 30 60 Q 80 ${75 + activeEnergy * 24} 130 60`}
            fill="none"
            stroke="url(#chuspaLipGrad)"
            strokeWidth="4.4"
            strokeLinecap="round"
          />

          {/* Núcleo acústico de barras vocales en tiempo real dentro de la boca */}
          <g>
            {eqHeights.map((baseH, idx) => {
              const barH = Math.max(4, (baseH * 28 + 6) * (0.28 + activeEnergy * 0.92));
              const x = 49 + idx * 10;
              const y = 60 - barH / 2;
              return (
                <rect
                  key={idx}
                  x={x}
                  y={y}
                  width="4.5"
                  height={barH}
                  rx="2.25"
                  fill="url(#chuspaMouthCore)"
                  opacity={wavesOn ? 0.98 : 0.68}
                />
              );
            })}
          </g>
        </svg>

        {/* Etiqueta compacta parlante / escucha */}
        <span
          className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1 whitespace-nowrap ${
            listening
              ? 'bg-[#4285F4] text-white'
              : wavesOn
              ? 'bg-[#FBBC04] text-[#0B0E14]'
              : 'bg-white/10 text-slate-200 border border-white/15'
          }`}
        >
          <Volume2 className="w-2.5 h-2.5" />
          <span>{listening ? 'Escuchando' : wavesOn ? 'Parlante ON' : 'Hablar'}</span>
        </span>
      </span>
    </button>
  );
};

export const DigitalMouthPortrait = RealisticAvatarPortrait;

interface FloatingAvatarWidgetProps {
  hidden?: boolean;
  onAssistantDispatch: (event: AssistantDispatchEvent) => void;
}

export const FloatingAvatarWidget: React.FC<FloatingAvatarWidgetProps> = ({
  hidden = false,
  onAssistantDispatch,
}) => {
  const [closed, setClosed] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showTextBox, setShowTextBox] = useState(false);
  const [textQuery, setTextQuery] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [mouthLevel, setMouthLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const controllerRef = useRef<HeygenWebRtcController | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const controller = new HeygenWebRtcController();
    controllerRef.current = controller;
    void controller.connect(
      () => {},
      () => {}
    );

    const unsubSpeech = subscribeAvatarSpeech((ev) => {
      setSpeaking(ev.speaking);
      setMouthLevel(ev.level);
    });
    const unsubCadence = subscribeSpeechCadence((ev) => {
      setSpeaking(ev.speaking);
      setMouthLevel(ev.level);
    });

    return () => {
      unsubSpeech();
      unsubCadence();
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      void controller.disconnect();
    };
  }, []);

  if (hidden) return null;

  async function processAssistantPrompt(rawPrompt: string) {
    const clean = rawPrompt.trim();
    if (!clean) return;
    setBusy(true);
    setCaption(clean);
    const t0 = performance.now();

    try {
      const intent = detectIntentFromQuery(clean);
      if (intent === 'DIVISAS') {
        const ms = Math.max(1, Math.round(performance.now() - t0));
        const reply =
          'Abriendo cotizador de casas de cambio verificadas en Cusco para reservar tu tasa.';
        setCaption(reply);
        if (!muted) {
          await controllerRef.current?.speak(reply);
        }
        onAssistantDispatch({ query: clean, intent: 'DIVISAS', reply, responseMs: ms });
        return;
      }

      if (intent === 'MARKET') {
        const ms = Math.max(1, Math.round(performance.now() - t0));
        const reply =
          'Comparando minimarkets abiertos en Cusco en el mapa para que elijas el mejor precio.';
        setCaption(reply);
        if (!muted) {
          await controllerRef.current?.speak(reply);
        }
        onAssistantDispatch({ query: clean, intent: 'MARKET', reply, responseMs: ms });
        return;
      }

      const forcedCat: Rubro | undefined = intent === 'TAXI' ? 'TRANSPORTE' : undefined;
      const res = await apiFetch<{
        categoria: Rubro;
        respuesta_voz: string;
        opciones: ConciergeOpcion[];
      }>('/api/public/asistente', {
        method: 'POST',
        body: {
          query: clean,
          categoria: forcedCat,
          lat: -13.5167,
          lng: -71.9788,
        },
      });
      const opts = Array.isArray(res?.opciones) ? res.opciones : [];
      const top = opts.find((o) => o.mejor_precio) || opts[0];
      const ms = Math.max(1, Math.round(performance.now() - t0));

      const reply = top
        ? `${res.respuesta_voz} Mejor opción: ${top.titulo} (${top.negocio_nombre}) por ${formatSoles(top.precio_centavos)}.`
        : res.respuesta_voz || 'Listo, revisa las opciones en pantalla.';

      setCaption(reply);
      if (!muted) {
        await controllerRef.current?.speak(reply);
      }
      onAssistantDispatch({
        query: clean,
        intent: res.categoria === 'TRANSPORTE' ? 'TAXI' : 'OTHER',
        categoria: res.categoria,
        reply,
        responseMs: ms,
        opciones: opts,
      });
    } catch {
      const ms = Math.max(1, Math.round(performance.now() - t0));
      const fallbackReply = 'Procesando tu solicitud en La Chuspa Cusco.';
      setCaption(fallbackReply);
      if (!muted) {
        speakWithAvatarLipSync(fallbackReply);
      }
      onAssistantDispatch({
        query: clean,
        intent: detectIntentFromQuery(clean),
        reply: fallbackReply,
        responseMs: ms,
      });
    } finally {
      setBusy(false);
    }
  }

  function toggleVoiceMicrophone() {
    if (listening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setListening(false);
      return;
    }

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setShowTextBox(true);
      const hint = 'Escribe aquí tu pedido de taxi, market, botica o comida.';
      setCaption(hint);
      if (!muted) speakWithAvatarLipSync(hint);
      return;
    }

    try {
      stopAvatarSpeech();
      const rec = new SpeechRec();
      recognitionRef.current = rec;
      rec.lang = 'es-PE';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      setListening(true);
      setCaption('Te escucho por micrófono...');

      rec.onresult = (event: any) => {
        const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim();
        setListening(false);
        if (transcript) {
          setTextQuery(transcript);
          void processAssistantPrompt(transcript);
        }
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      rec.start();
    } catch {
      setListening(false);
      setShowTextBox(true);
    }
  }

  if (closed) {
    return (
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50">
        <RealisticAvatarPortrait
          sizeClass="w-16 h-16"
          listening={listening}
          speaking={speaking}
          mouthLevel={mouthLevel}
          onClick={() => {
            setClosed(false);
            setMinimized(false);
          }}
          ariaLabel="Reabrir boca digital La Chuspa"
          title="Abrir asistente de voz La Chuspa"
        />
      </div>
    );
  }

  return (
    <div
      aria-label="Asistente boca digital flotante La Chuspa"
      className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 flex flex-col items-end gap-2.5 pointer-events-none max-w-[300px]"
    >
      {!minimized && (caption || showTextBox) && (
        <div className="pointer-events-auto w-[268px] sm:w-[290px] space-y-2">
          {caption && (
            <div className="relative rounded-2xl bg-[#090D16]/90 text-[#F4F1EA] px-3.5 py-2.5 text-xs leading-relaxed backdrop-blur-md shadow-2xl chuspa-google-border">
              <div className="flex items-start justify-between gap-2">
                <p className="flex-1">{caption}</p>
                <button
                  type="button"
                  onClick={() => setCaption(null)}
                  aria-label="Ocultar mensaje"
                  className="text-slate-400 hover:text-white shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {showTextBox && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!textQuery.trim() || busy) return;
                const val = textQuery;
                setTextQuery('');
                void processAssistantPrompt(val);
              }}
              className="flex items-center gap-1.5 rounded-full bg-[#090D16]/92 backdrop-blur-md pl-3.5 pr-1.5 py-1 shadow-xl chuspa-google-border"
            >
              <input
                type="text"
                value={textQuery}
                onChange={(e) => setTextQuery(e.target.value)}
                placeholder="Pide taxi, market o botica..."
                className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-400 focus:outline-none min-h-[34px]"
              />
              <button
                type="submit"
                disabled={busy || !textQuery.trim()}
                aria-label="Enviar mensaje al asistente"
                className="w-8 h-8 rounded-full bg-[#FBBC04] text-[#0B0E14] flex items-center justify-center disabled:opacity-40 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      )}

      <div className="pointer-events-auto relative flex items-end gap-2">
        {!minimized && (
          <div className="flex flex-col gap-1.5 mb-1">
            <button
              type="button"
              onClick={() => setShowTextBox((v) => !v)}
              aria-label="Escribir texto al asistente"
              title="Escribir texto"
              className="min-h-[36px] px-3 rounded-full bg-[#090D16]/88 hover:bg-[#131C2E] text-white/95 text-[11px] font-medium backdrop-blur-md shadow-lg transition-colors whitespace-nowrap chuspa-google-btn"
            >
              {showTextBox ? 'Ocultar texto' : 'Escribir'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!muted) stopAvatarSpeech();
                setMuted((m) => !m);
              }}
              aria-label={muted ? 'Activar parlante' : 'Silenciar parlante'}
              title={muted ? 'Activar parlante' : 'Silenciar parlante'}
              className="self-end w-9 h-9 rounded-full bg-[#090D16]/88 hover:bg-[#131C2E] text-white flex items-center justify-center backdrop-blur-md shadow-lg transition-colors chuspa-google-btn"
            >
              {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-[#FBBC04]" />}
            </button>
          </div>
        )}

        <div className="relative">
          <div className="absolute -top-2 -right-1 z-10 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMinimized((m) => !m)}
              aria-label={minimized ? 'Expandir asistente' : 'Minimizar asistente'}
              title={minimized ? 'Expandir' : 'Minimizar'}
              className="w-7 h-7 rounded-full bg-[#090D16]/90 hover:bg-[#1E293B] text-white flex items-center justify-center shadow-md backdrop-blur-md transition-colors"
            >
              {minimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => {
                stopAvatarSpeech();
                setClosed(true);
              }}
              aria-label="Cerrar asistente"
              title="Cerrar"
              className="w-7 h-7 rounded-full bg-[#090D16]/90 hover:bg-rose-600 text-white flex items-center justify-center shadow-md backdrop-blur-md transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <RealisticAvatarPortrait
            sizeClass={minimized ? 'w-20 h-20' : 'w-28 h-28 sm:w-32 sm:h-32'}
            listening={listening}
            speaking={speaking}
            mouthLevel={mouthLevel}
            onClick={() => {
              if (minimized) {
                setMinimized(false);
              }
              toggleVoiceMicrophone();
            }}
            ariaLabel={listening ? 'Detener micrófono' : 'Presionar boca digital para hablar'}
            title="Presiona la boca digital para activar micrófono y ondas de sonido"
          />

          {!minimized && (
            <button
              type="button"
              onClick={toggleVoiceMicrophone}
              aria-label={listening ? 'Detener dictado' : 'Activar micrófono'}
              className={`absolute -bottom-1 -left-1 w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                listening
                  ? 'bg-[#EA4335] text-white'
                  : 'bg-[#090D16]/92 text-[#4285F4] hover:text-sky-300 backdrop-blur-md chuspa-google-btn'
              }`}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const FloatingDigitalMouthWidget = FloatingAvatarWidget;
