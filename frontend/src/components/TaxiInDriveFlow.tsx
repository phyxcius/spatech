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
import { haversineKm, resolveCuscoDestination } from '../lib/cuscoMarkets.ts';
import { emitCenterNotification } from '../lib/notifications.ts';
import {
  formatPeruLookupError,
  isValidForeignDoc,
  type PeruDocumentLookupResult,
} from '../lib/peruDocs.ts';
import {
  createMercadoPagoYapeToken,
  isValidApprovalCode,
  isValidPeruYapePhone,
  VITE_MP_PUBLIC_KEY,
} from '../lib/mercadopago.ts';
import {
  formatSoles,
  type ConciergeOpcion,
  type MetodoPago,
  type PedidoPublico,
  type SharedCustomerDoc,
} from '../types.ts';
import { CuscoGeoMap, type GeoMapPin } from './CuscoGeoMap.tsx';
import {
  YapePlinTransferCheckoutBox,
  type NegocioPagoInfo,
} from './YapePlinTransferCheckoutBox.tsx';

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
  { label: 'Plaza de Armas Cusco', lat: -13.5167, lng: -71.9788 },
  { label: 'Terminal Terrestre Cusco', lat: -13.5322, lng: -71.9642 },
  { label: 'Aeropuerto Velasco Astete', lat: -13.5357, lng: -71.9388 },
  { label: 'Real Plaza Cusco', lat: -13.5249, lng: -71.9508 },
  { label: 'Hospital Regional Cusco', lat: -13.5236, lng: -71.9577 },
  { label: 'Plaza Túpac Amaru', lat: -13.5218, lng: -71.9629 },
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
    initialDestination?.trim() || 'Plaza de Armas Cusco'
  );
  const [offerSoles, setOfferSoles] = useState<number>(initialOfferSoles || 10.0);
  const [autoAccept, setAutoAccept] = useState(false);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('Yape');
  const [searchingRound, setSearchingRound] = useState(1);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('real-1');
  const [showTaxiComparison, setShowTaxiComparison] = useState(false);

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
  const [clienteTelefono, setClienteTelefono] = useState(customerDoc?.whatsapp || '');
  const [showEditCustomerData, setShowEditCustomerData] = useState(false);
  const [promotorCodigo, setPromotorCodigo] = useState('');
  const [pagoTelefono, setPagoTelefono] = useState('');
  const [pagoCodigoAprobacion, setPagoCodigoAprobacion] = useState('');
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [driverPagoConfig, setDriverPagoConfig] = useState<NegocioPagoInfo | null>(null);
  const [pendingTaxiOrder, setPendingTaxiOrder] = useState<{
    pedido: PedidoPublico;
    cliente_pin: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [osrmRoute, setOsrmRoute] = useState<{ km: number; etaMin: number } | null>(null);
  const isDocValid = Boolean(docVerificado && (docVerificado.valid || docVerificado.validado));

  useEffect(() => {
    if (customerDoc?.verificado) {
      setDocTipo(customerDoc.tipo);
      setDocNumero(customerDoc.numero);
      if (customerDoc.nombre) setClienteNombre(customerDoc.nombre);
      if (customerDoc.whatsapp) setClienteTelefono(customerDoc.whatsapp);
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
    customerDoc?.numero,
    customerDoc?.tipo,
    customerDoc?.nombre,
    customerDoc?.whatsapp,
  ]);

  useEffect(() => {
    setPendingTaxiOrder(null);
    setPagoCodigoAprobacion('');
    setTransferConfirmed(false);
    setErrorMsg(null);
    const digits = clienteTelefono.replace(/\D/g, '');
    const localNine = digits.length >= 9 ? digits.slice(-9) : '';
    setPagoTelefono(/^9\d{8}$/.test(localNine) ? localNine : '');
    if (!confirmDriver) {
      setDriverPagoConfig(null);
      return;
    }
    apiFetch<NegocioPagoInfo>(
      `/api/public/negocios/${confirmDriver.driver.negocio_id}/pago-config`
    )
      .then((cfg) => setDriverPagoConfig(cfg))
      .catch(() => setDriverPagoConfig(null));
  }, [confirmDriver?.driver.negocio_id, confirmDriver?.driver.unidad_id]);

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

  const destCoords = useMemo(
    () => resolveCuscoDestination(destinoText, userLat, userLng),
    [destinoText, userLat, userLng]
  );

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
    const realUnits = driverCatalog.filter(
      (c) => c.tipo === 'TAXI' && c.categoria === 'TRANSPORTE' && c.unidad_id
    );
    const offerCentavos = Math.round(offerSoles * 100);
    const factors = [0.94, 1.0, 1.08, 1.16];

    const list: DriverBidCard[] =
      realUnits.length > 0
        ? realUnits.map((real, idx) => {
            const seed = FALLBACK_DRIVER_SEEDS[idx % FALLBACK_DRIVER_SEEDS.length];
            const jitter = ((searchingRound + idx) % 3) * 0.0004;
            const lat = (typeof real.lat === 'number' ? real.lat : seed.lat) + jitter;
            const lng = (typeof real.lng === 'number' ? real.lng : seed.lng) - jitter;
            const dist = Math.max(0.4, haversineKm(userLat, userLng, lat, lng));
            const eta = Math.max(2, Math.round(dist * 3.2 + 1));
            const factor = factors[idx % factors.length];
            const rawCentavos = Math.max(
              600,
              Math.round((offerCentavos * factor) / 50) * 50
            );
            return {
              id: `real-${real.unidad_id}`,
              unidad_id: real.unidad_id!,
              negocio_id: real.negocio_id,
              negocio_nombre: real.negocio_nombre,
              conductor_nombre: real.conductor_nombre || real.titulo,
              placa: real.placa || 'CUS-VIP',
              modelo: real.modelo || 'Sedán Ejecutivo',
              calificacion: real.calificacion || 4.9,
              viajes: 120 + ((real.unidad_id || 1) * 47) % 180,
              lat,
              lng,
              distanciaKm: dist,
              etaMin: eta,
              priceCentavos: rawCentavos,
              isFairPrice: rawCentavos <= Math.round(recommendedSoles * 100) + 100,
              priceTier: 'mid',
            };
          })
        : FALLBACK_DRIVER_SEEDS.map((seed, idx) => {
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
              unidad_id: seed.unidad_id,
              negocio_id: seed.negocio_id,
              negocio_nombre: seed.negocio_nombre,
              conductor_nombre: seed.conductor_nombre,
              placa: seed.placa,
              modelo: seed.modelo,
              calificacion: seed.calificacion,
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

    const cleanPayPhone = pagoTelefono.replace(/\D/g, '').slice(0, 9);
    const cleanPayCode = pagoCodigoAprobacion.replace(/\D/g, '').slice(0, 6);
    if (metodoPago === 'Yape' || metodoPago === 'Plin') {
      if (!isValidPeruYapePhone(cleanPayPhone)) {
        setErrorMsg(`Ingresa tu celular ${metodoPago} de 9 dígitos (empezando en 9).`);
        return;
      }
      if (!isValidApprovalCode(cleanPayCode)) {
        setErrorMsg(`Ingresa el código de aprobación ${metodoPago} de 6 dígitos.`);
        return;
      }
    } else if (metodoPago === 'Tarjeta' && !transferConfirmed) {
      setErrorMsg('Confirma los datos de transferencia bancaria para aprobar tu viaje.');
      return;
    }

    setSubmitting(true);
    const t0 = performance.now();
    try {
      let res = pendingTaxiOrder;
      if (!res) {
        res = await apiFetch<{ pedido: PedidoPublico; cliente_pin: string }>(
          '/api/public/taxi/pedir',
          {
            method: 'POST',
            body: {
              unidad_id: confirmDriver.driver.unidad_id,
              metodo_pago: metodoPago,
              pago_telefono: metodoPago === 'Yape' || metodoPago === 'Plin' ? cleanPayPhone : undefined,
              pago_codigo_aprobacion:
                metodoPago === 'Yape' || metodoPago === 'Plin' ? cleanPayCode : undefined,
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
        setPendingTaxiOrder(res);
      }

      if (metodoPago === 'Yape' && driverPagoConfig?.mp_yape_configurado) {
        const pubKey = (driverPagoConfig.mp_public_key || VITE_MP_PUBLIC_KEY || '').trim();
        if (pubKey) {
          const yapeToken = await createMercadoPagoYapeToken(pubKey, cleanPayPhone, cleanPayCode);
          const payRes = await apiFetch<{
            paymentId?: string | number;
            status: string;
            statusDetail?: string;
          }>('/api/payments/yape', {
            method: 'POST',
            body: {
              token: yapeToken,
              businessId: res.pedido.negocio_id,
              orderId: res.pedido.id,
            },
          });
          if (payRes.status !== 'approved') {
            setErrorMsg(
              `Cobro Yape "${payRes.status}"${
                payRes.statusDetail ? ` (${payRes.statusDetail})` : ''
              }. Verifica el código de 6 dígitos e intenta de nuevo.`
            );
            return;
          }
          res = {
            ...res,
            pedido: {
              ...res.pedido,
              pago_gateway: 'MERCADOPAGO_YAPE',
              pago_referencia: payRes.paymentId ? String(payRes.paymentId) : cleanPayCode,
              pago_estado: 'approved',
            },
          };
        }
      }

      const latency = Math.round(performance.now() - t0);
      emitCenterNotification({
        sender: confirmDriver.driver.negocio_nombre,
        title: `Taxi Confirmado · ${res.pedido.codigo}`,
        message: `${confirmDriver.driver.conductor_nombre} (${confirmDriver.driver.placa}) en camino rumbo a ${destinoText}. Pago: ${metodoPago}. PIN: ${res.cliente_pin}`,
        badge: 'TAXI VERIFICADO',
        tone: 'success',
        placement: 'top',
        sound: metodoPago === 'Efectivo' ? 'whatsapp' : 'payment',
        responseTimeMs: latency,
        speakText: speakEnabled
          ? `Tu taxi ${res.pedido.codigo} con ${confirmDriver.driver.conductor_nombre} fue asignado. Tu PIN de abordaje es ${res.cliente_pin}.`
          : undefined,
      });
      setPendingTaxiOrder(null);
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
      <div className="rounded-3xl border border-[#D8E2EC] dark:border-white/15 bg-white dark:bg-[#052030] p-4 sm:p-5 shadow-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-[#1565F5] dark:text-[#F5C400]">
              Taxi por Geolocalización · Modo InDrive / La Chuspa
            </p>
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#0B2538] dark:text-white">
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
          {DESTINATION_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setDestinoText(preset.label)}
              className={`min-h-[36px] px-3 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border transition-colors ${
                destinoText === preset.label
                  ? 'border-[#1565F5] bg-[#EBF3FF] dark:bg-[#1565F5]/20 text-[#04334B] dark:text-[#F5C400]'
                  : 'border-[#D8E2EC] dark:border-white/10 text-[#516478] dark:text-slate-300 hover:border-[#1565F5]/50'
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
              <div className="flex flex-wrap items-center gap-1.5">
                {(['Yape', 'Plin', 'Efectivo', 'Tarjeta'] as MetodoPago[]).map((m) => (
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
              className="w-full min-h-[48px] rounded-2xl bg-[#F5C400] hover:bg-[#E2B400] text-[#04334B] font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <Zap className="w-4 h-4" />
              <span>Buscar conductores ({driverBids.length} cerca)</span>
            </button>
          </div>
        </div>

        {/* Columna derecha: Tarjetas de Conductores en Vivo + Toggle discreto de tabla */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#1565F5] dark:text-[#F5C400]">
              Conductores Cercanos ({driverBids.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowTaxiComparison((v) => !v)}
              className="text-[11px] font-semibold text-[#1565F5] dark:text-[#60A5FA] hover:underline"
            >
              {showTaxiComparison ? 'Ocultar lista comparativa' : 'Ver lista comparativa →'}
            </button>
          </div>

          {showTaxiComparison && (
            <div className="rounded-2xl border border-[#D8E2EC] dark:border-white/15 bg-white dark:bg-[#052030] p-3 overflow-x-auto">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-[#D8E2EC] dark:border-white/10 text-[#516478] dark:text-slate-400">
                    <th className="py-1.5 pr-2 font-semibold">Conductor / Auto</th>
                    <th className="py-1.5 pr-2 font-semibold">ETA · Dist.</th>
                    <th className="py-1.5 pr-2 font-semibold text-right">Tarifa</th>
                    <th className="py-1.5 pl-2 font-semibold text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8E2EC]/70 dark:divide-white/10">
                  {driverBids.map((drv, idx) => (
                    <tr
                      key={`taxi-tbl-${drv.id}`}
                      onClick={() => setSelectedDriverId(drv.id)}
                      className={`cursor-pointer ${
                        drv.id === selectedDriverId
                          ? 'bg-[#EBF3FF] dark:bg-[#1565F5]/15'
                          : 'hover:bg-[#F7FAFC] dark:hover:bg-white/[0.03]'
                      }`}
                    >
                      <td className="py-2 pr-2">
                        <div className="font-semibold text-[#0B2538] dark:text-white">
                          {drv.conductor_nombre}{' '}
                          {idx === 0 && (
                            <span className="text-[10px] font-bold text-[#1565F5] dark:text-[#F5C400]">
                              · Mejor tarifa
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#516478] dark:text-slate-400">
                          {drv.modelo} · <span className="font-mono-tabular">{drv.placa}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-2 font-mono-tabular text-[#516478] dark:text-slate-300 whitespace-nowrap">
                        {drv.etaMin} min · {drv.distanciaKm.toFixed(1)} km
                      </td>
                      <td className="py-2 pr-2 text-right font-mono-tabular font-black text-sm text-[#0B2538] dark:text-white whitespace-nowrap">
                        {formatSoles(drv.priceCentavos)}
                      </td>
                      <td className="py-2 pl-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDriver({ driver: drv, finalCentavos: drv.priceCentavos });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#F5C400] hover:bg-[#E2B400] text-[#04334B] font-extrabold"
                        >
                          Escoger
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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

              {/* Identidad del pasajero: si ya validó DNI/RUC + WhatsApp al entrar, no vuelve a pedirlos */}
              {isDocValid && docVerificado && clienteTelefono.trim().length >= 6 && !showEditCustomerData ? (
                <div className="space-y-2.5">
                  <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 flex items-start justify-between gap-3">
                    <div className="text-xs space-y-0.5">
                      <p className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                        <BadgeCheck className="w-4 h-4 shrink-0" />
                        <span>Pasajero verificado al ingreso (Sin facturación electrónica)</span>
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
                  <input
                    type="text"
                    value={promotorCodigo}
                    onChange={(e) => setPromotorCodigo(e.target.value)}
                    placeholder="Código referido (opcional)"
                    className="w-full min-h-[42px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs uppercase font-mono-tabular"
                  />
                </div>
              ) : (
                <>
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
                      <div className="flex items-center gap-2">
                        {isDocValid && docVerificado ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            <BadgeCheck className="w-3.5 h-3.5" /> {docVerificado.tipo} Verificado
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
                            className="text-[10px] font-bold text-[#2563EB] underline"
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
                        className="min-h-[42px] px-3.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold whitespace-nowrap"
                      >
                        {docLookupLoading ? 'Validando...' : 'Validar'}
                      </button>
                    </div>
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
                </>
              )}

              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-[#6A717E] dark:text-[#98A0AD]">
                  Método de pago del traslado
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['Yape', 'Plin', 'Efectivo', 'Tarjeta'] as MetodoPago[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMetodoPago(m);
                        setErrorMsg(null);
                      }}
                      className={`min-h-[40px] rounded-xl text-xs font-bold border ${
                        metodoPago === m
                          ? 'bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] border-transparent'
                          : 'border-black/15 dark:border-white/15'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <YapePlinTransferCheckoutBox
                  metodoPago={metodoPago}
                  amountCentavos={confirmDriver.finalCentavos}
                  negocioNombre={confirmDriver.driver.negocio_nombre}
                  negocioPagoConfig={driverPagoConfig}
                  phone={pagoTelefono}
                  onPhoneChange={setPagoTelefono}
                  approvalCode={pagoCodigoAprobacion}
                  onApprovalCodeChange={setPagoCodigoAprobacion}
                  transferConfirmed={transferConfirmed}
                  onTransferConfirmedChange={setTransferConfirmed}
                  compact
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
