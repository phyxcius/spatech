import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CarFront,
  CheckCircle2,
  KeyRound,
  MessageSquare,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { haversineKm } from '../lib/cuscoMarkets.ts';
import { subscribeFirebaseRtdbPath } from '../lib/firebaseRtdb.ts';
import { emitCenterNotification } from '../lib/notifications.ts';
import {
  ESTADO_LABELS,
  formatSoles,
  RUBRO_LABELS,
  type ComprobanteElectronico,
  type PedidoPublico,
  type WhatsAppLog,
} from '../types.ts';
import { CuscoGeoMap } from './CuscoGeoMap.tsx';
import { PinKeypadCard } from './DispatchAndRouteModules.tsx';
import {
  buildComprobanteFromOrder,
  ElectronicInvoiceModal,
} from './ElectronicInvoiceModal.tsx';

interface OrderTrackingProps {
  initialCodigo: string | null;
  clientPin: string | null;
}

export const OrderTracking: React.FC<OrderTrackingProps> = ({ initialCodigo, clientPin }) => {
  const [codigoInput, setCodigoInput] = useState(initialCodigo || '');
  const [pedido, setPedido] = useState<PedidoPublico | null>(null);
  const [logs, setLogs] = useState<WhatsAppLog[]>([]);
  const [puntos, setPuntos] = useState(0);
  const [hasReview, setHasReview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [cancelPhone, setCancelPhone] = useState('');
  const [showCancelBox, setShowCancelBox] = useState(false);
  const [reviewScore, setReviewScore] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [reviewPhone, setReviewPhone] = useState('');
  const [showRiderPreview, setShowRiderPreview] = useState(false);
  const [riderPinInput, setRiderPinInput] = useState('');
  const [riderFeedback, setRiderFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [invoiceData, setInvoiceData] = useState<ComprobanteElectronico | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  const prevEstadoRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialCodigo) {
      setCodigoInput(initialCodigo);
      prevEstadoRef.current = null;
      void fetchOrder(initialCodigo);
    }
  }, [initialCodigo]);

  useEffect(() => {
    if (!pedido || pedido.estado === 'ENTREGADO_PAGADO' || pedido.estado === 'CANCELADO') {
      return;
    }
    const id = setInterval(() => void fetchOrder(pedido.codigo, true), 2500);
    const unsubPedido = subscribeFirebaseRtdbPath(`pedidos/${pedido.codigo}`, () => {
      void fetchOrder(pedido.codigo, true);
    });
    return () => {
      clearInterval(id);
      unsubPedido();
    };
  }, [pedido?.codigo, pedido?.estado]);

  async function fetchOrder(code: string, silent = false) {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    if (!silent) setLoading(true);
    setErrorMsg(null);
    const t0 = performance.now();
    try {
      const res = await apiFetch<{
        pedido: PedidoPublico;
        notificaciones_whatsapp: WhatsAppLog[];
        resena: unknown;
        puntos_cliente: number;
      }>(`/api/public/pedidos/${encodeURIComponent(clean)}`);

      if (
        prevEstadoRef.current &&
        prevEstadoRef.current !== res.pedido.estado
      ) {
        const ms = Math.max(1, Math.round(performance.now() - t0));
        emitCenterNotification({
          id: `track-${res.pedido.codigo}-${res.pedido.estado}`,
          sender: res.pedido.negocio_nombre || 'La Chuspa WhatsApp',
          title: `Actualización · ${res.pedido.codigo}`,
          subtitle: `${ESTADO_LABELS[res.pedido.estado]} · ${res.pedido.negocio_nombre}`,
          detail:
            res.pedido.eta_min && res.pedido.estado === 'CONFIRMADO_PREPARACION'
              ? `Tiempo estimado de llegada: ${res.pedido.eta_min} minutos.`
              : `Tu solicitud cambió a ${ESTADO_LABELS[res.pedido.estado]}.`,
          tone:
            res.pedido.estado === 'CANCELADO'
              ? 'warning'
              : res.pedido.estado === 'ENTREGADO_PAGADO'
              ? 'success'
              : 'info',
          placement: 'top',
          sound: 'whatsapp',
          responseMs: ms,
          speakText: `Tu pedido ${res.pedido.codigo} pasó a ${ESTADO_LABELS[res.pedido.estado]}.`,
        });
      }
      prevEstadoRef.current = res.pedido.estado;
      setPedido(res.pedido);
      setLogs(res.notificaciones_whatsapp);
      setHasReview(Boolean(res.resena));
      setPuntos(res.puntos_cliente);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No encontramos ese código de pedido');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleCancelOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!pedido) return;
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ pedido: PedidoPublico }>(
        `/api/public/pedidos/${encodeURIComponent(pedido.codigo)}/cancelar`,
        {
          method: 'POST',
          body: { cliente_telefono: cancelPhone },
        }
      );
      setPedido(res.pedido);
      setShowCancelBox(false);
      fetchOrder(pedido.codigo, true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo cancelar el pedido');
    }
  }

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!pedido) return;
    setErrorMsg(null);
    try {
      await apiFetch(`/api/public/pedidos/${encodeURIComponent(pedido.codigo)}/resena`, {
        method: 'POST',
        body: {
          cliente_telefono: reviewPhone,
          calificacion: reviewScore,
          comentario: reviewText,
        },
      });
      setHasReview(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo enviar la reseña');
    }
  }

  const stepIndex =
    pedido?.estado === 'PENDIENTE_CONFIRMACION'
      ? 1
      : pedido?.estado === 'CONFIRMADO_PREPARACION'
      ? 2
      : pedido?.estado === 'ENTREGADO_PAGADO'
      ? 3
      : 0;

  return (
    <div className="space-y-8 pb-24 md:pb-12">
      <section className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#9A7B2C] dark:text-[#D4AF37]">
              Seguimiento en Tiempo Real
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold mt-1">
              Consulta tu solicitud
            </h1>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchOrder(codigoInput);
            }}
            className="flex gap-2 w-full sm:w-auto"
          >
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-[#8A8F99] absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={codigoInput}
                onChange={(e) => setCodigoInput(e.target.value)}
                placeholder="PED-CUSCO-1234"
                className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm font-mono-tabular uppercase"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] px-5 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-semibold whitespace-nowrap shrink-0"
            >
              {loading ? 'Buscando...' : 'Buscar'}
            </button>
          </form>
        </div>

        {errorMsg && (
          <div className="rounded-xl border border-[#C81E5B]/40 bg-[#C81E5B]/10 px-4 py-3 text-xs text-[#C81E5B]">
            {errorMsg}
          </div>
        )}

        {!pedido ? (
          <div className="py-12 text-center text-sm text-[#6A717E] dark:text-[#98A0AD]">
            Ingresa tu código de pedido o realiza una solicitud desde la pestaña Concierge para ver el seguimiento en vivo y la vista previa de WhatsApp.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
            <div className="lg:col-span-7 space-y-6">
              {/* Tarjeta principal del pedido */}
              <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-mono-tabular text-xs text-[#9A7B2C] dark:text-[#E5C158]">
                      {pedido.codigo} · {RUBRO_LABELS[pedido.categoria]}
                    </p>
                    <h2 className="font-display text-2xl sm:text-3xl font-semibold mt-1">
                      {pedido.item_nombre}
                    </h2>
                    <p className="text-xs text-[#6A717E] dark:text-[#98A0AD] mt-1">
                      {pedido.negocio_nombre} · {pedido.metodo_pago} ·{' '}
                      <span className="font-mono-tabular font-semibold text-[#14171F] dark:text-[#F4F1EA]">
                        {formatSoles(pedido.monto_centavos)}
                      </span>
                      {pedido.pago_estado && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          Pago: {pedido.pago_estado}
                          {pedido.pago_referencia ? ` · #${pedido.pago_referencia}` : ''}
                        </span>
                      )}
                    </p>
                    {pedido.cliente_documento_numero && (
                      <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-300">
                        <BadgeCheck className="w-3.5 h-3.5" />
                        Titular: {pedido.cliente_nombre} · {pedido.cliente_documento_tipo || 'DNI'}{' '}
                        {pedido.cliente_documento_numero}{' '}
                        {pedido.categoria === 'TRANSPORTE'
                          ? '(Pasajero verificado · Sin facturación electrónica)'
                          : pedido.cliente_documento_tipo === 'RUC'
                          ? '(Factura)'
                          : '(Boleta)'}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => fetchOrder(pedido.codigo)}
                    className="min-h-[44px] px-3.5 rounded-xl border border-black/10 dark:border-white/10 text-xs flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Actualizar</span>
                  </button>
                </div>

                {/* Mapa en Vivo A -> B + Ubicación del Conductor acercándose (Modo Cliente Taxi) */}
                {pedido.categoria === 'TRANSPORTE' && (() => {
                  const oLat = pedido.origen_lat ?? -13.5167;
                  const oLng = pedido.origen_lng ?? -71.9788;
                  const dLat = pedido.destino_lat ?? -13.5357;
                  const dLng = pedido.destino_lng ?? -71.9388;
                  const cLat = pedido.conductor_lat ?? pedido.unidad_lat ?? undefined;
                  const cLng = pedido.conductor_lng ?? pedido.unidad_lng ?? undefined;
                  const isOnBoard = pedido.pin_validado === 1 || pedido.viaje_etapa === 'EN_RUTA_DESTINO' || pedido.viaje_etapa === 'LLEGADO_DESTINO';
                  const hasArrived = pedido.viaje_etapa === 'LLEGADO_DESTINO';
                  const activeStartLat = isOnBoard && typeof cLat === 'number' ? cLat : oLat;
                  const activeStartLng = isOnBoard && typeof cLng === 'number' ? cLng : oLng;
                  const tripKm = Math.max(0.2, haversineKm(activeStartLat, activeStartLng, dLat, dLng));
                  const tripEta = isOnBoard
                    ? Math.max(1, Math.round(tripKm * 3.1 + 1))
                    : pedido.eta_min || Math.max(5, Math.round(tripKm * 3.1 + 2));
                  const drvDistKm =
                    typeof cLat === 'number' && typeof cLng === 'number'
                      ? Math.max(0.2, haversineKm(cLat, cLng, oLat, oLng))
                      : null;
                  const drvEta = drvDistKm !== null ? Math.max(1, Math.round(drvDistKm * 3.2 + 1)) : null;

                  return (
                    <div className="space-y-2.5">
                      <div
                        className={`rounded-2xl border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs ${
                          hasArrived
                            ? 'border-emerald-500/45 bg-emerald-500/12'
                            : isOnBoard
                              ? 'border-indigo-500/40 bg-indigo-500/10'
                              : 'border-blue-500/30 bg-blue-500/8'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-300">
                          <CarFront className="w-4 h-4 shrink-0" />
                          <span>
                            {hasArrived
                              ? `¡Llegaste a tu destino! · ${pedido.conductor_nombre || 'Taxi Cusco'}`
                              : isOnBoard
                                ? `Pasajero a bordo · Rumbo a ${pedido.destino_texto || 'Destino B'}`
                                : pedido.conductor_nombre
                                  ? `${pedido.conductor_nombre} (${pedido.placa || 'Taxi Cusco'})`
                                  : 'Buscando ubicación del conductor'}
                          </span>
                        </div>
                        <span className="font-mono-tabular font-bold text-[#14171F] dark:text-white">
                          {hasArrived
                            ? 'En Destino B · Listo para finalizar'
                            : isOnBoard
                              ? `Restante: ${tripEta} min · ${tripKm.toFixed(1)} km`
                              : drvDistKm !== null && drvEta !== null
                                ? `Acercándose: ${drvEta} min · ${drvDistKm.toFixed(1)} km del punto A`
                                : `Ruta A → B: ${tripKm.toFixed(1)} km`}
                        </span>
                      </div>

                      <CuscoGeoMap
                        mode="TAXI"
                        userLat={oLat}
                        userLng={oLng}
                        originLabel={pedido.origen_texto || 'Punto de recojo A'}
                        destLat={dLat}
                        destLng={dLng}
                        destLabel={pedido.destino_texto || 'Destino B'}
                        driverLat={cLat}
                        driverLng={cLng}
                        driverLabel={
                          pedido.conductor_nombre
                            ? `${pedido.conductor_nombre.split(' ')[0]} · ${pedido.placa || 'Taxi'}`
                            : 'Conductor'
                        }
                        driverEtaBadge={
                          !isOnBoard && drvEta !== null && drvDistKm !== null
                            ? `${drvEta} min\n${drvDistKm.toFixed(1)} km`
                            : undefined
                        }
                        routeBadge={`${tripEta} min\n${tripKm.toFixed(1)} km`}
                        followDriver={isOnBoard && pedido.estado === 'CONFIRMADO_PREPARACION'}
                        activeLeg={isOnBoard ? 'TO_DESTINATION' : 'BOTH'}
                        pins={[]}
                        heightClass="h-[260px] sm:h-[300px]"
                      />
                    </div>
                  );
                })()}

                {/* PIN secreto 4 cajas + advertencia + simulador Vista Rider */}
                {clientPin && initialCodigo === pedido.codigo && pedido.estado !== 'CANCELADO' && (
                  <div className="rounded-2xl border-2 border-[#D4AF37]/60 bg-[#0D1117] text-slate-100 p-5 space-y-4 shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center shrink-0">
                          <ShieldCheck className="w-5 h-5 text-[#D4AF37]" />
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-widest font-bold text-[#D4AF37]">
                            Código de Entrega (4 Dígitos)
                          </p>
                          <p className="text-xs text-slate-300">
                            {pedido.conductor_nombre
                              ? `Unidad asignada: ${pedido.conductor_nombre} (${pedido.placa || 'Cusco'})`
                              : `Repartidor verificado · ${pedido.negocio_nombre}`}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        {clientPin.split('').slice(0, 4).map((digit, i) => (
                          <div
                            key={i}
                            className="w-11 h-12 rounded-xl bg-[#07090E] border-2 border-[#D4AF37]/60 flex items-center justify-center font-mono-tabular text-2xl font-black text-amber-300"
                          >
                            {digit}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs text-amber-200">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>⚠️ No des este código antes de revisar tu entrega o completar el viaje.</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowRiderPreview((v) => !v);
                          setRiderFeedback(null);
                        }}
                        className="text-[11px] font-bold text-amber-300 hover:underline shrink-0 flex items-center gap-1"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>{showRiderPreview ? 'Ocultar Rider' : 'Vista Rider'}</span>
                      </button>
                    </div>

                    {showRiderPreview && (
                      <div className="space-y-2.5 pt-1">
                        <PinKeypadCard
                          value={riderPinInput}
                          onChange={setRiderPinInput}
                          submitLabel="Simular Validación del Rider"
                          attemptsInfo="Modo Demostración Cliente ↔ Rider"
                          onSubmit={() => {
                            if (riderPinInput === clientPin) {
                              setRiderFeedback({
                                ok: true,
                                msg: '✓ PIN correcto. El socio puede liquidar y liberar el fondo en garantía.',
                              });
                            } else {
                              setRiderFeedback({
                                ok: false,
                                msg: '✕ PIN incorrecto. Verifica los 4 dígitos con el cliente.',
                              });
                            }
                          }}
                        />
                        {riderFeedback && (
                          <div
                            className={`rounded-xl px-3.5 py-2 text-xs font-semibold border ${
                              riderFeedback.ok
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                : 'border-red-500/40 bg-red-500/10 text-red-300'
                            }`}
                          >
                            {riderFeedback.msg}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Línea de estados */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span>Estado actual: {ESTADO_LABELS[pedido.estado]}</span>
                    {pedido.eta_min && pedido.estado === 'CONFIRMADO_PREPARACION' && (
                      <span className="font-mono-tabular text-[#D4AF37]">
                        Llegada estimada: {pedido.eta_min} min
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {['Recibido', 'Confirmado', 'Completado'].map((lbl, idx) => {
                      const active = stepIndex >= idx + 1;
                      return (
                        <div key={lbl} className="space-y-1.5">
                          <div
                            className={`h-1.5 rounded-full ${
                              pedido.estado === 'CANCELADO'
                                ? 'bg-[#C81E5B]/40'
                                : active
                                ? 'bg-[#D4AF37]'
                                : 'bg-black/10 dark:bg-white/10'
                            }`}
                          />
                          <p className="text-[11px] text-[#6A717E] dark:text-[#98A0AD]">{lbl}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Cancelación del cliente con teléfono */}
                {(pedido.estado === 'PENDIENTE_CONFIRMACION' ||
                  pedido.estado === 'CONFIRMADO_PREPARACION') && (
                  <div className="pt-2 border-t border-black/10 dark:border-white/10">
                    {!showCancelBox ? (
                      <button
                        type="button"
                        onClick={() => setShowCancelBox(true)}
                        className="min-h-[44px] text-xs font-medium text-[#C81E5B] hover:underline"
                      >
                        Cancelar este pedido
                      </button>
                    ) : (
                      <form onSubmit={handleCancelOrder} className="flex flex-col sm:flex-row gap-2 pt-2">
                        <input
                          type="tel"
                          required
                          value={cancelPhone}
                          onChange={(e) => setCancelPhone(e.target.value)}
                          placeholder="Confirma tu WhatsApp del pedido"
                          className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs"
                        />
                        <button
                          type="submit"
                          className="min-h-[44px] px-4 rounded-xl bg-[#C81E5B] text-white text-xs font-semibold"
                        >
                          Confirmar cancelación
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCancelBox(false)}
                          className="min-h-[44px] px-3 rounded-xl border border-black/15 dark:border-white/15 text-xs"
                        >
                          Volver
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* Reseña verificada y Comprobante Electrónico al completar */}
                {pedido.estado === 'ENTREGADO_PAGADO' && (
                  <div className="pt-4 border-t border-black/10 dark:border-white/10 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 text-[#1FA855] font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        Servicio concretado
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono-tabular text-[#D4AF37]">
                          Puntos acumulados: {puntos} pts
                        </span>
                        {pedido.categoria !== 'TRANSPORTE' ? (
                          <button
                            type="button"
                            disabled={loadingInvoice}
                            onClick={async () => {
                              setLoadingInvoice(true);
                              try {
                                const r = await apiFetch<{ comprobante: ComprobanteElectronico }>(
                                  `/api/public/pedidos/${encodeURIComponent(pedido.codigo)}/comprobante`
                                );
                                setInvoiceData(r.comprobante);
                              } catch {
                                setInvoiceData(buildComprobanteFromOrder(pedido));
                              } finally {
                                setLoadingInvoice(false);
                              }
                            }}
                            className="min-h-[38px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>
                              {loadingInvoice
                                ? 'Generando...'
                                : pedido.cliente_documento_tipo === 'RUC'
                                ? 'Ver / Imprimir Factura'
                                : 'Ver / Imprimir Boleta'}
                            </span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#6A717E] dark:text-[#98A0AD]">
                            Viaje en taxi · Sin facturación electrónica
                          </span>
                        )}
                      </div>
                    </div>
                    {hasReview ? (
                      <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                        Gracias por registrar tu reseña verificada.
                      </p>
                    ) : (
                      <form onSubmit={handleSubmitReview} className="space-y-2.5">
                        <p className="text-xs font-medium">Califica tu experiencia</p>
                        <div className="flex items-center gap-1.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setReviewScore(n)}
                              className="min-h-[44px] min-w-[44px] rounded-xl border border-black/10 dark:border-white/10 flex items-center justify-center"
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  n <= reviewScore ? 'fill-[#D4AF37] text-[#D4AF37]' : 'text-[#8A8F99]'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                        <input
                          type="tel"
                          required
                          value={reviewPhone}
                          onChange={(e) => setReviewPhone(e.target.value)}
                          placeholder="Confirma tu WhatsApp"
                          className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs"
                        />
                        <input
                          type="text"
                          required
                          value={reviewText}
                          onChange={(e) => setReviewText(e.target.value)}
                          placeholder="Comentario breve sobre el servicio"
                          className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs"
                        />
                        <button
                          type="submit"
                          className="min-h-[44px] px-5 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-semibold"
                        >
                          Publicar Reseña Verificada
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Vista previa de mensajes WhatsApp */}
            <div className="lg:col-span-5 rounded-2xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#1FA855]" />
                  <h3 className="text-sm font-semibold">Notificaciones WhatsApp</h3>
                </div>
                <span className="text-[11px] font-mono-tabular text-[#1FA855]">
                  Cloud API Ready
                </span>
              </div>
              <div className="space-y-3">
                {logs.length === 0 ? (
                  <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                    Sin mensajes registrados aún.
                  </p>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-2xl border border-[#1FA855]/25 bg-white dark:bg-[#121620] p-3.5 space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#6A717E] dark:text-[#98A0AD]">
                        <span className="font-mono-tabular text-[#1FA855]">{log.plantilla}</span>
                        <span>{log.estado}</span>
                      </div>
                      <p className="text-xs leading-relaxed text-[#14171F] dark:text-[#F4F1EA]">
                        {log.mensaje}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {invoiceData && (
        <ElectronicInvoiceModal
          comprobante={invoiceData}
          onClose={() => setInvoiceData(null)}
        />
      )}
    </div>
  );
};
