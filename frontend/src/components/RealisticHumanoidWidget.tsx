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
  type AvatarConnectionState,
} from '../lib/heygenAvatar.ts';
import { apiFetch, subscribeSpeechCadence } from '../lib/api.ts';
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
  webrtcStream = null,
  onClick,
  ariaLabel = 'Hablar con el asistente La Chuspa',
  title = 'Haz clic para hablar por voz',
}) => {
  const [blinking, setBlinking] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && webrtcStream) {
      videoRef.current.srcObject = webrtcStream;
      void videoRef.current.play().catch(() => {});
    }
  }, [webrtcStream]);

  // Parpadeo natural estocástico (cada 2.8s - 5.2s, con doble parpadeo ocasional)
  useEffect(() => {
    let active = true;
    let t1: number | undefined;
    let t2: number | undefined;
    let t3: number | undefined;

    const scheduleBlink = () => {
      const nextMs = 2700 + Math.random() * 2600;
      t1 = window.setTimeout(() => {
        if (!active) return;
        setBlinking(true);
        t2 = window.setTimeout(() => {
          if (!active) return;
          setBlinking(false);
          if (Math.random() < 0.22) {
            t3 = window.setTimeout(() => {
              if (!active) return;
              setBlinking(true);
              window.setTimeout(() => active && setBlinking(false), 115);
            }, 130);
          }
          scheduleBlink();
        }, 125);
      }, nextMs);
    };

    scheduleBlink();
    return () => {
      active = false;
      if (t1) window.clearTimeout(t1);
      if (t2) window.clearTimeout(t2);
      if (t3) window.clearTimeout(t3);
    };
  }, []);

  const avatarSrc = `${import.meta.env.BASE_URL}assets/concierge_human_avatar.jpg`;
  const jawDropPx = speaking ? Math.min(3.5, mouthLevel * 4) : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className={`relative group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition-transform duration-200 active:scale-95 ${sizeClass}`}
      style={{
        filter: listening
          ? 'drop-shadow(0 14px 28px rgba(56, 189, 248, 0.42))'
          : speaking
          ? 'drop-shadow(0 14px 28px rgba(212, 175, 55, 0.35))'
          : 'drop-shadow(0 18px 34px rgba(0, 0, 0, 0.48))',
      }}
    >
      {/* Halo sutil al escuchar o hablar (sin bordes cuadrados) */}
      {(listening || speaking) && (
        <span
          aria-hidden="true"
          className={`chuspa-sphere-ring absolute -inset-1.5 rounded-full pointer-events-none ${
            listening
              ? 'ring-2 ring-sky-400/75 bg-sky-400/10'
              : 'ring-2 ring-[#D4AF37]/70 bg-[#D4AF37]/10'
          }`}
        />
      )}

      {/* Contenedor circular sin bordes duros, con máscara radial suave flotante */}
      <span
        className="relative block w-full h-full rounded-full overflow-hidden bg-[#182028]"
        style={{
          WebkitMaskImage: 'radial-gradient(circle, #000 72%, rgba(0,0,0,0.88) 88%, transparent 100%)',
          maskImage: 'radial-gradient(circle, #000 72%, rgba(0,0,0,0.88) 88%, transparent 100%)',
        }}
      >
        {webrtcStream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <span
            className={`relative block w-full h-full ${
              speaking ? 'chuspa-avatar-talking' : 'chuspa-avatar-idle'
            }`}
          >
            <img
              src={avatarSrc}
              alt="Asistente Humanoide La Chuspa"
              referrerPolicy="no-referrer"
              className={`w-full h-full object-cover object-top transition-transform duration-300 ${
                listening ? 'scale-[1.06]' : 'group-hover:scale-[1.03]'
              }`}
            />

            {/* Párpados anatómicos suaves para parpadeo natural en reposo y diálogo */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute rounded-full transition-all duration-75"
              style={{
                left: '35.5%',
                top: '34.4%',
                width: '10.2%',
                height: blinking ? '3.4%' : '0%',
                opacity: blinking ? 0.92 : 0,
                background:
                  'radial-gradient(ellipse at center, #c89574 20%, #9b6c50 85%, transparent 100%)',
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute rounded-full transition-all duration-75"
              style={{
                left: '54.2%',
                top: '34.4%',
                width: '10.2%',
                height: blinking ? '3.4%' : '0%',
                opacity: blinking ? 0.92 : 0,
                background:
                  'radial-gradient(ellipse at center, #c89574 20%, #9b6c50 85%, transparent 100%)',
              }}
            />

            {/* Sincronización labial orgánica al responder por voz */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -translate-x-1/2 rounded-full transition-all duration-75"
              style={{
                left: '50%',
                top: '51.4%',
                width: speaking ? `${10.5 + mouthLevel * 3.5}%` : '0%',
                height: speaking ? `${Math.max(1.2, mouthLevel * 3.8)}%` : '0%',
                opacity: speaking ? 0.68 : 0,
                transform: `translateY(${jawDropPx * 0.35}px)`,
                background:
                  'radial-gradient(ellipse at center, rgba(42,16,18,0.88) 35%, rgba(162,92,88,0.45) 85%, transparent 100%)',
              }}
            />
          </span>
        )}
      </span>

      {/* Indicador táctil de micrófono activo sobre el borde inferior del avatar */}
      {listening && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-6 px-2.5 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-md whitespace-nowrap">
          <Mic className="w-3 h-3" />
          Escuchando
        </span>
      )}
    </button>
  );
};

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
  const [connState, setConnState] = useState<AvatarConnectionState>('idle');
  const [webrtcStream, setWebrtcStream] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);

  const controllerRef = useRef<HeygenWebRtcController | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const controller = new HeygenWebRtcController();
    controllerRef.current = controller;
    void controller.connect(
      (stream) => setWebrtcStream(stream),
      (state) => setConnState(state)
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
      const hint = 'Escribe aquí tu pedido de taxi, market, comida o botica.';
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
      setCaption('Te escucho...');

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
          sizeClass="w-14 h-14"
          listening={listening}
          speaking={speaking}
          mouthLevel={mouthLevel}
          webrtcStream={webrtcStream}
          onClick={() => {
            setClosed(false);
            setMinimized(false);
          }}
          ariaLabel="Reabrir avatar asistente La Chuspa"
          title="Abrir asistente La Chuspa"
        />
      </div>
    );
  }

  return (
    <div
      aria-label="Asistente humanoide flotante La Chuspa"
      className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 flex flex-col items-end gap-2.5 pointer-events-none max-w-[300px]"
    >
      {/* Globo flotante compacto sin bordes duros cuando hay respuesta o campo de texto */}
      {!minimized && (caption || showTextBox) && (
        <div className="pointer-events-auto w-[268px] sm:w-[290px] space-y-2">
          {caption && (
            <div className="relative rounded-2xl bg-[#0D1117]/88 text-[#F4F1EA] px-3.5 py-2.5 text-xs leading-relaxed backdrop-blur-md shadow-2xl">
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
              className="flex items-center gap-1.5 rounded-full bg-[#0D1117]/90 backdrop-blur-md pl-3.5 pr-1.5 py-1 shadow-xl"
            >
              <input
                type="text"
                value={textQuery}
                onChange={(e) => setTextQuery(e.target.value)}
                placeholder="Pide taxi, market o comida..."
                className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-400 focus:outline-none min-h-[34px]"
              />
              <button
                type="submit"
                disabled={busy || !textQuery.trim()}
                aria-label="Enviar mensaje al avatar"
                className="w-8 h-8 rounded-full bg-[#D4AF37] text-[#0B0E14] flex items-center justify-center disabled:opacity-40 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      )}

      {/* Avatar circular sin marco cuadrado tradicional flotando en la esquina inferior derecha */}
      <div className="pointer-events-auto relative flex items-end gap-2">
        {!minimized && (
          <div className="flex flex-col gap-1.5 mb-1">
            <button
              type="button"
              onClick={() => setShowTextBox((v) => !v)}
              aria-label="Escribir texto al asistente"
              title="Escribir texto"
              className="min-h-[36px] px-3 rounded-full bg-[#0D1117]/82 hover:bg-[#161E2B] text-white/90 text-[11px] font-medium backdrop-blur-md shadow-lg transition-colors whitespace-nowrap"
            >
              {showTextBox ? 'Ocultar texto' : 'Escribir'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!muted) stopAvatarSpeech();
                setMuted((m) => !m);
              }}
              aria-label={muted ? 'Activar voz del avatar' : 'Silenciar voz del avatar'}
              title={muted ? 'Activar voz' : 'Silenciar voz'}
              className="self-end w-9 h-9 rounded-full bg-[#0D1117]/82 hover:bg-[#161E2B] text-white/90 flex items-center justify-center backdrop-blur-md shadow-lg transition-colors"
            >
              {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-[#D4AF37]" />}
            </button>
          </div>
        )}

        <div className="relative">
          {/* Controles flotantes de ventana (Minimizar / Cerrar) */}
          <div className="absolute -top-2 -right-1 z-10 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMinimized((m) => !m)}
              aria-label={minimized ? 'Expandir asistente' : 'Minimizar asistente'}
              title={minimized ? 'Expandir' : 'Minimizar'}
              className="w-7 h-7 rounded-full bg-[#0D1117]/88 hover:bg-[#1E293B] text-white flex items-center justify-center shadow-md backdrop-blur-md transition-colors"
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
              className="w-7 h-7 rounded-full bg-[#0D1117]/88 hover:bg-rose-600 text-white flex items-center justify-center shadow-md backdrop-blur-md transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <RealisticAvatarPortrait
            sizeClass={minimized ? 'w-20 h-20' : 'w-32 h-32 sm:w-36 sm:h-36'}
            listening={listening}
            speaking={speaking}
            mouthLevel={mouthLevel}
            webrtcStream={webrtcStream}
            onClick={() => {
              if (minimized) {
                setMinimized(false);
              }
              toggleVoiceMicrophone();
            }}
            ariaLabel={
              listening
                ? 'Detener micrófono'
                : 'Hablar con el avatar realista La Chuspa'
            }
            title={
              connState === 'webrtc-live'
                ? 'Avatar en vivo WebRTC · Toca para hablar'
                : 'Toca el avatar para hablar por micrófono'
            }
          />

          {/* Acceso directo de micrófono en esquina inferior izquierda del círculo */}
          {!minimized && (
            <button
              type="button"
              onClick={toggleVoiceMicrophone}
              aria-label={listening ? 'Detener dictado' : 'Activar micrófono'}
              className={`absolute -bottom-1 -left-1 w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                listening
                  ? 'bg-rose-600 text-white'
                  : 'bg-[#0D1117]/90 text-sky-400 hover:text-sky-300 backdrop-blur-md'
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
