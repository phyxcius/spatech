import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  BadgeCheck,
  CarFront,
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
  Store,
  Ticket,
  Utensils,
  Volume2,
  Wrench,
  X,
} from 'lucide-react';
import {
  detectConciergeIntent,
  parseMarketQuery,
  resolveCuscoDestination,
  type RequestedMarketItem,
} from '../lib/cuscoMarkets.ts';
import { apiFetch, speakSpanish, stopSpeaking, subscribeSpeechCadence } from '../lib/api.ts';
import { subscribeAvatarSpeech } from '../lib/heygenAvatar.ts';
import { emitCenterNotification } from '../lib/notifications.ts';
import {
  formatPeruLookupError,
  isValidForeignDoc,
  type PeruDocumentLookupResult,
} from '../lib/peruDocs.ts';
import {
  formatSoles,
  RUBRO_LABELS,
  type ConciergeOpcion,
  type DirectorioNegocio,
  type MetodoPago,
  type PedidoPublico,
  type Rubro,
  type SharedCustomerDoc,
} from '../types.ts';
import { CuscoGeoMap, type GeoMapPin } from './CuscoGeoMap.tsx';
import {
  EmergencyDispatchCenter,
  SosActiveModalCard,
} from './DispatchAndRouteModules.tsx';
import { MarketComparatorFlow } from './MarketComparatorFlow.tsx';
import {
  BodegaMinimarketModule,
  CampoDirectoModule,
  OficiosModule,
} from './MarketplaceModules.tsx';
import { RealisticAvatarPortrait } from './RealisticHumanoidWidget.tsx';
import { TaxiInDriveFlow } from './TaxiInDriveFlow.tsx';

interface ClientPortalProps {
  customerDoc?: SharedCustomerDoc | null;
  onCustomerDocVerified?: (doc: SharedCustomerDoc) => void;
  onRequestIdentityGate?: () => void;
  onOrderCreated: (pedido: PedidoPublico, pin: string) => void;
  openAssistantSignal: number;
  openSosSignal?: number;
  initialCoords?: { lat: number; lng: number; gpsVerificado?: boolean } | null;
  externalPromptSignal?: { seq: number; query: string; categoria?: Rubro } | null;
}

type ClientTab =
  | 'CONCIERGE'
  | 'DIVISAS'
  | 'BUTACAS'
  | 'BODEGA'
  | 'OFICIOS'
  | 'CAMPO'
  | 'DESPACHO';

