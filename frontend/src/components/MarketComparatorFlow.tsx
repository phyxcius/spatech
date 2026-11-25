import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  Clock,
  Minus,
  Plus,
  ShoppingBasket,
  Sparkles,
  Store,
  Trash2,
} from 'lucide-react';
import {
  computeMarketComparisons,
  QUICK_MARKET_CATALOG_ITEMS,
  type MarketComparisonResult,
  type RequestedMarketItem,
} from '../lib/cuscoMarkets.ts';
import { apiFetch, speakSpanish } from '../lib/api.ts';
import { emitCenterNotification } from '../lib/notifications.ts';
import {
  formatPeruLookupError,
  isValidForeignDoc,
  type PeruDocumentLookupResult,
} from '../lib/peruDocs.ts';
import {
  type MetodoPago,
  type PedidoPublico,
  type SharedCustomerDoc,
} from '../types.ts';
import { CuscoGeoMap, type GeoMapPin } from './CuscoGeoMap.tsx';

interface MarketComparatorFlowProps {
  userLat: number;
  userLng: number;
  gpsLive: boolean;
  onRequestGps: () => void;
  requestedItems: RequestedMarketItem[];
  onChangeItems: (items: RequestedMarketItem[]) => void;
  speakEnabled: boolean;
  customerDoc?: SharedCustomerDoc | null;
  onCustomerDocVerified?: (doc: SharedCustomerDoc) => void;
  onOrderCreated?: (pedido: PedidoPublico, pin: string) => void;
}

function fmtSoles(centavos: number): string {
  return `S/ ${(centavos / 100).toFixed(2)}`;
}

