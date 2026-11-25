import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  Clock,
  Minus,
  Navigation,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  Star,
  Zap,
} from 'lucide-react';
import { apiFetch, speakSpanish } from '../lib/api.ts';
import { haversineKm } from '../lib/cuscoMarkets.ts';
import { emitCenterNotification } from '../lib/notifications.ts';
import {
  formatPeruLookupError,
  isValidForeignDoc,
  type PeruDocumentLookupResult,
} from '../lib/peruDocs.ts';
import {
  formatSoles,
  type ConciergeOpcion,
  type MetodoPago,
  type PedidoPublico,
  type SharedCustomerDoc,
} from '../types.ts';
import { CuscoGeoMap, type GeoMapPin } from './CuscoGeoMap.tsx';

interface TaxiInDriveFlowProps {
  userLat: number;
  userLng: number;
  gpsLive: boolean;
  onRequestGps: () => void;
  initialDestination?: string;
  initialOfferSoles?: number;
  driverCatalog: ConciergeOpcion[];
  speakEnabled: boolean;
  customerDoc?: SharedCustomerDoc | null;
  onCustomerDocVerified?: (doc: SharedCustomerDoc) => void;
  onOrderCreated: (pedido: PedidoPublico, pin: string) => void;
}

const DESTINATION_PRESETS: Array<{ label: string; lat: number; lng: number }> = [
  { label: 'Aeropuerto Velasco Astete', lat: -13.5357, lng: -71.9388 },
  { label: 'Real Plaza Cusco', lat: -13.5249, lng: -71.9508 },
  { label: 'Terminal Terrestre Cusco', lat: -13.5322, lng: -71.9642 },
  { label: 'Plaza Túpac Amaru', lat: -13.5218, lng: -71.9629 },
  { label: 'Hospital Regional Cusco', lat: -13.5236, lng: -71.9577 },
  { label: 'Plaza de Armas Cusco', lat: -13.5167, lng: -71.9788 },
];

const FALLBACK_DRIVER_SEEDS = [
  {
    id: 'drv-1',
    unidad_id: 1,
    negocio_id: 1,
    negocio_nombre: 'Cusco Royal Taxi VIP',
    conductor_nombre: 'Carlos Mendoza',
    placa: 'X3K-412',
    modelo: 'Toyota Yaris Sedán',
    calificacion: 4.91,
    viajes: 248,
    lat: -13.5198,
    lng: -71.9742,
    deltaFactor: 0.92,
  },
  {
    id: 'drv-2',
    unidad_id: 2,
    negocio_id: 1,
    negocio_nombre: 'Andes Express Cusco',
    conductor_nombre: 'Katii Huamán',
    placa: 'X4M-809',
    modelo: 'Hyundai Accent Plata',
    calificacion: 4.86,
    viajes: 188,
    lat: -13.5232,
    lng: -71.9695,
    deltaFactor: 1.0,
  },
  {
    id: 'drv-3',
    unidad_id: 3,
    negocio_id: 1,
    negocio_nombre: 'Coripata Ejecutivo',
    conductor_nombre: 'Ruth Quispe',
    placa: 'X2B-651',
    modelo: 'Kia Rio Sedán',
    calificacion: 4.82,
    viajes: 124,
    lat: -13.5152,
    lng: -71.9818,
    deltaFactor: 1.12,
  },
  {
    id: 'drv-4',
    unidad_id: 4,
    negocio_id: 1,
    negocio_nombre: 'Imperial Cab Wanchaq',
    conductor_nombre: 'José Condori',
    placa: 'X5T-194',
    modelo: 'Suzuki Swift Hybrid',
    calificacion: 4.74,
    viajes: 95,
    lat: -13.5262,
    lng: -71.9635,
    deltaFactor: 1.24,
  },
];

interface DriverBidCard {
  id: string;
  unidad_id: number;
  negocio_id: number;
  negocio_nombre: string;
  conductor_nombre: string;
  placa: string;
  modelo: string;
  calificacion: number;
  viajes: number;
  lat: number;
  lng: number;
  distanciaKm: number;
  etaMin: number;
  priceCentavos: number;
  isFairPrice: boolean;
  priceTier: 'cheapest' | 'mid' | 'high';
}