type ConciergeMode = 'SPHERE_IDLE' | 'TAXI_INDRIVE' | 'MARKET_MAP' | 'CATALOG';

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
  customerDoc = null,
  onCustomerDocVerified,
  onRequestIdentityGate,
  onOrderCreated,
  openAssistantSignal,
  openSosSignal = 0,
  initialCoords = null,
  externalPromptSignal = null,
}) => {
  const [subTab, setSubTab] = useState<ClientTab>('CONCIERGE');
  const [conciergeMode, setConciergeMode] = useState<ConciergeMode>('SPHERE_IDLE');
  const [sphereExpanded, setSphereExpanded] = useState(false);

  const [query, setQuery] = useState('');
  const [selectedRubro, setSelectedRubro] = useState<Rubro | null>(null);
  const [destino, setDestino] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: initialCoords?.lat ?? -13.5167,
    lng: initialCoords?.lng ?? -71.9788,
  });
  const [gpsStatus, setGpsStatus] = useState<'default' | 'live' | 'denied'>(
    initialCoords?.gpsVerificado ? 'live' : 'default'
  );
  const [loading, setLoading] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);
  const [avatarMouthLevel, setAvatarMouthLevel] = useState(0);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [lastResponseMs, setLastResponseMs] = useState<number | null>(null);
  const [replyText, setReplyText] = useState<string>(
    'Toca al asistente y dime qué necesitas: taxi, restaurante, botica, tour o market.'
  );
  const [activeCategory, setActiveCategory] = useState<Rubro>('TRANSPORTE');
  const [taxiOpciones, setTaxiOpciones] = useState<ConciergeOpcion[]>([]);
  const [opciones, setOpciones] = useState<ConciergeOpcion[]>([]);
  const [directorio, setDirectorio] = useState<DirectorioNegocio[]>([]);
  const [selectedCatalogKey, setSelectedCatalogKey] = useState<string | null>(null);
  const [showCatalogPriceTable, setShowCatalogPriceTable] = useState(false);
  const [requestedMarketItems, setRequestedMarketItems] = useState<RequestedMarketItem[]>(() =>
    parseMarketQuery('leche, atún y arroz')
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hoja de confirmación para servicios generales
  const [selectedOption, setSelectedOption] = useState<ConciergeOpcion | null>(null);
  const [clienteNombre, setClienteNombre] = useState(customerDoc?.nombre || '');
  const [clienteTelefono, setClienteTelefono] = useState(customerDoc?.whatsapp || '');
  const [showEditCustomerData, setShowEditCustomerData] = useState(false);
  const [docTipo, setDocTipo] = useState<'DNI' | 'RUC' | 'EXTRANJERO'>(customerDoc?.tipo || 'DNI');
  const [docNumero, setDocNumero] = useState(customerDoc?.numero || '');
  const [clienteDireccionFiscal, setClienteDireccionFiscal] = useState(
    customerDoc?.direccionFiscal || ''
  );
  const [docVerificado, setDocVerificado] = useState<PeruDocumentLookupResult | null>(
    customerDoc?.verificado
      ? {
          valid: true,
          validado: true,
          tipo: customerDoc.tipo,
          numero: customerDoc.numero,
          nombre_completo: customerDoc.nombre,
          direccion: customerDoc.direccionFiscal,
          source:
            customerDoc.tipo === 'RUC'
              ? 'SUNAT'
              : customerDoc.tipo === 'EXTRANJERO'
              ? 'MIGRACIONES_EXTRANJERO'
              : 'RENIEC',
          fuente: customerDoc.fuente || customerDoc.tipo,
        }
      : null
  );
  const [docLookupLoading, setDocLookupLoading] = useState(false);
  const [docLookupError, setDocLookupError] = useState<string | null>(null);
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
  const docAlertCooldownRef = useRef<number>(0);

  const isDocValid = Boolean(docVerificado && (docVerificado.valid || docVerificado.validado));

  const sharedCustomerDoc = useMemo<SharedCustomerDoc | null>(() => {
    if (!isDocValid || !docVerificado) return null;
    return {
      tipo: docVerificado.tipo,
      numero: docVerificado.numero,
      nombre: docVerificado.nombre_completo || clienteNombre,
      direccionFiscal: clienteDireccionFiscal || docVerificado.direccion || '',
      whatsapp: clienteTelefono.trim() || customerDoc?.whatsapp,
      paisCodigo: customerDoc?.paisCodigo,
      paisNombre: customerDoc?.paisNombre,
      lat: coords.lat,
      lng: coords.lng,
      gpsVerificado: gpsStatus === 'live',
      verificado: true,
      fuente: docVerificado.fuente || docVerificado.source,
    };
  }, [
    isDocValid,
    docVerificado,
    clienteNombre,
    clienteDireccionFiscal,
    clienteTelefono,
    customerDoc?.whatsapp,
    customerDoc?.paisCodigo,
    customerDoc?.paisNombre,
    coords.lat,
    coords.lng,
    gpsStatus,
  ]);

  useEffect(() => {
    if (initialCoords?.gpsVerificado && typeof initialCoords.lat === 'number' && typeof initialCoords.lng === 'number') {
      setCoords({ lat: initialCoords.lat, lng: initialCoords.lng });
      setGpsStatus('live');
    }
  }, [initialCoords?.gpsVerificado, initialCoords?.lat, initialCoords?.lng]);

  useEffect(() => {
    if (customerDoc?.verificado) {
      setDocTipo(customerDoc.tipo);
      setDocNumero(customerDoc.numero);
      if (customerDoc.nombre) setClienteNombre(customerDoc.nombre);
      if (customerDoc.whatsapp) setClienteTelefono(customerDoc.whatsapp);
      if (customerDoc.direccionFiscal) setClienteDireccionFiscal(customerDoc.direccionFiscal);
      if (customerDoc.gpsVerificado && typeof customerDoc.lat === 'number' && typeof customerDoc.lng === 'number') {
        setCoords({ lat: customerDoc.lat, lng: customerDoc.lng });
        setGpsStatus('live');
      }
      setDocLookupError(null);
      setDocVerificado({
        valid: true,
        validado: true,
        tipo: customerDoc.tipo,
        numero: customerDoc.numero,
        nombre_completo: customerDoc.nombre,
        direccion: customerDoc.direccionFiscal,
        source:
          customerDoc.tipo === 'RUC'
            ? 'SUNAT'
            : customerDoc.tipo === 'EXTRANJERO'
            ? 'MIGRACIONES_EXTRANJERO'
            : 'RENIEC',
        fuente: customerDoc.fuente || customerDoc.tipo,
      });
    }
  }, [
    customerDoc?.verificado,
    customerDoc?.tipo,
    customerDoc?.numero,
    customerDoc?.nombre,
    customerDoc?.whatsapp,
    customerDoc?.gpsVerificado,
  ]);

  function handleSharedDocSynced(synced: SharedCustomerDoc) {
    setDocTipo(synced.tipo);
    setDocNumero(synced.numero);
    if (synced.nombre) setClienteNombre(synced.nombre);
    if (synced.whatsapp) setClienteTelefono(synced.whatsapp);
    if (synced.direccionFiscal) setClienteDireccionFiscal(synced.direccionFiscal);
    setDocLookupError(null);
    setDocVerificado({
      valid: synced.verificado,
      validado: synced.verificado,
      tipo: synced.tipo,
      numero: synced.numero,
      nombre_completo: synced.nombre,
      direccion: synced.direccionFiscal,
      source:
        synced.tipo === 'RUC'
          ? 'SUNAT'
          : synced.tipo === 'EXTRANJERO'
          ? 'MIGRACIONES_EXTRANJERO'
          : 'RENIEC',
      fuente: synced.fuente || synced.tipo,
    });
    onCustomerDocVerified?.(synced);
  }

  function notifyDocumentAlertIfNeeded(tipoPedidoLabel: string, allowSpeak = true) {
    if (isDocValid) return;
    const now = Date.now();
    if (now - docAlertCooldownRef.current < 450) return;
    docAlertCooldownRef.current = now;
    emitCenterNotification({
      id: `alerta-dni-ruc-${now}`,
      badge: 'IDENTIDAD OBLIGATORIA',
      title: 'Valida tu DNI, RUC o Documento Extranjero',
      subtitle: `${tipoPedidoLabel} · Identidad del titular requerida`,
      detail:
        'Para emitir pedidos a tu nombre debes validar tu DNI (RENIEC), RUC (SUNAT) o Pasaporte/Carné de Extranjería.',
      tone: 'warning',
      meta: 'RENIEC · SUNAT',
      speakText:
        allowSpeak && speakReplies
          ? 'Valida tu documento de identidad para registrar pedidos a tu nombre.'
          : undefined,
    });
    onRequestIdentityGate?.();
  }

  // Precarga silenciosa de unidades reales de taxi y coordenadas de directorio en Cusco
  useEffect(() => {
    apiFetch<{ opciones?: ConciergeOpcion[] }>('/api/public/asistente', {
      method: 'POST',
      body: {
        query: 'taxi disponible desde mi ubicación',
        categoria: 'TRANSPORTE',
        lat: coords.lat,
        lng: coords.lng,
      },
    })
      .then((res) =>
        setTaxiOpciones(
          Array.isArray(res?.opciones)
            ? res.opciones.filter((o) => o.tipo === 'TAXI' && o.categoria === 'TRANSPORTE')
            : []
        )
      )
      .catch(() => {});

    apiFetch<{ negocios?: DirectorioNegocio[] }>('/api/public/directorio')
      .then((res) => {
        if (Array.isArray(res?.negocios)) {
          setDirectorio(res.negocios);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsub1 = subscribeSpeechCadence((ev) => {
      setAvatarSpeaking(ev.speaking);
      setAvatarMouthLevel(ev.level);
    });
    const unsub2 = subscribeAvatarSpeech((ev) => {
      setAvatarSpeaking(ev.speaking);
      setAvatarMouthLevel(ev.level);
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  useEffect(() => {
    if (externalPromptSignal && externalPromptSignal.seq > 0 && externalPromptSignal.query.trim()) {
      setLastTranscript(externalPromptSignal.query);
      setQuery(externalPromptSignal.query);
      setSphereExpanded(true);
      void handleSearch(externalPromptSignal.query, externalPromptSignal.categoria, true);
      if (!isDocValid) {
        notifyDocumentAlertIfNeeded('Solicitud al Agente', false);
      }
    }
  }, [externalPromptSignal?.seq]);

  useEffect(() => {
    if (openAssistantSignal > 0) {
      setSubTab('CONCIERGE');
      setSphereExpanded(true);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [openAssistantSignal]);

  useEffect(() => {
    if (openSosSignal > 0) {
      setSubTab('CONCIERGE');
      setSosOpen(true);
    }
  }, [openSosSignal]);

  useEffect(() => {
    if (subTab === 'DIVISAS') {
      apiFetch<{ tasas?: DivisaRate[] }>('/api/public/divisas')
        .then((res) => setDivisas(Array.isArray(res?.tasas) ? res.tasas : []))
        .catch(() => {});
    } else if (subTab === 'BUTACAS') {
      apiFetch<{ rutas?: SeatRoute[] }>('/api/public/butacas')
        .then((res) => {
          const rutas = Array.isArray(res?.rutas) ? res.rutas : [];
          setRutasButacas(rutas);
          if (rutas.length > 0) setSelectedSeatRoute(rutas[0]);
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
    const t0 = performance.now();
    const q = (customQuery ?? query).trim();
    setSubTab('CONCIERGE');
    setErrorMsg(null);

    if (!silent && speakReplies && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.resume();
      } catch {
        // ignore
      }
    }

    // 1. Detectar intención estricta: Taxi, Market, Divisas o Categoría de Negocio
    const parsedIntent = detectConciergeIntent(q);
    const effectiveMode = forcedCat
      ? forcedCat === 'TRANSPORTE'
        ? 'TAXI'
        : forcedCat === 'CASA_CAMBIO'
          ? 'DIVISAS'
          : 'CATALOG'
      : parsedIntent.mode;
    const effectiveRubro: Rubro = forcedCat ?? selectedRubro ?? parsedIntent.rubro;

    if (effectiveMode === 'DIVISAS' || effectiveRubro === 'CASA_CAMBIO') {
      setSubTab('DIVISAS');
      const ms = Math.max(1, Math.round(performance.now() - t0));
      setLastResponseMs(ms);
      const msg = 'Mostrando casas de cambio verificadas en Cusco para cotizar y bloquear tu tasa.';
      setReplyText(msg);
      if (!silent) {
        emitCenterNotification({
          id: `concierge-divisas-${Date.now()}`,
          title: 'Cotizador de Divisas en Cusco',
          subtitle: 'Casas de cambio verificadas listas',
          detail: msg,
          tone: 'ai',
          responseMs: ms,
          speakText: speakReplies && isDocValid ? msg : undefined,
        });
        notifyDocumentAlertIfNeeded('Cambio de Divisas');
      }
      return;
    }

    if (effectiveMode === 'MARKET' && !forcedCat) {
      const parsed = parseMarketQuery(q);
      setRequestedMarketItems(parsed);
      setConciergeMode('MARKET_MAP');
      const ms = Math.max(1, Math.round(performance.now() - t0));
      setLastResponseMs(ms);
      const itemsText = parsed.map((p) => p.label.split(' ')[0]).join(', ');
      const msg = `Mostrando markets abiertos en Cusco con ${itemsText} para comparar precios.`;
      setReplyText(msg);
      if (!silent) {
        emitCenterNotification({
          id: `concierge-market-${Date.now()}`,
          title: 'Comparador Facilito · Markets Abiertos',
          subtitle: `${parsed.length} productos comparados en mapa GPS`,
          detail: msg,
          tone: 'ai',
          responseMs: ms,
          speakText: speakReplies && isDocValid ? msg : undefined,
        });
        notifyDocumentAlertIfNeeded('Compra / Reserva en Market');
      }
      return;
    }

    // 2. Detectar intención Taxi InDrive / Geolocalización (SOLO taxis)
    if (effectiveMode === 'TAXI' || effectiveRubro === 'TRANSPORTE') {
      const nextDestino = parsedIntent.destino || '';
      setDestino(nextDestino);
      setConciergeMode('TAXI_INDRIVE');
      setActiveCategory('TRANSPORTE');
      if (parsedIntent.fromMyLocation || gpsStatus !== 'live') requestGps();

      setLoading(true);
      try {
        const res = await apiFetch<{
          categoria: Rubro;
          respuesta_voz: string;
          destino_sugerido?: string;
          opciones: ConciergeOpcion[];
        }>('/api/public/asistente', {
          method: 'POST',
          body: {
            query: q || 'taxi desde mi ubicación',
            categoria: 'TRANSPORTE',
            lat: coords.lat,
            lng: coords.lng,
            destino: nextDestino || undefined,
          },
        });
        const opts = Array.isArray(res?.opciones)
          ? res.opciones.filter((o) => o.tipo === 'TAXI' && o.categoria === 'TRANSPORTE')
          : [];
        setTaxiOpciones(opts);
        const resolvedDestText = nextDestino || res.destino_sugerido || '';
        if (resolvedDestText && resolvedDestText !== nextDestino) {
          setDestino(resolvedDestText);
        }
        const ms = Math.max(1, Math.round(performance.now() - t0));
        setLastResponseMs(ms);
        const bestTaxi = opts.find((o) => o.mejor_precio) || opts[0];
        const msg = bestTaxi
          ? `Solo taxis disponibles${resolvedDestText ? ` rumbo a ${resolvedDestText}` : ''}: ${bestTaxi.titulo} desde ${formatSoles(bestTaxi.precio_centavos)}. Revisa los pines en el mapa.`
          : 'Taxistas cercanos listos en el mapa. Elige o escribe tu destino en Cusco.';
        setReplyText(msg);
        if (!silent) {
          emitCenterNotification({
            id: `concierge-taxi-${Date.now()}`,
            title: resolvedDestText ? `Taxis hacia ${resolvedDestText}` : 'Taxis Disponibles en tu Ubicación',
            subtitle: bestTaxi
              ? `${bestTaxi.titulo} · ${formatSoles(bestTaxi.precio_centavos)}`
              : 'Taxistas geolocalizados en mapa',
            detail: msg,
            tone: 'ai',
            responseMs: ms,
            speakText: speakReplies && isDocValid ? msg : undefined,
          });
          notifyDocumentAlertIfNeeded('Servicio de Taxi');
        }
      } catch {
        const ms = Math.max(1, Math.round(performance.now() - t0));
        setLastResponseMs(ms);
        setReplyText('Mapa de taxistas listo en Cusco. Elige tu destino y confirma tu unidad.');
        if (!silent) {
          notifyDocumentAlertIfNeeded('Servicio de Taxi');
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    // 3. Otras categorías estrictas del concierge (Farmacia, Restaurante, Turismo, Hotel)
    setOpciones([]);
    setSelectedCatalogKey(null);
    setActiveCategory(effectiveRubro);
    setConciergeMode('CATALOG');
    if (parsedIntent.fromMyLocation || gpsStatus !== 'live') requestGps();
    setLoading(true);
    try {
      const res = await apiFetch<{
        categoria: Rubro;
        respuesta_voz: string;
        destino_sugerido?: string;
        opciones: ConciergeOpcion[];
      }>('/api/public/asistente', {
        method: 'POST',
        body: {
          query: q,
          categoria: effectiveRubro,
          lat: coords.lat,
          lng: coords.lng,
          destino: parsedIntent.destino || undefined,
        },
      });
      const returnedCat = res.categoria || effectiveRubro;
      const safeOpciones = (Array.isArray(res?.opciones) ? res.opciones : []).filter(
        (op) => op.tipo !== 'TAXI' && op.categoria === returnedCat
      );
      setActiveCategory(returnedCat);
      setOpciones(safeOpciones);
      if (safeOpciones.length > 0) {
        const first = safeOpciones[0];
        setSelectedCatalogKey(`${first.negocio_id}-${first.unidad_id || first.servicio_id || 0}`);
      } else {
        setSelectedCatalogKey(null);
      }
      const ms = Math.max(1, Math.round(performance.now() - t0));
      setLastResponseMs(ms);
      const top = safeOpciones[0];
      const richVoice = top
        ? `${res.respuesta_voz} Mejor opción: ${top.titulo} en ${top.negocio_nombre} por ${formatSoles(top.precio_centavos)}.`
        : res.respuesta_voz;
      setReplyText(richVoice);
      if (!silent) {
        emitCenterNotification({
          id: `concierge-cat-${Date.now()}`,
          title: `Agente La Chuspa · ${RUBRO_LABELS[returnedCat]}`,
          subtitle: top
            ? `${top.titulo} · ${formatSoles(top.precio_centavos)}`
            : `${safeOpciones.length} opciones encontradas`,
          detail: richVoice,
          tone: 'ai',
          responseMs: ms,
          speakText: speakReplies && isDocValid ? richVoice : undefined,
        });
        notifyDocumentAlertIfNeeded(RUBRO_LABELS[returnedCat]);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo consultar el catálogo');
    } finally {
      setLoading(false);
    }
  }

  function handleSpherePress() {
    setSubTab('CONCIERGE');
    setSphereExpanded(true);
    handleVoiceCapture();
    setTimeout(() => inputRef.current?.focus(), 120);
  }

  function runVoiceCommand(phrase: string, rubro?: Rubro) {
    setLastTranscript(phrase);
    setQuery(phrase);
    setSphereExpanded(true);
    setSelectedRubro(rubro ?? null);
    void handleSearch(phrase, rubro);
  }

  function handleVoiceCapture(onFieldCaptured?: (text: string) => void) {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setReplyText(
        'Dictado nativo no disponible en este navegador; usa los comandos rápidos o escribe tu pedido abajo.'
      );
      if (speakReplies) {
        speakSpanish('Escribe o elige qué deseas pedir: taxi, restaurante, botica, tour o market.');
      }
      return;
    }
    try {
      const rec = new SpeechRec();
      rec.lang = 'es-PE';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      setVoiceActive(true);
      setReplyText('Escuchando... dime si necesitas taxi, restaurante, botica, tour o market.');
      rec.onresult = (event: any) => {
        const transcript = (event.results?.[0]?.[0]?.transcript || '').trim();
        setVoiceActive(false);
        if (!transcript) return;
        if (onFieldCaptured) {
          onFieldCaptured(transcript);
          return;
        }
        setLastTranscript(transcript);
        setQuery(transcript);
        setSelectedRubro(null);
        void handleSearch(transcript);
      };
      rec.onerror = () => setVoiceActive(false);
      rec.onend = () => setVoiceActive(false);
      rec.start();
    } catch {
      setVoiceActive(false);
    }
  }

  async function handleVerifyCustomerDoc(
    overrideTipo?: 'DNI' | 'RUC' | 'EXTRANJERO',
    overrideNumero?: string
  ): Promise<PeruDocumentLookupResult | null> {
    const requestedTipo = overrideTipo || docTipo;
    const rawNum = (overrideNumero ?? docNumero).trim();
    const clean = requestedTipo === 'EXTRANJERO' ? rawNum.toUpperCase() : rawNum.replace(/\D/g, '');
    const tipoUse: 'DNI' | 'RUC' | 'EXTRANJERO' =
      requestedTipo === 'EXTRANJERO'
        ? 'EXTRANJERO'
        : overrideTipo || (clean.length === 11 ? 'RUC' : clean.length === 8 ? 'DNI' : docTipo);

    if (tipoUse !== docTipo) setDocTipo(tipoUse);
    setDocLookupError(null);
    if (!clean || (tipoUse === 'EXTRANJERO' && !isValidForeignDoc(clean))) {
      setDocLookupError('Ingresa DNI (8 dígitos), RUC (11 dígitos) o Pasaporte/CE válido.');
      return null;
    }
    setDocLookupLoading(true);
    try {
      const res = await apiFetch<PeruDocumentLookupResult>(
        `/api/public/consulta-documento?tipo=${tipoUse}&numero=${encodeURIComponent(clean)}${
          tipoUse === 'EXTRANJERO' && clienteNombre.trim()
            ? `&nombre=${encodeURIComponent(clienteNombre.trim())}`
            : ''
        }`
      );
      setDocVerificado(res);
      if (res.nombre_completo && (!clienteNombre.trim() || tipoUse !== 'EXTRANJERO')) {
        setClienteNombre(res.nombre_completo);
      }
      if (res.direccion) {
        setClienteDireccionFiscal(res.direccion);
      }
      onCustomerDocVerified?.({
        tipo: res.tipo,
        numero: res.numero,
        nombre: (tipoUse === 'EXTRANJERO' ? clienteNombre.trim() : '') || res.nombre_completo,
        direccionFiscal: res.direccion,
        verificado: true,
        fuente: res.fuente || res.source,
      });
      return res;
    } catch (err) {
      setDocVerificado(null);
      setDocLookupError(formatPeruLookupError(err));
      return null;
    } finally {
      setDocLookupLoading(false);
    }
  }

  async function handleConfirmOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOption) return;
    setSheetError(null);

    let activeDoc = isDocValid ? docVerificado : null;
    if (!activeDoc) {
      const clean =
        docTipo === 'EXTRANJERO' ? docNumero.trim().toUpperCase() : docNumero.replace(/\D/g, '');
      if (docTipo === 'EXTRANJERO' && isValidForeignDoc(clean)) {
        activeDoc = await handleVerifyCustomerDoc('EXTRANJERO', clean);
      } else if (clean.length === 8 || clean.length === 11) {
        activeDoc = await handleVerifyCustomerDoc(clean.length === 11 ? 'RUC' : 'DNI', clean);
      }
    }

    if (!activeDoc || !(activeDoc.valid || activeDoc.validado)) {
      setSheetError(
        'Valida tu DNI (8 dígitos), RUC (11 dígitos) o documento de extranjero para continuar.'
      );
      return;
    }

    const finalNombre = (clienteNombre || activeDoc.nombre_completo || '').trim();
    const finalDirFiscal = (clienteDireccionFiscal || activeDoc.direccion || '').trim();

    setSubmittingOrder(true);
    const t0 = performance.now();
    try {
      if (selectedOption.tipo === 'TAXI' && selectedOption.unidad_id) {
        const resolvedDest = resolveCuscoDestination(
          destino || 'Plaza de Armas Cusco',
          coords.lat,
          coords.lng
        );
        const res = await apiFetch<{ pedido: PedidoPublico; cliente_pin: string }>(
          '/api/public/taxi/pedir',
          {
            method: 'POST',
            body: {
              unidad_id: selectedOption.unidad_id,
              metodo_pago: metodoPago,
              cliente_nombre: finalNombre,
              cliente_telefono: clienteTelefono,
              cliente_documento_tipo: activeDoc.tipo,
              cliente_documento_numero: activeDoc.numero,
              cliente_documento_verificado: true,
              origen_texto: gpsStatus === 'live' ? 'Mi ubicación GPS' : 'Plaza de Armas, Cusco',
              destino_texto: destino || 'Aeropuerto Velasco Astete',
              origen_lat: coords.lat,
              origen_lng: coords.lng,
              destino_lat: resolvedDest.lat,
              destino_lng: resolvedDest.lng,
              promotor_codigo: promotorCodigo || undefined,
            },
          }
        );
        const ms = Math.max(1, Math.round(performance.now() - t0));
        setSelectedOption(null);
        emitCenterNotification({
          id: `order-confirm-${res.pedido.codigo}`,
          title: `Taxi Confirmado · ${res.pedido.codigo}`,
          subtitle: `${selectedOption.negocio_nombre} · PIN ${res.cliente_pin}`,
          detail: `Conductor en ruta. Pasajero verificado: ${finalNombre} (${activeDoc.tipo} ${activeDoc.numero}).`,
          tone: 'success',
          responseMs: ms,
          speakText: speakReplies
            ? `Taxi confirmado. Código ${res.pedido.codigo}. Tu PIN es ${res.cliente_pin.split('').join(' ')}.`
            : undefined,
        });
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
              cliente_nombre: finalNombre,
              cliente_telefono: clienteTelefono,
              cliente_documento_tipo: activeDoc.tipo,
              cliente_documento_numero: activeDoc.numero,
              cliente_documento_verificado: true,
              cliente_direccion_fiscal: finalDirFiscal || undefined,
              transcripcion: query || selectedOption.titulo,
              promotor_codigo: promotorCodigo || undefined,
            },
          }
        );
        const ms = Math.max(1, Math.round(performance.now() - t0));
        setSelectedOption(null);
        emitCenterNotification({
          id: `order-confirm-${res.pedido.codigo}`,
          title: `Pedido Enviado · ${res.pedido.codigo}`,
          subtitle: `${selectedOption.negocio_nombre} · PIN ${res.cliente_pin}`,
          detail: `${selectedOption.titulo} enviado al panel del negocio (${activeDoc.tipo} ${activeDoc.numero} · ${activeDoc.tipo === 'RUC' ? 'Factura' : 'Boleta'}).`,
          tone: 'success',
          responseMs: ms,
          speakText: speakReplies
            ? `Pedido confirmado en ${selectedOption.negocio_nombre}. Tu PIN de entrega es ${res.cliente_pin.split('').join(' ')}.`
            : undefined,
        });
        onOrderCreated(res.pedido, res.cliente_pin);
      }
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Error al confirmar el pedido');
    } finally {
      setSubmittingOrder(false);
    }
  }

  async function handleLockRate(rate: DivisaRate) {
    if (!isDocValid || !docVerificado) {
      setErrorMsg(
        'Es obligatorio ingresar y validar tu DNI (8 dígitos) o RUC (11 dígitos) del titular antes de reservar una tasa de cambio.'
      );
      notifyDocumentAlertIfNeeded('Reserva de Divisas');
      return;
    }
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
          cliente_documento_tipo: docVerificado.tipo,
          cliente_documento_numero: docVerificado.numero,
          cliente_documento_verificado: true,
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
    if (!isDocValid || !docVerificado) {
      setErrorMsg(
        'Es obligatorio ingresar y validar el DNI (8 dígitos) o RUC (11 dígitos) del titular antes de reservar una butaca.'
      );
      notifyDocumentAlertIfNeeded('Reserva de Butaca');
      return;
    }
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
          cliente_documento_tipo: docVerificado.tipo,
          cliente_documento_numero: docVerificado.numero,
          cliente_documento_verificado: true,
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

  const secondaryModules: Array<{
    label: string;
    rubro?: Rubro;
    tab?: ClientTab;
    icon: React.ReactNode;
    prompt?: string;
  }> = [
    { label: 'Gastronomía', rubro: 'RESTAURANTE', icon: <Utensils className="w-4 h-4" />, prompt: 'Ceviche gourmet y lomo saltado' },
    { label: 'Botica 24h', rubro: 'FARMACIA', icon: <Pill className="w-4 h-4" />, prompt: 'Kit soroche oxígeno y pastillas' },
    { label: 'Tours Privados', rubro: 'TURISMO', icon: <Sparkles className="w-4 h-4" />, prompt: 'Guía privado Machu Picchu o Valle Sagrado' },
    { label: 'Hoteles', rubro: 'HOTEL', icon: <Hotel className="w-4 h-4" />, prompt: 'Suite oxigenada o spa andino' },
    { label: 'Butacas VIP', tab: 'BUTACAS', icon: <Ticket className="w-4 h-4" /> },
    { label: 'Divisas', tab: 'DIVISAS', icon: <ArrowLeftRight className="w-4 h-4" /> },
    { label: 'Bodega & Vivero', tab: 'BODEGA', icon: <ShoppingBasket className="w-4 h-4" /> },
    { label: 'Oficios', tab: 'OFICIOS', icon: <Wrench className="w-4 h-4" /> },
    { label: 'Campo B2B', tab: 'CAMPO', icon: <Sprout className="w-4 h-4" /> },
    { label: 'Central SOS', tab: 'DESPACHO', icon: <Siren className="w-4 h-4" /> },
  ];

  const catalogMapEntries = useMemo(() => {
    const offsets: Array<[number, number]> = [
      [0.0018, -0.0016],
      [-0.0021, 0.0024],
      [0.0028, 0.0019],
      [-0.0015, -0.0028],
      [0.0034, -0.0008],
      [-0.0029, 0.0009],
    ];
    return opciones
      .filter((op) => op.tipo !== 'TAXI' && op.categoria === activeCategory)
      .map((op, idx) => {
        const key = `${op.negocio_id}-${op.unidad_id || op.servicio_id || idx}`;
        const biz = directorio.find((d) => d.id === op.negocio_id);
        const [dLat, dLng] = offsets[idx % offsets.length];
        const baseLat = op.lat ?? biz?.lat ?? coords.lat;
        const baseLng = op.lng ?? biz?.lng ?? coords.lng;
        const hasRealCoords = Boolean(op.lat || biz?.lat);
        const lat = Number((baseLat + (idx === 0 && hasRealCoords ? 0 : dLat * 0.25)).toFixed(5));
        const lng = Number((baseLng + (idx === 0 && hasRealCoords ? 0 : dLng * 0.25)).toFixed(5));
        const priceText =
          op.tipo === 'DIVISA' && op.tasa_compra
            ? `S/ ${op.tasa_compra.toFixed(3)}`
            : formatSoles(op.precio_centavos);
        return { key, op, lat, lng, priceText };
      });
  }, [opciones, activeCategory, directorio, coords.lat, coords.lng]);

  const catalogPins: GeoMapPin[] = useMemo(
    () =>
      catalogMapEntries.map((entry, idx) => ({
        id: entry.key,
        lat: entry.lat,
        lng: entry.lng,
        priceText: entry.priceText,
        sublabel: entry.op.negocio_nombre,
        detailTitle: `${entry.op.titulo} · ${entry.op.negocio_nombre}`,
        tier: entry.op.mejor_precio ? 'cheapest' : idx % 3 === 2 ? 'high' : 'mid',
        kind: 'BUSINESS',
        isOpen: entry.op.abierto_ahora !== false,
      })),
    [catalogMapEntries]
  );

  const isCompactSphere = subTab === 'CONCIERGE' && conciergeMode !== 'SPHERE_IDLE';

  return (
    <div className="space-y-6 pb-24 md:pb-12">
      {/* ==================================================================== */}
      {/* AGENTE COMPACTO "LA CHUSPA" (AZUL MARINO, BLANCO, COBALTO Y DORADO)  */}
      {/* ==================================================================== */}
      <section className="rounded-3xl border border-[#D8E2EC] dark:border-white/15 bg-white dark:bg-[#052030] transition-all shadow-[0_10px_30px_-14px_rgba(4,51,75,0.14)] p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Agente pequeño y compacto (sin ícono gigante invasivo) */}
          <div className="flex items-center gap-3.5">
            <RealisticAvatarPortrait
              sizeClass="w-14 h-14 shrink-0"
              listening={voiceActive}
              speaking={avatarSpeaking}
              mouthLevel={avatarMouthLevel}
              onClick={handleSpherePress}
              ariaLabel="Presionar agente La Chuspa para pedir por voz o escribir"
              title="Toca el agente pequeño para pedir por voz o escribir tu solicitud"
            />

            <div className="text-left space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] uppercase tracking-[0.18em] font-extrabold text-[#1565F5] dark:text-[#F5C400]">
                  Agente La Chuspa · Toca para pedir
                </p>
                {lastResponseMs !== null && (
                  <span className="text-[11px] font-mono-tabular text-[#516478] dark:text-slate-400 font-semibold">
                    · {lastResponseMs} ms
                  </span>
                )}
                {conciergeMode !== 'SPHERE_IDLE' && subTab === 'CONCIERGE' && (
                  <button
                    type="button"
                    onClick={() => {
                      setConciergeMode('SPHERE_IDLE');
                      setSphereExpanded(false);
                      setShowCatalogPriceTable(false);
                      setLastTranscript(null);
                      setReplyText(
                        'Toca el agente pequeño y dime qué necesitas: taxi, restaurante, botica, tour o market.'
                      );
                    }}
                    className="text-[11px] font-bold text-[#1565F5] dark:text-[#60A5FA] hover:underline"
                  >
                    Volver al inicio →
                  </button>
                )}
              </div>
              {lastTranscript && (
                <p className="text-[11px] font-mono-tabular text-[#1565F5] dark:text-[#60A5FA]">
                  Escuché: «{lastTranscript}»
                </p>
              )}
              <div className="flex items-center gap-2">
                <p className="text-xs sm:text-sm text-[#0B2538] dark:text-[#F1F5F9] font-medium">
                  {replyText}
                </p>
                <button
                  type="button"
                  onClick={() => speakSpanish(replyText)}
                  aria-label="Escuchar voz"
                  className="w-8 h-8 rounded-full border border-[#1565F5]/25 bg-[#EBF3FF] dark:bg-[#1565F5]/15 text-[#1565F5] dark:text-[#60A5FA] flex items-center justify-center shrink-0"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Buscador siempre listo junto al agente compacto (sin botón de comparación de precios) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSelectedRubro(null);
              handleSearch();
            }}
            className="flex flex-col sm:flex-row gap-2.5 w-full lg:max-w-xl"
          >
            <div className="relative flex-1 flex items-center">
              <Search className="w-4 h-4 text-[#1565F5] absolute left-4 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Pide al agente: "Taxi", "Pollo a la brasa", "Oxígeno", "Leche"'
                className="w-full min-h-[46px] pl-11 pr-12 rounded-2xl border border-[#1565F5]/35 bg-[#F7FAFC] dark:bg-[#031622] text-sm text-[#0B2538] dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1565F5]"
              />
              <button
                type="button"
                onClick={() => handleVoiceCapture()}
                aria-label="Dictar por voz"
                className={`absolute right-2 w-9 h-9 rounded-xl flex items-center justify-center ${
                  voiceActive ? 'bg-[#E11D48] text-white' : 'text-[#1565F5] hover:bg-[#1565F5]/10'
                }`}
              >
                {voiceActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[46px] px-6 rounded-2xl bg-[#F5C400] hover:bg-[#E2B400] text-[#04334B] text-sm font-extrabold whitespace-nowrap shrink-0 transition-colors shadow-sm"
            >
              {loading ? 'Solicitando...' : 'Solicitar'}
            </button>
          </form>
        </div>

        {/* Botones directos principales bajo la barra del agente (activan el mapa solo al solicitar) */}
        {!isCompactSphere && (
          <div className="w-full mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => runVoiceCommand('Quiero un taxi al aeropuerto', 'TRANSPORTE')}
                className="min-h-[62px] px-5 py-3.5 rounded-2xl border border-[#1565F5]/30 bg-white dark:bg-[#031622] hover:border-[#1565F5] hover:bg-[#EBF3FF]/50 text-left flex items-center justify-between gap-3 transition-colors shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#04334B] text-[#F5C400] flex items-center justify-center shrink-0">
                    <CarFront className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#0B2538] dark:text-white">
                      Solicitar Taxi
                    </p>
                    <p className="text-[11px] text-[#516478] dark:text-slate-400">
                      Activa el mapa en vivo con unidades cercanas
                    </p>
                  </div>
                </div>
                <Compass className="w-4 h-4 text-[#1565F5] shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => runVoiceCommand('Comprar leche, atún y arroz en market abierto')}
                className="min-h-[62px] px-5 py-3.5 rounded-2xl border border-[#D8E2EC] dark:border-white/15 bg-white dark:bg-[#031622] hover:border-[#1565F5] hover:bg-[#EBF3FF]/50 text-left flex items-center justify-between gap-3 transition-colors shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1565F5] text-white flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#0B2538] dark:text-white">
                      Pedir en Markets Abiertos
                    </p>
                    <p className="text-[11px] text-[#516478] dark:text-slate-400">
                      Activa el mapa con tiendas y víveres disponibles
                    </p>
                  </div>
                </div>
                <ShoppingBasket className="w-4 h-4 text-[#1565F5] shrink-0" />
              </button>
            </div>

            {/* Comandos de voz rápidos para Otros Negocios */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => runVoiceCommand('Quiero pedir ceviche en restaurante', 'RESTAURANTE')}
                className="min-h-[38px] px-3.5 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-[#F7FAFC] dark:bg-[#031622] text-xs font-semibold text-[#0B2538] dark:text-slate-200 flex items-center gap-1.5 hover:border-[#1565F5]"
              >
                <Utensils className="w-3.5 h-3.5 text-[#1565F5]" />
                <span>«Pedir Restaurante»</span>
              </button>
              <button
                type="button"
                onClick={() => runVoiceCommand('Necesito pastillas para el soroche en botica 24h', 'FARMACIA')}
                className="min-h-[38px] px-3.5 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-[#F7FAFC] dark:bg-[#031622] text-xs font-semibold text-[#0B2538] dark:text-slate-200 flex items-center gap-1.5 hover:border-[#1565F5]"
              >
                <Pill className="w-3.5 h-3.5 text-[#1565F5]" />
                <span>«Botica 24h»</span>
              </button>
              <button
                type="button"
                onClick={() => runVoiceCommand('Quiero reservar tour privado a Machu Picchu', 'TURISMO')}
                className="min-h-[38px] px-3.5 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-[#F7FAFC] dark:bg-[#031622] text-xs font-semibold text-[#0B2538] dark:text-slate-200 flex items-center gap-1.5 hover:border-[#1565F5]"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#F5C400]" />
                <span>«Tours Cusco»</span>
              </button>
              <button
                type="button"
                onClick={() => runVoiceCommand('Reservar habitación de hotel oxigenada', 'HOTEL')}
                className="min-h-[38px] px-3.5 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-[#F7FAFC] dark:bg-[#031622] text-xs font-semibold text-[#0B2538] dark:text-slate-200 flex items-center gap-1.5 hover:border-[#1565F5]"
              >
                <Hotel className="w-3.5 h-3.5 text-[#1565F5]" />
                <span>«Hoteles»</span>
              </button>
              <button
                type="button"
                onClick={() => runVoiceCommand('Quiero cambiar dólares en casa de cambio')}
                className="min-h-[38px] px-3.5 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-[#F7FAFC] dark:bg-[#031622] text-xs font-semibold text-[#0B2538] dark:text-slate-200 flex items-center gap-1.5 hover:border-[#1565F5]"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-[#1565F5]" />
                <span>«Cambiar Dólares»</span>
              </button>
            </div>

            {/* Barra compacta GPS / Voz / SOS */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setSphereExpanded(true);
                  setTimeout(() => inputRef.current?.focus(), 60);
                }}
                className="min-h-[38px] px-3.5 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-white dark:bg-[#031622] text-xs font-semibold text-[#0B2538] dark:text-slate-200 hover:border-[#1565F5]"
              >
                Escribir otro pedido
              </button>
              <button
                type="button"
                onClick={requestGps}
                className="min-h-[38px] px-3.5 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-white dark:bg-[#031622] text-xs font-semibold text-[#0B2538] dark:text-slate-200 flex items-center gap-1.5 hover:border-[#1565F5]"
              >
                <MapPin className="w-3.5 h-3.5 text-[#1565F5]" />
                <span>{gpsStatus === 'live' ? 'GPS Activo' : 'Activar mi GPS'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !speakReplies;
                  setSpeakReplies(next);
                  if (next) speakSpanish(replyText);
                  else stopSpeaking();
                }}
                className={`min-h-[38px] px-3.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
                  speakReplies
                    ? 'border-[#1565F5]/40 bg-[#EBF3FF] dark:bg-[#1565F5]/15 text-[#1565F5] dark:text-[#60A5FA]'
                    : 'border-[#D8E2EC] dark:border-white/15 text-[#516478]'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>{speakReplies ? 'Voz Activa' : 'Voz Silenciada'}</span>
              </button>
              <button
                type="button"
                onClick={() => setSosOpen(true)}
                className="min-h-[38px] px-3.5 rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5 hover:bg-rose-100"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Emergencia SOS</span>
              </button>
            </div>
          </div>
        )}

        {/* Barra de acceso rápido a los módulos complementarios */}
        <div className="mt-4 pt-4 border-t border-[#D8E2EC] dark:border-white/10 flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => {
              setSubTab('CONCIERGE');
              handleSearch('Quiero un taxi al aeropuerto', 'TRANSPORTE', true);
              notifyDocumentAlertIfNeeded('Taxi InDrive', false);
            }}
            className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 border ${
              subTab === 'CONCIERGE' && conciergeMode === 'TAXI_INDRIVE'
                ? 'border-[#04334B] bg-[#04334B] text-[#F5C400]'
                : 'border-[#D8E2EC] dark:border-white/15 bg-[#F7FAFC] dark:bg-[#031622] text-[#0B2538] dark:text-slate-300 hover:border-[#1565F5]'
            }`}
          >
            <CarFront className="w-3.5 h-3.5" />
            <span>Taxi InDrive</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubTab('CONCIERGE');
              handleSearch('leche, atún y arroz', undefined, true);
              notifyDocumentAlertIfNeeded('Markets Abiertos', false);
            }}
            className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 border ${
              subTab === 'CONCIERGE' && conciergeMode === 'MARKET_MAP'
                ? 'border-[#1565F5] bg-[#1565F5] text-white'
                : 'border-[#D8E2EC] dark:border-white/15 bg-[#F7FAFC] dark:bg-[#031622] text-[#0B2538] dark:text-slate-300 hover:border-[#1565F5]'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Markets Abiertos</span>
          </button>

          {secondaryModules.map((sc) => {
            const active =
              (sc.tab && subTab === sc.tab) ||
              (!sc.tab &&
                subTab === 'CONCIERGE' &&
                conciergeMode === 'CATALOG' &&
                activeCategory === sc.rubro);
            return (
              <button
                key={sc.label}
                type="button"
                onClick={() => {
                  if (sc.tab) {
                    setSubTab(sc.tab);
                  } else if (sc.rubro) {
                    setSelectedRubro(sc.rubro);
                    setQuery(sc.prompt || '');
                    handleSearch(sc.prompt || '', sc.rubro);
                  }
                }}
                className={`min-h-[38px] px-3 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 border transition-colors ${
                  active
                    ? 'bg-[#04334B] text-[#F5C400] border-[#04334B]'
                    : 'border-[#D8E2EC] dark:border-white/15 bg-[#F7FAFC] dark:bg-[#031622] text-[#0B2538] dark:text-slate-300 hover:border-[#1565F5]'
                }`}
              >
                {sc.icon}
                <span>{sc.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {errorMsg && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODO 0 (INICIO): SIN MAPA NI LISTA DE PRECIOS HASTA SOLICITAR        */}
      {/* El mapa se activa únicamente cuando el cliente solicita al agente    */}
      {/* ==================================================================== */}

      {/* ==================================================================== */}
      {/* MODO 1: TAXI POR GEOLOCALIZACIÓN (INDRIVE / FACILITO)                */}
      {/* ==================================================================== */}
      {subTab === 'CONCIERGE' && conciergeMode === 'TAXI_INDRIVE' && (
        <TaxiInDriveFlow
          userLat={coords.lat}
          userLng={coords.lng}
          gpsLive={gpsStatus === 'live'}
          onRequestGps={requestGps}
          initialDestination={destino}
          driverCatalog={taxiOpciones}
          speakEnabled={speakReplies}
          customerDoc={sharedCustomerDoc}
          onCustomerDocVerified={handleSharedDocSynced}
          onOrderCreated={onOrderCreated}
        />
      )}

      {/* ==================================================================== */}
      {/* MODO 2: MARKETS ABIERTOS EN MAPA + COMPARADOR DE PRODUCTOS           */}
      {/* ==================================================================== */}
      {subTab === 'CONCIERGE' && conciergeMode === 'MARKET_MAP' && (
        <MarketComparatorFlow
          userLat={coords.lat}
          userLng={coords.lng}
          gpsLive={gpsStatus === 'live'}
          onRequestGps={requestGps}
          requestedItems={requestedMarketItems}
          onChangeItems={setRequestedMarketItems}
          speakEnabled={speakReplies}
          customerDoc={sharedCustomerDoc}
          onCustomerDocVerified={handleSharedDocSynced}
          onOrderCreated={onOrderCreated}
        />
      )}

      {/* ==================================================================== */}
      {/* MODO 3: CATÁLOGO + MAPA CENTRADO + CARRUSEL LATERAL DERECHO         */}
      {/* ==================================================================== */}
      {subTab === 'CONCIERGE' && conciergeMode === 'CATALOG' && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-[#4285F4] dark:text-[#60A5FA]">
                Búsqueda Geolocalizada · La Chuspa
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#14171F] dark:text-[#F4F1EA]">
                {RUBRO_LABELS[activeCategory]} ({opciones.length} encontrados)
              </h2>
              <p className="text-xs sm:text-sm text-[#6A717E] dark:text-[#98A0AD]">
                Mapa centrado en Cusco · Toca cualquier precio del negocio en el mapa para abrir su petición superpuesta
              </p>
            </div>
          </div>

          {opciones.length === 0 ? (
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#0D1322] p-10 text-center space-y-3 chuspa-google-border">
              <p className="text-sm text-[#6A717E] dark:text-[#98A0AD]">
                No encontramos disponibilidad para esa búsqueda exacta en este rubro.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  handleSearch('', activeCategory);
                }}
                className="min-h-[44px] px-5 rounded-xl border border-[#D4AF37]/50 text-xs font-medium text-[#9A7B2C] dark:text-[#E5C158] chuspa-google-btn"
              >
                Ver todo el catálogo de {RUBRO_LABELS[activeCategory]}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Mapa Google Maps grande centrado + Carrusel lateral derecho movible de arriba abajo */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                <div className="lg:col-span-8">
                  <CuscoGeoMap
                    mode="MARKET"
                    userLat={coords.lat}
                    userLng={coords.lng}
                    pins={catalogPins}
                    selectedPinId={selectedCatalogKey ?? catalogMapEntries[0]?.key ?? null}
                    onSelectPin={(id) => {
                      setSelectedCatalogKey(id);
                      const found = catalogMapEntries.find((e) => e.key === id);
                      if (!found) return;
                      if (found.op.tipo === 'DIVISA') {
                        setSubTab('DIVISAS');
                      } else {
                        setSheetError(null);
                        setSelectedOption(found.op);
                        if (!isDocValid) {
                          notifyDocumentAlertIfNeeded(found.op.titulo, false);
                        }
                      }
                    }}
                    onRequestPinAction={(id) => {
                      const found = catalogMapEntries.find((e) => e.key === id);
                      if (!found) return;
                      if (found.op.tipo === 'DIVISA') {
                        setSubTab('DIVISAS');
                      } else {
                        setSheetError(null);
                        setSelectedOption(found.op);
                        if (!isDocValid) {
                          notifyDocumentAlertIfNeeded(found.op.titulo, false);
                        }
                      }
                    }}
                    onRequestGps={requestGps}
                    gpsLive={gpsStatus === 'live'}
                    heightClass="h-[52vh] sm:h-[520px] min-h-[400px]"
                  />
                </div>

                <div className="lg:col-span-4 rounded-3xl border border-[#D8E2EC] dark:border-white/15 bg-white dark:bg-[#052030] p-3.5 flex flex-col max-h-[520px] shadow-md">
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#D8E2EC] dark:border-white/10">
                    <div>
                      <p className="text-xs font-bold text-[#0B2538] dark:text-white">
                        Negocios Encontrados
                      </p>
                      <p className="text-[10px] text-[#516478] dark:text-slate-400">
                        Desliza de arriba a abajo para elegir
                      </p>
                    </div>
                    <span className="text-[11px] font-mono-tabular font-bold text-[#1565F5]">
                      {catalogMapEntries.length}
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                    {catalogMapEntries.map((entry) => {
                      const selected =
                        (selectedCatalogKey ?? catalogMapEntries[0]?.key) === entry.key;
                      return (
                        <div
                          key={entry.key}
                          onClick={() => setSelectedCatalogKey(entry.key)}
                          className={`rounded-2xl border p-3 cursor-pointer transition-all space-y-1.5 ${
                            selected
                              ? 'border-[#1565F5] bg-[#EBF3FF]/70 dark:bg-[#1565F5]/15 shadow-sm'
                              : 'border-[#D8E2EC] dark:border-white/10 bg-[#F7FAFC] dark:bg-[#031622]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#0B2538] dark:text-white truncate">
                                {entry.op.negocio_nombre}
                              </p>
                              <p className="text-[11px] text-[#516478] dark:text-slate-300 line-clamp-2">
                                {entry.op.titulo}
                              </p>
                            </div>
                            <span className="text-xs font-mono-tabular font-extrabold text-[#1565F5] dark:text-[#F5C400] shrink-0">
                              {entry.priceText}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <span className="text-[10px] text-[#516478] dark:text-slate-400">
                              <span className={entry.op.abierto_ahora !== false ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-500 font-semibold'}>
                                {entry.op.abierto_ahora !== false ? '● Abierto' : 'Cerrado'}
                              </span>
                              {' · '}
                              {entry.op.zona || 'Cusco'} · ★ {entry.op.calificacion.toFixed(1)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (entry.op.tipo === 'DIVISA') {
                                  setSubTab('DIVISAS');
                                } else {
                                  setSheetError(null);
                                  setSelectedOption(entry.op);
                                  if (!isDocValid) {
                                    notifyDocumentAlertIfNeeded(entry.op.titulo, false);
                                  }
                                }
                              }}
                              className="min-h-[30px] px-3 rounded-lg bg-[#F5C400] hover:bg-[#E2B400] text-[#04334B] text-[11px] font-extrabold"
                            >
                              Solicitar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Opción discreta para mostrar/ocultar la tabla comparativa si el usuario la requiere */}
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setShowCatalogPriceTable((v) => !v)}
                  className="text-xs font-semibold text-[#1565F5] dark:text-[#60A5FA] hover:underline"
                >
                  {showCatalogPriceTable ? 'Ocultar lista comparativa' : 'Ver lista comparativa de precios →'}
                </button>
              </div>

              {showCatalogPriceTable && (
                <div className="rounded-3xl border border-[#D8E2EC] dark:border-white/15 bg-white dark:bg-[#052030] p-4 sm:p-5 shadow-md overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#D8E2EC] dark:border-white/10">
                    <div>
                      <h3 className="text-sm font-bold text-[#0B2538] dark:text-white">
                        Lista Comparativa · Agente La Chuspa
                      </h3>
                      <p className="text-[11px] text-[#516478] dark:text-slate-400">
                        Ordenado de menor a mayor tarifa para escoger al proveedor
                      </p>
                    </div>
                    <span className="text-[11px] font-mono-tabular font-semibold text-[#1565F5]">
                      {catalogMapEntries.length} opciones
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#D8E2EC] dark:border-white/10 text-[11px] uppercase tracking-wider text-[#516478] dark:text-slate-400">
                          <th className="py-2.5 pr-3 font-semibold">Negocio</th>
                          <th className="py-2.5 pr-3 font-semibold">Servicio / Producto</th>
                          <th className="py-2.5 pr-3 font-semibold">Distancia · ETA</th>
                          <th className="py-2.5 pr-3 font-semibold text-right">Precio</th>
                          <th className="py-2.5 pl-3 font-semibold text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D8E2EC]/70 dark:divide-white/10">
                        {catalogMapEntries.map((entry) => {
                          const op = entry.op;
                          return (
                            <tr
                              key={`tbl-${entry.key}`}
                              onClick={() => setSelectedCatalogKey(entry.key)}
                              className={`cursor-pointer transition-colors ${
                                entry.key === selectedCatalogKey
                                  ? 'bg-[#EBF3FF] dark:bg-[#1565F5]/15'
                                  : 'hover:bg-[#F7FAFC] dark:hover:bg-white/[0.03]'
                              }`}
                            >
                              <td className="py-3 pr-3 font-semibold text-[#0B2538] dark:text-white">
                                <div>{op.negocio_nombre}</div>
                                <div className="text-[10px] font-mono-tabular text-[#516478] dark:text-slate-400">
                                  ★ {op.calificacion.toFixed(2)}
                                </div>
                              </td>
                              <td className="py-3 pr-3 text-[#516478] dark:text-slate-300">
                                <div className="font-medium text-[#0B2538] dark:text-white">
                                  {op.titulo}
                                </div>
                                {op.mejor_precio && (
                                  <span className="text-[10px] font-bold text-[#1565F5] dark:text-[#F5C400]">
                                    Mejor tarifa encontrada
                                  </span>
                                )}
                              </td>
                              <td className="py-3 pr-3 font-mono-tabular text-[#516478] dark:text-slate-400 whitespace-nowrap">
                                {op.distancia_km !== undefined ? `${op.distancia_km.toFixed(1)} km · ` : ''}
                                {op.eta_min} min
                              </td>
                              <td className="py-3 pr-3 text-right font-mono-tabular font-black text-sm whitespace-nowrap text-[#0B2538] dark:text-white">
                                {entry.priceText}
                              </td>
                              <td className="py-3 pl-3 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (op.tipo === 'DIVISA') {
                                      setSubTab('DIVISAS');
                                    } else {
                                      setSheetError(null);
                                      setSelectedOption(op);
                                      if (!isDocValid) {
                                        notifyDocumentAlertIfNeeded(op.titulo, false);
                                      }
                                    }
                                  }}
                                  className="min-h-[34px] px-3.5 rounded-xl bg-[#F5C400] hover:bg-[#E2B400] text-[#04334B] text-[11px] font-extrabold"
                                >
                                  {op.tipo === 'DIVISA' ? 'Cotizar' : 'Escoger'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tarjetas completas debajo para detalle extendido */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {catalogMapEntries.map((entry) => {
                  const op = entry.op;
                  const isHighlighted = entry.key === selectedCatalogKey;
                  return (
                    <article
                      key={entry.key}
                      onClick={() => setSelectedCatalogKey(entry.key)}
                      className={`rounded-2xl border bg-white dark:bg-[#0D1322] p-6 flex flex-col justify-between gap-5 transition-all cursor-pointer ${
                        isHighlighted
                          ? 'border-[#4285F4] ring-2 ring-[#4285F4]/35 shadow-xl'
                          : op.mejor_precio
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
                              <span className="text-[#34A853] font-semibold">Mejor tarifa</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 pt-4 border-t border-black/8 dark:border-white/8">
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-[#6A717E] dark:text-[#98A0AD]">
                            Tarifa verificada {op.unidad_medida ? `· por ${op.unidad_medida}` : ''}
                          </p>
                          <p className="font-mono-tabular text-xl font-semibold text-[#14171F] dark:text-[#F4F1EA]">
                            {entry.priceText}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (op.tipo === 'DIVISA') {
                              setSubTab('DIVISAS');
                            } else {
                              setSheetError(null);
                              setSelectedOption(op);
                              if (!isDocValid) {
                                notifyDocumentAlertIfNeeded(op.titulo, false);
                              }
                            }
                          }}
                          className="min-h-[44px] px-5 rounded-xl bg-[#F5C400] hover:bg-[#E2B400] text-[#04334B] text-xs font-extrabold whitespace-nowrap shrink-0 transition-colors shadow-xs"
                        >
                          {op.tipo === 'DIVISA' ? 'Cotizar' : 'Solicitar'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
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

          {isDocValid && docVerificado && clienteTelefono.trim().length >= 6 && !showEditCustomerData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <input
                type="number"
                min="10"
                value={divisaMonto}
                onChange={(e) => setDivisaMonto(e.target.value)}
                placeholder="Monto en USD / EUR"
                className="min-h-[44px] px-4 rounded-xl border border-[#2563EB]/30 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm font-mono-tabular"
              />
              <div className="min-h-[44px] px-4 py-2 rounded-xl border border-emerald-500/35 bg-emerald-500/8 flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-emerald-700 dark:text-emerald-300 font-semibold">
                  ✓ {clienteNombre} · {docVerificado.tipo} {docVerificado.numero} · {clienteTelefono}
                </span>
                <button
                  type="button"
                  onClick={() => setShowEditCustomerData(true)}
                  className="text-[11px] font-bold text-[#2563EB] dark:text-[#06B6D4] underline shrink-0"
                >
                  Cambiar
                </button>
              </div>
            </div>
          ) : (
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
          )}

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

          {!isDocValid && (
            <div className="rounded-2xl border border-amber-500/45 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200">
              <span>
                <strong>Documento Obligatorio:</strong> valida tu DNI, RUC o documento de extranjero antes de bloquear una tasa.
              </span>
              <button
                type="button"
                onClick={() => onRequestIdentityGate?.()}
                className="px-3 py-1.5 rounded-xl bg-amber-500 text-[#0B0E14] font-bold"
              >
                Identificar Titular
              </button>
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
                      disabled={!isDocValid}
                      onClick={() => handleLockRate(r)}
                      className="min-h-[44px] px-4 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-semibold whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      {isDocValid ? 'Bloquear tasa' : 'Valida DNI/RUC'}
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
              <div className="lg:col-span-6 rounded-3xl border border-white/10 p-5 bg-[#07090E] space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{activeRoute.unidad}</span>
                  <span className="font-mono-tabular text-amber-300">
                    {activeRoute.total_asientos - activeRoute.asientos_ocupados.length} libres
                  </span>
                </div>

                {activeRoute.id === 999 ? (
                  <div className="max-w-xs mx-auto space-y-2.5 border border-white/10 rounded-3xl p-4 bg-[#0D1117]">
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
                <div
                  className={`rounded-2xl border p-3 text-xs flex items-center justify-between gap-2 ${
                    isDocValid && docVerificado
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-amber-500/45 bg-amber-500/10 text-amber-200'
                  }`}
                >
                  <span>
                    {isDocValid && docVerificado
                      ? `✓ Titular registrado: ${clienteNombre} · ${docVerificado.tipo} ${docVerificado.numero}${
                          clienteTelefono ? ` · ${clienteTelefono}` : ''
                        }`
                      : 'Obligatorio: valida tu DNI, RUC o Pasaporte para reservar butaca.'}
                  </span>
                  {!isDocValid ? (
                    <button
                      type="button"
                      onClick={() => onRequestIdentityGate?.()}
                      className="px-2.5 py-1 rounded-lg bg-[#D4AF37] text-[#0B0E14] font-bold shrink-0"
                    >
                      Validar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowEditCustomerData((v) => !v)}
                      className="text-[11px] font-bold text-[#06B6D4] underline shrink-0"
                    >
                      {showEditCustomerData ? 'Listo' : 'Cambiar'}
                    </button>
                  )}
                </div>
                {(!isDocValid || clienteTelefono.trim().length < 6 || showEditCustomerData) && (
                  <>
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
                  </>
                )}
                <button
                  type="submit"
                  disabled={!selectedSeatNum || !isDocValid}
                  onClick={() => {
                    if (!selectedSeatRoute) setSelectedSeatRoute(activeRoute);
                  }}
                  className="w-full min-h-[48px] rounded-xl bg-[#D4AF37] text-[#0B0E14] text-xs font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {!isDocValid
                    ? 'Valida DNI/RUC del titular para apartar'
                    : 'Apartar Butaca con PIN de Garantía'}
                </button>
              </form>
            </div>
          </section>
        );
      })()}

      {subTab === 'BODEGA' && (
        <BodegaMinimarketModule
          customerDoc={sharedCustomerDoc}
          onCustomerDocVerified={handleSharedDocSynced}
        />
      )}
      {subTab === 'OFICIOS' && (
        <OficiosModule
          customerDoc={sharedCustomerDoc}
          onCustomerDocVerified={handleSharedDocSynced}
        />
      )}
      {subTab === 'CAMPO' && (
        <CampoDirectoModule
          customerDoc={sharedCustomerDoc}
          onCustomerDocVerified={handleSharedDocSynced}
        />
      )}
      {subTab === 'DESPACHO' && <EmergencyDispatchCenter />}

      {/* HOJA DE CONFIRMACIÓN DE PEDIDO */}
      {selectedOption && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar solicitud"
          className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#121620] border border-black/10 dark:border-white/15 p-6 space-y-5 max-h-[90vh] overflow-y-auto chuspa-google-border">
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
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      required
                      value={destino}
                      onChange={(e) => setDestino(e.target.value)}
                      placeholder="Ej: Aeropuerto Velasco Astete / Hotel Belmond"
                      className="w-full min-h-[44px] pl-4 pr-11 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => handleVoiceCapture((txt) => setDestino(txt))}
                      aria-label="Dictar destino por voz"
                      className="absolute right-2 w-8 h-8 rounded-lg flex items-center justify-center text-[#6A717E] hover:text-[#D4AF37]"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Datos del Titular: si ya ingresó con documento + WhatsApp al entrar, NO se vuelven a pedir */}
              {isDocValid && docVerificado && clienteTelefono.trim().length >= 6 && !showEditCustomerData ? (
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 flex items-start justify-between gap-3">
                  <div className="space-y-0.5 text-xs">
                    <p className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <BadgeCheck className="w-4 h-4 shrink-0" />
                      <span>
                        Titular registrado al ingreso ·{' '}
                        {selectedOption.tipo === 'TAXI'
                          ? 'Identidad de Pasajero'
                          : docVerificado.tipo === 'RUC'
                          ? 'Factura Electrónica'
                          : 'Boleta Electrónica'}
                      </span>
                    </p>
                    <p className="font-semibold text-[#14171F] dark:text-white">
                      {clienteNombre || docVerificado.nombre_completo}
                    </p>
                    <p className="font-mono-tabular text-[11px] text-[#555B66] dark:text-[#A3A9B5]">
                      {docVerificado.tipo}: {docVerificado.numero} · WhatsApp: {clienteTelefono}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowEditCustomerData(true)}
                    className="text-[11px] font-bold text-[#2563EB] dark:text-[#06B6D4] underline shrink-0"
                  >
                    Cambiar datos
                  </button>
                </div>
              ) : (
                <>
                  <div
                    className={`rounded-2xl border p-3.5 space-y-2.5 ${
                      isDocValid
                        ? 'border-emerald-500/40 bg-emerald-500/8'
                        : 'border-amber-500/45 bg-amber-500/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] uppercase tracking-wider font-bold text-[#1E40AF] dark:text-[#06B6D4]">
                        {selectedOption.tipo === 'TAXI'
                          ? 'Identidad del Pasajero * (Sin facturación electrónica)'
                          : 'DNI (8), RUC (11) o Extranjero *'}
                      </span>
                      <div className="flex items-center gap-2">
                        {isDocValid && docVerificado ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            <BadgeCheck className="w-3.5 h-3.5" /> {docVerificado.tipo}{' '}
                            {selectedOption.tipo === 'TAXI'
                              ? 'Verificado'
                              : `· ${
                                  docVerificado.tipo === 'RUC'
                                    ? 'Factura Electrónica'
                                    : 'Boleta Electrónica'
                                }`}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                            Obligatorio
                          </span>
                        )}
                        {showEditCustomerData && (
                          <button
                            type="button"
                            onClick={() => setShowEditCustomerData(false)}
                            className="text-[10px] font-bold text-[#2563EB] dark:text-[#06B6D4] underline"
                          >
                            Ocultar
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={docTipo}
                        onChange={(e) => {
                          setDocTipo(e.target.value as 'DNI' | 'RUC' | 'EXTRANJERO');
                          setDocVerificado(null);
                          setDocLookupError(null);
                        }}
                        className="min-h-[40px] px-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs font-semibold"
                      >
                        <option value="DNI">DNI (8)</option>
                        <option value="RUC">RUC (11)</option>
                        <option value="EXTRANJERO">Extranjero</option>
                      </select>
                      <input
                        type="text"
                        required
                        inputMode={docTipo === 'EXTRANJERO' ? 'text' : 'numeric'}
                        maxLength={docTipo === 'DNI' ? 8 : docTipo === 'RUC' ? 11 : 20}
                        value={docNumero}
                        onChange={(e) => {
                          if (docTipo === 'EXTRANJERO') {
                            setDocNumero(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''));
                          } else {
                            const digits = e.target.value.replace(/\D/g, '');
                            setDocNumero(digits);
                            if (digits.length > 8 && docTipo !== 'RUC') setDocTipo('RUC');
                          }
                          setDocVerificado(null);
                          setDocLookupError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleVerifyCustomerDoc();
                          }
                        }}
                        placeholder={
                          docTipo === 'DNI'
                            ? 'Ej: 44556677'
                            : docTipo === 'RUC'
                            ? 'Ej: 20601234565'
                            : 'Pasaporte / CE'
                        }
                        className="flex-1 min-h-[40px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs font-mono-tabular"
                      />
                      <button
                        type="button"
                        onClick={() => void handleVerifyCustomerDoc()}
                        disabled={docLookupLoading}
                        className="min-h-[40px] px-3 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold whitespace-nowrap"
                      >
                        {docLookupLoading ? 'Validando...' : 'Validar'}
                      </button>
                    </div>
                    {selectedOption.tipo !== 'TAXI' && docTipo === 'RUC' && (
                      <input
                        type="text"
                        value={clienteDireccionFiscal}
                        onChange={(e) => setClienteDireccionFiscal(e.target.value)}
                        placeholder="Dirección fiscal SUNAT (se completa automáticamente)"
                        className="w-full min-h-[38px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs"
                      />
                    )}
                    {docLookupError && <p className="text-[11px] text-[#C81E5B]">{docLookupError}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
                        {docTipo === 'RUC' ? 'Razón Social' : 'Nombre completo'}
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          required
                          value={clienteNombre}
                          onChange={(e) => setClienteNombre(e.target.value)}
                          placeholder="Camila Mendoza"
                          className="w-full min-h-[44px] pl-4 pr-10 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => handleVoiceCapture((txt) => setClienteNombre(txt))}
                          aria-label="Dictar nombre por voz"
                          className="absolute right-2 w-7 h-7 rounded-lg flex items-center justify-center text-[#6A717E] hover:text-[#2563EB]"
                        >
                          <Mic className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
                </>
              )}

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
                  disabled={submittingOrder || docLookupLoading || !isDocValid}
                  className="flex-1 min-h-[48px] rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingOrder
                    ? 'Enviando...'
                    : !isDocValid
                    ? 'Valida DNI/RUC'
                    : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sosOpen && (
        <SosActiveModalCard
          onClose={() => setSosOpen(false)}
          onOpenDispatchCenter={() => setSubTab('DESPACHO')}
          coords={coords}
          onRefreshGps={requestGps}
          defaultNombre={clienteNombre}
          defaultTelefono={customerDoc?.whatsapp || clienteTelefono}
          defaultDoc={sharedCustomerDoc || customerDoc}
        />
      )}
    </div>
  );
};