export const MarketComparatorFlow: React.FC<MarketComparatorFlowProps> = ({
  userLat,
  userLng,
  gpsLive,
  onRequestGps,
  requestedItems,
  onChangeItems,
  speakEnabled,
  customerDoc,
  onCustomerDocVerified,
  onOrderCreated,
}) => {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [sortBy, setSortBy] = useState<'PRICE' | 'DISTANCE'>('PRICE');
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [addSku, setAddSku] = useState<string>('aceite');

  // Checkout / Reserva Modal
  const [checkoutTarget, setCheckoutTarget] = useState<{
    result: MarketComparisonResult;
    mode: 'COMPRA' | 'RESERVA';
  } | null>(null);
  const [clienteNombre, setClienteNombre] = useState(customerDoc?.nombre || '');
  const [clienteDireccionFiscal, setClienteDireccionFiscal] = useState(
    customerDoc?.direccionFiscal || ''
  );
  const [clienteTelefono, setClienteTelefono] = useState(customerDoc?.whatsapp || '');
  const [showEditCustomerData, setShowEditCustomerData] = useState(false);
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
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('Yape');
  const [orderReceipt, setOrderReceipt] = useState<{
    codigo: string;
    pin: string;
    marketName: string;
    direccion: string;
    totalCentavos: number;
    mode: 'COMPRA' | 'RESERVA';
    itemsCount: number;
    documentoResumen?: string;
  } | null>(null);
  const isDocValid = Boolean(docVerificado && (docVerificado.valid || docVerificado.validado));

  useEffect(() => {
    if (customerDoc?.verificado) {
      setDocTipo(customerDoc.tipo);
      setDocNumero(customerDoc.numero);
      if (customerDoc.nombre) setClienteNombre(customerDoc.nombre);
      if (customerDoc.whatsapp) setClienteTelefono(customerDoc.whatsapp);
      if (customerDoc.direccionFiscal) setClienteDireccionFiscal(customerDoc.direccionFiscal);
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

  const comparisons = useMemo(() => {
    const list = computeMarketComparisons(requestedItems, userLat, userLng, !onlyOpen);
    if (sortBy === 'DISTANCE') {
      return [...list].sort((a, b) => a.distanciaKm - b.distanciaKm);
    }
    return list;
  }, [requestedItems, userLat, userLng, onlyOpen, sortBy]);

  const activeResult =
    comparisons.find((c) => c.market.id === selectedMarketId) || comparisons[0] || null;

  const mapPins: GeoMapPin[] = useMemo(
    () =>
      comparisons.map((c) => ({
        id: c.market.id,
        lat: c.market.lat,
        lng: c.market.lng,
        priceText: c.market.abiertoAhora ? fmtSoles(c.totalCentavos) : 'Cerrado',
        sublabel: c.market.nombre.replace('Bodega & Minimarket ', '').replace('Market ', ''),
        tier: !c.market.abiertoAhora ? 'closed' : c.priceTier,
        kind: 'MARKET',
        isOpen: c.market.abiertoAhora,
      })),
    [comparisons]
  );

  function updateQty(sku: string, delta: number) {
    onChangeItems(
      requestedItems
        .map((it) =>
          it.sku === sku ? { ...it, cantidad: Math.max(0, Math.min(12, it.cantidad + delta)) } : it
        )
        .filter((it) => it.cantidad > 0)
    );
  }

  function addProductToCompare() {
    const existing = requestedItems.find((i) => i.sku === addSku);
    if (existing) {
      updateQty(addSku, 1);
      return;
    }
    const meta = QUICK_MARKET_CATALOG_ITEMS.find((q) => q.sku === addSku);
    if (!meta) return;
    onChangeItems([...requestedItems, { sku: meta.sku, label: meta.label, cantidad: 1 }]);
  }

  async function handleVerifyCustomerDoc() {
    const clean =
      docTipo === 'EXTRANJERO' ? docNumero.trim().toUpperCase() : docNumero.replace(/\D/g, '');
    setDocLookupError(null);
    if (!clean || (docTipo === 'EXTRANJERO' && !isValidForeignDoc(clean))) {
      setDocLookupError('Ingresa DNI (8 dígitos), RUC (11 dígitos) o Pasaporte/CE válido.');
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
      if (res.direccion) {
        setClienteDireccionFiscal(res.direccion);
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

  async function handleConfirmPurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!checkoutTarget) return;
    setCheckoutError(null);

    const cleanDoc =
      docTipo === 'EXTRANJERO' ? docNumero.trim().toUpperCase() : docNumero.replace(/\D/g, '');
    let activeVerif = docVerificado;
    let activeNombre = clienteNombre.trim();
    let activeDireccion = clienteDireccionFiscal.trim();

    if (!activeVerif || !(activeVerif.valid || activeVerif.validado)) {
      if (!cleanDoc) {
        setCheckoutError('Es obligatorio ingresar y validar el DNI, RUC o documento de extranjero del titular.');
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
        if (res.direccion && !activeDireccion) {
          activeDireccion = res.direccion;
          setClienteDireccionFiscal(res.direccion);
        }
        onCustomerDocVerified?.({
          tipo: res.tipo,
          numero: res.numero,
          nombre: activeNombre || res.nombre_completo,
          direccionFiscal: activeDireccion || res.direccion,
          verificado: true,
          fuente: res.fuente || res.source,
        });
      } catch (err) {
        setDocLookupLoading(false);
        setCheckoutError(formatPeruLookupError(err));
        return;
      }
      setDocLookupLoading(false);
    }

    const t0 = performance.now();
    setSubmittingCheckout(true);
    const itemsMatched = checkoutTarget.result.items.filter((i) => i.matched);
    const count = itemsMatched.reduce((acc, i) => acc + i.cantidad, 0);
    const resumen = itemsMatched
      .map((i) => `${i.cantidad}x ${i.matched?.nombre || i.requestedLabel}`)
      .join(', ');

    try {
      const res = await apiFetch<{ pedido: PedidoPublico; cliente_pin: string }>(
        '/api/public/market-pedidos',
        {
          method: 'POST',
          body: {
            market_nombre: checkoutTarget.result.market.nombre,
            market_zona: checkoutTarget.result.market.direccion,
            items_resumen: resumen || 'Canasta de productos',
            monto_centavos: checkoutTarget.result.totalCentavos,
            metodo_pago: metodoPago,
            cliente_nombre: activeNombre || clienteNombre,
            cliente_telefono: clienteTelefono,
            cliente_documento_tipo: activeVerif?.tipo || docTipo,
            cliente_documento_numero: activeVerif?.numero || cleanDoc,
            cliente_documento_verificado: true,
            cliente_direccion_fiscal: activeDireccion || undefined,
            tipo_entrega: checkoutTarget.mode === 'COMPRA' ? 'DELIVERY' : 'RESERVA',
          },
        }
      );

      const ms = Math.max(1, Math.round(performance.now() - t0));
      const receipt = {
        codigo: res.pedido.codigo,
        pin: res.cliente_pin,
        marketName: checkoutTarget.result.market.nombre,
        direccion: checkoutTarget.result.market.direccion,
        totalCentavos: checkoutTarget.result.totalCentavos,
        mode: checkoutTarget.mode,
        itemsCount: count,
        documentoResumen: `${docVerificado?.tipo || docTipo} ${docVerificado?.numero || cleanDoc}`,
      };
      setOrderReceipt(receipt);
      setCheckoutTarget(null);
      emitCenterNotification({
        id: `market-order-${receipt.codigo}`,
        title: `${checkoutTarget.mode === 'COMPRA' ? 'Compra Confirmada' : 'Reserva Confirmada'} · ${receipt.codigo}`,
        subtitle: `${receipt.marketName} · ${fmtSoles(receipt.totalCentavos)} · PIN ${receipt.pin}`,
        detail: `Sincronizado con panel multinegocio (${receipt.documentoResumen}).`,
        tone: 'success',
        responseMs: ms,
        speakText: speakEnabled
          ? `${
              checkoutTarget.mode === 'COMPRA' ? 'Compra confirmada' : 'Reserva generada'
            } en ${receipt.marketName} por ${fmtSoles(receipt.totalCentavos)}. Tu PIN es ${receipt.pin
              .split('')
              .join(' ')}.`
          : undefined,
      });
      onOrderCreated?.(res.pedido, res.cliente_pin);
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'No se pudo enviar el pedido al minimarket'
      );
    } finally {
      setSubmittingCheckout(false);
    }
  }

  return (
    <section className="space-y-4">
      {/* Canasta de productos solicitados + Filtros de Comparador */}
      <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-emerald-600 dark:text-emerald-400">
              Comparador Facilito · Solo Markets Abiertos en Cusco
            </p>
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#14171F] dark:text-white">
              Compara tu lista en markets abiertos por geolocalización
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="min-h-[38px] px-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyOpen}
                onChange={(e) => setOnlyOpen(e.target.checked)}
                className="accent-emerald-600"
              />
              <span>Solo abiertos ahora ({comparisons.filter((c) => c.market.abiertoAhora).length})</span>
            </label>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'PRICE' | 'DISTANCE')}
              className="min-h-[38px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs font-semibold"
            >
              <option value="PRICE">Ordenar: Menor Precio Total</option>
              <option value="DISTANCE">Ordenar: Más Cercano</option>
            </select>
          </div>
        </div>

        {/* Productos que el cliente pidió + Agregar otro producto */}
        <div className="flex flex-wrap items-center gap-2">
          {requestedItems.map((it) => (
            <div
              key={it.sku}
              className="min-h-[40px] pl-3 pr-1.5 py-1 rounded-2xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 flex items-center gap-2 text-xs font-semibold"
            >
              <span className="text-[#14171F] dark:text-[#F4F1EA]">{it.label}</span>
              <div className="flex items-center gap-1 bg-white dark:bg-[#0B0E14] rounded-xl px-1 py-0.5 border border-black/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => updateQty(it.sku, -1)}
                  className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {it.cantidad <= 1 ? (
                    <Trash2 className="w-3 h-3 text-[#C81E5B]" />
                  ) : (
                    <Minus className="w-3 h-3" />
                  )}
                </button>
                <span className="font-mono-tabular w-5 text-center">{it.cantidad}</span>
                <button
                  type="button"
                  onClick={() => updateQty(it.sku, 1)}
                  className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-1.5">
            <select
              value={addSku}
              onChange={(e) => setAddSku(e.target.value)}
              className="min-h-[40px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs"
            >
              {QUICK_MARKET_CATALOG_ITEMS.map((item) => (
                <option key={item.sku} value={item.sku}>
                  + {item.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addProductToCompare}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-bold"
            >
              Añadir
            </button>
          </div>
        </div>
      </div>

      {/* Confirmación reciente de Compra / Reserva PIN */}
      {orderReceipt && (
        <div className="rounded-3xl border-2 border-emerald-500/60 bg-emerald-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              {orderReceipt.mode === 'COMPRA'
                ? 'Compra Confirmada · Preparando Pedido'
                : 'Reserva Generada · Stock Apartado 60 min'}
            </p>
            <h3 className="font-display text-2xl font-semibold text-[#14171F] dark:text-white">
              {orderReceipt.marketName} ({orderReceipt.codigo})
            </h3>
            <p className="text-xs text-[#555B66] dark:text-[#A3A9B5]">
              {orderReceipt.direccion} · {orderReceipt.itemsCount} productos · Total:{' '}
              <strong className="font-mono-tabular">{fmtSoles(orderReceipt.totalCentavos)}</strong>
            </p>
          </div>
          <div className="bg-[#0B0E14] text-white border border-emerald-500/40 rounded-2xl px-5 py-3 text-center shrink-0">
            <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">
              PIN de Entrega / Retiro
            </p>
            <p className="font-mono-tabular text-2xl font-black tracking-[0.25em] text-[#D4AF37]">
              {orderReceipt.pin}
            </p>
          </div>
        </div>
      )}

      {/* Mapa grande centrado · al tocar un precio de minimarket se superpone el popup */}
      <CuscoGeoMap
        mode="MARKET"
        userLat={userLat}
        userLng={userLng}
        pins={mapPins}
        selectedPinId={activeResult?.market.id ?? null}
        onSelectPin={(id) => {
          setSelectedMarketId(id);
          const target = comparisons.find((c) => c.market.id === id);
          if (target && target.market.abiertoAhora && target.totalCentavos > 0) {
            setCheckoutTarget({ result: target, mode: 'COMPRA' });
          }
        }}
        onRequestPinAction={(id) => {
          const target = comparisons.find((c) => c.market.id === id);
          if (target && target.market.abiertoAhora && target.totalCentavos > 0) {
            setSelectedMarketId(id);
            setCheckoutTarget({ result: target, mode: 'COMPRA' });
          }
        }}
        onRequestGps={onRequestGps}
        gpsLive={gpsLive}
        heightClass="h-[58vh] sm:h-[66vh] min-h-[430px]"
      />

      {/* Detalle del Market Seleccionado + Comparativa Inferior */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 space-y-4">
          {activeResult && (
            <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#0D1322] p-5 shadow-xl space-y-4 chuspa-google-border">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        activeResult.market.abiertoAhora
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-500/15 text-slate-500'
                      }`}
                    >
                      {activeResult.market.abiertoAhora ? '● Abierto ahora' : 'Cerrado'} ·{' '}
                      {activeResult.market.horario}
                    </span>
                    <span className="text-[11px] font-mono-tabular text-[#6A717E] dark:text-[#98A0AD]">
                      {activeResult.distanciaKm.toFixed(1)} km · ~{activeResult.etaMin} min
                    </span>
                  </div>
                  <h3 className="font-display text-2xl font-semibold text-[#14171F] dark:text-white flex items-center gap-2">
                    <Store className="w-5 h-5 text-[#D4AF37]" />
                    {activeResult.market.nombre}
                  </h3>
                  <p className="text-xs text-[#555B66] dark:text-[#A3A9B5]">
                    {activeResult.market.direccion} · ★ {activeResult.market.calificacion.toFixed(2)}
                  </p>
                </div>

                <div className="text-left sm:text-right shrink-0">
                  <p className="text-[11px] uppercase tracking-wider text-[#6A717E] dark:text-[#98A0AD]">
                    Total de tu lista
                  </p>
                  <p className="font-mono-tabular text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {fmtSoles(activeResult.totalCentavos)}
                  </p>
                  {activeResult.ahorroVsCaroCentavos > 0 && (
                    <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Ahorras {fmtSoles(activeResult.ahorroVsCaroCentavos)} frente al más caro
                    </p>
                  )}
                </div>
              </div>

              {/* Desglose producto por producto solicitado */}
              <div className="divide-y divide-black/8 dark:divide-white/8 rounded-2xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#080C16]">
                {activeResult.items.map((item) => (
                  <div
                    key={item.sku}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[#14171F] dark:text-white truncate">
                        {item.cantidad}×{' '}
                        {item.matched ? item.matched.nombre : `${item.requestedLabel} (Sin stock)`}
                      </p>
                      {item.matched && (
                        <p className="text-[11px] text-[#6A717E] dark:text-[#98A0AD]">
                          {item.matched.marca} · {item.matched.presentacion} ·{' '}
                          {fmtSoles(item.matched.precioCentavos)} c/u
                        </p>
                      )}
                    </div>
                    <span className="font-mono-tabular font-bold shrink-0 text-[#14171F] dark:text-white">
                      {item.matched ? fmtSoles(item.subtotalCentavos) : '—'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Botones Compra directa o Reserva */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  disabled={!activeResult.market.abiertoAhora || activeResult.totalCentavos === 0}
                  onClick={() => setCheckoutTarget({ result: activeResult, mode: 'COMPRA' })}
                  className="flex-1 min-h-[46px] px-5 rounded-2xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 chuspa-google-btn"
                >
                  <ShoppingBasket className="w-4 h-4" />
                  <span>Comprar Ahora ({fmtSoles(activeResult.totalCentavos)})</span>
                </button>
                <button
                  type="button"
                  disabled={!activeResult.market.abiertoAhora || activeResult.totalCentavos === 0}
                  onClick={() => setCheckoutTarget({ result: activeResult, mode: 'RESERVA' })}
                  className="flex-1 min-h-[46px] px-5 rounded-2xl border border-[#D4AF37]/60 bg-[#D4AF37]/10 text-[#9A7B2C] dark:text-[#E5C158] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Clock className="w-4 h-4" />
                  <span>Reservar Canasta (Recojo)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Columna derecha: Tabla Comparativa + Ranking completo de Markets Abiertos */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#1E40AF] dark:text-[#06B6D4]">
              Tabla Comparativa de Precios ({comparisons.length})
            </h3>
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              Facilito Multi-Canasta
            </span>
          </div>

          <div className="rounded-2xl border border-[#2563EB]/25 bg-white dark:bg-[#0D1426] p-3 overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/10 text-[#6A717E] dark:text-[#98A0AD]">
                  <th className="py-1.5 pr-2 font-semibold">Minimarket</th>
                  <th className="py-1.5 pr-2 font-semibold">Stock</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">Canasta</th>
                  <th className="py-1.5 pl-2 font-semibold text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/8 dark:divide-white/8">
                {comparisons.map((res, idx) => (
                  <tr
                    key={`mkt-row-${res.market.id}`}
                    onClick={() => setSelectedMarketId(res.market.id)}
                    className={`cursor-pointer ${
                      activeResult?.market.id === res.market.id
                        ? 'bg-[#2563EB]/10'
                        : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    <td className="py-2 pr-2 font-semibold text-[#14171F] dark:text-white">
                      <div className="truncate max-w-[130px]">{res.market.nombre}</div>
                      <div className="text-[10px] font-mono-tabular text-[#6A717E] dark:text-[#98A0AD]">
                        {res.distanciaKm.toFixed(1)} km {idx === 0 && res.market.abiertoAhora ? '· Mejor precio' : ''}
                      </div>
                    </td>
                    <td className="py-2 pr-2 font-mono-tabular text-[#555B66] dark:text-[#B4BAC4] whitespace-nowrap">
                      {res.matchedCount}/{requestedItems.length}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono-tabular font-black text-[#14171F] dark:text-white whitespace-nowrap">
                      {fmtSoles(res.totalCentavos)}
                    </td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={!res.market.abiertoAhora || res.totalCentavos === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCheckoutTarget({ result: res, mode: 'COMPRA' });
                        }}
                        className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white font-bold disabled:opacity-40"
                      >
                        Escoger
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {comparisons.map((res, idx) => {
            const selected = activeResult?.market.id === res.market.id;
            return (
              <article
                key={res.market.id}
                onClick={() => setSelectedMarketId(res.market.id)}
                className={`rounded-3xl border p-4 cursor-pointer transition-all bg-white dark:bg-[#121620] space-y-3 ${
                  selected
                    ? 'border-emerald-500 ring-2 ring-emerald-500/25 shadow-xl'
                    : 'border-black/10 dark:border-white/10 hover:border-[#D4AF37]/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {idx === 0 && res.market.abiertoAhora && (
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                          Mejor Precio
                        </span>
                      )}
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <BadgeCheck className="w-3 h-3" />{' '}
                        {res.market.abiertoAhora ? 'Abierto' : 'Cerrado'}
                      </span>
                      <span className="text-[11px] font-mono-tabular text-[#6A717E] dark:text-[#98A0AD]">
                        · {res.distanciaKm.toFixed(1)} km
                      </span>
                    </div>
                    <h4 className="font-display text-lg font-semibold text-[#14171F] dark:text-white mt-0.5">
                      {res.market.nombre}
                    </h4>
                    <p className="text-[11px] text-[#6A717E] dark:text-[#98A0AD]">
                      {res.market.zona} · ★ {res.market.calificacion.toFixed(2)}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={`font-mono-tabular text-xl font-black ${
                        res.priceTier === 'cheapest'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : res.priceTier === 'high'
                          ? 'text-rose-500'
                          : 'text-[#9A7B2C] dark:text-amber-300'
                      }`}
                    >
                      {fmtSoles(res.totalCentavos)}
                    </p>
                    <p className="text-[10px] text-[#6A717E] dark:text-[#98A0AD]">
                      {res.matchedCount}/{requestedItems.length} productos
                    </p>
                  </div>
                </div>

                {/* Mini resumen de precios por producto */}
                <div className="flex flex-wrap gap-1.5">
                  {res.items.map((it) => (
                    <span
                      key={it.sku}
                      className="text-[11px] px-2.5 py-1 rounded-xl bg-[#F8F7F4] dark:bg-[#0B0E14] border border-black/10 dark:border-white/10 font-mono-tabular"
                    >
                      {it.requestedLabel.split(' ')[0]}:{' '}
                      <strong>{it.matched ? fmtSoles(it.matched.precioCentavos) : 'N/D'}</strong>
                    </span>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!res.market.abiertoAhora || res.totalCentavos === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCheckoutTarget({ result: res, mode: 'COMPRA' });
                    }}
                    className="flex-1 min-h-[40px] rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-bold disabled:opacity-50"
                  >
                    Comprar
                  </button>
                  <button
                    type="button"
                    disabled={!res.market.abiertoAhora || res.totalCentavos === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCheckoutTarget({ result: res, mode: 'RESERVA' });
                    }}
                    className="flex-1 min-h-[40px] rounded-xl border border-black/15 dark:border-white/15 text-xs font-semibold disabled:opacity-50"
                  >
                    Reservar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Modal de Compra / Reserva de Canasta Market */}
      {checkoutTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        >
          <form
            onSubmit={handleConfirmPurchase}
            className="w-full max-w-md rounded-3xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto chuspa-google-border"
          >
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400">
                {checkoutTarget.mode === 'COMPRA'
                  ? 'Compra Directa con Delivery / Recojo'
                  : 'Reserva de Canasta en Market Abierto'}
              </p>
              <h3 className="font-display text-2xl font-semibold text-[#14171F] dark:text-white">
                {checkoutTarget.result.market.nombre}
              </h3>
              <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                {checkoutTarget.result.market.direccion} · Total:{' '}
                <strong className="font-mono-tabular text-[#14171F] dark:text-white">
                  {fmtSoles(checkoutTarget.result.totalCentavos)}
                </strong>
              </p>
            </div>

            {checkoutError && (
              <div className="rounded-xl border border-[#C81E5B]/40 bg-[#C81E5B]/10 px-3.5 py-2 text-xs text-[#C81E5B]">
                {checkoutError}
              </div>
            )}

            {/* Identidad del Titular: omitida automáticamente si ya validó al ingresar */}
            {isDocValid && docVerificado && clienteTelefono.trim().length >= 6 && !showEditCustomerData ? (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs space-y-0.5">
                    <p className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <BadgeCheck className="w-4 h-4 shrink-0" />
                      <span>
                        {docTipo === 'RUC'
                          ? 'Factura Electrónica (RUC)'
                          : docTipo === 'EXTRANJERO'
                          ? 'Boleta Electrónica (Pasaporte / CE)'
                          : 'Boleta Electrónica (DNI)'}
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
                    <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-700 dark:text-emerald-300">
                      DNI (8), RUC (11) o Extranjero *
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
                          void handleVerifyCustomerDoc();
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
                      onClick={handleVerifyCustomerDoc}
                      disabled={docLookupLoading}
                      className="min-h-[42px] px-3.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-xs font-bold whitespace-nowrap"
                    >
                      {docLookupLoading ? 'Validando...' : 'Validar'}
                    </button>
                  </div>
                  {docLookupError && <p className="text-[11px] text-[#C81E5B]">{docLookupError}</p>}
                </div>

                <div className="space-y-2.5">
                  <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    Comprobante a emitir al finalizar:{' '}
                    <strong>
                      {docTipo === 'RUC'
                        ? 'Factura Electrónica (RUC)'
                        : docTipo === 'EXTRANJERO'
                        ? 'Boleta Electrónica (Pasaporte / CE)'
                        : 'Boleta Electrónica (DNI)'}
                    </strong>
                  </p>
                  <input
                    required
                    type="text"
                    value={clienteNombre}
                    onChange={(e) => setClienteNombre(e.target.value)}
                    placeholder="Titular / Razón social (autocompletado al validar)"
                    className="w-full min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                  />
                  {docTipo === 'RUC' && (
                    <input
                      type="text"
                      value={clienteDireccionFiscal}
                      onChange={(e) => setClienteDireccionFiscal(e.target.value)}
                      placeholder="Dirección fiscal para Factura (autocompletada)"
                      className="w-full min-h-[42px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs"
                    />
                  )}
                  <input
                    required
                    type="tel"
                    value={clienteTelefono}
                    onChange={(e) => setClienteTelefono(e.target.value)}
                    placeholder="WhatsApp (+51 9...)"
                    className="w-full min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                  />
                </div>
              </>
            )}

            <div className="space-y-2.5">
              <div className="grid grid-cols-3 gap-2">
                {(['Yape', 'Plin', 'Efectivo'] as MetodoPago[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetodoPago(m)}
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
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCheckoutTarget(null);
                  setCheckoutError(null);
                }}
                className="flex-1 min-h-[46px] rounded-2xl border border-black/15 dark:border-white/15 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submittingCheckout || docLookupLoading || !isDocValid}
                className="flex-[2] min-h-[46px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {submittingCheckout
                    ? 'Sincronizando...'
                    : !isDocValid
                    ? 'Valida DNI/RUC del titular'
                    : checkoutTarget.mode === 'COMPRA'
                    ? 'Confirmar Compra + PIN'
                    : 'Generar Reserva + PIN'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};