export const TaxiInDriveFlow: React.FC<TaxiInDriveFlowProps> = ({
  userLat,
  userLng,
  gpsLive,
  onRequestGps,
  initialDestination,
  initialOfferSoles,
  driverCatalog,
  speakEnabled,
  customerDoc,
  onCustomerDocVerified,
  onOrderCreated,
}) => {
  const [destinoText, setDestinoText] = useState(
    initialDestination?.trim() || 'Aeropuerto Velasco Astete'
  );
  const [offerSoles, setOfferSoles] = useState<number>(initialOfferSoles || 10.0);
  const [autoAccept, setAutoAccept] = useState(false);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('Yape');
  const [searchingRound, setSearchingRound] = useState(1);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('drv-1');

  // Hoja de confirmación
  const [confirmDriver, setConfirmDriver] = useState<{
    driver: DriverBidCard;
    finalCentavos: number;
  } | null>(null);
  const [docTipo, setDocTipo] = useState<'DNI' | 'RUC' | 'EXTRANJERO'>(customerDoc?.tipo || 'DNI');
  const [docNumero, setDocNumero] = useState(customerDoc?.numero || '');
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
  const [clienteNombre, setClienteNombre] = useState(customerDoc?.nombre || '');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [promotorCodigo, setPromotorCodigo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [osrmRoute, setOsrmRoute] = useState<{ km: number; etaMin: number } | null>(null);
  const isDocValid = Boolean(docVerificado && (docVerificado.valid || docVerificado.validado));

  useEffect(() => {
    if (customerDoc?.verificado) {
      setDocTipo(customerDoc.tipo);
      setDocNumero(customerDoc.numero);
      if (customerDoc.nombre) setClienteNombre(customerDoc.nombre);
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
  }, [customerDoc?.verificado, customerDoc?.numero, customerDoc?.tipo, customerDoc?.nombre]);

  useEffect(() => {
    if (!gpsLive) {
      onRequestGps();
    }
  }, []);

  useEffect(() => {
    if (initialDestination && initialDestination.trim()) {
      setDestinoText(initialDestination.trim());
    }
  }, [initialDestination]);

  const destCoords = useMemo(() => {
    const q = destinoText.toLowerCase();
    const match = DESTINATION_PRESETS.find((p) =>
      p.label.toLowerCase().includes(q) || q.includes(p.label.split(' ')[0].toLowerCase())
    );
    return match || DESTINATION_PRESETS[0];
  }, [destinoText]);

  const haversineRouteKm = useMemo(
    () => Math.max(1.2, haversineKm(userLat, userLng, destCoords.lat, destCoords.lng)),
    [userLat, userLng, destCoords.lat, destCoords.lng]
  );
  const routeDistanceKm = osrmRoute?.km ?? haversineRouteKm;
  const routeEtaMin = osrmRoute?.etaMin ?? Math.max(5, Math.round(routeDistanceKm * 3.1 + 3));
  const recommendedSoles = useMemo(
    () => Number(Math.max(6.0, routeDistanceKm * 2.1 + 3.5).toFixed(1)),
    [routeDistanceKm]
  );

  useEffect(() => {
    if (!initialOfferSoles) {
      setOfferSoles(recommendedSoles);
    }
  }, [recommendedSoles, initialOfferSoles]);

  const driverBids = useMemo<DriverBidCard[]>(() => {
    const realUnits = driverCatalog.filter((c) => c.tipo === 'TAXI' && c.unidad_id);
    const offerCentavos = Math.round(offerSoles * 100);

    const list: DriverBidCard[] = FALLBACK_DRIVER_SEEDS.map((seed, idx) => {
      const real = realUnits[idx % Math.max(1, realUnits.length)];
      const unidadId = real?.unidad_id ?? seed.unidad_id;
      const negocioId = real?.negocio_id ?? seed.negocio_id;
      const negocioNombre = real?.negocio_nombre || seed.negocio_nombre;
      const conductorNombre = real?.conductor_nombre || seed.conductor_nombre;
      const placa = real?.placa || seed.placa;
      const modelo = real?.modelo || seed.modelo;
      const calificacion = real?.calificacion || seed.calificacion;

      const jitter = ((searchingRound + idx) % 3) * 0.0007;
      const lat = seed.lat + jitter;
      const lng = seed.lng - jitter;
      const dist = Math.max(0.5, haversineKm(userLat, userLng, lat, lng));
      const eta = Math.max(2, Math.round(dist * 3.2 + 1));

      const rawCentavos = Math.max(
        600,
        Math.round((offerCentavos * seed.deltaFactor) / 50) * 50
      );
      return {
        id: seed.id,
        unidad_id: unidadId,
        negocio_id: negocioId,
        negocio_nombre: negocioNombre,
        conductor_nombre: conductorNombre,
        placa,
        modelo,
        calificacion,
        viajes: seed.viajes,
        lat,
        lng,
        distanciaKm: dist,
        etaMin: eta,
        priceCentavos: rawCentavos,
        isFairPrice: rawCentavos <= Math.round(recommendedSoles * 100) + 100,
        priceTier: 'mid',
      };
    });

    list.sort((a, b) => a.priceCentavos - b.priceCentavos);
    const minP = list[0]?.priceCentavos ?? 0;
    const maxP = list[list.length - 1]?.priceCentavos ?? 0;

    return list.map((d, i) => ({
      ...d,
      priceTier: i === 0 || d.priceCentavos <= minP ? 'cheapest' : d.priceCentavos >= maxP ? 'high' : 'mid',
    }));
  }, [driverCatalog, offerSoles, searchingRound, userLat, userLng, recommendedSoles]);

  const mapPins: GeoMapPin[] = useMemo(
    () =>
      driverBids.map((d) => ({
        id: d.id,
        lat: d.lat,
        lng: d.lng,
        priceText: formatSoles(d.priceCentavos),
        sublabel: `${d.etaMin} min · ${d.conductor_nombre.split(' ')[0]}`,
        detailTitle: `${d.conductor_nombre} (${d.modelo} · ${d.placa})`,
        tier: d.priceTier,
        kind: 'DRIVER',
        isOpen: true,
      })),
    [driverBids]
  );

  const cheapestDriver = driverBids[0];

  function triggerDriverSearch() {
    const t0 = performance.now();
    setSearchingRound((r) => r + 1);
    const cheapest = driverBids[0];
    const latency = Math.max(18, Math.round(performance.now() - t0));
    if (cheapest) {
      const msg = `La mejor tarifa a ${destinoText} es ${formatSoles(
        cheapest.priceCentavos
      )} con ${cheapest.conductor_nombre} (${cheapest.modelo}, a ${cheapest.etaMin} min).`;
      emitCenterNotification({
        title: `Mejor Precio Taxi · ${formatSoles(cheapest.priceCentavos)}`,
        message: msg,
        badge: 'AGENTE LA CHUSPA',
        tone: 'success',
        responseTimeMs: latency,
        speakText: speakEnabled ? msg : undefined,
      });
      if (speakEnabled) {
        speakSpanish(msg);
      }
      if (autoAccept) {
        setConfirmDriver({ driver: cheapest, finalCentavos: Math.round(offerSoles * 100) });
      }
    }
  }

  async function handleVerifyTaxiDoc() {
    const clean =
      docTipo === 'EXTRANJERO' ? docNumero.trim().toUpperCase() : docNumero.replace(/\D/g, '');
    setDocLookupError(null);
    if (!clean || (docTipo === 'EXTRANJERO' && !isValidForeignDoc(clean))) {
      setDocLookupError('Ingresa tu DNI (8 dígitos), RUC (11 dígitos) o Pasaporte/CE válido.');
      return;
    }
    setDocLookupLoading(true);
    try {
      const res = await apiFetch<PeruDocumentLookupResult>(
        `/api/public/consulta-documento?tipo=${docTipo}&numero=${encodeURIComponent(clean)}${
          docTipo === 'EXTRANJERO' && clienteNombre.trim()
            ? `&nombre=${encodeURIComponent(clienteNombre.trim())}`
            : ''
        }`
      );
      setDocVerificado(res);
      if (res.nombre_completo && (!clienteNombre.trim() || docTipo !== 'EXTRANJERO')) {
        setClienteNombre(res.nombre_completo);
      }
      onCustomerDocVerified?.({
        tipo: res.tipo,
        numero: res.numero,
        nombre: (docTipo === 'EXTRANJERO' ? clienteNombre.trim() : '') || res.nombre_completo,
        direccionFiscal: res.direccion,
        verificado: true,
        fuente: res.fuente || res.source,
      });
    } catch (err) {
      setDocVerificado(null);
      setDocLookupError(formatPeruLookupError(err));
    } finally {
      setDocLookupLoading(false);
    }
  }

  async function handleDispatchTaxi(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmDriver) return;
    setErrorMsg(null);

    const cleanDoc =
      docTipo === 'EXTRANJERO' ? docNumero.trim().toUpperCase() : docNumero.replace(/\D/g, '');
    let activeVerif = docVerificado;
    let activeNombre = clienteNombre.trim();

    if (!activeVerif || !(activeVerif.valid || activeVerif.validado)) {
      if (!cleanDoc) {
        setErrorMsg('Es obligatorio validar el DNI, RUC o Pasaporte/CE del pasajero para pedir un taxi.');
        return;
      }
      setDocLookupLoading(true);
      try {
        const res = await apiFetch<PeruDocumentLookupResult>(
          `/api/public/consulta-documento?tipo=${docTipo}&numero=${encodeURIComponent(cleanDoc)}${
            docTipo === 'EXTRANJERO' && activeNombre
              ? `&nombre=${encodeURIComponent(activeNombre)}`
              : ''
          }`
        );
        activeVerif = res;
        setDocVerificado(res);
        if (res.nombre_completo && !activeNombre) {
          activeNombre = res.nombre_completo;
          setClienteNombre(res.nombre_completo);
        }
        onCustomerDocVerified?.({
          tipo: res.tipo,
          numero: res.numero,
          nombre: activeNombre || res.nombre_completo,
          direccionFiscal: res.direccion,
          verificado: true,
          fuente: res.fuente || res.source,
        });
      } catch (err) {
        setDocLookupLoading(false);
        setErrorMsg(formatPeruLookupError(err));
        return;
      }
      setDocLookupLoading(false);
    }

    setSubmitting(true);
    const t0 = performance.now();
    try {
      const res = await apiFetch<{ pedido: PedidoPublico; cliente_pin: string }>(
        '/api/public/taxi/pedir',
        {
          method: 'POST',
          body: {
            unidad_id: confirmDriver.driver.unidad_id,
            metodo_pago: metodoPago,
            cliente_nombre: activeNombre || clienteNombre,
            cliente_telefono: clienteTelefono,
            cliente_documento_tipo: activeVerif?.tipo || docTipo,
            cliente_documento_numero: activeVerif?.numero || cleanDoc,
            cliente_documento_verificado: Boolean(activeVerif && (activeVerif.valid || activeVerif.validado)),
            origen_texto: gpsLive ? 'Mi ubicación GPS Cusco' : 'Plaza de Armas, Cusco',
            destino_texto: `${destinoText} (Oferta acordada ${formatSoles(confirmDriver.finalCentavos)})`,
            origen_lat: userLat,
            origen_lng: userLng,
            destino_lat: destCoords.lat,
            destino_lng: destCoords.lng,
            promotor_codigo: promotorCodigo || undefined,
          },
        }
      );
      const latency = Math.round(performance.now() - t0);
      emitCenterNotification({
        title: `Taxi Confirmado · ${res.pedido.codigo}`,
        message: `${confirmDriver.driver.conductor_nombre} (${confirmDriver.driver.placa}) en camino rumbo a ${destinoText}. PIN de abordaje: ${res.cliente_pin}`,
        badge: 'TAXI VERIFICADO',
        tone: 'success',
        responseTimeMs: latency,
        speakText: speakEnabled
          ? `Tu taxi ${res.pedido.codigo} con ${confirmDriver.driver.conductor_nombre} fue asignado. Tu PIN de abordaje es ${res.cliente_pin}.`
          : undefined,
      });
      setConfirmDriver(null);
      onOrderCreated(res.pedido, res.cliente_pin);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo solicitar el taxi');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      {/* Barra superior estilo InDrive A -> B */}
      <div className="rounded-3xl border border-[#4285F4]/25 bg-white dark:bg-[#0D1322] p-4 sm:p-5 shadow-lg space-y-3 chuspa-google-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-[#4285F4] dark:text-[#60A5FA]">
              Taxi por Geolocalización · Modo InDrive / La Chuspa
            </p>
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#14171F] dark:text-white">
              Mapa centrado en vivo · Toca un precio para solicitar tu taxi
            </h2>
          </div>
        </div>

        {/* Origen A y Destino B */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="min-h-[44px] px-3.5 py-2 rounded-2xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#080C16] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-6 h-6 rounded-lg bg-[#4285F4] text-white text-xs font-black flex items-center justify-center shrink-0">
                A
              </span>
              <span className="text-xs sm:text-sm font-medium truncate">
                {gpsLive ? 'Mi ubicación GPS actual' : 'Plaza de Armas, Centro Histórico'}
              </span>
            </div>
            <button
              type="button"
              onClick={onRequestGps}
              className="text-[11px] font-semibold text-[#4285F4] shrink-0 hover:underline"
            >
              {gpsLive ? 'Actualizado' : 'Usar GPS'}
            </button>
          </div>

          <div className="min-h-[44px] px-3.5 py-1.5 rounded-2xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#080C16] flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-lg bg-[#34A853] text-white text-xs font-black flex items-center justify-center shrink-0">
              B
            </span>
            <input
              type="text"
              value={destinoText}
              onChange={(e) => setDestinoText(e.target.value)}
              placeholder="¿A dónde vas en Cusco?"
              className="w-full bg-transparent text-xs sm:text-sm font-medium text-[#14171F] dark:text-white focus:outline-none"
            />
            <span className="text-[11px] font-mono-tabular text-[#6A717E] dark:text-[#98A0AD] shrink-0">
              ~{routeEtaMin} min · {routeDistanceKm.toFixed(1)} km
            </span>
          </div>
        </div>

        {/* Destinos rápidos */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {DESTINATION_PRESETS.slice(0, 5).map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setDestinoText(preset.label)}
              className={`min-h-[36px] px-3 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border transition-colors ${
                destinoText === preset.label
                  ? 'border-[#34A853] bg-[#34A853]/15 text-[#14171F] dark:text-[#B6F02B]'
                  : 'border-black/10 dark:border-white/10 text-[#555B66] dark:text-[#98A0AD] hover:border-[#4285F4]/50'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Recomendación Agente La Chuspa: Mejor Precio */}
        {cheapestDriver && (
          <div className="rounded-2xl border border-[#34A853]/40 bg-[#34A853]/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#34A853] text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 dark:text-emerald-300">
                  Recomendación La Chuspa · Mejor Precio
                </p>
                <p className="text-xs sm:text-sm font-semibold text-[#14171F] dark:text-white truncate">
                  {cheapestDriver.conductor_nombre} ({cheapestDriver.modelo}) ·{' '}
                  <span className="font-mono-tabular font-bold text-emerald-700 dark:text-emerald-300">
                    {formatSoles(cheapestDriver.priceCentavos)}
                  </span>{' '}
                  · llega en {cheapestDriver.etaMin} min
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                setConfirmDriver({
                  driver: cheapestDriver,
                  finalCentavos: cheapestDriver.priceCentavos,
                })
              }
              className="min-h-[38px] px-4 rounded-xl bg-[#34A853] hover:bg-emerald-600 text-white text-xs font-bold shrink-0 transition-colors chuspa-google-btn"
            >
              Pedir Mejor Precio
            </button>
          </div>
        )}
      </div>

      {/* Mapa grande centrado · al tocar un precio se superpone el popup de petición */}
      <div className="space-y-4">
        <CuscoGeoMap
          mode="TAXI"
          userLat={userLat}
          userLng={userLng}
          originLabel={gpsLive ? 'Tu GPS' : 'Centro Cusco'}
          destLat={destCoords.lat}
          destLng={destCoords.lng}
          destLabel={destinoText}
          routeSummary={`${routeEtaMin} min · ${routeDistanceKm.toFixed(1)} km`}
          pins={mapPins}
          selectedPinId={selectedDriverId}
          onSelectPin={(id) => {
            setSelectedDriverId(id);
            const drv = driverBids.find((d) => d.id === id);
            if (drv) {
              setConfirmDriver({ driver: drv, finalCentavos: drv.priceCentavos });
            }
          }}
          onRequestPinAction={(id) => {
            const drv = driverBids.find((d) => d.id === id);
            if (drv) {
              setSelectedDriverId(drv.id);
              setConfirmDriver({ driver: drv, finalCentavos: drv.priceCentavos });
            }
          }}
          onRouteComputed={setOsrmRoute}
          onRequestGps={onRequestGps}
          gpsLive={gpsLive}
          heightClass="h-[58vh] sm:h-[66vh] min-h-[430px]"
        />

        {/* Controles InDrive "Viaja a tu precio" + tarjetas de oferta */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5">

          {/* Tarjeta inferior InDrive: Viaja a tu precio */}
          <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#84CC16]/20 border border-[#84CC16]/40 flex items-center justify-center text-xl">
                  🚕
                </div>
                <div>
                  <p className="text-sm font-bold text-[#14171F] dark:text-white">
                    Viaja a tu precio
                  </p>
                  <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                    Tarifa recomendada: <span className="font-mono-tabular font-semibold">S/ {recommendedSoles.toFixed(2)}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {(['Yape', 'Plin', 'Efectivo'] as MetodoPago[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetodoPago(m)}
                    className={`min-h-[34px] px-2.5 rounded-xl text-[11px] font-bold border transition-colors ${
                      metodoPago === m
                        ? 'bg-[#84CC16] text-[#0B0E14] border-[#84CC16]'
                        : 'border-black/10 dark:border-white/15 text-[#555B66] dark:text-[#98A0AD]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Stepper - S/ X.XX + */}
            <div className="flex items-center justify-between gap-4 bg-[#F8F7F4] dark:bg-[#0B0E14] rounded-2xl p-2.5 border border-black/10 dark:border-white/10">
              <button
                type="button"
                aria-label="Bajar tarifa"
                onClick={() => setOfferSoles((v) => Math.max(5.0, Number((v - 0.5).toFixed(2))))}
                className="w-12 h-12 rounded-xl bg-white dark:bg-[#161B26] border border-black/10 dark:border-white/10 flex items-center justify-center hover:border-[#D4AF37]"
              >
                <Minus className="w-5 h-5" />
              </button>
              <div className="text-center">
                <p className="font-mono-tabular text-2xl sm:text-3xl font-extrabold text-[#14171F] dark:text-white">
                  S/ {offerSoles.toFixed(2)}
                </p>
                <p className="text-[11px] text-[#6A717E] dark:text-[#98A0AD]">
                  Tu oferta actual al conductor
                </p>
              </div>
              <button
                type="button"
                aria-label="Subir tarifa"
                onClick={() => setOfferSoles((v) => Math.min(80.0, Number((v + 0.5).toFixed(2))))}
                className="w-12 h-12 rounded-xl bg-white dark:bg-[#161B26] border border-black/10 dark:border-white/10 flex items-center justify-center hover:border-[#D4AF37]"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2.5 text-xs text-[#4A505C] dark:text-[#B4BAC4] cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAccept}
                  onChange={(e) => setAutoAccept(e.target.checked)}
                  className="w-4 h-4 accent-[#84CC16] rounded"
                />
                <span>
                  Aceptar automáticamente oferta de{' '}
                  <strong className="font-mono-tabular">S/ {offerSoles.toFixed(2)}</strong>
                </span>
              </label>
            </div>

            <button
              type="button"
              onClick={triggerDriverSearch}
              className="w-full min-h-[48px] rounded-2xl bg-[#B6F02B] hover:bg-[#a6e01f] text-[#0B0E14] font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-colors chuspa-google-btn"
            >
              <Zap className="w-4 h-4" />
              <span>Buscar conductores ({driverBids.length} cerca)</span>
            </button>
          </div>
        </div>

        {/* Columna derecha: Lista detallada de ofertas de conductores en vivo */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6A717E] dark:text-[#98A0AD]">
              Ofertas de Conductores Verificados ({driverBids.length})
            </h3>
            <span className="text-[11px] font-mono-tabular text-emerald-600 dark:text-emerald-400 font-semibold">
              En Línea ●
            </span>
          </div>

          {driverBids.map((drv) => {
            const isSelected = drv.id === selectedDriverId;
            return (
              <article
                key={drv.id}
                onClick={() => setSelectedDriverId(drv.id)}
                className={`rounded-3xl border p-4 sm:p-5 transition-all cursor-pointer bg-white dark:bg-[#121620] ${
                  isSelected
                    ? 'border-[#84CC16] ring-2 ring-[#84CC16]/30 shadow-xl'
                    : 'border-black/10 dark:border-white/10 hover:border-[#D4AF37]/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Perfil Conductor */}
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-[#14213D] dark:bg-[#D4AF37]/20 text-white dark:text-[#E5C158] font-bold flex items-center justify-center text-sm shrink-0">
                      {drv.conductor_nombre
                        .split(' ')
                        .map((w) => w[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-[#14171F] dark:text-white">
                          {drv.conductor_nombre}
                        </span>
                        <span className="text-xs font-mono-tabular text-amber-500 flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {drv.calificacion.toFixed(2)}
                        </span>
                        <span className="text-[11px] text-[#6A717E] dark:text-[#98A0AD]">
                          ({drv.viajes})
                        </span>
                      </div>
                      <p className="text-xs text-[#555B66] dark:text-[#A3A9B5]">
                        {drv.modelo} · <span className="font-mono-tabular">{drv.placa}</span>
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-[#6A717E] dark:text-[#98A0AD]">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-emerald-500" /> {drv.etaMin} min.
                        </span>
                        <span>·</span>
                        <span className="font-mono-tabular">~{drv.distanciaKm.toFixed(1)} km</span>
                        <span>·</span>
                        <span className="font-semibold text-[#14171F] dark:text-white bg-[#B6F02B]/30 dark:bg-[#B6F02B]/20 px-1.5 py-0.5 rounded-md">
                          {metodoPago}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Precio del conductor */}
                  <div className="text-right shrink-0">
                    <p
                      className={`font-mono-tabular text-xl font-black ${
                        drv.priceTier === 'cheapest'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-[#14171F] dark:text-white'
                      }`}
                    >
                      {formatSoles(drv.priceCentavos)}
                    </p>
                    {drv.isFairPrice && (
                      <p className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                        ↑ Precio justo
                      </p>
                    )}
                  </div>
                </div>

                {/* Ruta breve */}
                <div className="mt-3 pt-3 border-t border-black/8 dark:border-white/8 text-xs text-[#555B66] dark:text-[#A3A9B5] flex items-center justify-between gap-2">
                  <span className="truncate flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    Rumbo a {destinoText}
                  </span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold shrink-0 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> PIN Seguro
                  </span>
                </div>

                {/* Botón aceptar + contraofertas rápidas estilo InDrive */}
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDriver({ driver: drv, finalCentavos: drv.priceCentavos });
                    }}
                    className="flex-1 min-h-[44px] px-4 rounded-2xl bg-[#B6F02B] hover:bg-[#a6e01f] text-[#0B0E14] font-bold text-xs sm:text-sm transition-colors"
                  >
                    Aceptar por {formatSoles(drv.priceCentavos)}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDriver({
                        driver: drv,
                        finalCentavos: Math.round(offerSoles * 100),
                      });
                    }}
                    className="min-h-[44px] px-3.5 rounded-2xl border border-black/15 dark:border-white/15 text-xs font-semibold text-[#14171F] dark:text-white hover:border-[#D4AF37]"
                  >
                    Ofertar S/ {offerSoles.toFixed(2)}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        </div>
      </div>

      {/* Modal de Confirmación de Taxi con Creación Real y PIN */}
      {confirmDriver && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        >
            <form
              onSubmit={handleDispatchTaxi}
              className="w-full max-w-md rounded-3xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto chuspa-google-border"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400">
                    Confirmar Conductor InDrive
                  </p>
                  <h3 className="font-display text-2xl font-semibold text-[#14171F] dark:text-white">
                    {confirmDriver.driver.conductor_nombre} · {confirmDriver.driver.placa}
                  </h3>
                  <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                    {confirmDriver.driver.modelo} · Llega en {confirmDriver.driver.etaMin} min rumbo a{' '}
                    {destinoText}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono-tabular text-xl font-black text-emerald-600 dark:text-emerald-400">
                    {formatSoles(confirmDriver.finalCentavos)}
                  </p>
                  <p className="text-[11px] text-[#6A717E] dark:text-[#98A0AD]">{metodoPago}</p>
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-xl border border-[#C81E5B]/40 bg-[#C81E5B]/10 p-3 text-xs text-[#C81E5B]">
                  {errorMsg}
                </div>
              )}

              {/* Identidad obligatoria del pasajero (solo identificación, sin facturación electrónica) */}
              <div
                className={`rounded-2xl border p-3.5 space-y-2 ${
                  isDocValid
                    ? 'border-emerald-500/40 bg-emerald-500/8'
                    : 'border-amber-500/45 bg-amber-500/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                    <Receipt className="w-3.5 h-3.5" />
                    Identidad del Pasajero * (Sin facturación electrónica)
                  </span>
                  {isDocValid && docVerificado ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      <BadgeCheck className="w-3.5 h-3.5" /> {docVerificado.tipo} Verificado
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                      Obligatorio para reservar
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <select
                    value={docTipo}
                    onChange={(e) => {
                      setDocTipo(e.target.value as 'DNI' | 'RUC' | 'EXTRANJERO');
                      setDocVerificado(null);
                      setDocLookupError(null);
                    }}
                    className="min-h-[42px] px-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs font-bold"
                  >
                    <option value="DNI">DNI (RENIEC)</option>
                    <option value="RUC">RUC (SUNAT)</option>
                    <option value="EXTRANJERO">Extranjero</option>
                  </select>
                  <input
                    required
                    type="text"
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
                        void handleVerifyTaxiDoc();
                      }
                    }}
                    placeholder={
                      docTipo === 'DNI'
                        ? 'DNI 8 dígitos'
                        : docTipo === 'RUC'
                        ? 'RUC 11 dígitos'
                        : 'Pasaporte / CE'
                    }
                    className="flex-1 min-h-[42px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs font-mono-tabular"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyTaxiDoc}
                    disabled={docLookupLoading}
                    className="min-h-[42px] px-3.5 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-bold whitespace-nowrap"
                  >
                    {docLookupLoading ? 'Validando...' : 'Validar'}
                  </button>
                </div>
                {!isDocValid && (
                  <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">
                    Obligatorio: valida tu DNI, RUC o Pasaporte para identificar al pasajero (los viajes en taxi no emiten factura electrónica).
                  </p>
                )}
                {docLookupError && <p className="text-[11px] text-[#C81E5B]">{docLookupError}</p>}
              </div>

              <div className="space-y-2.5">
                <input
                  required
                  type="text"
                  value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value)}
                  placeholder="Nombre completo del pasajero"
                  className="w-full min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                />
                <input
                  required
                  type="tel"
                  value={clienteTelefono}
                  onChange={(e) => setClienteTelefono(e.target.value)}
                  placeholder="WhatsApp (+51 9...)"
                  className="w-full min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                />
                <input
                  type="text"
                  value={promotorCodigo}
                  onChange={(e) => setPromotorCodigo(e.target.value)}
                  placeholder="Código referido (opcional)"
                  className="w-full min-h-[42px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs uppercase font-mono-tabular"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDriver(null)}
                  className="flex-1 min-h-[46px] rounded-2xl border border-black/15 dark:border-white/15 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || docLookupLoading || !isDocValid}
                  className="flex-[2] min-h-[46px] rounded-2xl bg-[#B6F02B] text-[#0B0E14] text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {submitting
                      ? 'Enviando...'
                      : !isDocValid
                      ? 'Valida documento del titular'
                      : 'Pedir Taxi y Ver PIN'}
                  </span>
                </button>
              </div>
            </form>
        </div>
      )}
    </section>
  );
};
