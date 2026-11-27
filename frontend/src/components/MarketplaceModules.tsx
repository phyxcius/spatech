import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Eye,
  Hammer,
  Leaf,
  Minus,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Sprout,
  Star,
  Store,
  Trash2,
  Truck,
  Volume2,
  Wrench,
  X,
  Zap,
  ZoomIn,
} from 'lucide-react';
import { apiFetch, speakSpanish } from '../lib/api.ts';
import { isValidApprovalCode, isValidPeruYapePhone } from '../lib/mercadopago.ts';
import { emitCenterNotification } from '../lib/notifications.ts';
import {
  formatPeruLookupError,
  isValidForeignDoc,
  type PeruDocumentLookupResult,
} from '../lib/peruDocs.ts';
import type { MetodoPago, SharedCustomerDoc } from '../types.ts';
import { YapePlinTransferCheckoutBox } from './YapePlinTransferCheckoutBox.tsx';

interface MarketplaceModuleProps {
  customerDoc?: SharedCustomerDoc | null;
  onCustomerDocVerified?: (doc: SharedCustomerDoc) => void;
}

const MandatoryDocGate: React.FC<{
  customerDoc?: SharedCustomerDoc | null;
  onVerified: (doc: SharedCustomerDoc) => void;
  contextLabel: string;
}> = ({ customerDoc, onVerified, contextLabel }) => {
  const [tipo, setTipo] = useState<'DNI' | 'RUC' | 'EXTRANJERO'>(customerDoc?.tipo || 'DNI');
  const [numero, setNumero] = useState(customerDoc?.numero || '');
  const [nombreExtra, setNombreExtra] = useState(
    customerDoc?.tipo === 'EXTRANJERO' ? customerDoc.nombre : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customerDoc?.verificado) {
      setTipo(customerDoc.tipo);
      setNumero(customerDoc.numero);
      if (customerDoc.tipo === 'EXTRANJERO') setNombreExtra(customerDoc.nombre);
      setError(null);
    }
  }, [customerDoc?.verificado, customerDoc?.tipo, customerDoc?.numero, customerDoc?.nombre]);

  async function handleVerify() {
    setError(null);
    if (tipo === 'EXTRANJERO') {
      const clean = numero.trim().toUpperCase();
      if (!isValidForeignDoc(clean)) {
        setError('Ingresa un Pasaporte o Carné de Extranjería válido (6-20 caracteres).');
        return;
      }
      setLoading(true);
      try {
        const res = await apiFetch<PeruDocumentLookupResult>(
          `/api/public/consulta-documento?tipo=EXTRANJERO&numero=${encodeURIComponent(clean)}${
            nombreExtra.trim() ? `&nombre=${encodeURIComponent(nombreExtra.trim())}` : ''
          }`
        );
        onVerified({
          tipo: 'EXTRANJERO',
          numero: res.numero,
          nombre: nombreExtra.trim() || res.nombre_completo,
          direccionFiscal: res.direccion,
          verificado: true,
          fuente: res.fuente || res.source,
        });
      } catch (err) {
        setError(formatPeruLookupError(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    const clean = numero.replace(/\D/g, '');
    if (!clean) {
      setError('Ingresa el DNI (8 dígitos) o RUC (11 dígitos) del titular.');
      return;
    }
    const useTipo: 'DNI' | 'RUC' = clean.length === 11 ? 'RUC' : clean.length === 8 ? 'DNI' : tipo;
    if (useTipo !== tipo) setTipo(useTipo);
    setLoading(true);
    try {
      const res = await apiFetch<PeruDocumentLookupResult>(
        `/api/public/consulta-documento?tipo=${useTipo}&numero=${encodeURIComponent(clean)}`
      );
      onVerified({
        tipo: res.tipo,
        numero: res.numero,
        nombre: res.nombre_completo,
        direccionFiscal: res.direccion,
        verificado: true,
        fuente: res.fuente || res.source,
      });
    } catch (err) {
      setError(formatPeruLookupError(err));
    } finally {
      setLoading(false);
    }
  }

  const verified = Boolean(customerDoc?.verificado);

  return (
    <div
      className={`rounded-2xl border p-3.5 space-y-2 ${
        verified
          ? 'border-emerald-500/40 bg-emerald-500/10'
          : 'border-amber-500/45 bg-amber-500/10'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider font-bold text-amber-300">
          Documento del Titular * ({contextLabel})
        </span>
        {verified && customerDoc ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300">
            <BadgeCheck className="w-3.5 h-3.5" /> {customerDoc.tipo} {customerDoc.numero} Verificado
          </span>
        ) : (
          <span className="text-[10px] font-bold text-amber-300">Obligatorio para reservar</span>
        )}
      </div>

      <div className="flex gap-2">
        <select
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value as 'DNI' | 'RUC' | 'EXTRANJERO');
            setError(null);
          }}
          className="min-h-[40px] px-2.5 rounded-xl border border-white/15 bg-[#07090E] text-xs font-bold text-white"
        >
          <option value="DNI">DNI (8)</option>
          <option value="RUC">RUC (11)</option>
          <option value="EXTRANJERO">Extranjero</option>
        </select>
        <input
          type="text"
          inputMode={tipo === 'EXTRANJERO' ? 'text' : 'numeric'}
          maxLength={tipo === 'DNI' ? 8 : tipo === 'RUC' ? 11 : 20}
          value={numero}
          onChange={(e) => {
            if (tipo === 'EXTRANJERO') {
              setNumero(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''));
            } else {
              const digits = e.target.value.replace(/\D/g, '');
              setNumero(digits);
              if (digits.length > 8 && tipo !== 'RUC') setTipo('RUC');
            }
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleVerify();
            }
          }}
          placeholder={
            tipo === 'DNI' ? 'DNI 8 dígitos' : tipo === 'RUC' ? 'RUC 11 dígitos' : 'Pasaporte / CE'
          }
          className="flex-1 min-h-[40px] px-3 rounded-xl border border-white/15 bg-[#07090E] text-xs font-mono-tabular text-white"
        />
        <button
          type="button"
          onClick={() => void handleVerify()}
          disabled={loading}
          className="min-h-[40px] px-3 rounded-xl bg-[#D4AF37] text-[#0B0E14] text-xs font-bold whitespace-nowrap"
        >
          {loading ? 'Validando...' : 'Validar'}
        </button>
      </div>

      {tipo === 'EXTRANJERO' && !verified && (
        <input
          type="text"
          value={nombreExtra}
          onChange={(e) => setNombreExtra(e.target.value)}
          placeholder="Nombre completo del titular"
          className="w-full min-h-[38px] px-3 rounded-xl border border-white/15 bg-[#07090E] text-xs text-white"
        />
      )}

      {verified && customerDoc ? (
        <p className="text-[11px] text-emerald-300 font-medium">
          ✓ Titular: {customerDoc.nombre}
        </p>
      ) : (
        <p className="text-[11px] text-amber-200">
          Obligatorio: ingresa y valida tu DNI, RUC o Pasaporte/CE para habilitar la reserva.
        </p>
      )}
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  );
};

// ============================================================================
// 1. MINIMARKET LOCAL + VIVERO + ZOOM HD + CANASTA DINÁMICA + DETALLE
// ============================================================================

interface BodegaProduct {
  id: string;
  nombre: string;
  categoria: 'Abarrotes' | 'Lácteos' | 'Vivero Los Sauces';
  proveedor: string;
  precioCentavos: number;
  unidad: string;
  stock: number;
  lote: string;
  vence: string;
  badge?: string;
  emoji: string;
  descripcion: string;
  composicion?: string[];
  beneficios?: string[];
}

const BODEGA_PRODUCTS: BodegaProduct[] = [
  {
    id: 'prod-leche',
    nombre: 'Leche Evaporada Entera (Pack x6)',
    categoria: 'Lácteos',
    proveedor: 'Bodega & Minimarket El Sol',
    precioCentavos: 2450,
    unidad: 'Pack 6 latas · 400g c/u',
    stock: 18,
    lote: 'Lote: 2026-B',
    vence: 'Vence: Dic 2027',
    badge: 'Más Pedido',
    emoji: '🥛',
    descripcion:
      'Six-pack sellado de fábrica con registro sanitario vigente e inspección de lote verificada en mostrador.',
  },
  {
    id: 'prod-arroz',
    nombre: 'Arroz Superior Seleccionado (Bolsa 5kg)',
    categoria: 'Abarrotes',
    proveedor: 'Bodega & Minimarket El Sol',
    precioCentavos: 2100,
    unidad: 'Bolsa sellada · 5 kg',
    stock: 24,
    lote: 'Lote: 2026-A',
    vence: 'Cosecha Norte 2026',
    emoji: '🌾',
    descripcion:
      'Grano largo entero seleccionado, empaque original hermético pesado en balanza calibrada.',
  },
  {
    id: 'prod-tierra',
    nombre: 'Tierra Negra Preparada Especial (Saco 15kg)',
    categoria: 'Vivero Los Sauces',
    proveedor: 'Vivero Los Sauces · Cusco',
    precioCentavos: 1800,
    unidad: 'Saco 15 kg · Orgánico',
    stock: 32,
    lote: 'Lote: VIV-09',
    vence: 'Mezcla Fresca Mayo',
    badge: 'Vivero Verificado',
    emoji: '🌱',
    descripcion:
      'Sustrato andino aireado y enriquecido, ideal para macetas de interior, suculentas, rosas y biohuertos de altura.',
    composicion: [
      '45% Tierra de chacra tamizada (Valle Sagrado)',
      '25% Humus de lombriz rojo californiano',
      '20% Musgo andino retenedor de humedad',
      '10% Perlita volcánica y carbón vegetal',
    ],
    beneficios: [
      'Drenaje óptimo que evita pudrición de raíces en clima frío.',
      'Nutrición orgánica de liberación lenta por 90 días.',
      'Libre de semillas de maleza y patógenos del suelo.',
    ],
  },
  {
    id: 'prod-aceite',
    nombre: 'Aceite Vegetal Clásico (Botella 1L)',
    categoria: 'Abarrotes',
    proveedor: 'Bodega & Minimarket El Sol',
    precioCentavos: 980,
    unidad: 'Botella PET · 1 Litro',
    stock: 40,
    lote: 'Lote: 2026-C',
    vence: 'Vence: Oct 2027',
    emoji: '🌻',
    descripcion: 'Aceite vegetal refinado con sello inviolable en tapa.',
  },
];

function fmtSoles(centavos: number): string {
  return `S/ ${(centavos / 100).toFixed(2)}`;
}

export const BodegaMinimarketModule: React.FC<MarketplaceModuleProps> = ({
  customerDoc,
  onCustomerDocVerified,
}) => {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<'Todos' | BodegaProduct['categoria']>('Todos');
  const [cart, setCart] = useState<Array<{ product: BodegaProduct; qty: number }>>([
    { product: BODEGA_PRODUCTS[0], qty: 2 },
    { product: BODEGA_PRODUCTS[1], qty: 1 },
  ]);
  const [zoomTarget, setZoomTarget] = useState<{
    title: string;
    subtitle: string;
    emoji: string;
    lote: string;
    vence: string;
    note: string;
  } | null>(null);
  const [detailProduct, setDetailProduct] = useState<BodegaProduct | null>(null);
  const [checkoutPin, setCheckoutPin] = useState<{
    codigo: string;
    pin: string;
    totalCentavos: number;
    itemsCount: number;
  } | null>(null);
  const [localDoc, setLocalDoc] = useState<SharedCustomerDoc | null>(customerDoc ?? null);
  const [clienteNombre, setClienteNombre] = useState(customerDoc?.nombre || '');
  const [clienteTel, setClienteTel] = useState(customerDoc?.whatsapp || '');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('Yape');
  const [pagoTelefono, setPagoTelefono] = useState('');
  const [pagoCodigoAprobacion, setPagoCodigoAprobacion] = useState('');
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  useEffect(() => {
    if (customerDoc?.verificado) {
      setLocalDoc(customerDoc);
      if (customerDoc.nombre) setClienteNombre(customerDoc.nombre);
      if (customerDoc.whatsapp) {
        setClienteTel(customerDoc.whatsapp);
        const d = customerDoc.whatsapp.replace(/\D/g, '').slice(-9);
        if (/^9\d{8}$/.test(d) && !pagoTelefono) setPagoTelefono(d);
      }
      setDocError(null);
    }
  }, [customerDoc?.verificado, customerDoc?.numero, customerDoc?.nombre, customerDoc?.whatsapp]);

  const activeDoc = customerDoc?.verificado ? customerDoc : localDoc;
  const isDocValid = Boolean(activeDoc?.verificado);

  function handleDocVerified(doc: SharedCustomerDoc) {
    setLocalDoc(doc);
    if (doc.nombre) setClienteNombre(doc.nombre);
    setDocError(null);
    onCustomerDocVerified?.(doc);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return BODEGA_PRODUCTS.filter((p) => {
      if (catFilter !== 'Todos' && p.categoria !== catFilter) return false;
      if (!q) return true;
      return (
        p.nombre.toLowerCase().includes(q) ||
        p.proveedor.toLowerCase().includes(q) ||
        p.categoria.toLowerCase().includes(q)
      );
    });
  }, [search, catFilter]);

  const subtotalCentavos = cart.reduce((acc, item) => acc + item.product.precioCentavos * item.qty, 0);
  const totalItems = cart.reduce((acc, item) => acc + item.qty, 0);

  function addToCart(product: BodegaProduct) {
    setCheckoutPin(null);
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id);
      if (idx >= 0) {
        return prev.map((i, k) =>
          k === idx ? { ...i, qty: Math.min(product.stock, i.qty + 1) } : i
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product.id === productId
            ? { ...i, qty: Math.min(i.product.stock, Math.max(0, i.qty + delta)) }
            : i
        )
        .filter((i) => i.qty > 0)
    );
  }

  function handleConfirmBasket(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) return;
    if (!isDocValid) {
      setDocError('Es obligatorio validar el DNI o RUC del titular para confirmar la reserva.');
      return;
    }
    const cleanPayPhone = pagoTelefono.replace(/\D/g, '').slice(0, 9);
    const cleanPayCode = pagoCodigoAprobacion.replace(/\D/g, '').slice(0, 6);
    if (metodoPago === 'Yape' || metodoPago === 'Plin') {
      if (!isValidPeruYapePhone(cleanPayPhone)) {
        setDocError(`Ingresa tu celular ${metodoPago} de 9 dígitos (empezando en 9).`);
        return;
      }
      if (!isValidApprovalCode(cleanPayCode)) {
        setDocError(`Ingresa el código de aprobación ${metodoPago} de 6 dígitos.`);
        return;
      }
    } else if (metodoPago === 'Tarjeta' && !transferConfirmed) {
      setDocError('Confirma los datos de transferencia bancaria del comercio para aprobar la compra.');
      return;
    }

    setDocError(null);
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const codigo = `BOD-${Math.floor(1000 + Math.random() * 9000)}`;
    setCheckoutPin({
      codigo,
      pin,
      totalCentavos: subtotalCentavos,
      itemsCount: totalItems,
    });
    emitCenterNotification({
      id: `bodega-${codigo}`,
      sender: 'Bodega & Minimarket El Sol',
      title: `Canasta Confirmada · ${codigo}`,
      subtitle: `${totalItems} artículos · ${fmtSoles(subtotalCentavos)} · ${metodoPago}`,
      detail: `Tu PIN de entrega en Bodega El Sol es ${pin}.`,
      tone: 'success',
      placement: 'top',
      sound: metodoPago === 'Efectivo' ? 'whatsapp' : 'payment',
    });
  }

  return (
    <section className="space-y-6">
      {/* Cabecera de Doble Identidad Verificada */}
      <div className="rounded-3xl border border-amber-500/30 bg-[#0D1117] text-slate-100 p-5 sm:p-6 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-2xl shrink-0">
              🏪
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-400">
                  Comercio Local Verificado · Cusco
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  <BadgeCheck className="w-3 h-3" /> DNI Titular Verificado
                </span>
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white">
                Bodega & Minimarket El Sol · Vivero Los Sauces
              </h2>
              <p className="text-xs text-slate-300">
                Responsable: <span className="font-semibold text-amber-300">Doña Carmen Quispe • Titular</span> · Av. Cultura 812 · Entrega en 20 min con garantía PIN
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              setZoomTarget({
                title: 'Fachada Verificada · Bodega & Minimarket El Sol',
                subtitle: 'Titular: Doña Carmen Quispe · RUC / DNI Activo',
                emoji: '🏬',
                lote: 'Inspección Presencial 2026',
                vence: 'Horario: 06:30 AM – 10:30 PM',
                note: 'Local comercial verificado en Av. Cultura 812, Cusco. Cuenta con balanza calibrada y despacho sellado para pedidos La Chuspa.',
              })
            }
            className="min-h-[44px] px-4 py-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 text-xs font-semibold flex items-center gap-2 shrink-0 transition-colors"
          >
            <ZoomIn className="w-4 h-4 text-amber-400" />
            <span>Ver Fachada HD</span>
          </button>
        </div>
      </div>

      {/* Vista Detalle de Producto (cuando se inspecciona un producto como Tierra Negra) */}
      {detailProduct ? (
        <div className="rounded-3xl border border-emerald-500/35 bg-[#0D1117] text-slate-100 p-6 sm:p-8 space-y-6">
          <button
            type="button"
            onClick={() => setDetailProduct(null)}
            className="min-h-[40px] px-3.5 rounded-xl border border-white/15 text-xs font-semibold text-slate-200 inline-flex items-center gap-2 hover:border-amber-400/50"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al catálogo</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#07090E] p-6 text-center space-y-4">
              <div className="w-28 h-28 mx-auto rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-6xl">
                {detailProduct.emoji}
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold">
                  {detailProduct.proveedor}
                </span>
                <h3 className="font-display text-2xl font-semibold text-white mt-1">
                  {detailProduct.nombre}
                </h3>
                <p className="text-xs text-slate-400 mt-1">{detailProduct.unidad}</p>
              </div>
              <div className="flex items-center justify-center gap-3 text-xs font-mono-tabular">
                <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-amber-300">
                  {detailProduct.lote}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">
                  Stock: {detailProduct.stock}
                </span>
              </div>
              <p className="font-mono-tabular text-3xl font-bold text-amber-400">
                {fmtSoles(detailProduct.precioCentavos)}
              </p>
            </div>

            <div className="lg:col-span-7 space-y-5">
              <p className="text-sm text-slate-300 leading-relaxed">{detailProduct.descripcion}</p>

              {detailProduct.composicion && (
                <div className="rounded-2xl border border-white/10 bg-[#07090E] p-5 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                    <Sprout className="w-4 h-4" /> ¿Qué contiene esta mezcla?
                  </h4>
                  <ul className="space-y-2 text-xs text-slate-200">
                    {detailProduct.composicion.map((c) => (
                      <li key={c} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detailProduct.beneficios && (
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5 space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                    <Leaf className="w-4 h-4" /> Beneficios para tus plantas
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {detailProduct.beneficios.map((b) => (
                      <li key={b}>• {b}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    speakSpanish(
                      `${detailProduct.nombre}. ${detailProduct.descripcion} Precio ${fmtSoles(detailProduct.precioCentavos)}. Stock disponible de ${detailProduct.stock} unidades.`
                    )
                  }
                  className="min-h-[48px] px-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs font-semibold flex items-center gap-2"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Preguntar al Agente (Voz)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    addToCart(detailProduct);
                    setDetailProduct(null);
                  }}
                  className="flex-1 min-h-[48px] px-6 rounded-2xl bg-emerald-500 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 hover:bg-emerald-400 transition-colors"
                >
                  <ShoppingBasket className="w-4 h-4" />
                  <span>Apartar para Recojo / Delivery</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Catálogo + Buscador */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#0D1117] p-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar leche, arroz, tierra negra para plantas..."
                  className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#07090E] text-sm text-[#14171F] dark:text-slate-100"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(['Todos', 'Lácteos', 'Abarrotes', 'Vivero Los Sauces'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCatFilter(cat)}
                    className={`min-h-[36px] px-3.5 rounded-xl text-xs font-semibold border transition-colors ${
                      catFilter === cat
                        ? 'bg-[#D4AF37] text-[#0B0E14] border-[#D4AF37]'
                        : 'border-black/10 dark:border-white/10 text-[#555B66] dark:text-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map((p) => (
                <article
                  key={p.id}
                  className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#0D1117] p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setZoomTarget({
                            title: p.nombre,
                            subtitle: `${p.proveedor} · ${p.unidad}`,
                            emoji: p.emoji,
                            lote: p.lote,
                            vence: p.vence,
                            note: p.descripcion,
                          })
                        }
                        className="relative w-16 h-16 rounded-2xl bg-[#F8F7F4] dark:bg-[#07090E] border border-amber-500/30 flex items-center justify-center text-3xl shrink-0 group hover:border-amber-400"
                        title="Inspeccionar en Zoom HD"
                      >
                        <span>{p.emoji}</span>
                        <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shadow">
                          <ZoomIn className="w-3.5 h-3.5" />
                        </span>
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                            {p.categoria}
                          </span>
                          <span className="text-[10px] font-mono-tabular text-emerald-600 dark:text-emerald-400">
                            Stock: {p.stock}
                          </span>
                        </div>
                        <h3 className="font-display text-lg font-semibold leading-snug text-[#14171F] dark:text-white mt-0.5">
                          {p.nombre}
                        </h3>
                        <p className="text-[11px] text-[#6A717E] dark:text-slate-400 mt-0.5">
                          {p.unidad}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400 bg-[#F8F7F4] dark:bg-[#07090E] px-3 py-1.5 rounded-xl">
                      <span>{p.lote}</span>
                      <span>{p.vence}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-black/10 dark:border-white/10">
                    <div>
                      <p className="font-mono-tabular text-lg font-bold text-[#14171F] dark:text-amber-400">
                        {fmtSoles(p.precioCentavos)}
                      </p>
                      <button
                        type="button"
                        onClick={() => setDetailProduct(p)}
                        className="text-[11px] text-[#9A7B2C] dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> Ver detalle
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => addToCart(p)}
                      className="min-h-[42px] px-4 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-bold flex items-center gap-1.5 hover:opacity-90"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Agregar</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {/* Canasta Dinámica en Vivo */}
          <div className="lg:col-span-5 rounded-3xl border border-amber-500/35 bg-[#0D1117] text-slate-100 p-5 sm:p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
              <div className="flex items-center gap-2.5">
                <ShoppingBasket className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Canasta Dinámica
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {totalItems} {totalItems === 1 ? 'producto' : 'productos'} seleccionados
                  </p>
                </div>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCart([]);
                    setCheckoutPin(null);
                  }}
                  className="text-[11px] text-red-400 hover:text-red-300 font-semibold"
                >
                  Vaciar todo
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                Tu canasta está vacía. Agrega productos del catálogo para armar tu pedido.
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map(({ product, qty }) => (
                  <div
                    key={product.id}
                    className="rounded-2xl border border-white/10 bg-[#07090E] p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl shrink-0">{product.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{product.nombre}</p>
                        <p className="text-[11px] font-mono-tabular text-amber-400">
                          {fmtSoles(product.precioCentavos)} c/u
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQty(product.id, -1)}
                        aria-label="Disminuir cantidad"
                        className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:border-amber-400"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center font-mono-tabular text-xs font-bold">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(product.id, 1)}
                        aria-label="Aumentar cantidad"
                        className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:border-amber-400"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateQty(product.id, -qty)}
                        aria-label="Quitar producto"
                        className="w-8 h-8 rounded-lg text-red-400 hover:bg-red-500/10 flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-2xl bg-[#07090E] border border-white/10 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Subtotal productos</span>
                <span className="font-mono-tabular text-white">{fmtSoles(subtotalCentavos)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Delivery asegurado Cusco</span>
                <span className="font-mono-tabular text-emerald-400">Gratis (Socio VIP)</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Total con Garantía PIN
                </span>
                <span className="font-mono-tabular text-2xl font-bold text-amber-400">
                  {fmtSoles(subtotalCentavos)}
                </span>
              </div>
            </div>

            {checkoutPin ? (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2">
                <p className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Pedido {checkoutPin.codigo} Confirmado
                </p>
                <p className="text-xs text-slate-200">
                  {checkoutPin.itemsCount} artículos · Total{' '}
                  <span className="font-mono-tabular font-bold">
                    {fmtSoles(checkoutPin.totalCentavos)}
                  </span>
                </p>
                <div className="flex items-center justify-between bg-[#07090E] rounded-xl px-4 py-2.5 border border-emerald-500/30">
                  <span className="text-[11px] text-slate-400">Tu PIN de entrega:</span>
                  <span className="font-mono-tabular text-xl font-bold tracking-[0.25em] text-amber-400">
                    {checkoutPin.pin}
                  </span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleConfirmBasket} className="space-y-3">
                <MandatoryDocGate
                  customerDoc={activeDoc}
                  onVerified={handleDocVerified}
                  contextLabel="Bodega / Vivero"
                />
                {docError && <p className="text-[11px] text-rose-400">{docError}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    value={clienteNombre}
                    onChange={(e) => setClienteNombre(e.target.value)}
                    placeholder="Tu nombre"
                    className="min-h-[42px] px-3.5 rounded-xl border border-white/15 bg-[#07090E] text-xs text-white"
                  />
                  <input
                    type="tel"
                    required
                    value={clienteTel}
                    onChange={(e) => setClienteTel(e.target.value)}
                    placeholder="WhatsApp (+51...)"
                    className="min-h-[42px] px-3.5 rounded-xl border border-white/15 bg-[#07090E] text-xs text-white"
                  />
                </div>
                <div className="space-y-2.5">
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['Yape', 'Plin', 'Efectivo', 'Tarjeta'] as MetodoPago[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setMetodoPago(m);
                          setDocError(null);
                        }}
                        className={`min-h-[38px] rounded-xl text-xs font-bold border ${
                          metodoPago === m
                            ? 'bg-[#D4AF37] text-[#0B0E14] border-transparent'
                            : 'border-white/15 text-slate-300'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <YapePlinTransferCheckoutBox
                    metodoPago={metodoPago}
                    amountCentavos={subtotalCentavos}
                    negocioNombre="Bodega & Minimarket El Sol"
                    negocioPagoConfig={{
                      yape_numero: '984620118',
                      plin_numero: '984620118',
                      banco_nombre: 'BCP Cusco',
                      banco_titular: 'Carmen Quispe Condori',
                      banco_cuenta: '285-99401231-0-88',
                      banco_cci: '002-285-009940123188-41',
                    }}
                    phone={pagoTelefono}
                    onPhoneChange={setPagoTelefono}
                    approvalCode={pagoCodigoAprobacion}
                    onApprovalCodeChange={setPagoCodigoAprobacion}
                    transferConfirmed={transferConfirmed}
                    onTransferConfirmedChange={setTransferConfirmed}
                    compact
                  />
                </div>
                <button
                  type="submit"
                  disabled={cart.length === 0 || !isDocValid}
                  className="w-full min-h-[48px] rounded-2xl bg-[#D4AF37] text-[#0B0E14] text-xs font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isDocValid
                    ? 'Confirmar Pedido con PIN de Entrega'
                    : 'Valida DNI/RUC del titular para confirmar'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal de Inspección Zoom HD */}
      {zoomTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Inspección Zoom HD"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-3xl bg-[#0D1117] border-2 border-amber-500/40 p-6 space-y-4 text-slate-100 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400 font-bold">
                  Inspección Visual HD · Mostrador
                </p>
                <h3 className="font-display text-xl font-semibold text-white mt-0.5">
                  {zoomTarget.title}
                </h3>
                <p className="text-xs text-slate-400">{zoomTarget.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setZoomTarget(null)}
                aria-label="Cerrar Zoom HD"
                className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-[#07090E] border border-white/10 py-10 flex flex-col items-center justify-center gap-3">
              <span className="text-7xl">{zoomTarget.emoji}</span>
              <span className="text-[11px] font-mono-tabular px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                ✓ Sello & Integridad Verificados
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono-tabular">
              <div className="rounded-xl bg-[#07090E] border border-white/10 p-3">
                <span className="text-[10px] text-slate-400 block">Registro</span>
                <span className="text-amber-300 font-semibold">{zoomTarget.lote}</span>
              </div>
              <div className="rounded-xl bg-[#07090E] border border-white/10 p-3">
                <span className="text-[10px] text-slate-400 block">Vigencia</span>
                <span className="text-emerald-300 font-semibold">{zoomTarget.vence}</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{zoomTarget.note}</p>

            <button
              type="button"
              onClick={() => setZoomTarget(null)}
              className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] text-[#0B0E14] text-xs font-bold"
            >
              Cerrar Vista HD
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

// ============================================================================
// 2. COMPARADOR DE OFICIOS (GASFITERÍA / TÉCNICOS VERIFICADOS)
// ============================================================================

interface TechnicianItem {
  id: string;
  nombre: string;
  oficio: 'Gasfitería' | 'Electricidad' | 'Cerrajería';
  rating: number;
  trabajos: number;
  etaMin: number;
  tarifaCentavos: number;
  masCercano?: boolean;
  enLinea: boolean;
  especialidad: string;
}

const TECHNICIANS: TechnicianItem[] = [
  {
    id: 'tec-1',
    nombre: 'Juan Carlos Quispe',
    oficio: 'Gasfitería',
    rating: 4.9,
    trabajos: 84,
    etaMin: 15,
    tarifaCentavos: 2500,
    masCercano: true,
    enLinea: true,
    especialidad: 'Fugas de tubería PVC/cobre, grifería, termas solares y desatoro.',
  },
  {
    id: 'tec-2',
    nombre: 'Mario Huamán T.',
    oficio: 'Gasfitería',
    rating: 5.0,
    trabajos: 142,
    etaMin: 24,
    tarifaCentavos: 3000,
    enLinea: true,
    especialidad: 'Instalación sanitaria completa, bombas hidroneumáticas y filtraciones.',
  },
  {
    id: 'tec-3',
    nombre: 'Rosaura Condori C.',
    oficio: 'Electricidad',
    rating: 4.9,
    trabajos: 96,
    etaMin: 18,
    tarifaCentavos: 2800,
    masCercano: true,
    enLinea: true,
    especialidad: 'Cortocircuitos, llaves térmicas, duchas eléctricas y tableros.',
  },
  {
    id: 'tec-4',
    nombre: 'Elmer Ccahuana V.',
    oficio: 'Cerrajería',
    rating: 4.8,
    trabajos: 67,
    etaMin: 14,
    tarifaCentavos: 3500,
    masCercano: true,
    enLinea: true,
    especialidad: 'Apertura de puertas blindadas, chapas digitales y copias en sitio.',
  },
];

export const OficiosModule: React.FC<MarketplaceModuleProps> = ({
  customerDoc,
  onCustomerDocVerified,
}) => {
  const [oficio, setOficio] = useState<TechnicianItem['oficio']>('Gasfitería');
  const [solicitud, setSolicitud] = useState('Fuga en tubería de lavadero / baño');
  const [modo, setModo] = useState<'INMEDIATO' | 'PROGRAMAR'>('INMEDIATO');
  const [fechaProg, setFechaProg] = useState('Hoy · 16:00 hrs');
  const [selectedTech, setSelectedTech] = useState<TechnicianItem | null>(null);
  const [visitBooking, setVisitBooking] = useState<{
    codigo: string;
    pin: string;
    tech: TechnicianItem;
    horario: string;
  } | null>(null);
  const [localDoc, setLocalDoc] = useState<SharedCustomerDoc | null>(customerDoc ?? null);
  const [nombre, setNombre] = useState(customerDoc?.nombre || '');
  const [telefono, setTelefono] = useState('');
  const [docError, setDocError] = useState<string | null>(null);

  useEffect(() => {
    if (customerDoc?.verificado) {
      setLocalDoc(customerDoc);
      if (customerDoc.nombre) setNombre(customerDoc.nombre);
      setDocError(null);
    }
  }, [customerDoc?.verificado, customerDoc?.numero, customerDoc?.nombre]);

  const activeDoc = customerDoc?.verificado ? customerDoc : localDoc;
  const isDocValid = Boolean(activeDoc?.verificado);

  function handleDocVerified(doc: SharedCustomerDoc) {
    setLocalDoc(doc);
    if (doc.nombre) setNombre(doc.nombre);
    setDocError(null);
    onCustomerDocVerified?.(doc);
  }

  const visibleTechs = TECHNICIANS.filter((t) => t.oficio === oficio);

  function handleConfirmVisit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTech) return;
    if (!isDocValid) {
      setDocError('Es obligatorio validar el DNI o RUC del titular para solicitar la visita.');
      return;
    }
    setDocError(null);
    setVisitBooking({
      codigo: `OFI-${Math.floor(1000 + Math.random() * 9000)}`,
      pin: String(Math.floor(1000 + Math.random() * 9000)),
      tech: selectedTech,
      horario: modo === 'INMEDIATO' ? `Llegada inmediata (~${selectedTech.etaMin} min)` : fechaProg,
    });
    setSelectedTech(null);
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-[#0D1117] text-slate-100 p-6 space-y-5 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400 font-bold">
              Chuspa Oficios · Técnicos con Antecedentes Verificados
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white">
              Comparador de Oficios en Vivo
            </h2>
          </div>

          <div className="inline-flex rounded-2xl bg-[#07090E] border border-white/10 p-1">
            <button
              type="button"
              onClick={() => setModo('INMEDIATO')}
              className={`min-h-[40px] px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                modo === 'INMEDIATO'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>En Línea (Inmediato)</span>
            </button>
            <button
              type="button"
              onClick={() => setModo('PROGRAMAR')}
              className={`min-h-[40px] px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                modo === 'PROGRAMAR'
                  ? 'bg-[#D4AF37] text-[#0B0E14]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span>Programar Visita</span>
            </button>
          </div>
        </div>

        {/* Resumen detectado por voz o editable */}
        <div className="rounded-2xl border border-amber-500/30 bg-[#07090E] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                Problema detectado
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                {oficio}
              </span>
            </div>
            <input
              type="text"
              value={solicitud}
              onChange={(e) => setSolicitud(e.target.value)}
              className="w-full bg-transparent text-sm font-semibold text-white focus:outline-none border-b border-transparent focus:border-amber-400 pb-0.5"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(['Gasfitería', 'Electricidad', 'Cerrajería'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setOficio(cat)}
                className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold border transition-colors ${
                  oficio === cat
                    ? 'bg-amber-400 text-slate-950 border-amber-400'
                    : 'border-white/15 text-slate-300 hover:border-amber-400/50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {modo === 'PROGRAMAR' && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-slate-400">Horario preferido:</span>
            {['Hoy · 16:00 hrs', 'Mañana · 09:00 AM', 'Mañana · 15:00 hrs'].map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setFechaProg(slot)}
                className={`px-3 py-1.5 rounded-lg border font-mono-tabular ${
                  fechaProg === slot
                    ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-amber-300'
                    : 'border-white/10 text-slate-400'
                }`}
              >
                {slot}
              </button>
            ))}
          </div>
        )}
      </div>

      {visitBooking && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider">
              ✓ Visita Técnica Confirmada ({visitBooking.codigo})
            </p>
            <p className="text-sm font-semibold text-[#14171F] dark:text-white">
              {visitBooking.tech.nombre} · {visitBooking.horario}
            </p>
            <p className="text-xs text-[#6A717E] dark:text-slate-300">
              Inspección: {solicitud} · Pago protegido al aprobar la reparación
            </p>
          </div>
          <div className="rounded-xl bg-[#07090E] border border-emerald-500/30 px-4 py-2.5 text-center">
            <span className="text-[10px] text-slate-400 block">PIN de Llegada</span>
            <span className="font-mono-tabular text-2xl font-bold tracking-[0.25em] text-amber-400">
              {visitBooking.pin}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleTechs.map((tech) => (
          <article
            key={tech.id}
            className={`rounded-2xl border bg-white dark:bg-[#0D1117] p-6 flex flex-col justify-between gap-4 ${
              tech.masCercano
                ? 'border-emerald-500/50 shadow-lg'
                : 'border-black/10 dark:border-white/10'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    {tech.oficio === 'Gasfitería' ? (
                      <Wrench className="w-5 h-5" />
                    ) : tech.oficio === 'Electricidad' ? (
                      <Zap className="w-5 h-5" />
                    ) : (
                      <Hammer className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-xl font-semibold text-[#14171F] dark:text-white">
                        {tech.nombre}
                      </h3>
                      <BadgeCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    </div>
                    <p className="text-xs text-[#6A717E] dark:text-slate-400">
                      ★ {tech.rating.toFixed(1)} • {tech.trabajos} trabajos ·{' '}
                      {modo === 'INMEDIATO' ? `Llega en ~${tech.etaMin} min` : fechaProg}
                    </p>
                  </div>
                </div>
                {tech.masCercano && (
                  <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-500 dark:text-emerald-300 border border-emerald-500/30 shrink-0">
                    Más Cercano
                  </span>
                )}
              </div>

              <p className="text-xs text-[#555B66] dark:text-slate-300 leading-relaxed">
                {tech.especialidad}
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 pt-3 border-t border-black/10 dark:border-white/10">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#6A717E] dark:text-slate-400 block">
                  Tarifa de diagnóstico / visita
                </span>
                <span className="font-mono-tabular text-xl font-bold text-[#14171F] dark:text-amber-400">
                  {fmtSoles(tech.tarifaCentavos)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTech(tech)}
                className="min-h-[44px] px-5 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-bold whitespace-nowrap hover:opacity-90"
              >
                Solicitar Visita
              </button>
            </div>
          </article>
        ))}
      </div>

      {selectedTech && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Solicitar técnico"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-3xl bg-[#0D1117] border border-amber-500/35 p-6 space-y-4 text-slate-100">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">
                  Pago Protegido con PIN
                </p>
                <h3 className="font-display text-2xl font-semibold text-white">
                  {selectedTech.nombre}
                </h3>
                <p className="text-xs text-slate-400">
                  Visita técnica: {fmtSoles(selectedTech.tarifaCentavos)} · {solicitud}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTech(null)}
                aria-label="Cerrar"
                className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmVisit} className="space-y-3">
              <MandatoryDocGate
                customerDoc={activeDoc}
                onVerified={handleDocVerified}
                contextLabel="Visita Técnica"
              />
              {docError && <p className="text-[11px] text-rose-400">{docError}</p>}
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-white/15 bg-[#07090E] text-sm"
              />
              <input
                type="tel"
                required
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="WhatsApp y dirección exacta en Cusco"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-white/15 bg-[#07090E] text-sm"
              />
              <button
                type="submit"
                disabled={!isDocValid}
                className="w-full min-h-[48px] rounded-xl bg-[#D4AF37] text-[#0B0E14] text-xs font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isDocValid
                  ? 'Confirmar Solicitud con PIN'
                  : 'Valida DNI/RUC del titular para solicitar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

// ============================================================================
// 3. CHUSPA CAMPO DIRECTO (LOTES B2B / PREVENTA MAYORISTA)
// ============================================================================

interface CampoLot {
  id: string;
  categoria: 'Papas al por mayor' | 'Hortalizas / Verduras' | 'Quesos Andinos' | 'Cuyes Eviscerados';
  nombre: string;
  productor: string;
  origen: string;
  calibre: string;
  disponible: number;
  unidad: string;
  precioCentavos: number;
  ahorroPct: number;
  emoji: string;
}

const CAMPO_LOTS: CampoLot[] = [
  {
    id: 'lot-papa',
    categoria: 'Papas al por mayor',
    nombre: 'Papa Canchán Seleccionada (Primera)',
    productor: 'Asoc. Productores de Paucartambo',
    origen: 'Paucartambo · 3,450 msnm',
    calibre: 'Primera (70-90g)',
    disponible: 42,
    unidad: 'Saco 50 kg',
    precioCentavos: 9500,
    ahorroPct: 22,
    emoji: '🥔',
  },
  {
    id: 'lot-cebolla',
    categoria: 'Hortalizas / Verduras',
    nombre: 'Cebolla Roja Cusqueña de Chakra',
    productor: 'Cooperativa Valle de Urubamba',
    origen: 'Calca · Valle Sagrado',
    calibre: 'Extra Pareja',
    disponible: 28,
    unidad: 'Malla 45 kg',
    precioCentavos: 7800,
    ahorroPct: 18,
    emoji: '🧅',
  },
  {
    id: 'lot-queso',
    categoria: 'Quesos Andinos',
    nombre: 'Queso Paria & Andino Madurado',
    productor: 'Estancia Láctea Chinchero',
    origen: 'Chinchero · Cusco',
    calibre: 'Moldes 1 kg (Caja x10)',
    disponible: 15,
    unidad: 'Caja 10 kg',
    precioCentavos: 24000,
    ahorroPct: 20,
    emoji: '🧀',
  },
  {
    id: 'lot-cuy',
    categoria: 'Cuyes Eviscerados',
    nombre: 'Cuyes Eviscerados Empacados al Vacío',
    productor: 'Granja Tecnificada Tipón',
    origen: 'Oropesa / Tipón',
    calibre: '850g - 950g c/u (x12)',
    disponible: 19,
    unidad: 'Jaba Refrigerada x12',
    precioCentavos: 31200,
    ahorroPct: 16,
    emoji: '🌿',
  },
];

export const CampoDirectoModule: React.FC<MarketplaceModuleProps> = ({
  customerDoc,
  onCustomerDocVerified,
}) => {
  const [categoria, setCategoria] = useState<'Todas' | CampoLot['categoria']>('Todas');
  const [quantities, setQuantities] = useState<Record<string, number>>({
    'lot-papa': 2,
    'lot-cebolla': 1,
    'lot-queso': 1,
    'lot-cuy': 1,
  });
  const [activeLot, setActiveLot] = useState<CampoLot>(CAMPO_LOTS[0]);
  const [localDoc, setLocalDoc] = useState<SharedCustomerDoc | null>(customerDoc ?? null);
  const [docError, setDocError] = useState<string | null>(null);
  const [escrowReceipt, setEscrowReceipt] = useState<{
    codigo: string;
    pin: string;
    lot: CampoLot;
    qty: number;
    totalCentavos: number;
  } | null>(null);

  useEffect(() => {
    if (customerDoc?.verificado) {
      setLocalDoc(customerDoc);
      setDocError(null);
    }
  }, [customerDoc?.verificado, customerDoc?.numero]);

  const activeDoc = customerDoc?.verificado ? customerDoc : localDoc;
  const isDocValid = Boolean(activeDoc?.verificado);

  function handleDocVerified(doc: SharedCustomerDoc) {
    setLocalDoc(doc);
    setDocError(null);
    onCustomerDocVerified?.(doc);
  }

  const visibleLots = CAMPO_LOTS.filter((l) => categoria === 'Todas' || l.categoria === categoria);

  function changeQty(id: string, max: number, delta: number) {
    setQuantities((prev) => ({
      ...prev,
      [id]: Math.min(max, Math.max(1, (prev[id] || 1) + delta)),
    }));
  }

  function confirmPreventa(lot: CampoLot) {
    if (!isDocValid) {
      setDocError('Es obligatorio validar el DNI o RUC del titular para confirmar una preventa.');
      return;
    }
    setDocError(null);
    const qty = quantities[lot.id] || 1;
    setEscrowReceipt({
      codigo: `AGR-${Math.floor(1000 + Math.random() * 9000)}`,
      pin: String(Math.floor(1000 + Math.random() * 9000)),
      lot,
      qty,
      totalCentavos: lot.precioCentavos * qty,
    });
  }

  return (
    <section className="space-y-6">
      {/* Banner Camión Comunal */}
      <div className="rounded-3xl border border-emerald-500/35 bg-[#0D1117] text-slate-100 p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-400 shrink-0">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-emerald-400">
                Chuspa Campo Directo · Preventa B2B Sin Intermediarios
              </span>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white">
                Lotes del Campo Directo a tu Negocio
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                🚛 Camión Comunal: <span className="text-amber-300 font-semibold">Salida Sábado 5:00 AM</span> · Acopio Paucartambo / Valle Sagrado → Descarga en Cusco
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-[#07090E] px-4 py-2.5 text-xs">
            <span className="text-slate-400 block text-[10px]">Garantía Escrow La Chuspa</span>
            <span className="text-amber-300 font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> Liberación solo contra pesado y PIN
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {(
            [
              'Todas',
              'Papas al por mayor',
              'Hortalizas / Verduras',
              'Quesos Andinos',
              'Cuyes Eviscerados',
            ] as const
          ).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoria(cat)}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold border transition-colors ${
                categoria === cat
                  ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                  : 'border-white/15 text-slate-300 hover:border-emerald-400/50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <MandatoryDocGate
          customerDoc={activeDoc}
          onVerified={handleDocVerified}
          contextLabel="Preventa B2B"
        />
        {docError && <p className="text-xs text-rose-400">{docError}</p>}
      </div>

      {escrowReceipt && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider">
              ✓ Preventa B2B Bloqueada en Escrow ({escrowReceipt.codigo})
            </p>
            <p className="text-sm font-semibold text-[#14171F] dark:text-white">
              {escrowReceipt.qty} × {escrowReceipt.lot.nombre} ({escrowReceipt.lot.productor})
            </p>
            <p className="text-xs text-[#6A717E] dark:text-slate-300">
              Total apartado: <span className="font-mono-tabular font-bold">{fmtSoles(escrowReceipt.totalCentavos)}</span> · Entrega Camión Comunal Sábado
            </p>
          </div>
          <div className="rounded-xl bg-[#07090E] border border-emerald-500/30 px-4 py-2.5 text-center">
            <span className="text-[10px] text-slate-400 block">PIN de Pesaje</span>
            <span className="font-mono-tabular text-2xl font-bold tracking-[0.25em] text-amber-400">
              {escrowReceipt.pin}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {visibleLots.map((lot) => {
          const qty = quantities[lot.id] || 1;
          const total = lot.precioCentavos * qty;
          const isSelected = activeLot.id === lot.id;
          return (
            <article
              key={lot.id}
              onClick={() => setActiveLot(lot)}
              className={`rounded-3xl border bg-[#0D1117] text-slate-100 p-5 sm:p-6 space-y-4 transition-colors cursor-pointer ${
                isSelected ? 'border-emerald-500/60' : 'border-white/10'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-2xl">
                    {lot.emoji}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      {lot.productor}
                    </span>
                    <h3 className="font-display text-xl font-semibold text-white leading-snug">
                      {lot.nombre}
                    </h3>
                    <p className="text-[11px] text-slate-400">{lot.origen}</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                  -{lot.ahorroPct}% vs Mercado
                </span>
              </div>

              {/* 3 columnas: Calibre, Disponible, Precio x Saco */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-[#07090E] border border-white/10 p-3">
                  <span className="text-[10px] text-slate-400 block">Calibre / Peso</span>
                  <span className="text-xs font-semibold text-white">{lot.calibre}</span>
                </div>
                <div className="rounded-xl bg-[#07090E] border border-white/10 p-3">
                  <span className="text-[10px] text-slate-400 block">Disponible</span>
                  <span className="font-mono-tabular text-xs font-bold text-emerald-400">
                    {lot.disponible} lotes
                  </span>
                </div>
                <div className="rounded-xl bg-[#07090E] border border-white/10 p-3">
                  <span className="text-[10px] text-slate-400 block">Precio x {lot.unidad.split(' ')[0]}</span>
                  <span className="font-mono-tabular text-xs font-bold text-amber-400">
                    {fmtSoles(lot.precioCentavos)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      changeQty(lot.id, lot.disponible, -1);
                    }}
                    className="w-9 h-9 rounded-xl bg-[#07090E] border border-white/15 flex items-center justify-center hover:border-amber-400"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-10 text-center font-mono-tabular text-sm font-bold">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      changeQty(lot.id, lot.disponible, 1);
                    }}
                    className="w-9 h-9 rounded-xl bg-[#07090E] border border-white/15 flex items-center justify-center hover:border-amber-400"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  disabled={!isDocValid}
                  onClick={(e) => {
                    e.stopPropagation();
                    confirmPreventa(lot);
                  }}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  {isDocValid
                    ? `Confirmar Preventa · ${fmtSoles(total)}`
                    : 'Valida DNI/RUC para reservar'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

// Suppress unused icon warning if any icon only referenced dynamically
void Package;
void Star;
void Store;
void AlertTriangle;
void Sparkles;
