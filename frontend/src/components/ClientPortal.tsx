import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Compass,
  Hotel,
  MapPin,
  Mic,
  MicOff,
  Pill,
  Search,
  ShieldAlert,
  ShoppingBasket,
  Siren,
  Sparkles,
  Sprout,
  Ticket,
  Utensils,
  Volume2,
  Wrench,
  X,
} from 'lucide-react';
import { apiFetch, speakSpanish, stopSpeaking } from '../lib/api.ts';
import {
  formatSoles,
  RUBRO_LABELS,
  type ConciergeOpcion,
  type MetodoPago,
  type PedidoPublico,
  type Rubro,
} from '../types.ts';
import {
  BodegaMinimarketModule,
  CampoDirectoModule,
  OficiosModule,
} from './MarketplaceModules.tsx';
import {
  EmergencyDispatchCenter,
  SosActiveModalCard,
} from './DispatchAndRouteModules.tsx';

interface ClientPortalProps {
  onOrderCreated: (pedido: PedidoPublico, pin: string) => void;
  openAssistantSignal: number;
}

type ClientTab =
  | 'CONCIERGE'
  | 'DIVISAS'
  | 'BUTACAS'
  | 'BODEGA'
  | 'OFICIOS'
  | 'CAMPO'
  | 'DESPACHO';

interface DivisaRate {
  id: number;
  negocio_id: number;
  negocio_nombre: string;
  zona: string;
  moneda_origen: string;
  moneda_destino: string;
  tasa_compra: number;
  tasa_venta: number;
}

interface SeatRoute {
  id: number;
  negocio_id: number;
  negocio_nombre: string;
  codigo_ruta: string;
  ruta: string;
  unidad: string;
  salida_at: string;
  precio_centavos: number;
  total_asientos: number;
  asientos_ocupados: number[];
}

export const ClientPortal: React.FC<ClientPortalProps> = ({
  onOrderCreated,
  openAssistantSignal,
}) => {
  const [subTab, setSubTab] = useState<ClientTab>('CONCIERGE');
  const [query, setQuery] = useState('');
  const [selectedRubro, setSelectedRubro] = useState<Rubro | null>(null);
  const [destino, setDestino] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: -13.5167,
    lng: -71.9788,
  });
  const [gpsStatus, setGpsStatus] = useState<'default' | 'live' | 'denied'>('default');
  const [loading, setLoading] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [replyText, setReplyText] = useState<string>(
    'Solicita un traslado ejecutivo, guía privado, mesa gourmet o botica 24h en Cusco.'
  );
  const [activeCategory, setActiveCategory] = useState<Rubro>('TRANSPORTE');
  const [opciones, setOpciones] = useState<ConciergeOpcion[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hoja de confirmación
  const [selectedOption, setSelectedOption] = useState<ConciergeOpcion | null>(null);
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('Yape');
  const [promotorCodigo, setPromotorCodigo] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // Divisas state
  const [divisas, setDivisas] = useState<DivisaRate[]>([]);
  const [divisaOp, setDivisaOp] = useState<'COMPRA' | 'VENTA'>('COMPRA');
  const [divisaMonto, setDivisaMonto] = useState('200');
  const [divisaLockCode, setDivisaLockCode] = useState<{
    codigo_retiro: string;
    monto_destino_pen: number;
    moneda: string;
  } | null>(null);

  // Butacas state
  const [rutasButacas, setRutasButacas] = useState<SeatRoute[]>([]);
  const [selectedSeatRoute, setSelectedSeatRoute] = useState<SeatRoute | null>(null);
  const [selectedSeatNum, setSelectedSeatNum] = useState<number | null>(null);
  const [tourPackage, setTourPackage] = useState<'DIRECTO' | 'AGENCY'>('DIRECTO');
  const [vinicuncaOcupados, setVinicuncaOcupados] = useState<number[]>([1, 2, 5, 6, 9, 12]);
  const [seatSuccess, setSeatSuccess] = useState<{
    codigo_ruta: string;
    asiento_numero: number;
    cliente_pin: string;
    nota?: string;
  } | null>(null);

  // SOS modal
  const [sosOpen, setSosOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    handleSearch('taxi ejecutivo aeropuerto', 'TRANSPORTE', true);
  }, []);

  useEffect(() => {
    if (openAssistantSignal > 0) {
      setSubTab('CONCIERGE');
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [openAssistantSignal]);

  useEffect(() => {
    if (subTab === 'DIVISAS') {
      apiFetch<{ tasas: DivisaRate[] }>('/api/public/divisas')
        .then((res) => setDivisas(res.tasas))
        .catch(() => {});
    } else if (subTab === 'BUTACAS') {
      apiFetch<{ rutas: SeatRoute[] }>('/api/public/butacas')
        .then((res) => {
          setRutasButacas(res.rutas);
          if (res.rutas.length > 0) setSelectedSeatRoute(res.rutas[0]);
        })
        .catch(() => {});
    }
  }, [subTab]);

  function requestGps() {
    if (!navigator.geolocation) {
      setGpsStatus('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus('live');
      },
      () => setGpsStatus('denied'),
      { timeout: 6000 }
    );
  }

  async function handleSearch(customQuery?: string, forcedCat?: Rubro, silent = false) {
    const q = (customQuery ?? query).trim();
    if (!silent && speakReplies && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.resume();
      } catch {
        // ignore
      }
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{
        categoria: Rubro;
        respuesta_voz: string;
        destino_sugerido?: string;
        ai_error?: string | null;
        opciones: ConciergeOpcion[];
      }>('/api/public/asistente', {
        method: 'POST',
        body: {
          query: q,
          categoria: forcedCat ?? selectedRubro ?? undefined,
          lat: coords.lat,
          lng: coords.lng,
          destino: destino || undefined,
        },
      });
      setActiveCategory(res.categoria);
      setOpciones(res.opciones);
      setReplyText(res.respuesta_voz);
      if (res.destino_sugerido && !destino) {
        setDestino(res.destino_sugerido);
      }
      if (!silent && speakReplies) {
        speakSpanish(res.respuesta_voz);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo consultar el catálogo');
    } finally {
      setLoading(false);
    }
  }

  function handleVoiceCapture() {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setErrorMsg('Tu navegador no soporta dictado de voz; escribe tu pedido en el buscador.');
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'es-PE';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setVoiceActive(true);
    rec.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      setQuery(transcript);
      setSelectedRubro(null);
      setVoiceActive(false);
      handleSearch(transcript);
    };
    rec.onerror = () => setVoiceActive(false);
    rec.onend = () => setVoiceActive(false);
    rec.start();
  }

  async function handleConfirmOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOption) return;
    setSubmittingOrder(true);
    setSheetError(null);
    try {
      if (selectedOption.tipo === 'TAXI' && selectedOption.unidad_id) {
        const res = await apiFetch<{ pedido: PedidoPublico; cliente_pin: string }>(
          '/api/public/taxi/pedir',
          {
            method: 'POST',
            body: {
              unidad_id: selectedOption.unidad_id,
              metodo_pago: metodoPago,
              cliente_nombre: clienteNombre,
              cliente_telefono: clienteTelefono,
              origen_texto: gpsStatus === 'live' ? 'Mi ubicación GPS' : 'Plaza de Armas, Cusco',
              destino_texto: destino || 'Aeropuerto Velasco Astete',
              origen_lat: coords.lat,
              origen_lng: coords.lng,
              promotor_codigo: promotorCodigo || undefined,
            },
          }
        );
        setSelectedOption(null);
        onOrderCreated(res.pedido, res.cliente_pin);
      } else if (selectedOption.servicio_id) {
        const res = await apiFetch<{ pedido: PedidoPublico; cliente_pin: string }>(
          '/api/public/pedidos',
          {
            method: 'POST',
            body: {
              negocio_id: selectedOption.negocio_id,
              servicio_id: selectedOption.servicio_id,
              categoria: selectedOption.categoria,
              metodo_pago: metodoPago,
              cliente_nombre: clienteNombre,
              cliente_telefono: clienteTelefono,
              transcripcion: query || selectedOption.titulo,
              promotor_codigo: promotorCodigo || undefined,
            },
          }
        );
        setSelectedOption(null);
        onOrderCreated(res.pedido, res.cliente_pin);
      }
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Error al confirmar el pedido');
    } finally {
      setSubmittingOrder(false);
    }
  }

  async function handleLockRate(rate: DivisaRate) {
    if (!clienteNombre.trim() || !clienteTelefono.trim()) {
      setErrorMsg('Ingresa tu nombre y WhatsApp en la calculadora para reservar la tasa.');
      return;
    }
    setErrorMsg(null);
    try {
      const res = await apiFetch<{
        codigo_retiro: string;
        monto_destino_pen: number;
        moneda: string;
      }>('/api/public/divisas/reservar', {
        method: 'POST',
        body: {
          negocio_id: rate.negocio_id,
          moneda: rate.moneda_origen,
          operacion: divisaOp,
          monto_origen: Number(divisaMonto) || 100,
          cliente_nombre: clienteNombre,
          cliente_telefono: clienteTelefono,
        },
      });
      setDivisaLockCode(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo reservar la tasa');
    }
  }

  async function handleReserveSeat(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSeatRoute || !selectedSeatNum) return;
    setErrorMsg(null);
    if (selectedSeatRoute.id === 999) {
      const pin = String(Math.floor(1000 + Math.random() * 9000));
      setVinicuncaOcupados((prev) =>
        prev.includes(selectedSeatNum) ? prev : [...prev, selectedSeatNum]
      );
      setSeatSuccess({
        codigo_ruta: tourPackage === 'DIRECTO' ? 'VIN-CORDILLERA' : 'VIN-QESWACHAKA',
        asiento_numero: selectedSeatNum,
        cliente_pin: pin,
        nota:
          tourPackage === 'DIRECTO'
            ? 'Transportes Cordillera Andina (Solo Traslado S/ 45.00)'
            : "Q'eswachaka Perú Tours (Full Agency S/ 85.00)",
      });
      setSelectedSeatNum(null);
      return;
    }
    try {
      const res = await apiFetch<{
        codigo_ruta: string;
        asiento_numero: number;
        cliente_pin: string;
      }>('/api/public/butacas/reservar', {
        method: 'POST',
        body: {
          asiento_servicio_id: selectedSeatRoute.id,
          asiento_numero: selectedSeatNum,
          cliente_nombre: clienteNombre,
          cliente_telefono: clienteTelefono,
        },
      });
      setSeatSuccess(res);
      setSelectedSeatNum(null);
      const updated = await apiFetch<{ rutas: SeatRoute[] }>('/api/public/butacas');
      setRutasButacas(updated.rutas);
      const match = updated.rutas.find((r) => r.id === selectedSeatRoute.id);
      if (match) setSelectedSeatRoute(match);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo reservar la butaca');
    }
  }

  const shortcutItems: Array<{ label: string; rubro?: Rubro; tab?: ClientTab; icon: React.ReactNode; prompt?: string }> = [
    { label: 'Taxi GPS', rubro: 'TRANSPORTE', icon: <Compass className="w-4 h-4" />, prompt: 'Quiero un taxi ejecutivo al aeropuerto' },
    { label: 'Gastronomía', rubro: 'RESTAURANTE', icon: <Utensils className="w-4 h-4" />, prompt: 'Ceviche gourmet y lomo saltado' },
    { label: 'Botica 24h', rubro: 'FARMACIA', icon: <Pill className="w-4 h-4" />, prompt: 'Kit soroche oxígeno y pastillas' },
    { label: 'Tours Privados', rubro: 'TURISMO', icon: <Sparkles className="w-4 h-4" />, prompt: 'Guía privado Machu Picchu o Valle Sagrado' },
    { label: 'Hoteles', rubro: 'HOTEL', icon: <Hotel className="w-4 h-4" />, prompt: 'Suite oxigenada o spa andino' },
    { label: 'Divisas', tab: 'DIVISAS', icon: <ArrowLeftRight className="w-4 h-4" /> },
    { label: 'Butacas VIP', tab: 'BUTACAS', icon: <Ticket className="w-4 h-4" /> },
    { label: 'Bodega & Vivero', tab: 'BODEGA', icon: <ShoppingBasket className="w-4 h-4" /> },
    { label: 'Oficios', tab: 'OFICIOS', icon: <Wrench className="w-4 h-4" /> },
    { label: 'Campo B2B', tab: 'CAMPO', icon: <Sprout className="w-4 h-4" /> },
    { label: 'Central SOS', tab: 'DESPACHO', icon: <Siren className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-8 pb-24 md:pb-12">
      {/* Hero Editorial Concierge */}
      <section className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 sm:p-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-8 flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <p className="text-xs tracking-[0.2em] uppercase text-[#9A7B2C] dark:text-[#D4AF37] font-medium">
                Cusco, Perú · Concierge Privado Multinegocio
              </p>
              <h1 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight text-balance leading-[1.08] text-[#14171F] dark:text-[#F4F1EA]">
                Movilidad ejecutiva, alta cocina y experiencias curadas en un solo gesto.
              </h1>
              <div className="flex items-start gap-3 max-w-2xl">
                <p className="text-sm sm:text-base text-[#555B66] dark:text-[#A3A9B5] leading-relaxed flex-1">
                  {replyText}
                </p>
                <button
                  type="button"
                  onClick={() => speakSpanish(replyText)}
                  title="Escuchar respuesta con voz"
                  aria-label="Escuchar respuesta con voz"
                  className="min-h-[36px] min-w-[36px] shrink-0 rounded-xl border border-[#D4AF37]/35 bg-[#D4AF37]/10 text-[#9A7B2C] dark:text-[#E5C158] flex items-center justify-center hover:bg-[#D4AF37]/20 transition-colors"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Buscador protagonista con voz y texto */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSubTab('CONCIERGE');
                setSelectedRubro(null);
                handleSearch();
              }}
              className="flex flex-col sm:flex-row gap-3"
            >
              <div className="relative flex-1 flex items-center">
                <Search className="w-4 h-4 text-[#8A8F99] absolute left-4 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ej: Taxi al Aeropuerto, kit para el soroche, tour Valle Sagrado..."
                  className="w-full min-h-[48px] pl-11 pr-14 rounded-2xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm text-[#14171F] dark:text-[#F4F1EA] placeholder:text-[#7B8290] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                />
                <button
                  type="button"
                  onClick={handleVoiceCapture}
                  title="Pedir por voz"
                  aria-label="Pedir por voz"
                  className={`absolute right-2 min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center transition-colors ${
                    voiceActive
                      ? 'bg-[#C81E5B] text-white'
                      : 'text-[#6A717E] hover:text-[#D4AF37] hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {voiceActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="min-h-[48px] px-7 rounded-2xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-sm font-semibold whitespace-nowrap shrink-0 hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {loading ? 'Consultando...' : 'Consultar'}
              </button>
            </form>

            {/* Atajos y controles secundarios */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                {shortcutItems.map((sc) => {
                  const isActive =
                    (sc.tab && subTab === sc.tab) ||
                    (!sc.tab && subTab === 'CONCIERGE' && activeCategory === sc.rubro);
                  return (
                    <button
                      key={sc.label}
                      type="button"
                      onClick={() => {
                        if (sc.tab) {
                          setSubTab(sc.tab);
                        } else if (sc.rubro) {
                          setSubTab('CONCIERGE');
                          setSelectedRubro(sc.rubro);
                          setQuery(sc.prompt || '');
                          handleSearch(sc.prompt || '', sc.rubro);
                        }
                      }}
                      className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-2 whitespace-nowrap shrink-0 border transition-colors ${
                        isActive
                          ? 'bg-[#14213D] text-white border-[#14213D] dark:bg-[#D4AF37]/15 dark:text-[#E5C158] dark:border-[#D4AF37]/50'
                          : 'bg-transparent border-black/10 dark:border-white/10 text-[#4A505C] dark:text-[#B4BAC4] hover:border-[#D4AF37]/40'
                      }`}
                    >
                      {sc.icon}
                      <span>{sc.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={requestGps}
                  className="min-h-[44px] px-3.5 rounded-xl border border-black/10 dark:border-white/10 text-xs font-medium text-[#4A505C] dark:text-[#B4BAC4] flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:border-[#D4AF37]/40"
                >
                  <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>{gpsStatus === 'live' ? 'GPS Activo' : 'Usar mi GPS'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !speakReplies;
                    setSpeakReplies(next);
                    if (next) {
                      speakSpanish(replyText);
                    } else {
                      stopSpeaking();
                    }
                  }}
                  className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    speakReplies
                      ? 'border-[#D4AF37] text-[#9A7B2C] dark:text-[#E5C158]'
                      : 'border-black/10 dark:border-white/10 text-[#4A505C] dark:text-[#B4BAC4]'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{speakReplies ? 'Voz Activa' : 'Voz'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSosOpen(true)}
                  className="min-h-[44px] px-3.5 rounded-xl border border-[#C81E5B]/40 text-xs font-medium text-[#C81E5B] flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:bg-[#C81E5B]/10"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>SOS</span>
                </button>
              </div>
            </div>
          </div>

          {/* Radar Topográfico Cusco / Resumen de Categoría */}
          <div className="lg:col-span-4 rounded-2xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[#6A717E] dark:text-[#98A0AD]">
              <span>Centro Histórico · Cusco</span>
              <span className="font-mono-tabular">
                {coords.lat.toFixed(3)}, {coords.lng.toFixed(3)}
              </span>
            </div>
            <svg viewBox="0 0 280 150" className="w-full h-36 my-3" aria-hidden="true">
              <defs>
                <radialGradient id="cuscoRadar" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx="140" cy="75" r="64" fill="url(#cuscoRadar)" />
              <circle cx="140" cy="75" r="56" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3 4" />
              <circle cx="140" cy="75" r="34" fill="none" stroke="currentColor" strokeOpacity="0.18" />
              <path d="M24 115 Q90 85 140 75 T258 38" fill="none" stroke="#D4AF37" strokeWidth="1.5" strokeOpacity="0.7" />
              <circle cx="140" cy="75" r="5" fill="#D4AF37" />
              <circle cx="96" cy="58" r="3.5" fill="#C81E5B" />
              <circle cx="192" cy="92" r="3.5" fill="#D4AF37" fillOpacity="0.8" />
              <circle cx="172" cy="46" r="3.5" fill="#D4AF37" fillOpacity="0.6" />
            </svg>
            <div className="text-xs text-[#555B66] dark:text-[#A3A9B5] flex items-center justify-between border-t border-black/10 dark:border-white/10 pt-3">
              <span>Categoría activa</span>
              <span className="font-medium text-[#14171F] dark:text-[#F4F1EA]">
                {RUBRO_LABELS[activeCategory]}
              </span>
            </div>
          </div>
        </div>
      </section>

      {errorMsg && (
        <div className="rounded-2xl border border-[#C81E5B]/40 bg-[#C81E5B]/10 px-4 py-3 text-sm text-[#C81E5B]">
          {errorMsg}
        </div>
      )}

      {/* SUBVISTA: CONCIERGE & COMPARADOR */}
      {subTab === 'CONCIERGE' && (
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#14171F] dark:text-[#F4F1EA]">
                {RUBRO_LABELS[activeCategory]}
              </h2>
              <p className="text-xs sm:text-sm text-[#6A717E] dark:text-[#98A0AD]">
                Comparador en tiempo real · Cada solicitud se enruta únicamente a prestadores verificados de este rubro
              </p>
            </div>
            {activeCategory === 'TRANSPORTE' && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                  placeholder="Destino (ej. Aeropuerto, Ollantaytambo)"
                  className="min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs sm:text-sm text-[#14171F] dark:text-[#F4F1EA] w-full sm:w-72"
                />
              </div>
            )}
          </div>

          {opciones.length === 0 ? (
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-10 text-center space-y-3">
              <p className="text-sm text-[#6A717E] dark:text-[#98A0AD]">
                No encontramos disponibilidad para esa búsqueda exacta en este rubro.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  handleSearch('', activeCategory);
                }}
                className="min-h-[44px] px-5 rounded-xl border border-[#D4AF37]/50 text-xs font-medium text-[#9A7B2C] dark:text-[#E5C158]"
              >
                Ver todo el catálogo de {RUBRO_LABELS[activeCategory]}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {opciones.map((op, idx) => (
                <article
                  key={`${op.negocio_id}-${op.unidad_id || op.servicio_id || idx}`}
                  className={`rounded-2xl border bg-white dark:bg-[#121620] p-6 flex flex-col justify-between gap-5 transition-colors ${
                    op.mejor_precio
                      ? 'border-[#D4AF37]/60'
                      : 'border-black/10 dark:border-white/10'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-[#6A717E] dark:text-[#98A0AD]">
                      <span className="truncate">{op.negocio_nombre}</span>
                      <span className="font-mono-tabular shrink-0">
                        ★ {op.calificacion.toFixed(2)}
                      </span>
                    </div>
                    <h3 className="font-display text-2xl font-semibold leading-snug text-[#14171F] dark:text-[#F4F1EA]">
                      {op.titulo}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#555B66] dark:text-[#A3A9B5] leading-relaxed">
                      {op.descripcion}
                    </p>
                    <div className="text-xs text-[#6A717E] dark:text-[#98A0AD] flex flex-wrap items-center gap-2 pt-1">
                      <span>{op.eta_min} min aprox.</span>
                      {op.distancia_km !== undefined && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">{op.distancia_km.toFixed(1)} km</span>
                        </>
                      )}
                      {op.mejor_precio && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#9A7B2C] dark:text-[#E5C158] font-semibold">
                            Mejor tarifa
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-4 border-t border-black/8 dark:border-white/8">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-[#6A717E] dark:text-[#98A0AD]">
                        Tarifa verificada
                      </p>
                      <p className="font-mono-tabular text-xl font-semibold text-[#14171F] dark:text-[#F4F1EA]">
                        {op.tipo === 'DIVISA' && op.tasa_compra
                          ? `S/ ${op.tasa_compra.toFixed(3)}`
                          : formatSoles(op.precio_centavos)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (op.tipo === 'DIVISA') {
                          setSubTab('DIVISAS');
                        } else {
                          setSheetError(null);
                          setSelectedOption(op);
                        }
                      }}
                      className="min-h-[44px] px-5 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-semibold whitespace-nowrap shrink-0 hover:opacity-90 transition-opacity"
                    >
                      {op.tipo === 'DIVISA' ? 'Cotizar' : 'Solicitar'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SUBVISTA: DIVISAS */}
      {subTab === 'DIVISAS' && (
        <section className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 sm:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold">
                Mesa de Cambio & Tasas Preferenciales
              </h2>
              <p className="text-xs sm:text-sm text-[#6A717E] dark:text-[#98A0AD]">
                Reserva tu tipo de cambio y obtén un código garantizado de retiro en ventanilla
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDivisaOp('COMPRA')}
                className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold border ${
                  divisaOp === 'COMPRA'
                    ? 'bg-[#14213D] text-white border-[#14213D] dark:bg-[#D4AF37] dark:text-[#0B0E14] dark:border-[#D4AF37]'
                    : 'border-black/15 dark:border-white/15'
                }`}
              >
                Vender Divisa (Recibes S/)
              </button>
              <button
                type="button"
                onClick={() => setDivisaOp('VENTA')}
                className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold border ${
                  divisaOp === 'VENTA'
                    ? 'bg-[#14213D] text-white border-[#14213D] dark:bg-[#D4AF37] dark:text-[#0B0E14] dark:border-[#D4AF37]'
                    : 'border-black/15 dark:border-white/15'
                }`}
              >
                Comprar Divisa
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="number"
              min="10"
              value={divisaMonto}
              onChange={(e) => setDivisaMonto(e.target.value)}
              placeholder="Monto en USD / EUR"
              className="min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm font-mono-tabular"
            />
            <input
              type="text"
              value={clienteNombre}
              onChange={(e) => setClienteNombre(e.target.value)}
              placeholder="Tu nombre completo"
              className="min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
            />
            <input
              type="tel"
              value={clienteTelefono}
              onChange={(e) => setClienteTelefono(e.target.value)}
              placeholder="WhatsApp (+51...)"
              className="min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
            />
          </div>

          {divisaLockCode && (
            <div className="rounded-2xl border border-[#D4AF37]/50 bg-[#D4AF37]/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-[#9A7B2C] dark:text-[#E5C158]">
                  Tasa bloqueada por 60 minutos
                </p>
                <p className="font-mono-tabular text-xl font-semibold">
                  Código: {divisaLockCode.codigo_retiro}
                </p>
              </div>
              <p className="font-mono-tabular text-lg font-semibold">
                Recibes: S/ {divisaLockCode.monto_destino_pen.toFixed(2)}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {divisas.map((r) => {
              const rate = divisaOp === 'COMPRA' ? r.tasa_compra : r.tasa_venta;
              const est = ((Number(divisaMonto) || 0) * rate).toFixed(2);
              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-black/10 dark:border-white/10 p-5 flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                      {r.negocio_nombre} · {r.zona}
                    </p>
                    <p className="font-display text-2xl font-semibold">
                      {r.moneda_origen} / {r.moneda_destino}
                    </p>
                    <p className="text-xs font-mono-tabular text-[#6A717E] dark:text-[#98A0AD]">
                      Compra {r.tasa_compra.toFixed(3)} · Venta {r.tasa_venta.toFixed(3)}
                    </p>
                  </div>
                  <div className="text-right space-y-2">
                    <p className="font-mono-tabular text-lg font-semibold">S/ {est}</p>
                    <button
                      type="button"
                      onClick={() => handleLockRate(r)}
                      className="min-h-[44px] px-4 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-semibold whitespace-nowrap"
                    >
                      Bloquear tasa
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* SUBVISTA: BUTACAS INTERPROVINCIALES & VAN TURÍSTICA VINICUNCA */}
      {subTab === 'BUTACAS' && (() => {
        const vinicuncaRoute: SeatRoute = {
          id: 999,
          negocio_id: 3,
          negocio_nombre:
            tourPackage === 'DIRECTO'
              ? 'Transportes Cordillera Andina'
              : "Q'eswachaka Perú Tours",
          codigo_ruta: 'TOUR-VINICUNCA-15',
          ruta: 'Tour: Montaña de 7 Colores (Vinicunca)',
          unidad: 'Van Turística Panorámica · 15 Asientos',
          salida_at: 'Diario · 04:30 AM',
          precio_centavos: tourPackage === 'DIRECTO' ? 4500 : 8500,
          total_asientos: 14,
          asientos_ocupados: vinicuncaOcupados,
        };
        const allRoutes = [vinicuncaRoute, ...rutasButacas];
        const activeRoute =
          allRoutes.find((r) => r.id === (selectedSeatRoute?.id ?? 999)) || vinicuncaRoute;

        const seatLabel = (num: number): string => {
          if (num === 1) return 'Copiloto Panorámico';
          if (num >= 11) return 'Fila Trasera (4 asientos)';
          if (num === 2 || num === 5 || num === 8) return 'Ventana Izquierda';
          if (num === 3 || num === 6 || num === 9) return 'Pasillo / Medio';
          return 'Ventana Derecha';
        };

        return (
          <section className="rounded-3xl border border-black/10 dark:border-white/10 bg-[#0D1117] text-slate-100 p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400 font-bold">
                  Cotizador Turístico & Mapa de Cabina en Tiempo Real
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white mt-1">
                  Reserva de Butacas VIP & Tours Cusco
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Compara operador directo vs agencia completa y elige tu asiento exacto (Ventana / Pasillo).
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] bg-[#07090E] border border-white/10 px-3.5 py-2 rounded-xl">
                <span className="flex items-center gap-1.5 text-emerald-300">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40 border border-emerald-400" /> Libre
                </span>
                <span className="flex items-center gap-1.5 text-amber-300">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Tu Elección
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-700" /> Ocupado
                </span>
              </div>
            </div>

            {/* Comparador Tour Montaña de 7 Colores */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setTourPackage('DIRECTO');
                  setSelectedSeatRoute(vinicuncaRoute);
                  setSelectedSeatNum(null);
                }}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  tourPackage === 'DIRECTO' && activeRoute.id === 999
                    ? 'border-emerald-500/70 bg-emerald-500/10'
                    : 'border-white/10 bg-[#07090E] hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Solo Traslado Directo
                  </span>
                  <span className="font-mono-tabular text-xl font-black text-emerald-400">
                    S/ 45.00
                  </span>
                </div>
                <p className="font-display text-lg font-semibold text-white mt-2">
                  Transportes Cordillera Andina
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ida y vuelta Plaza Regocijo ⇄ Cusipata · Van Sprinter reclinable · Ideal si llevas equipo propio.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTourPackage('AGENCY');
                  setSelectedSeatRoute(vinicuncaRoute);
                  setSelectedSeatNum(null);
                }}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  tourPackage === 'AGENCY' && activeRoute.id === 999
                    ? 'border-amber-500/70 bg-amber-500/10'
                    : 'border-white/10 bg-[#07090E] hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Full Agency Todo Incluido
                  </span>
                  <span className="font-mono-tabular text-xl font-black text-amber-400">
                    S/ 85.00
                  </span>
                </div>
                <p className="font-display text-lg font-semibold text-white mt-2">
                  Q&apos;eswachaka Perú Tours
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Transporte VIP + Desayuno buffet + Almuerzo andino + Guía oficial + Bastones y oxígeno.
                </p>
              </button>
            </div>

            {/* Selector de rutas */}
            <div className="flex flex-wrap gap-2.5">
              {allRoutes.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSelectedSeatRoute(r);
                    setSelectedSeatNum(null);
                  }}
                  className={`min-h-[44px] px-4 py-2 rounded-xl border text-left text-xs transition-colors ${
                    activeRoute.id === r.id
                      ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-amber-200'
                      : 'border-white/10 bg-[#07090E] text-slate-400 hover:border-white/25'
                  }`}
                >
                  <div className="font-semibold text-white">{r.ruta}</div>
                  <div className="font-mono-tabular text-[11px]">
                    {r.codigo_ruta} · {r.salida_at} · {formatSoles(r.precio_centavos)}
                  </div>
                </button>
              ))}
            </div>

            {seatSuccess && (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-emerald-400 font-bold uppercase">
                    ✓ Butaca apartada con garantía
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {seatSuccess.nota || `Ruta ${seatSuccess.codigo_ruta}`} · Asiento #{seatSuccess.asiento_numero}
                  </p>
                </div>
                <div className="font-mono-tabular text-xl font-black text-amber-300 bg-[#07090E] px-4 py-2 rounded-xl border border-emerald-500/30">
                  PIN Abordaje: {seatSuccess.cliente_pin}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Plano Espacial de Cabina Van Turística / Sprinter */}
              <div className="lg:col-span-6 rounded-3xl border border-white/10 p-5 bg-[#07090E] space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{activeRoute.unidad}</span>
                  <span className="font-mono-tabular text-amber-300">
                    {activeRoute.total_asientos - activeRoute.asientos_ocupados.length} libres
                  </span>
                </div>

                {activeRoute.id === 999 ? (
                  <div className="max-w-xs mx-auto space-y-2.5 border border-white/10 rounded-3xl p-4 bg-[#0D1117]">
                    {/* Fila Chofer + Copiloto #1 */}
                    <div className="grid grid-cols-4 gap-2 pb-2.5 border-b border-white/10">
                      <div className="col-span-2 h-12 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-[11px] font-bold text-slate-400">
                        🧑‍✈️ Chofer
                      </div>
                      <div className="flex items-center justify-center text-[9px] text-slate-500">
                        Guía
                      </div>
                      {[1].map((num) => {
                        const occupied = activeRoute.asientos_ocupados.includes(num);
                        const chosen = selectedSeatNum === num;
                        return (
                          <button
                            key={num}
                            type="button"
                            disabled={occupied}
                            onClick={() => setSelectedSeatNum(num)}
                            className={`h-12 rounded-xl font-mono-tabular text-xs font-bold border transition-all ${
                              occupied
                                ? 'bg-slate-800/50 border-slate-700 text-slate-600 cursor-not-allowed line-through'
                                : chosen
                                ? 'bg-amber-400 border-amber-300 text-slate-950 scale-105'
                                : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/25'
                            }`}
                          >
                            #{num}
                          </button>
                        );
                      })}
                    </div>

                    {/* Filas 2..4 (Ventana | PASILLO | Medio + Ventana) */}
                    {[
                      [2, 3, 4],
                      [5, 6, 7],
                      [8, 9, 10],
                    ].map((row, rIdx) => (
                      <div key={rIdx} className="grid grid-cols-4 gap-2 items-center">
                        {[row[0]].map((num) => {
                          const occupied = activeRoute.asientos_ocupados.includes(num);
                          const chosen = selectedSeatNum === num;
                          return (
                            <button
                              key={num}
                              type="button"
                              disabled={occupied}
                              onClick={() => setSelectedSeatNum(num)}
                              className={`h-12 rounded-xl font-mono-tabular text-xs font-bold border transition-all ${
                                occupied
                                  ? 'bg-slate-800/50 border-slate-700 text-slate-600 cursor-not-allowed line-through'
                                  : chosen
                                  ? 'bg-amber-400 border-amber-300 text-slate-950 scale-105'
                                  : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/25'
                              }`}
                            >
                              #{num}
                            </button>
                          );
                        })}
                        <div className="text-center text-[9px] font-bold tracking-widest text-slate-500">
                          PASILLO
                        </div>
                        {row.slice(1).map((num) => {
                          const occupied = activeRoute.asientos_ocupados.includes(num);
                          const chosen = selectedSeatNum === num;
                          return (
                            <button
                              key={num}
                              type="button"
                              disabled={occupied}
                              onClick={() => setSelectedSeatNum(num)}
                              className={`h-12 rounded-xl font-mono-tabular text-xs font-bold border transition-all ${
                                occupied
                                  ? 'bg-slate-800/50 border-slate-700 text-slate-600 cursor-not-allowed line-through'
                                  : chosen
                                  ? 'bg-amber-400 border-amber-300 text-slate-950 scale-105'
                                  : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/25'
                              }`}
                            >
                              #{num}
                            </button>
                          );
                        })}
                      </div>
                    ))}

                    {/* Fila trasera de 4 asientos (11-14) */}
                    <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/10">
                      {[11, 12, 13, 14].map((num) => {
                        const occupied = activeRoute.asientos_ocupados.includes(num);
                        const chosen = selectedSeatNum === num;
                        return (
                          <button
                            key={num}
                            type="button"
                            disabled={occupied}
                            onClick={() => setSelectedSeatNum(num)}
                            className={`h-12 rounded-xl font-mono-tabular text-xs font-bold border transition-all ${
                              occupied
                                ? 'bg-slate-800/50 border-slate-700 text-slate-600 cursor-not-allowed line-through'
                                : chosen
                                ? 'bg-amber-400 border-amber-300 text-slate-950 scale-105'
                                : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/25'
                            }`}
                          >
                            #{num}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-3">
                    {Array.from({ length: activeRoute.total_asientos }, (_, i) => i + 1).map(
                      (num) => {
                        const occupied = activeRoute.asientos_ocupados.includes(num);
                        const chosen = selectedSeatNum === num;
                        return (
                          <button
                            key={num}
                            type="button"
                            disabled={occupied}
                            onClick={() => setSelectedSeatNum(num)}
                            className={`min-h-[48px] rounded-xl font-mono-tabular text-xs font-semibold border transition-colors ${
                              occupied
                                ? 'bg-white/5 border-transparent text-slate-600 cursor-not-allowed line-through'
                                : chosen
                                ? 'bg-[#D4AF37] border-[#D4AF37] text-[#0B0E14]'
                                : 'bg-[#0D1117] border-white/15 hover:border-[#D4AF37]'
                            }`}
                          >
                            #{num}
                          </button>
                        );
                      }
                    )}
                  </div>
                )}
              </div>

              <form onSubmit={handleReserveSeat} className="lg:col-span-6 space-y-4">
                <div className="rounded-2xl bg-[#07090E] border border-white/10 p-4 space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">
                    Resumen de Butaca
                  </span>
                  <p className="text-sm font-semibold text-white">
                    {selectedSeatNum
                      ? `Asiento #${selectedSeatNum} (${activeRoute.id === 999 ? seatLabel(selectedSeatNum) : 'VIP Sprinter'}) · ${formatSoles(activeRoute.precio_centavos)}`
                      : 'Toca un asiento libre en verde en el mapa de cabina'}
                  </p>
                </div>
                <input
                  type="text"
                  required
                  value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value)}
                  placeholder="Nombre completo del pasajero"
                  className="w-full min-h-[44px] px-4 rounded-xl border border-white/15 bg-[#07090E] text-sm text-white"
                />
                <input
                  type="tel"
                  required
                  value={clienteTelefono}
                  onChange={(e) => setClienteTelefono(e.target.value)}
                  placeholder="WhatsApp (+51...)"
                  className="w-full min-h-[44px] px-4 rounded-xl border border-white/15 bg-[#07090E] text-sm text-white"
                />
                <button
                  type="submit"
                  disabled={!selectedSeatNum}
                  onClick={() => {
                    if (!selectedSeatRoute) setSelectedSeatRoute(activeRoute);
                  }}
                  className="w-full min-h-[48px] rounded-xl bg-[#D4AF37] text-[#0B0E14] text-xs font-bold uppercase tracking-wider disabled:opacity-40"
                >
                  Apartar Butaca con PIN de Garantía
                </button>
              </form>
            </div>
          </section>
        );
      })()}

      {/* SUBVISTA: BODEGA & MINIMARKET CON ZOOM HD Y CANASTA DINÁMICA */}
      {subTab === 'BODEGA' && <BodegaMinimarketModule />}

      {/* SUBVISTA: OFICIOS & TÉCNICOS VERIFICADOS */}
      {subTab === 'OFICIOS' && <OficiosModule />}

      {/* SUBVISTA: CAMPO DIRECTO B2B (PREVENTA MAYORISTA) */}
      {subTab === 'CAMPO' && <CampoDirectoModule />}

      {/* SUBVISTA: PANEL DE DESPACHO UNIFICADO (CENTRAL DE EMERGENCIAS CUSCO) */}
      {subTab === 'DESPACHO' && <EmergencyDispatchCenter />}

      {/* HOJA DE CONFIRMACIÓN DE PEDIDO (Confirmar / Cancelar / Cerrar) */}
      {selectedOption && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar solicitud"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#121620] border border-black/10 dark:border-white/15 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-[#9A7B2C] dark:text-[#E5C158] font-medium">
                  {selectedOption.negocio_nombre}
                </p>
                <h3 className="font-display text-2xl font-semibold text-[#14171F] dark:text-[#F4F1EA]">
                  {selectedOption.titulo}
                </h3>
                <p className="text-xs text-[#6A717E] dark:text-[#98A0AD] mt-1">
                  Tarifa garantizada: <span className="font-mono-tabular font-semibold">{formatSoles(selectedOption.precio_centavos)}</span> · {selectedOption.eta_min} min
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOption(null)}
                aria-label="Cerrar"
                className="min-h-[44px] min-w-[44px] rounded-xl border border-black/10 dark:border-white/10 flex items-center justify-center text-[#6A717E] hover:text-[#14171F] dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {sheetError && (
              <div className="rounded-xl border border-[#C81E5B]/40 bg-[#C81E5B]/10 px-3.5 py-2.5 text-xs text-[#C81E5B]">
                {sheetError}
              </div>
            )}

            <form onSubmit={handleConfirmOrder} className="space-y-4">
              {selectedOption.tipo === 'TAXI' && (
                <div>
                  <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
                    Destino en Cusco
                  </label>
                  <input
                    type="text"
                    required
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                    placeholder="Ej: Aeropuerto Velasco Astete / Hotel Belmond"
                    className="w-full min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    required
                    value={clienteNombre}
                    onChange={(e) => setClienteNombre(e.target.value)}
                    placeholder="Camila Mendoza"
                    className="w-full min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
                    WhatsApp (recibirás tu PIN)
                  </label>
                  <input
                    type="tel"
                    required
                    value={clienteTelefono}
                    onChange={(e) => setClienteTelefono(e.target.value)}
                    placeholder="+51984123456"
                    className="w-full min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1.5">
                  Método de pago al concretar
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['Yape', 'Plin', 'Efectivo', 'Tarjeta'] as MetodoPago[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMetodoPago(m)}
                      className={`min-h-[44px] rounded-xl text-xs font-medium border transition-colors ${
                        metodoPago === m
                          ? 'bg-[#14213D] text-white border-[#14213D] dark:bg-[#D4AF37] dark:text-[#0B0E14] dark:border-[#D4AF37]'
                          : 'border-black/15 dark:border-white/15 text-[#555B66] dark:text-[#A3A9B5]'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
                  Código de promotor o concierge (opcional)
                </label>
                <input
                  type="text"
                  value={promotorCodigo}
                  onChange={(e) => setPromotorCodigo(e.target.value)}
                  placeholder="Ej: CUSCOVIP"
                  className="w-full min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm uppercase font-mono-tabular"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOption(null)}
                  className="flex-1 min-h-[48px] rounded-xl border border-black/15 dark:border-white/15 text-sm font-medium text-[#555B66] dark:text-[#B4BAC4] hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingOrder}
                  className="flex-1 min-h-[48px] rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {submittingOrder ? 'Enviando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EMERGENCIA CHUSPA SOS ACTIVO */}
      {sosOpen && (
        <SosActiveModalCard
          onClose={() => setSosOpen(false)}
          onOpenDispatchCenter={() => setSubTab('DESPACHO')}
          coords={coords}
          onRefreshGps={requestGps}
          defaultNombre={clienteNombre}
          defaultTelefono={clienteTelefono}
        />
      )}
    </div>
  );
};
