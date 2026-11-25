import React, { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  Bell,
  CarFront,
  Check,
  Crosshair,
  FileCheck2,
  Gauge,
  KeyRound,
  ListChecks,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  Power,
  Printer,
  RefreshCw,
  Send,
  Settings,
  Star,
  Trash2,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch, ApiError, playLuxuryChime, speakSpanish } from '../lib/api.ts';
import { haversineKm } from '../lib/cuscoMarkets.ts';
import { subscribeFirebaseRtdbPath } from '../lib/firebaseRtdb.ts';
import { emitCenterNotification } from '../lib/notifications.ts';
import {
  formatPeruLookupError,
  type PeruDocumentLookupResult,
} from '../lib/peruDocs.ts';
import {
  BUSINESS_CATEGORIES,
  ESTADO_LABELS,
  formatSoles,
  RUBRO_LABELS,
  SALE_MODALITIES,
  type AiBusinessPanelSchema,
  type ComprobanteElectronico,
  type DirectorioNegocio,
  type MetodoPago,
  type MetodoRecarga,
  type PedidoNegocio,
  type Rubro,
} from '../types.ts';
import { AiBusinessBuilder, AiDynamicToolsBar } from './AiBusinessBuilder.tsx';
import { BusinessConfigTab } from './BusinessConfigTab.tsx';
import { CuscoGeoMap, type GeoMapPin } from './CuscoGeoMap.tsx';
import {
  ColectivoSeatControl,
  EmergencyDispatchCenter,
  PinKeypadCard,
} from './DispatchAndRouteModules.tsx';
import { ElectronicInvoiceModal } from './ElectronicInvoiceModal.tsx';

type BizTab = 'NUEVOS' | 'EN_CURSO' | 'HISTORIAL' | 'REFERIDOS' | 'RUTAS_SOS' | 'CONFIGURACION' | 'GESTION';

interface NegocioSession {
  token: string;
  negocioId: number;
  nombre: string;
  codigo: string;
  rubro: Rubro;
}

interface ResumenData {
  negocio: {
    id: number;
    codigo: string;
    rubro: Rubro;
    nombre: string;
    telefono?: string;
    descripcion?: string;
    zona: string;
    lat?: number;
    lng?: number;
    en_linea: boolean;
    horario_apertura?: string;
    horario_cierre?: string;
    abierto_24h?: boolean | number;
    metodos_pago_aceptados?: string;
    auto_aceptar_pedidos?: boolean | number;
    alerta_voz_activa?: boolean | number;
    tarifa_minima_centavos?: number;
    radio_cobertura_km?: number;
    tipo_persona?: 'NATURAL' | 'JURIDICA';
    documento_tipo?: 'DNI' | 'RUC';
    documento_numero?: string;
    razon_social?: string;
    tipo_negocio?: string;
    modalidades_venta?: string[];
    panel_ia?: AiBusinessPanelSchema | null;
    saldo: number;
    saldo_retenido: number;
    saldo_libre: number;
  };
  regla_comision: {
    porcentaje_plataforma: number;
    porcentaje_referido: number;
  };
  movimientos: Array<{
    id: number;
    tipo: string;
    monto_centavos: number;
    retenido_delta_centavos: number;
    saldo_posterior_centavos: number;
    referencia: string;
    motivo: string | null;
    created_at: string;
  }>;
  recargas: Array<{
    id: number;
    monto_centavos: number;
    metodo: string;
    codigo_operacion: string;
    estado: string;
    motivo_rechazo: string | null;
    created_at: string;
  }>;
  servicios: Array<{
    id: number;
    nombre: string;
    descripcion?: string;
    precio_centavos: number;
    unidad_medida?: string;
    atributos?: Record<string, string> | null;
    stock: number;
    disponible: number;
  }>;
  unidades: Array<{
    id: number;
    conductor_nombre: string;
    placa: string;
    modelo: string;
    color?: string;
    lat?: number;
    lng?: number;
    calificacion?: number;
    tarifa_base_centavos?: number;
    tarifa_km_centavos?: number;
    estado: string;
    certificada: number;
  }>;
  tasas: Array<{
    id: number;
    moneda_origen: string;
    moneda_destino: string;
    tasa_compra: number;
    tasa_venta: number;
  }>;
  facturacion_apisperu_activa?: boolean;
}

const RUBRO_PANEL_THEME: Record<
  Rubro,
  {
    badge: string;
    cardBg: string;
    tileBg: string;
    accentText: string;
    activeTab: string;
    primaryBtn: string;
  }
> = {
  TRANSPORTE: {
    badge: 'Panel Taxista · Cockpit Lima & Asfalto',
    cardBg:
      'border-[#84CC16]/45 bg-gradient-to-br from-[#F7FEE7] via-white to-[#ECFDF5] dark:from-[#0A140D] dark:via-[#0B0F12] dark:to-[#0A1812]',
    tileBg: 'border-[#84CC16]/25 bg-white/80 dark:bg-[#070B09]/90',
    accentText: 'text-[#4D7C0F] dark:text-[#B6F02B]',
    activeTab:
      'bg-[#B6F02B] text-[#0B0E14] border-[#84CC16] shadow-md chuspa-google-btn',
    primaryBtn:
      'bg-[#B6F02B] text-[#0B0E14] hover:bg-[#a6e01f] chuspa-google-btn',
  },
  FARMACIA: {
    badge: 'Panel Botica 24h · Esmeralda Clínica',
    cardBg:
      'border-emerald-500/45 bg-gradient-to-br from-[#ECFDF5] via-white to-[#ECFEFF] dark:from-[#051B16] dark:via-[#081214] dark:to-[#061C24]',
    tileBg: 'border-emerald-500/25 bg-white/85 dark:bg-[#061210]/90',
    accentText: 'text-emerald-700 dark:text-emerald-300',
    activeTab:
      'bg-emerald-500 text-[#051612] border-emerald-400 shadow-md chuspa-google-btn',
    primaryBtn:
      'bg-gradient-to-r from-emerald-500 to-teal-500 text-white chuspa-google-btn',
  },
  RESTAURANTE: {
    badge: 'Panel Gastronomía · Cobre & Carmesí',
    cardBg:
      'border-orange-500/40 bg-gradient-to-br from-[#FFF7ED] via-white to-[#FFF1F2] dark:from-[#1B0D07] dark:via-[#110B0D] dark:to-[#1C0B13]',
    tileBg: 'border-orange-500/25 bg-white/85 dark:bg-[#140A08]/90',
    accentText: 'text-orange-700 dark:text-orange-300',
    activeTab:
      'bg-gradient-to-r from-orange-500 to-rose-500 text-white border-orange-400 shadow-md chuspa-google-btn',
    primaryBtn:
      'bg-gradient-to-r from-orange-500 to-rose-500 text-white chuspa-google-btn',
  },
  TURISMO: {
    badge: 'Panel Turismo VIP · Índigo Cusco',
    cardBg:
      'border-indigo-500/40 bg-gradient-to-br from-[#EEF2FF] via-white to-[#F0F9FF] dark:from-[#0B1026] dark:via-[#0B0E16] dark:to-[#0B192C]',
    tileBg: 'border-indigo-500/25 bg-white/85 dark:bg-[#090D1F]/90',
    accentText: 'text-indigo-700 dark:text-sky-300',
    activeTab:
      'bg-gradient-to-r from-indigo-500 to-sky-500 text-white border-indigo-400 shadow-md chuspa-google-btn',
    primaryBtn:
      'bg-gradient-to-r from-indigo-500 to-sky-500 text-white chuspa-google-btn',
  },
  HOTEL: {
    badge: 'Panel Hotelería · Amatista Real',
    cardBg:
      'border-purple-500/40 bg-gradient-to-br from-[#FAF5FF] via-white to-[#EEF2FF] dark:from-[#160C26] dark:via-[#0E0B16] dark:to-[#1B0E2E]',
    tileBg: 'border-purple-500/25 bg-white/85 dark:bg-[#11091F]/90',
    accentText: 'text-purple-700 dark:text-purple-300',
    activeTab:
      'bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white border-purple-400 shadow-md chuspa-google-btn',
    primaryBtn:
      'bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white chuspa-google-btn',
  },
  CASA_CAMBIO: {
    badge: 'Panel Mesa de Cambio · Zafiro Perla',
    cardBg:
      'border-cyan-500/40 bg-gradient-to-br from-[#F0F9FF] via-white to-[#F0FDFA] dark:from-[#07161F] dark:via-[#091118] dark:to-[#061D1C]',
    tileBg: 'border-cyan-500/25 bg-white/85 dark:bg-[#071219]/90',
    accentText: 'text-cyan-700 dark:text-cyan-300',
    activeTab:
      'bg-gradient-to-r from-cyan-500 to-emerald-500 text-[#051318] border-cyan-400 shadow-md chuspa-google-btn',
    primaryBtn:
      'bg-gradient-to-r from-cyan-500 to-emerald-500 text-[#051318] chuspa-google-btn',
  },
};

const DEMO_ACCESS_GUIDE: Array<{ codigo: string; rubro: string; pin: string; nota: string }> = [
  { codigo: 'NEG-TX-01', rubro: 'Transporte VIP', pin: '2468', nota: 'Con saldo y unidades' },
  { codigo: 'NEG-TX-02', rubro: 'Transporte', pin: '1357', nota: 'Saldo S/ 0.00 (prueba 402)' },
  { codigo: 'NEG-TU-01', rubro: 'Turismo', pin: '3691', nota: 'Guías Machu Picchu' },
  { codigo: 'NEG-RE-01', rubro: 'Restaurante', pin: '5792', nota: 'Alta cocina cusqueña' },
  { codigo: 'NEG-FA-01', rubro: 'Farmacia', pin: '7531', nota: 'Botica 24h Soroche' },
  { codigo: 'NEG-CC-01', rubro: 'Casa de Cambio', pin: '7419', nota: 'Tasas USD / EUR' },
];

export const BusinessPanel: React.FC = () => {
  const [directorio, setDirectorio] = useState<DirectorioNegocio[]>([]);
  const [session, setSession] = useState<NegocioSession | null>(null);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [loginCodigo, setLoginCodigo] = useState('NEG-TX-01');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showDemoGuide, setShowDemoGuide] = useState(false);

  // Registro de nuevo negocio multirubro con RUC/DNI + Categoría + Modalidades
  const [regRubro, setRegRubro] = useState<Rubro>('RESTAURANTE');
  const [regTipoPersona, setRegTipoPersona] = useState<'NATURAL' | 'JURIDICA'>('JURIDICA');
  const [regDocNumero, setRegDocNumero] = useState('');
  const [regRazonSocial, setRegRazonSocial] = useState('');
  const [regDocVerificado, setRegDocVerificado] = useState<PeruDocumentLookupResult | null>(null);
  const [regDocLoading, setRegDocLoading] = useState(false);
  const [regTipoNegocio, setRegTipoNegocio] = useState<string>(BUSINESS_CATEGORIES[0]);
  const [regModalidades, setRegModalidades] = useState<string[]>(['Unidad', 'Kilo']);
  const [regNombre, setRegNombre] = useState('');
  const [regTelefono, setRegTelefono] = useState('');
  const [regZona, setRegZona] = useState('Centro Histórico, Cusco');
  const [regLat, setRegLat] = useState<number>(-13.5167);
  const [regLng, setRegLng] = useState<number>(-71.9788);
  const [regGpsStatus, setRegGpsStatus] = useState<'idle' | 'loading' | 'live' | 'denied'>('idle');
  const [regPin, setRegPin] = useState('');
  const [regPanelIa, setRegPanelIa] = useState<AiBusinessPanelSchema | null>(null);

  const [tab, setTab] = useState<BizTab>('NUEVOS');
  const [resumen, setResumen] = useState<ResumenData | null>(null);
  const [pedidos, setPedidos] = useState<PedidoNegocio[]>([]);
  const [pinInputs, setPinInputs] = useState<Record<number, string>>({});
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [invoiceModal, setInvoiceModal] = useState<{
    order?: PedidoNegocio;
    comprobante?: ComprobanteElectronico;
  } | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const seenPendingIdsRef = useRef<Set<number>>(new Set());
  const seededOrdersRef = useRef(false);

  // Recarga modal
  const [recargaOpen, setRecargaOpen] = useState(false);
  const [recargaSoles, setRecargaSoles] = useState('100');
  const [recargaMetodo, setRecargaMetodo] = useState<MetodoRecarga>('Yape');
  const [recargaOpCode, setRecargaOpCode] = useState('');

  // Reservar referido
  const [guias, setGuias] = useState<
    Array<{
      servicio_id: number;
      negocio_id: number;
      nombre: string;
      negocio_nombre: string;
      precio_centavos: number;
    }>
  >([]);
  const [refGuiaKey, setRefGuiaKey] = useState('');
  const [refClienteNombre, setRefClienteNombre] = useState('');
  const [refClienteTelefono, setRefClienteTelefono] = useState('');
  const [refFechaHora, setRefFechaHora] = useState('Mañana · 07:30 AM');
  const [refMetodoPago, setRefMetodoPago] = useState<MetodoPago>('Efectivo');

  // Nuevo servicio catálogo
  const [newServNombre, setNewServNombre] = useState('');
  const [newServPrecioSoles, setNewServPrecioSoles] = useState('');
  const [newServDesc, setNewServDesc] = useState('');
  const [newServUnidadMedida, setNewServUnidadMedida] = useState('Unidad');
  const [newServCustomUnidad, setNewServCustomUnidad] = useState('');
  const [newServAtributos, setNewServAtributos] = useState<Record<string, string>>({});

  // Modo Conductor (TRANSPORTE) & SUNAT (Otros rubros)
  const [driverSubTab, setDriverSubTab] = useState<'SOLICITUDES' | 'DESEMPENO'>('SOLICITUDES');
  const [activeUnitId, setActiveUnitId] = useState<number | null>(null);
  const [selectedRideOrder, setSelectedRideOrder] = useState<PedidoNegocio | null>(null);
  const [selectedBizOrder, setSelectedBizOrder] = useState<PedidoNegocio | null>(null);
  const [customCounterOpen, setCustomCounterOpen] = useState(false);
  const [customCounterSoles, setCustomCounterSoles] = useState('');
  const [driverGpsSending, setDriverGpsSending] = useState(false);
  const [sunatSendingId, setSunatSendingId] = useState<number | null>(null);

  async function refreshDirectorio() {
    try {
      const res = await apiFetch<{ negocios?: DirectorioNegocio[] }>('/api/public/directorio');
      if (Array.isArray(res?.negocios)) {
        setDirectorio(res.negocios);
      }
    } catch {
      // keep existing directorio list
    }
  }

  useEffect(() => {
    void refreshDirectorio();
  }, []);

  useEffect(() => {
    if (!session) {
      seededOrdersRef.current = false;
      seenPendingIdsRef.current.clear();
      return;
    }
    void loadWorkspace(true);
    const id = setInterval(() => void loadWorkspace(true), 2500);
    const unsubPedidos = subscribeFirebaseRtdbPath('pedidos', () => {
      void loadWorkspace(true);
    });
    const unsubNegocios = subscribeFirebaseRtdbPath('negocios', () => {
      void loadWorkspace(true);
    });
    return () => {
      clearInterval(id);
      unsubPedidos();
      unsubNegocios();
    };
  }, [session?.negocioId, session?.token]);

  async function loadWorkspace(silent = false) {
    if (!session) return;
    const t0 = performance.now();
    try {
      const [resRes, pedRes, guiasRes] = await Promise.all([
        apiFetch<ResumenData>(`/api/negocio/${session.negocioId}/resumen`, {
          token: session.token,
        }),
        apiFetch<{ pedidos?: PedidoNegocio[] }>(`/api/negocio/${session.negocioId}/pedidos`, {
          token: session.token,
        }),
        apiFetch<{ guias?: any[] }>(`/api/negocio/${session.negocioId}/guias-disponibles`, {
          token: session.token,
        }),
      ]);
      if (resRes?.negocio) {
        const nextUnidades = Array.isArray(resRes.unidades) ? resRes.unidades : [];
        setResumen({
          ...resRes,
          movimientos: Array.isArray(resRes.movimientos) ? resRes.movimientos : [],
          recargas: Array.isArray(resRes.recargas) ? resRes.recargas : [],
          servicios: Array.isArray(resRes.servicios) ? resRes.servicios : [],
          unidades: nextUnidades,
          tasas: Array.isArray(resRes.tasas) ? resRes.tasas : [],
        });
        if (nextUnidades.length > 0) {
          setActiveUnitId((prev) =>
            prev && nextUnidades.some((u) => u.id === prev) ? prev : nextUnidades[0].id
          );
        }
      }
      const nextPedidos = Array.isArray(pedRes?.pedidos) ? pedRes.pedidos : [];
      const nextGuias = Array.isArray(guiasRes?.guias) ? guiasRes.guias : [];
      setPedidos(nextPedidos);
      setSelectedRideOrder((prev) =>
        prev ? nextPedidos.find((p) => p.id === prev.id && p.estado === 'PENDIENTE_CONFIRMACION') || null : null
      );
      setSelectedBizOrder((prev) =>
        prev ? nextPedidos.find((p) => p.id === prev.id && p.estado === 'PENDIENTE_CONFIRMACION') || null : null
      );
      setGuias(nextGuias);
      if (nextGuias.length > 0 && !refGuiaKey) {
        const g = nextGuias[0];
        setRefGuiaKey(`${g.negocio_id}:${g.servicio_id}`);
      }

      const pendingItems = nextPedidos.filter(
        (p) => p.estado === 'PENDIENTE_CONFIRMACION' && p.negocio_id === session.negocioId
      );
      if (!seededOrdersRef.current) {
        seededOrdersRef.current = true;
        seenPendingIdsRef.current = new Set(pendingItems.map((p) => p.id));
      } else {
        const ms = Math.max(1, Math.round(performance.now() - t0));
        for (const newest of pendingItems) {
          if (!seenPendingIdsRef.current.has(newest.id)) {
            if (soundEnabled) playLuxuryChime();
            const docLabel =
              newest.cliente_documento_numero && newest.cliente_documento_tipo
                ? ` · ${newest.cliente_documento_tipo} ${newest.cliente_documento_numero}`
                : '';
            emitCenterNotification({
              id: `biz-ord-${newest.id}-${newest.estado}`,
              title: `Nuevo Pedido · ${newest.codigo}`,
              subtitle: `${newest.item_nombre} · ${formatSoles(newest.monto_centavos)}`,
              detail: `Cliente: ${newest.cliente_nombre}${docLabel}`,
              tone: 'ai',
              responseMs: ms,
              speakText:
                soundEnabled && resRes?.negocio?.alerta_voz_activa !== false
                  ? `Nuevo pedido para ${resRes.negocio.nombre}: ${newest.item_nombre}, por ${(
                      newest.monto_centavos / 100
                    ).toFixed(2)} soles.`
                  : undefined,
            });
          }
        }
        seenPendingIdsRef.current = new Set(pendingItems.map((p) => p.id));
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSession(null);
        setLoginError('Tu sesión expiró por seguridad (15 min). Ingresa nuevamente.');
      } else if (!silent) {
        setActionMsg({
          type: 'err',
          text: err instanceof Error ? err.message : 'Error cargando datos',
        });
      }
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await apiFetch<{
        token: string;
        negocio: {
          id: number;
          codigo: string;
          rubro: Rubro;
          nombre: string;
        };
      }>('/api/negocio/login', {
        method: 'POST',
        body: { codigo: loginCodigo, pin: loginPin },
      });
      setSession({
        token: res.token,
        negocioId: res.negocio.id,
        nombre: res.negocio.nombre,
        codigo: res.negocio.codigo,
        rubro: res.negocio.rubro,
      });
      setLoginPin('');
      setActionMsg(null);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    }
  }

  async function handleLookupRegDoc() {
    const docTipo = regTipoPersona === 'NATURAL' ? 'DNI' : 'RUC';
    const clean = regDocNumero.replace(/\D/g, '');
    setLoginError(null);
    if (!clean) {
      setLoginError(`Ingresa el ${docTipo} para validar con RENIEC/SUNAT.`);
      return;
    }
    setRegDocLoading(true);
    try {
      const res = await apiFetch<PeruDocumentLookupResult>(
        `/api/public/consulta-documento?tipo=${docTipo}&numero=${encodeURIComponent(clean)}`
      );
      setRegDocVerificado(res);
      if (res.nombre_completo) {
        setRegRazonSocial(res.nombre_completo);
        if (!regNombre.trim()) setRegNombre(res.nombre_completo);
      }
    } catch (err) {
      setRegDocVerificado(null);
      setLoginError(formatPeruLookupError(err));
    } finally {
      setRegDocLoading(false);
    }
  }

  function handleRequestRegGps() {
    if (!navigator.geolocation) {
      setRegGpsStatus('denied');
      return;
    }
    setRegGpsStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRegLat(pos.coords.latitude);
        setRegLng(pos.coords.longitude);
        setRegGpsStatus('live');
      },
      () => setRegGpsStatus('denied'),
      { enableHighAccuracy: true, timeout: 7000 }
    );
  }

  async function handleUpdateWorkspaceGps() {
    if (!session) return;
    if (!navigator.geolocation) {
      setActionMsg({ type: 'err', text: 'Tu navegador no permite geolocalización GPS.' });
      return;
    }
    setDriverGpsSending(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await apiFetch(`/api/negocio/${session.negocioId}/configuracion`, {
            method: 'PUT',
            body: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            },
            token: session.token,
          });
          setActionMsg({
            type: 'ok',
            text: `Ubicación GPS del negocio actualizada (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}).`,
          });
          await loadWorkspace(true);
        } catch (err) {
          setActionMsg({
            type: 'err',
            text: err instanceof Error ? err.message : 'No se pudo guardar el GPS del negocio',
          });
        } finally {
          setDriverGpsSending(false);
        }
      },
      () => {
        setDriverGpsSending(false);
        setActionMsg({
          type: 'err',
          text: 'Permite el acceso a tu ubicación GPS para ubicar tu negocio en el mapa.',
        });
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  }

  async function handleRegisterBusiness(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    const docTipo = regTipoPersona === 'NATURAL' ? 'DNI' : 'RUC';
    try {
      const res = await apiFetch<{
        token: string;
        negocio: {
          id: number;
          codigo: string;
          rubro: Rubro;
          nombre: string;
        };
      }>('/api/public/negocios/registro', {
        method: 'POST',
        body: {
          rubro: regRubro,
          nombre: regNombre,
          telefono: regTelefono,
          zona: regZona,
          lat: regLat,
          lng: regLng,
          pin: regPin,
          tipo_persona: regTipoPersona,
          documento_tipo: docTipo,
          documento_numero: regDocNumero.replace(/\D/g, ''),
          razon_social: regRazonSocial || regNombre,
          tipo_negocio: regTipoNegocio,
          modalidades_venta: regModalidades,
          panel_ia: regPanelIa || undefined,
          catalogo_inicial: regPanelIa?.catalogo_inicial || undefined,
        },
      });
      setSession({
        token: res.token,
        negocioId: res.negocio.id,
        nombre: res.negocio.nombre,
        codigo: res.negocio.codigo,
        rubro: res.negocio.rubro,
      });
      setTab('GESTION');
      setActionMsg({
        type: 'ok',
        text: `¡Negocio registrado! Tu código de acceso es ${res.negocio.codigo}. ${
          regPanelIa
            ? `Tu panel IA de "${regPanelIa.rubro_titulo}" y catálogo inicial ya están listos.`
            : 'Configura ahora tus horarios, tarifas y catálogo.'
        }`,
      });
      void refreshDirectorio();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'No se pudo registrar el negocio');
    }
  }

  async function handleToggleOnline() {
    if (!session || !resumen) return;
    try {
      const nextOnline = !resumen.negocio.en_linea;
      await apiFetch(`/api/negocio/${session.negocioId}/estado`, {
        method: 'PATCH',
        body: { en_linea: nextOnline },
        token: session.token,
      });
      setActionMsg({
        type: 'ok',
        text: nextOnline
          ? 'Tu negocio está EN LÍNEA recibiendo pedidos.'
          : 'Tu negocio quedó PAUSADO temporalmente.',
      });
      await loadWorkspace(true);
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error cambiando estado',
      });
    }
  }

  async function handleAccept(pedidoId: number) {
    if (!session) return;
    setActionMsg(null);
    try {
      await apiFetch(`/api/negocio/${session.negocioId}/pedidos/${pedidoId}/aceptar`, {
        method: 'POST',
        body: {},
        token: session.token,
      });
      setActionMsg({
        type: 'ok',
        text:
          session.rubro === 'TRANSPORTE'
            ? 'Viaje aceptado. Sigue la ruta en el mapa hacia el Punto A para recoger al pasajero.'
            : 'Pedido aceptado. Comisión retenida en garantía.',
      });
      await loadWorkspace(true);
      if (session.rubro === 'TRANSPORTE') {
        setTab('EN_CURSO');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setActionMsg({ type: 'err', text: err.message });
        setRecargaOpen(true);
      } else {
        setActionMsg({
          type: 'err',
          text: err instanceof Error ? err.message : 'No se pudo aceptar el pedido',
        });
      }
    }
  }

  async function handleReject(pedidoId: number) {
    if (!session) return;
    setActionMsg(null);
    try {
      await apiFetch(`/api/negocio/${session.negocioId}/pedidos/${pedidoId}/rechazar`, {
        method: 'POST',
        body: { motivo: 'Sin disponibilidad en este momento' },
        token: session.token,
      });
      setActionMsg({ type: 'ok', text: 'Solicitud rechazada.' });
      await loadWorkspace(true);
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error al rechazar',
      });
    }
  }

  async function handleToggleDriverAvailability() {
    if (!session || !resumen) return;
    const unit =
      resumen.unidades.find((u) => u.id === activeUnitId) || resumen.unidades[0];
    if (!unit) {
      await handleToggleOnline();
      return;
    }
    const nextUnitEstado = unit.estado === 'DISPONIBLE' ? 'OCUPADO' : 'DISPONIBLE';
    try {
      await apiFetch(`/api/negocio/${session.negocioId}/unidades/${unit.id}`, {
        method: 'PATCH',
        body: { estado: nextUnitEstado },
        token: session.token,
      });
      if (nextUnitEstado === 'DISPONIBLE' && !resumen.negocio.en_linea) {
        await apiFetch(`/api/negocio/${session.negocioId}/estado`, {
          method: 'PATCH',
          body: { en_linea: true },
          token: session.token,
        });
      }
      setActionMsg({
        type: 'ok',
        text:
          nextUnitEstado === 'DISPONIBLE'
            ? `Unidad ${unit.placa} en modo DISPONIBLE recibiendo solicitudes.`
            : `Unidad ${unit.placa} marcada como OCUPADA.`,
      });
      await loadWorkspace(true);
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error cambiando disponibilidad del conductor',
      });
    }
  }

  async function handleSendDriverGps() {
    if (!session || !resumen) return;
    const unit =
      resumen.unidades.find((u) => u.id === activeUnitId) || resumen.unidades[0];
    if (!unit) return;
    setDriverGpsSending(true);
    const pushCoords = async (lat: number, lng: number, sourceLabel: string) => {
      try {
        await apiFetch(`/api/negocio/${session.negocioId}/unidades/${unit.id}`, {
          method: 'PATCH',
          body: { lat, lng },
          token: session.token,
        });
        setActionMsg({
          type: 'ok',
          text: `GPS de ${unit.placa} (${sourceLabel}) sincronizado en mapa en vivo: ${lat.toFixed(4)}, ${lng.toFixed(4)}.`,
        });
        await loadWorkspace(true);
      } catch (err) {
        setActionMsg({
          type: 'err',
          text: err instanceof Error ? err.message : 'Error enviando ubicación GPS',
        });
      } finally {
        setDriverGpsSending(false);
      }
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void pushCoords(pos.coords.latitude, pos.coords.longitude, 'GPS del dispositivo');
        },
        () => {
          const baseLat = unit.lat ?? resumen.negocio.lat ?? -13.5174;
          const baseLng = unit.lng ?? resumen.negocio.lng ?? -71.9765;
          void pushCoords(
            Number((baseLat + 0.0008).toFixed(5)),
            Number((baseLng - 0.0006).toFixed(5)),
            'GPS Cusco Centro'
          );
        },
        { timeout: 5000 }
      );
    } else {
      const baseLat = unit.lat ?? resumen.negocio.lat ?? -13.5174;
      const baseLng = unit.lng ?? resumen.negocio.lng ?? -71.9765;
      await pushCoords(
        Number((baseLat + 0.0008).toFixed(5)),
        Number((baseLng - 0.0006).toFixed(5)),
        'GPS Cusco Centro'
      );
    }
  }

  async function handleSendCounterOffer(pedidoId: number, montoCentavos: number) {
    if (!session) return;
    setActionMsg(null);
    try {
      await apiFetch(`/api/negocio/${session.negocioId}/pedidos/${pedidoId}/contraoferta`, {
        method: 'POST',
        body: { monto_centavos: montoCentavos },
        token: session.token,
      });
      setCustomCounterOpen(false);
      setCustomCounterSoles('');
      setActionMsg({
        type: 'ok',
        text: `Contraoferta de ${formatSoles(montoCentavos)} enviada al pasajero en vivo.`,
      });
      await loadWorkspace(true);
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo enviar la contraoferta',
      });
    }
  }

  async function handleEmitirSunat(pedidoId: number) {
    if (!session || session.rubro === 'TRANSPORTE') return;
    setSunatSendingId(pedidoId);
    setActionMsg(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        enviado_apisperu: boolean;
        mensaje?: string | null;
        comprobante: ComprobanteElectronico;
      }>(`/api/negocio/${session.negocioId}/pedidos/${pedidoId}/emitir-sunat`, {
        method: 'POST',
        body: {},
        token: session.token,
      });
      setActionMsg({
        type: 'ok',
        text: `Comprobante ${res.comprobante.numero_completo} actualizado (${res.comprobante.sunat_estado || 'REGISTRADA_LOCAL'}).`,
      });
      setInvoiceModal({ comprobante: res.comprobante });
      await loadWorkspace(true);
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error enviando comprobante a SUNAT',
      });
    } finally {
      setSunatSendingId(null);
    }
  }

  async function submitPinValidation(pedidoId: number) {
    if (!session) return;
    setActionMsg(null);
    try {
      const res = await apiFetch<{
        puntos_otorgados: number;
        pedido?: PedidoNegocio;
        comprobante?: ComprobanteElectronico;
      }>(
        `/api/negocio/${session.negocioId}/pedidos/${pedidoId}/entregar`,
        {
          method: 'POST',
          body: { pin: pinInputs[pedidoId] || '' },
          token: session.token,
        }
      );
      const isTaxi =
        session.rubro === 'TRANSPORTE' || res.pedido?.categoria === 'TRANSPORTE';
      setActionMsg({
        type: 'ok',
        text: isTaxi
          ? `PIN validado. Traslado completado y liquidado (+${res.puntos_otorgados} pts al pasajero).`
          : `PIN validado. Servicio completado y liquidado (+${res.puntos_otorgados} pts al cliente). Comprobante listo para imprimir.`,
      });
      setPinInputs((prev) => ({ ...prev, [pedidoId]: '' }));
      if (!isTaxi && (res.comprobante || res.pedido)) {
        setInvoiceModal({ order: res.pedido, comprobante: res.comprobante });
      }
      await loadWorkspace(true);
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error validando PIN',
      });
      await loadWorkspace(true);
    }
  }

  async function handleValidatePin(e: React.FormEvent, pedidoId: number) {
    e.preventDefault();
    await submitPinValidation(pedidoId);
  }

  async function handleRequestRecharge(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setActionMsg(null);
    try {
      const centavos = Math.round((Number(recargaSoles) || 0) * 100);
      await apiFetch(`/api/negocio/${session.negocioId}/recargas`, {
        method: 'POST',
        body: {
          monto_centavos: centavos,
          metodo: recargaMetodo,
          codigo_operacion: recargaOpCode,
        },
        token: session.token,
      });
      setRecargaOpen(false);
      setRecargaOpCode('');
      setActionMsg({
        type: 'ok',
        text: 'Solicitud de recarga enviada en estado PENDIENTE para aprobación del administrador.',
      });
      await loadWorkspace(true);
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error solicitando recarga',
      });
    }
  }

  async function handleCreateReferral(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !refGuiaKey) return;
    const [negIdStr, servIdStr] = refGuiaKey.split(':');
    setActionMsg(null);
    try {
      const res = await apiFetch<{ pedido: PedidoNegocio }>(
        `/api/negocio/${session.negocioId}/reservas-referidas`,
        {
          method: 'POST',
          body: {
            negocio_destino_id: Number(negIdStr),
            servicio_id: Number(servIdStr),
            cliente_nombre: refClienteNombre,
            cliente_telefono: refClienteTelefono,
            fecha_hora_reserva: refFechaHora,
            metodo_pago: refMetodoPago,
          },
          token: session.token,
        }
      );
      setRefClienteNombre('');
      setRefClienteTelefono('');
      setActionMsg({
        type: 'ok',
        text: `Reserva referida ${res.pedido.codigo} enviada al guía. Al finalizar, el guía te dará su PIN para validarlo aquí y recibir tu crédito interno.`,
      });
      await loadWorkspace(true);
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error creando reserva referida',
      });
    }
  }

  async function handleAddService(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setActionMsg(null);
    const unidadFinal =
      newServUnidadMedida === '__CUSTOM__'
        ? newServCustomUnidad.trim() || 'Unidad'
        : newServUnidadMedida;
    const cleanAtributos: Record<string, string> = {};
    for (const [k, v] of Object.entries(newServAtributos)) {
      if (v && v.trim()) cleanAtributos[k] = v.trim();
    }
    try {
      await apiFetch(`/api/negocio/${session.negocioId}/servicios`, {
        method: 'POST',
        body: {
          nombre: newServNombre,
          descripcion: newServDesc,
          precio_centavos: Math.round((Number(newServPrecioSoles) || 0) * 100),
          unidad_medida: unidadFinal,
          atributos: Object.keys(cleanAtributos).length > 0 ? cleanAtributos : undefined,
          stock: 20,
          duracion_min: 45,
        },
        token: session.token,
      });
      setNewServNombre('');
      setNewServPrecioSoles('');
      setNewServDesc('');
      setNewServCustomUnidad('');
      setNewServAtributos({});
      setActionMsg({
        type: 'ok',
        text: `Ítem publicado por "${unidadFinal}" en tu catálogo.`,
      });
      await loadWorkspace(true);
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error agregando servicio',
      });
    }
  }

  async function handleDeleteServiceFromMgmt(servicioId: number) {
    if (!session) return;
    try {
      await apiFetch(`/api/negocio/${session.negocioId}/servicios/${servicioId}`, {
        method: 'DELETE',
        token: session.token,
      });
      setActionMsg({ type: 'ok', text: 'Ítem eliminado del catálogo.' });
      await loadWorkspace(true);
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error eliminando servicio',
      });
    }
  }

  async function handleUpdateRate(tasaId: number, tasaCompra: number, tasaVenta: number) {
    if (!session) return;
    try {
      await apiFetch(`/api/negocio/${session.negocioId}/divisas/${tasaId}`, {
        method: 'PATCH',
        body: { tasa_compra: tasaCompra, tasa_venta: tasaVenta },
        token: session.token,
      });
      setActionMsg({ type: 'ok', text: 'Tasa de cambio actualizada.' });
      await loadWorkspace(true);
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error actualizando tasa',
      });
    }
  }

  if (!session) {
    return (
      <div className={`${authMode === 'REGISTER' ? 'max-w-3xl' : 'max-w-lg'} mx-auto py-8 pb-24 transition-all`}>
        <div className="rounded-3xl border border-[#2563EB]/25 bg-white dark:bg-[#0D1426] p-6 sm:p-8 space-y-6 shadow-2xl chuspa-google-border">
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-[0.2em] text-[#9A7B2C] dark:text-[#D4AF37]">
              Portal Multinegocio La Chuspa
            </p>
            <h1 className="font-display text-3xl font-semibold">
              {authMode === 'LOGIN' ? 'Acceso al Panel del Negocio' : 'Registra y Configura tu Negocio'}
            </h1>
            <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
              {authMode === 'LOGIN'
                ? 'Sesión protegida con PIN de 4 dígitos (bloqueo automático tras 3 intentos fallidos).'
                : 'Crea tu cuenta de prestador (Taxi, Restaurante, Botica, Turismo, Hotel o Divisas) y configura tu panel.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#F8F7F4] dark:bg-[#0B0E14] border border-black/10 dark:border-white/10">
            <button
              type="button"
              onClick={() => {
                setAuthMode('LOGIN');
                setLoginError(null);
              }}
              className={`min-h-[40px] rounded-xl text-xs font-bold transition-colors ${
                authMode === 'LOGIN'
                  ? 'bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14]'
                  : 'text-[#6A717E] dark:text-[#98A0AD]'
              }`}
            >
              Ya tengo código
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('REGISTER');
                setLoginError(null);
              }}
              className={`min-h-[40px] rounded-xl text-xs font-bold transition-colors ${
                authMode === 'REGISTER'
                  ? 'bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14]'
                  : 'text-[#6A717E] dark:text-[#98A0AD]'
              }`}
            >
              Crear Nuevo Negocio
            </button>
          </div>

          {loginError && (
            <div className="rounded-xl border border-[#C81E5B]/40 bg-[#C81E5B]/10 px-4 py-3 text-xs text-[#C81E5B]">
              {loginError}
            </div>
          )}

          {authMode === 'LOGIN' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
                  Selecciona tu negocio
                </label>
                <select
                  value={loginCodigo}
                  onChange={(e) => setLoginCodigo(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                >
                  {(Array.isArray(directorio) && directorio.length > 0
                    ? directorio
                    : DEMO_ACCESS_GUIDE.map((d, idx) => ({
                        id: idx + 1,
                        codigo: d.codigo,
                        nombre: d.nota,
                        rubro: (d.codigo.startsWith('NEG-TX')
                          ? 'TRANSPORTE'
                          : d.codigo.startsWith('NEG-TU')
                          ? 'TURISMO'
                          : d.codigo.startsWith('NEG-RE')
                          ? 'RESTAURANTE'
                          : d.codigo.startsWith('NEG-FA')
                          ? 'FARMACIA'
                          : 'CASA_CAMBIO') as Rubro,
                      }))
                  ).map((b) => (
                    <option key={b.id} value={b.codigo}>
                      {b.codigo} · {b.nombre} ({RUBRO_LABELS[b.rubro]})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
                  PIN de 4 dígitos
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#8A8F99] absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    required
                    value={loginPin}
                    onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="w-full min-h-[48px] pl-10 pr-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-lg font-mono-tabular tracking-[0.35em]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full min-h-[48px] rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-sm font-semibold"
              >
                Ingresar al Panel
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterBusiness} className="space-y-4">
              {/* Agente IA Multi-Rubro: crea automáticamente el panel de control y unidades para cualquier negocio */}
              <AiBusinessBuilder
                nombreComercial={regNombre}
                zona={regZona}
                value={regPanelIa}
                onChange={(schema) => {
                  setRegPanelIa(schema);
                  setRegRubro(schema.rubro_base);
                  setRegTipoNegocio(schema.rubro_titulo);
                  if (schema.unidades_medida.length > 0) {
                    setRegModalidades(schema.unidades_medida);
                    setNewServUnidadMedida(schema.unidades_medida[0]);
                  }
                }}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
                    Rubro operativo base
                  </label>
                  <select
                    value={regRubro}
                    onChange={(e) => setRegRubro(e.target.value as Rubro)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                  >
                    {(['TRANSPORTE', 'RESTAURANTE', 'FARMACIA', 'TURISMO', 'HOTEL', 'CASA_CAMBIO'] as Rubro[]).map(
                      (r) => (
                        <option key={r} value={r}>
                          {RUBRO_LABELS[r]}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
                    Categoría / Especialidad del Negocio
                  </label>
                  <select
                    value={BUSINESS_CATEGORIES.includes(regTipoNegocio as any) ? regTipoNegocio : '__CUSTOM__'}
                    onChange={(e) => {
                      if (e.target.value !== '__CUSTOM__') setRegTipoNegocio(e.target.value);
                    }}
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs"
                  >
                    {BUSINESS_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    {!BUSINESS_CATEGORIES.includes(regTipoNegocio as any) && (
                      <option value="__CUSTOM__">{regTipoNegocio} (Generado por IA)</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Persona Natural DNI o Jurídica RUC */}
              <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <select
                    value={regTipoPersona}
                    onChange={(e) => {
                      setRegTipoPersona(e.target.value as 'NATURAL' | 'JURIDICA');
                      setRegDocVerificado(null);
                    }}
                    className="min-h-[36px] px-2.5 rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs font-semibold"
                  >
                    <option value="JURIDICA">Persona Jurídica (RUC)</option>
                    <option value="NATURAL">Persona Natural (DNI)</option>
                  </select>
                  {regDocVerificado?.validado && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      <BadgeCheck className="w-3.5 h-3.5" /> Verificado
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={regTipoPersona === 'NATURAL' ? 8 : 11}
                    value={regDocNumero}
                    onChange={(e) => {
                      setRegDocNumero(e.target.value.replace(/\D/g, ''));
                      setRegDocVerificado(null);
                    }}
                    placeholder={regTipoPersona === 'NATURAL' ? 'DNI (8 dígitos)' : 'RUC (11 dígitos)'}
                    className="flex-1 min-h-[40px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs font-mono-tabular"
                  />
                  <button
                    type="button"
                    onClick={handleLookupRegDoc}
                    disabled={regDocLoading}
                    className="min-h-[40px] px-3 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-bold whitespace-nowrap"
                  >
                    {regDocLoading ? 'Validando...' : 'Validar RENIEC/SUNAT'}
                  </button>
                </div>
                {regRazonSocial && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Titular: {regRazonSocial}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <span className="block text-[11px] text-[#6A717E] dark:text-[#98A0AD]">
                  Modalidades de venta (Kilos, Arrobas, Unidades, etc.)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SALE_MODALITIES.map((mod) => {
                    const active = regModalidades.includes(mod);
                    return (
                      <button
                        key={mod}
                        type="button"
                        onClick={() =>
                          setRegModalidades((prev) =>
                            prev.includes(mod)
                              ? prev.length > 1
                                ? prev.filter((x) => x !== mod)
                                : prev
                              : [...prev, mod]
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                          active
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'border-black/15 dark:border-white/15 text-[#6A717E]'
                        }`}
                      >
                        {mod}
                      </button>
                    );
                  })}
                </div>
              </div>

              <input
                type="text"
                required
                value={regNombre}
                onChange={(e) => setRegNombre(e.target.value)}
                placeholder="Nombre comercial (ej. Minimarket Imperial Cusco)"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="tel"
                  required
                  value={regTelefono}
                  onChange={(e) => setRegTelefono(e.target.value)}
                  placeholder="WhatsApp (+51...)"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  value={regPin}
                  onChange={(e) => setRegPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="PIN 4 dígitos"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm font-mono-tabular"
                />
              </div>
              <input
                type="text"
                required
                value={regZona}
                onChange={(e) => setRegZona(e.target.value)}
                placeholder="Dirección o zona en Cusco"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
              />
              <div className="rounded-2xl border border-[#2563EB]/25 bg-[#2563EB]/6 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <p className="font-bold text-[#1E40AF] dark:text-[#06B6D4]">
                      {regGpsStatus === 'live'
                        ? `GPS del negocio activo (${regLat.toFixed(4)}, ${regLng.toFixed(4)})`
                        : 'Ubicación Real en Google Maps del Negocio'}
                    </p>
                    <p className="text-[10px] text-[#6A717E] dark:text-[#98A0AD]">
                      Toca el mapa para fijar tu local o presiona Activar GPS para ubicarte automáticamente.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRequestRegGps}
                    disabled={regGpsStatus === 'loading'}
                    className="min-h-[36px] px-3 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-[11px] font-bold flex items-center gap-1.5 shrink-0"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>{regGpsStatus === 'loading' ? 'Ubicando...' : regGpsStatus === 'live' ? 'GPS Listo' : 'Activar GPS'}</span>
                  </button>
                </div>
                <CuscoGeoMap
                  mode="MARKET"
                  userLat={regLat}
                  userLng={regLng}
                  originLabel={regNombre.trim() || 'Tu Negocio'}
                  pins={[
                    {
                      id: 'reg-store-pin',
                      lat: regLat,
                      lng: regLng,
                      priceText: regPanelIa?.rubro_titulo || RUBRO_LABELS[regRubro],
                      sublabel: regZona,
                      detailTitle: regNombre.trim() || 'Ubicación de tu negocio',
                      tier: 'cheapest',
                      kind: 'MARKET',
                      isOpen: true,
                    },
                  ]}
                  gpsLive={regGpsStatus === 'live'}
                  onRequestGps={handleRequestRegGps}
                  onMapClick={(latVal, lngVal) => {
                    setRegLat(latVal);
                    setRegLng(lngVal);
                    setRegGpsStatus('live');
                  }}
                  heightClass="h-[220px] sm:h-[260px]"
                />
              </div>
              <button
                type="submit"
                className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white text-sm font-bold chuspa-google-btn"
              >
                {regPanelIa
                  ? `Crear Panel IA (${regPanelIa.rubro_titulo}) y Entrar`
                  : 'Crear y Configurar Mi Panel'}
              </button>
            </form>
          )}

          <div className="pt-3 border-t border-black/10 dark:border-white/10">
            <button
              type="button"
              onClick={() => setShowDemoGuide((v) => !v)}
              className="text-xs text-[#9A7B2C] dark:text-[#E5C158] hover:underline"
            >
              {showDemoGuide ? 'Ocultar credenciales de prueba' : 'Ver credenciales de prueba (entorno demo)'}
            </button>
            {showDemoGuide && (
              <div className="mt-3 space-y-1.5 text-xs">
                {DEMO_ACCESS_GUIDE.map((item) => (
                  <button
                    key={item.codigo}
                    type="button"
                    onClick={() => {
                      setLoginCodigo(item.codigo);
                      setLoginPin(item.pin);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-black/8 dark:border-white/8 hover:border-[#D4AF37]/50 text-left"
                  >
                    <span>
                      <span className="font-mono-tabular font-semibold">{item.codigo}</span> · {item.rubro}
                    </span>
                    <span className="font-mono-tabular text-[#6A717E] dark:text-[#98A0AD]">
                      PIN {item.pin} · {item.nota}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const nuevos = pedidos.filter(
    (p) => p.estado === 'PENDIENTE_CONFIRMACION' && p.negocio_id === session.negocioId
  );
  const enCurso = pedidos.filter(
    (p) => p.estado === 'CONFIRMADO_PREPARACION' && p.negocio_id === session.negocioId
  );
  const historial = pedidos.filter(
    (p) =>
      (p.estado === 'ENTREGADO_PAGADO' || p.estado === 'CANCELADO') &&
      p.negocio_id === session.negocioId
  );
  const referidosPorMi = pedidos.filter((p) => p.referido_negocio_id === session.negocioId);
  const roleTheme = RUBRO_PANEL_THEME[session.rubro] || RUBRO_PANEL_THEME.RESTAURANTE;
  const panelIa = resumen?.negocio?.panel_ia || null;

  return (
    <div className="space-y-6 pb-24 md:pb-12">
      {/* Cabecera financiera del negocio con color temático único por rubro / IA */}
      <section
        style={panelIa ? { borderColor: `${panelIa.tema_color.primaryHex}66` } : undefined}
        className={`rounded-3xl border p-6 space-y-5 shadow-2xl chuspa-google-border ${roleTheme.cardBg}`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p
              style={panelIa ? { color: panelIa.tema_color.primaryHex } : undefined}
              className={`text-xs uppercase tracking-[0.16em] font-bold ${roleTheme.accentText}`}
            >
              {panelIa?.badge_panel || roleTheme.badge} · {session.codigo}
            </p>
            <h1 className="font-display text-3xl font-semibold mt-0.5">{session.nombre}</h1>
            {panelIa && (
              <p className="text-xs text-[#6A717E] dark:text-[#98A0AD] mt-0.5">
                {panelIa.rubro_titulo} — {panelIa.subtitulo_panel}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {resumen && (
              <button
                type="button"
                onClick={handleToggleOnline}
                className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                  resumen.negocio.en_linea
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'border-rose-500/40 bg-rose-500/15 text-rose-500'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{resumen.negocio.en_linea ? 'En Línea ●' : 'Pausado'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSoundEnabled((v) => !v)}
              className="min-h-[44px] px-3.5 rounded-xl border border-black/10 dark:border-white/10 text-xs flex items-center gap-1.5"
            >
              <Bell className={`w-3.5 h-3.5 ${soundEnabled ? 'text-[#D4AF37]' : 'text-[#8A8F99]'}`} />
              <span>{soundEnabled ? 'Voz & Timbre' : 'Silenciado'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleUpdateWorkspaceGps()}
              disabled={driverGpsSending}
              className="min-h-[44px] px-3.5 rounded-xl border border-[#2563EB]/30 bg-[#2563EB]/10 text-[#1E40AF] dark:text-[#06B6D4] text-xs font-semibold flex items-center gap-1.5"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>{driverGpsSending ? 'Ubicando...' : 'GPS Celular'}</span>
            </button>
            <button
              type="button"
              onClick={() => loadWorkspace(false)}
              className="min-h-[44px] px-3.5 rounded-xl border border-black/10 dark:border-white/10 text-xs flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Actualizar</span>
            </button>
            <button
              type="button"
              onClick={() => setRecargaOpen(true)}
              className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${roleTheme.primaryBtn}`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Recargar Saldo</span>
            </button>
            <button
              type="button"
              onClick={() => setSession(null)}
              className="min-h-[44px] px-3.5 rounded-xl border border-black/10 dark:border-white/10 text-xs flex items-center gap-1.5 text-[#C81E5B]"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Salir</span>
            </button>
          </div>
        </div>

        {/* Strip financiero 3 columnas */}
        {resumen && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-black/8 dark:border-white/8">
            <div className={`p-4 rounded-2xl border ${roleTheme.tileBg}`}>
              <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">Saldo Total</p>
              <p className="font-mono-tabular text-2xl font-semibold mt-1">
                {formatSoles(resumen.negocio.saldo)}
              </p>
            </div>
            <div className={`p-4 rounded-2xl border ${roleTheme.tileBg}`}>
              <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">Retenido en Curso</p>
              <p className="font-mono-tabular text-2xl font-semibold mt-1 text-[#D97706]">
                {formatSoles(resumen.negocio.saldo_retenido)}
              </p>
            </div>
            <div className={`p-4 rounded-2xl border ${roleTheme.tileBg}`}>
              <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                Disponible Libre (Comisión {resumen.regla_comision.porcentaje_plataforma}%)
              </p>
              <p className="font-mono-tabular text-2xl font-semibold mt-1 text-[#1FA855]">
                {formatSoles(resumen.negocio.saldo_libre)}
              </p>
            </div>
          </div>
        )}

        {/* Pestañas */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'NUEVOS', label: `Nuevos (${nuevos.length})` },
              { id: 'EN_CURSO', label: `En curso (${enCurso.length})` },
              { id: 'HISTORIAL', label: `Historial (${historial.length})` },
              { id: 'REFERIDOS', label: `Reservas Referidas (${referidosPorMi.length})` },
              { id: 'RUTAS_SOS', label: 'Ruta Colectivo & Despacho' },
              { id: 'CONFIGURACION', label: 'Configurar Mi Panel' },
              { id: 'GESTION', label: 'Catálogo y Movimientos' },
            ] as Array<{ id: BizTab; label: string }>
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold border whitespace-nowrap shrink-0 transition-colors flex items-center gap-1.5 ${
                tab === t.id
                  ? roleTheme.activeTab
                  : 'border-black/10 dark:border-white/10 text-[#555B66] dark:text-[#A3A9B5]'
              }`}
            >
              {t.id === 'CONFIGURACION' && <Settings className="w-3.5 h-3.5" />}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </section>

      {actionMsg && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs sm:text-sm ${
            actionMsg.type === 'ok'
              ? 'border-[#1FA855]/40 bg-[#1FA855]/10 text-[#1FA855]'
              : 'border-[#C81E5B]/40 bg-[#C81E5B]/10 text-[#C81E5B]'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {/* TAB NUEVOS (para TRANSPORTE incluye Modo Conductor estilo inDrive) */}
      {tab === 'NUEVOS' && session.rubro === 'TRANSPORTE' && (() => {
        const activeUnit =
          resumen?.unidades.find((u) => u.id === activeUnitId) || resumen?.unidades[0];
        const isDriverAvailable = activeUnit ? activeUnit.estado === 'DISPONIBLE' : Boolean(resumen?.negocio.en_linea);
        const completedTrips = historial.filter((h) => h.estado === 'ENTREGADO_PAGADO');
        const grossEarnings = completedTrips.reduce((sum, h) => sum + h.monto_centavos, 0);

        return (
          <div className="space-y-4">
            {/* Barra superior Modo Conductor estilo inDrive */}
            <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <CarFront className="w-5 h-5 text-[#16A34A]" />
                  <div>
                    <h2 className="font-display text-xl font-semibold leading-tight">
                      Modo Conductor · En Vivo
                    </h2>
                    <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                      {activeUnit
                        ? `${activeUnit.conductor_nombre} · ${activeUnit.placa} (${activeUnit.modelo})`
                        : 'Sin unidades registradas aún'}
                    </p>
                  </div>
                </div>
                {resumen && resumen.unidades.length > 1 && (
                  <select
                    value={activeUnit?.id ?? ''}
                    onChange={(e) => setActiveUnitId(Number(e.target.value))}
                    className="min-h-[40px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs font-semibold"
                  >
                    {resumen.unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.conductor_nombre} · {u.placa}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Toggle Disponible / Ocupado */}
                <button
                  type="button"
                  onClick={() => void handleToggleDriverAvailability()}
                  className="min-h-[44px] p-1 rounded-full bg-[#EFECE6] dark:bg-[#0B0E14] border border-black/10 dark:border-white/10 inline-flex items-center gap-1"
                  aria-label="Cambiar disponibilidad del conductor"
                >
                  <span
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                      !isDriverAvailable
                        ? 'bg-[#DC2626] text-white shadow'
                        : 'text-[#6A717E] dark:text-[#98A0AD]'
                    }`}
                  >
                    Ocupado
                  </span>
                  <span
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                      isDriverAvailable
                        ? 'bg-[#16A34A] text-white shadow'
                        : 'text-[#6A717E] dark:text-[#98A0AD]'
                    }`}
                  >
                    Disponible
                  </span>
                </button>

                <button
                  type="button"
                  disabled={!activeUnit || driverGpsSending}
                  onClick={() => void handleSendDriverGps()}
                  className="min-h-[44px] px-4 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>{driverGpsSending ? 'Enviando GPS...' : 'Enviar Mi GPS'}</span>
                </button>
              </div>
            </div>

            {/* Sub-pestañas inDrive: Solicitudes de viaje | Desempeño */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-white dark:bg-[#121620] border border-black/10 dark:border-white/10 max-w-md">
              <button
                type="button"
                onClick={() => setDriverSubTab('SOLICITUDES')}
                className={`min-h-[42px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  driverSubTab === 'SOLICITUDES'
                    ? 'bg-[#14213D] text-white dark:bg-[#B6F02B] dark:text-[#0B0E14]'
                    : 'text-[#6A717E] dark:text-[#98A0AD]'
                }`}
              >
                <ListChecks className="w-4 h-4" />
                <span>Solicitudes de viaje ({nuevos.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setDriverSubTab('DESEMPENO')}
                className={`min-h-[42px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  driverSubTab === 'DESEMPENO'
                    ? 'bg-[#14213D] text-white dark:bg-[#B6F02B] dark:text-[#0B0E14]'
                    : 'text-[#6A717E] dark:text-[#98A0AD]'
                }`}
              >
                <Gauge className="w-4 h-4" />
                <span>Desempeño</span>
              </button>
            </div>

            {driverSubTab === 'SOLICITUDES' ? (
              <div className="space-y-4">
                {(() => {
                  const drvLat = activeUnit?.lat ?? resumen?.negocio.lat ?? -13.5174;
                  const drvLng = activeUnit?.lng ?? resumen?.negocio.lng ?? -71.9765;
                  const driverPins: GeoMapPin[] = nuevos.map((p, idx) => {
                    const angle = (idx * 72 * Math.PI) / 180;
                    const pLat = p.origen_lat ?? drvLat + Math.sin(angle) * 0.0045;
                    const pLng = p.origen_lng ?? drvLng + Math.cos(angle) * 0.0045;
                    return {
                      id: `ride-${p.id}`,
                      lat: pLat,
                      lng: pLng,
                      priceText: formatSoles(p.monto_centavos),
                      sublabel: p.cliente_nombre,
                      detailTitle: `${p.origen_texto || 'Pasajero'} → ${p.destino_texto || 'Cusco'}`,
                      tier: p.monto_centavos >= 2000 ? 'cheapest' : 'mid',
                      kind: 'DRIVER',
                      isOpen: true,
                    };
                  });
                  return (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                        <p className="text-xs font-semibold text-[#14213D] dark:text-[#E5C158]">
                          Mapa de solicitudes en vivo ({nuevos.length}) · Pulsa un precio en el mapa para responder
                        </p>
                        <span className="text-[11px] font-mono-tabular text-[#6A717E] dark:text-[#98A0AD]">
                          {activeUnit ? `Unidad ${activeUnit.placa}` : 'Tu unidad'}
                        </span>
                      </div>
                      <CuscoGeoMap
                        mode="TAXI"
                        userLat={drvLat}
                        userLng={drvLng}
                        originLabel={activeUnit ? `${activeUnit.conductor_nombre} (${activeUnit.placa})` : 'Tu ubicación actual'}
                        pins={driverPins}
                        selectedPinId={selectedRideOrder ? `ride-${selectedRideOrder.id}` : null}
                        onSelectPin={(pinId) => {
                          const found = nuevos.find((p) => `ride-${p.id}` === pinId);
                          if (found) {
                            setSelectedRideOrder(found);
                            setCustomCounterOpen(false);
                          }
                        }}
                        onRequestPinAction={(pinId) => {
                          const found = nuevos.find((p) => `ride-${p.id}` === pinId);
                          if (found) {
                            setSelectedRideOrder(found);
                            setCustomCounterOpen(false);
                          }
                        }}
                        gpsLive={driverGpsSending}
                        heightClass="h-[300px] sm:h-[360px]"
                      />
                    </div>
                  );
                })()}

                {enCurso.length > 0 && (
                  <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs">
                      <p className="font-bold text-emerald-700 dark:text-emerald-300">
                        Tienes {enCurso.length} traslado{enCurso.length > 1 ? 's' : ''} aceptado{enCurso.length > 1 ? 's' : ''} en curso
                      </p>
                      <p className="text-[#555B66] dark:text-[#A3A9B5]">
                        Mantén tu GPS actualizado y solicita el PIN de 4 dígitos al pasajero al finalizar.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTab('EN_CURSO')}
                      className="min-h-[40px] px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold whitespace-nowrap"
                    >
                      Ir a En Curso ({enCurso.length})
                    </button>
                  </div>
                )}

                {nuevos.length === 0 ? (
                  <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-10 text-center space-y-2">
                    <p className="text-sm font-medium">
                      Sin solicitudes de viaje pendientes en este momento.
                    </p>
                    <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                      Mantén tu estado en Disponible y envía tu GPS para que los pasajeros te ubiquen en el mapa de Cusco.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-black/10 dark:divide-white/10 rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] overflow-hidden">
                    {nuevos.map((p) => {
                      const kmStr = (p.distancia_km ?? 2.8).toFixed(1).replace('.', ',');
                      const etaStr = `${p.eta_min ?? 6} min.`;
                      return (
                        <article
                          key={p.id}
                          onClick={() => {
                            setSelectedRideOrder(p);
                            setCustomCounterOpen(false);
                          }}
                          className="p-4 sm:p-5 hover:bg-[#F8F7F4] dark:hover:bg-[#161B28] transition-colors cursor-pointer flex items-start gap-3.5"
                        >
                          {/* Columna izquierda pasajero */}
                          <div className="w-16 shrink-0 flex flex-col items-center text-center gap-1">
                            <div className="w-11 h-11 rounded-full bg-[#EFECE6] dark:bg-[#1E2534] border border-black/10 dark:border-white/10 flex items-center justify-center font-display font-bold text-base">
                              {p.cliente_nombre.slice(0, 1).toUpperCase()}
                            </div>
                            <p className="text-[11px] font-semibold leading-tight truncate w-full">
                              {p.cliente_nombre}
                            </p>
                            <p className="text-[10px] font-mono-tabular text-[#9A7B2C] dark:text-[#E5C158] flex items-center gap-0.5">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> 4.9
                            </p>
                            <p className="text-[10px] font-mono-tabular text-[#6A717E] dark:text-[#98A0AD]">
                              {etaStr}
                            </p>
                          </div>

                          {/* Detalle tarifa, puntos A -> B y pasajero verificado */}
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-baseline gap-2">
                                <span className="text-xs font-mono-tabular text-[#6A717E] dark:text-[#98A0AD]">
                                  ~{kmStr} km
                                </span>
                                <span className="font-mono-tabular text-xl font-extrabold">
                                  {formatSoles(p.monto_centavos)}
                                </span>
                                <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                                  {p.contraoferta_centavos ? 'Contraoferta enviada' : 'Precio justo'}
                                </span>
                              </div>
                              <span className="text-[11px] font-mono-tabular text-[#6A717E] dark:text-[#98A0AD]">
                                {p.codigo}
                              </span>
                            </div>

                            <p className="text-sm font-semibold leading-snug">
                              A: {p.origen_texto || 'Ubicación GPS del pasajero'}
                            </p>
                            <p className="text-xs sm:text-sm text-[#555B66] dark:text-[#A3A9B5] leading-snug">
                              B: {p.destino_texto || 'Destino en Cusco'}
                            </p>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5">
                              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                <span className="px-2.5 py-0.5 rounded-lg bg-[#B6F02B] text-[#0B0E14] font-bold">
                                  {p.metodo_pago}
                                </span>
                                {p.cliente_documento_numero && (
                                  <span className="inline-flex items-center gap-1 font-mono-tabular text-emerald-700 dark:text-emerald-300 font-semibold">
                                    <BadgeCheck className="w-3.5 h-3.5" />
                                    {p.cliente_documento_tipo || 'DNI'}: {p.cliente_documento_numero} (Pasajero · Sin factura)
                                  </span>
                                )}
                              </div>
                              <div
                                className="flex items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedRideOrder(p);
                                    setCustomCounterOpen(false);
                                  }}
                                  className="min-h-[38px] px-3 rounded-xl border border-black/15 dark:border-white/15 text-xs font-semibold inline-flex items-center gap-1"
                                >
                                  <MapPin className="w-3.5 h-3.5 text-[#2563EB]" />
                                  <span>Ver mapa</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleAccept(p.id)}
                                  className="min-h-[38px] px-3.5 rounded-xl bg-[#16A34A] text-white text-xs font-bold inline-flex items-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Aceptar</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-2xl font-semibold">Desempeño del Conductor</h3>
                    <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                      Resumen operativo en tiempo real · Identidad de pasajeros verificada sin facturación electrónica
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-4 rounded-2xl bg-[#F8F7F4] dark:bg-[#0B0E14]">
                    <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">Viajes Completados</p>
                    <p className="font-mono-tabular text-2xl font-bold mt-1">{completedTrips.length}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#F8F7F4] dark:bg-[#0B0E14]">
                    <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">Ingresos Generados</p>
                    <p className="font-mono-tabular text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                      {formatSoles(grossEarnings)}
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#F8F7F4] dark:bg-[#0B0E14]">
                    <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">Calificación</p>
                    <p className="font-mono-tabular text-2xl font-bold mt-1">
                      {(activeUnit?.calificacion ?? 4.9).toFixed(2)} ★
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#F8F7F4] dark:bg-[#0B0E14]">
                    <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">Viajes Activos</p>
                    <p className="font-mono-tabular text-2xl font-bold mt-1">{enCurso.length}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* TAB NUEVOS (Negocios no-taxi con Mapa Centrado + Popup Superpuesto) */}
      {tab === 'NUEVOS' && session.rubro !== 'TRANSPORTE' && (() => {
        const bizLat = resumen?.negocio.lat ?? -13.5167;
        const bizLng = resumen?.negocio.lng ?? -71.9788;
        const bizOrderPins: GeoMapPin[] = nuevos.map((p, idx) => {
          const angle = (idx * 68 * Math.PI) / 180;
          const radius = 0.0028 + (idx % 3) * 0.0014;
          return {
            id: `biz-ord-${p.id}`,
            lat: p.origen_lat ?? bizLat + Math.sin(angle) * radius,
            lng: p.origen_lng ?? bizLng + Math.cos(angle) * radius,
            priceText: formatSoles(p.monto_centavos),
            sublabel: p.cliente_nombre,
            detailTitle: p.item_nombre,
            tier: p.monto_centavos >= 5000 ? 'cheapest' : 'mid',
            kind: 'MARKET',
            isOpen: true,
          };
        });

        return (
          <div className="space-y-4">
            {panelIa && <AiDynamicToolsBar panelIa={panelIa} />}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <p className="text-xs font-semibold text-[#14213D] dark:text-[#E5C158]">
                  Mapa de pedidos entrantes ({nuevos.length}) · Pulsa un pin de precio para abrir la ficha del cliente
                </p>
                <span className="text-[11px] font-mono-tabular text-[#6A717E] dark:text-[#98A0AD]">
                  {resumen?.negocio.zona || 'Cusco'}
                </span>
              </div>
              <CuscoGeoMap
                mode="MARKET"
                userLat={bizLat}
                userLng={bizLng}
                originLabel={resumen?.negocio.nombre || 'Tu local'}
                pins={bizOrderPins}
                selectedPinId={selectedBizOrder ? `biz-ord-${selectedBizOrder.id}` : null}
                onSelectPin={(pinId) => {
                  const found = nuevos.find((p) => `biz-ord-${p.id}` === pinId);
                  if (found) setSelectedBizOrder(found);
                }}
                onRequestPinAction={(pinId) => {
                  const found = nuevos.find((p) => `biz-ord-${p.id}` === pinId);
                  if (found) setSelectedBizOrder(found);
                }}
                heightClass="h-[300px] sm:h-[360px]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {nuevos.length === 0 ? (
                <div className="md:col-span-2 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-10 text-center text-sm text-[#6A717E] dark:text-[#98A0AD]">
                  No hay solicitudes nuevas en este momento. Solo recibes pedidos de tu categoría ({RUBRO_LABELS[session.rubro]}).
                </div>
              ) : (
                nuevos.map((p) => (
                  <article
                    key={p.id}
                    onClick={() => setSelectedBizOrder(p)}
                    className="rounded-2xl border border-[#D4AF37]/40 bg-white dark:bg-[#121620] p-6 space-y-4 cursor-pointer hover:border-[#D4AF37] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono-tabular text-xs text-[#9A7B2C] dark:text-[#E5C158]">
                          {p.codigo} · {p.metodo_pago}
                        </p>
                        <h3 className="font-display text-2xl font-semibold mt-1">{p.item_nombre}</h3>
                        <p className="text-xs text-[#6A717E] dark:text-[#98A0AD] mt-1">
                          Cliente: {p.cliente_nombre} · {p.transcripcion}
                        </p>
                        {p.cliente_documento_numero && (
                          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-mono-tabular text-emerald-700 dark:text-emerald-300 font-semibold">
                            <BadgeCheck className="w-3.5 h-3.5" />
                            {p.cliente_documento_tipo || 'DNI'}: {p.cliente_documento_numero}{' '}
                            {p.cliente_documento_verificado ? '· RENIEC/SUNAT Verificado' : ''}
                          </p>
                        )}
                      </div>
                      <p className="font-mono-tabular text-xl font-semibold shrink-0">
                        {formatSoles(p.monto_centavos)}
                      </p>
                    </div>

                    <div
                      className="flex flex-wrap gap-2.5 pt-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedBizOrder(p)}
                        className="min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <MapPin className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>Ver ficha</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(p.id)}
                        className="flex-1 min-h-[44px] rounded-xl border border-[#C81E5B]/40 text-[#C81E5B] text-sm font-semibold flex items-center justify-center gap-1.5"
                      >
                        <X className="w-4 h-4" />
                        <span>Rechazar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAccept(p.id)}
                        className="flex-1 min-h-[44px] rounded-xl bg-[#1FA855] text-white text-sm font-semibold flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        <span>Aceptar</span>
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        );
      })()}

      {/* TAB EN CURSO */}
      {tab === 'EN_CURSO' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {enCurso.length === 0 ? (
            <div className="md:col-span-2 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-10 text-center text-sm text-[#6A717E] dark:text-[#98A0AD]">
              Sin servicios en curso.
            </div>
          ) : (
            enCurso.map((p) => {
              const isTaxiOrder = p.categoria === 'TRANSPORTE' || session.rubro === 'TRANSPORTE';
              if (isTaxiOrder) {
                const activeUnit =
                  resumen?.unidades.find((u) => u.id === activeUnitId) ||
                  resumen?.unidades.find((u) => u.id === p.unidad_id) ||
                  resumen?.unidades[0];
                const oLat = p.origen_lat ?? -13.5167;
                const oLng = p.origen_lng ?? -71.9788;
                const dLat = p.destino_lat ?? -13.5356;
                const dLng = p.destino_lng ?? -71.9388;
                const drvLat =
                  activeUnit?.lat ??
                  p.conductor_lat ??
                  p.unidad_lat ??
                  resumen?.negocio.lat ??
                  -13.5174;
                const drvLng =
                  activeUnit?.lng ??
                  p.conductor_lng ??
                  p.unidad_lng ??
                  resumen?.negocio.lng ??
                  -71.9765;
                const pickupKm = Math.max(0.2, haversineKm(drvLat, drvLng, oLat, oLng));
                const pickupEta = Math.max(1, Math.round(pickupKm * 3.2 + 1));
                const tripKm = Math.max(0.8, p.distancia_km ?? haversineKm(oLat, oLng, dLat, dLng));
                const tripEta = p.eta_min || Math.max(4, Math.round(tripKm * 3.1 + 2));

                return (
                  <article
                    key={p.id}
                    className="md:col-span-2 rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-5 sm:p-6"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                      {/* Izquierda: Mapa de Ruta del Taxista (Conductor -> Punto A -> Destino B) */}
                      <div className="lg:col-span-7 flex flex-col gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                              Ruta en Vivo · Recoger en A y llevar a B
                            </p>
                            <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                              Para recoger: <span className="font-mono-tabular font-semibold text-[#14171F] dark:text-white">{pickupEta} min ({pickupKm.toFixed(1)} km)</span> · Viaje A → B: <span className="font-mono-tabular font-semibold text-[#14171F] dark:text-white">{tripEta} min ({tripKm.toFixed(1)} km)</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={!activeUnit || driverGpsSending}
                            onClick={() => void handleSendDriverGps()}
                            className="min-h-[38px] px-3.5 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                          >
                            <Crosshair className="w-3.5 h-3.5" />
                            <span>{driverGpsSending ? 'Enviando GPS...' : 'Actualizar Mi GPS'}</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] px-3 py-2 flex items-start gap-2">
                            <span className="w-5 h-5 rounded-md bg-[#2563EB] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              A
                            </span>
                            <div className="min-w-0">
                              <p className="text-[11px] text-[#6A717E] dark:text-[#98A0AD]">Punto de recojo</p>
                              <p className="font-semibold truncate">{p.origen_texto || 'Ubicación GPS del pasajero'}</p>
                            </div>
                          </div>
                          <div className="rounded-xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] px-3 py-2 flex items-start gap-2">
                            <span className="w-5 h-5 rounded-md bg-[#16A34A] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              B
                            </span>
                            <div className="min-w-0">
                              <p className="text-[11px] text-[#6A717E] dark:text-[#98A0AD]">Destino final</p>
                              <p className="font-semibold truncate">{p.destino_texto || 'Destino en Cusco'}</p>
                            </div>
                          </div>
                        </div>

                        <CuscoGeoMap
                          mode="TAXI"
                          userLat={oLat}
                          userLng={oLng}
                          originLabel={p.origen_texto || 'Recoger pasajero (A)'}
                          destLat={dLat}
                          destLng={dLng}
                          destLabel={p.destino_texto || 'Destino (B)'}
                          driverLat={drvLat}
                          driverLng={drvLng}
                          driverLabel={
                            activeUnit
                              ? `${activeUnit.conductor_nombre} (${activeUnit.placa})`
                              : p.conductor_nombre
                                ? `${p.conductor_nombre} (${p.placa || 'Taxi'})`
                                : 'Mi Taxi GPS'
                          }
                          driverEtaBadge={`${pickupEta} min\n${pickupKm.toFixed(1)} km`}
                          routeBadge={`${tripEta} min\n${tripKm.toFixed(1)} km`}
                          gpsLive={Boolean(activeUnit?.lat && activeUnit?.lng)}
                          onRequestGps={() => void handleSendDriverGps()}
                          pins={[]}
                          heightClass="h-[290px] sm:h-[340px]"
                        />
                      </div>

                      {/* Derecha: Pasajero verificado + Teclado PIN */}
                      <div className="lg:col-span-5 flex flex-col justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-mono-tabular text-xs text-[#9A7B2C] dark:text-[#E5C158]">
                                {p.codigo} · Retención: {formatSoles(p.comision_retenida_centavos)}
                              </p>
                              <h3 className="font-display text-2xl font-semibold mt-1">{p.item_nombre}</h3>
                              <p className="text-xs text-[#6A717E] dark:text-[#98A0AD] mt-1">
                                Pasajero: {p.cliente_nombre} · {p.cliente_telefono}
                              </p>
                              {p.cliente_documento_numero && (
                                <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-mono-tabular text-emerald-600 dark:text-emerald-400 font-semibold">
                                  <BadgeCheck className="w-3.5 h-3.5" />
                                  {p.cliente_documento_tipo || 'DNI'}: {p.cliente_documento_numero} (Identidad verificada · Sin factura)
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-mono-tabular text-xl font-semibold">
                                {formatSoles(p.monto_centavos)}
                              </p>
                              <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                {p.metodo_pago}
                              </p>
                            </div>
                          </div>
                        </div>

                        {p.referido_negocio_id ? (
                          <div className="rounded-xl border border-[#D4AF37]/50 bg-[#D4AF37]/10 p-4 space-y-1">
                            <p className="text-xs font-semibold text-[#9A7B2C] dark:text-[#E5C158]">
                              Reserva referida por {p.referidor_nombre || `Socio #${p.referido_negocio_id}`}
                            </p>
                            <p className="text-xs text-[#555B66] dark:text-[#A3A9B5]">
                              Entrega este PIN al referidor al terminar para que liquide tu comisión:
                            </p>
                            <p className="font-mono-tabular text-2xl font-bold tracking-[0.25em] pt-1">
                              {p.pin_prestador || '----'}
                            </p>
                          </div>
                        ) : p.pin_bloqueado === 1 ? (
                          <p className="text-xs text-[#C81E5B] font-medium">
                            PIN bloqueado tras 5 intentos fallidos. Solo el pasajero puede cancelar el viaje.
                          </p>
                        ) : (
                          <PinKeypadCard
                            value={pinInputs[p.id] || ''}
                            onChange={(next) =>
                              setPinInputs((prev) => ({
                                ...prev,
                                [p.id]: next.replace(/\D/g, '').slice(0, 4),
                              }))
                            }
                            onSubmit={() => void submitPinValidation(p.id)}
                            submitLabel="Validar PIN y Finalizar Viaje"
                            attemptsInfo={`Intentos fallidos: ${p.intentos_pin}/5`}
                          />
                        )}
                      </div>
                    </div>
                  </article>
                );
              }

              return (
                <article
                  key={p.id}
                  className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono-tabular text-xs text-[#9A7B2C] dark:text-[#E5C158]">
                        {p.codigo} · Retención: {formatSoles(p.comision_retenida_centavos)}
                      </p>
                      <h3 className="font-display text-2xl font-semibold mt-1">{p.item_nombre}</h3>
                      <p className="text-xs text-[#6A717E] dark:text-[#98A0AD] mt-1">
                        Cliente: {p.cliente_nombre} · {p.cliente_telefono}
                      </p>
                      {p.cliente_documento_numero && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-mono-tabular text-emerald-600 dark:text-emerald-400 font-semibold">
                          <BadgeCheck className="w-3.5 h-3.5" /> {p.cliente_documento_tipo || 'DNI'}: {p.cliente_documento_numero}
                        </p>
                      )}
                    </div>
                    <p className="font-mono-tabular text-xl font-semibold shrink-0">
                      {formatSoles(p.monto_centavos)}
                    </p>
                  </div>

                  {p.referido_negocio_id ? (
                    <div className="rounded-xl border border-[#D4AF37]/50 bg-[#D4AF37]/10 p-4 space-y-1">
                      <p className="text-xs font-semibold text-[#9A7B2C] dark:text-[#E5C158]">
                        Reserva referida por {p.referidor_nombre || `Socio #${p.referido_negocio_id}`}
                      </p>
                      <p className="text-xs text-[#555B66] dark:text-[#A3A9B5]">
                        Entrega este PIN al referidor al terminar para que liquide tu comisión:
                      </p>
                      <p className="font-mono-tabular text-2xl font-bold tracking-[0.25em] pt-1">
                        {p.pin_prestador || '----'}
                      </p>
                    </div>
                  ) : p.pin_bloqueado === 1 ? (
                    <p className="text-xs text-[#C81E5B] font-medium">
                      PIN bloqueado tras 5 intentos fallidos. Solo el cliente puede cancelar el pedido.
                    </p>
                  ) : (
                    <PinKeypadCard
                      value={pinInputs[p.id] || ''}
                      onChange={(next) =>
                        setPinInputs((prev) => ({
                          ...prev,
                          [p.id]: next.replace(/\D/g, '').slice(0, 4),
                        }))
                      }
                      onSubmit={() => void submitPinValidation(p.id)}
                      submitLabel="Validar PIN y Cobrar"
                      attemptsInfo={`Intentos fallidos: ${p.intentos_pin}/5`}
                    />
                  )}
                </article>
              );
            })
          )}
        </div>
      )}

      {/* TAB HISTORIAL */}
      {tab === 'HISTORIAL' && (
        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-black/10 dark:border-white/10 text-[#6A717E] dark:text-[#98A0AD]">
              <tr>
                <th className="py-3.5 px-4 font-medium">Código</th>
                <th className="py-3.5 px-4 font-medium">Cliente / Doc.</th>
                <th className="py-3.5 px-4 font-medium">Servicio</th>
                <th className="py-3.5 px-4 font-medium">Estado</th>
                <th className="py-3.5 px-4 font-medium text-right">Monto</th>
                <th className="py-3.5 px-4 font-medium text-right">Comisión</th>
                {session.rubro !== 'TRANSPORTE' && (
                  <th className="py-3.5 px-4 font-medium text-right">Comprobante SUNAT</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/8 dark:divide-white/8">
              {historial.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 px-4 font-mono-tabular">{p.codigo}</td>
                  <td className="py-3 px-4">
                    <div className="font-medium">{p.cliente_nombre}</div>
                    {p.cliente_documento_numero && (
                      <div className="text-[11px] font-mono-tabular text-emerald-600 dark:text-emerald-400">
                        {p.cliente_documento_tipo || 'DNI'}: {p.cliente_documento_numero}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">{p.item_nombre}</td>
                  <td className="py-3 px-4">{ESTADO_LABELS[p.estado]}</td>
                  <td className="py-3 px-4 font-mono-tabular text-right">
                    {formatSoles(p.monto_centavos)}
                  </td>
                  <td className="py-3 px-4 font-mono-tabular text-right">
                    {formatSoles(p.comision_retenida_centavos)}
                  </td>
                  {session.rubro !== 'TRANSPORTE' && (
                    <td className="py-3 px-4 text-right">
                      {p.estado === 'ENTREGADO_PAGADO' ? (
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {p.comprobante_sunat_estado && (
                            <span className="text-[10px] font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-300">
                              {p.comprobante_sunat_estado}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setInvoiceModal({ order: p })}
                            className="min-h-[36px] px-3 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-[11px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>
                              {p.cliente_documento_tipo === 'RUC' ? 'Factura' : 'Boleta / Recibo'}
                            </span>
                          </button>
                          {p.comprobante_sunat_estado !== 'ACEPTADA_SUNAT' && (
                            <button
                              type="button"
                              disabled={sunatSendingId === p.id}
                              onClick={() => void handleEmitirSunat(p.id)}
                              className="min-h-[36px] px-3 rounded-xl border border-emerald-600/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                            >
                              <FileCheck2 className="w-3.5 h-3.5" />
                              <span>
                                {sunatSendingId === p.id ? 'Enviando...' : 'Enviar a SUNAT'}
                              </span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#8A8F99]">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB RESERVAS REFERIDAS */}
      {tab === 'REFERIDOS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateReferral}
            className="lg:col-span-5 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#D4AF37]" />
              <h2 className="font-display text-2xl font-semibold">Reservar Guía para Cliente</h2>
            </div>
            <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
              Reserva un tour verificado para tu pasajero. Al finalizar, ingresa el PIN que te entregará el guía para ganar crédito interno en tu saldo.
            </p>
            <select
              value={refGuiaKey}
              onChange={(e) => setRefGuiaKey(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs"
            >
              {guias.map((g) => (
                <option key={`${g.negocio_id}:${g.servicio_id}`} value={`${g.negocio_id}:${g.servicio_id}`}>
                  {g.negocio_nombre} · {g.nombre} ({formatSoles(g.precio_centavos)})
                </option>
              ))}
            </select>
            <input
              type="text"
              required
              value={refClienteNombre}
              onChange={(e) => setRefClienteNombre(e.target.value)}
              placeholder="Nombre del turista"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
            />
            <input
              type="tel"
              required
              value={refClienteTelefono}
              onChange={(e) => setRefClienteTelefono(e.target.value)}
              placeholder="WhatsApp del turista"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={refFechaHora}
                onChange={(e) => setRefFechaHora(e.target.value)}
                placeholder="Fecha y hora"
                className="min-h-[44px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs"
              />
              <select
                value={refMetodoPago}
                onChange={(e) => setRefMetodoPago(e.target.value as MetodoPago)}
                className="min-h-[44px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs"
              >
                <option value="Efectivo">Efectivo</option>
                <option value="Yape">Yape</option>
                <option value="Plin">Plin</option>
                <option value="Tarjeta">Tarjeta</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Enviar Reserva Referida</span>
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            {referidosPorMi.length === 0 ? (
              <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-10 text-center text-sm text-[#6A717E] dark:text-[#98A0AD]">
                Aún no has referido servicios a otros socios.
              </div>
            ) : (
              referidosPorMi.map((p) => (
                <article
                  key={p.id}
                  className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono-tabular text-xs text-[#9A7B2C] dark:text-[#E5C158]">
                        {p.codigo} · {ESTADO_LABELS[p.estado]}
                      </p>
                      <h3 className="font-display text-xl font-semibold">{p.item_nombre}</h3>
                      <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                        Prestador: {p.prestador_nombre} · Turista: {p.cliente_nombre}
                      </p>
                    </div>
                    <p className="font-mono-tabular text-lg font-semibold">
                      {formatSoles(p.monto_centavos)}
                    </p>
                  </div>

                  {p.estado === 'CONFIRMADO_PREPARACION' && p.pin_bloqueado === 0 && (
                    <form onSubmit={(e) => handleValidatePin(e, p.id)} className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        required
                        value={pinInputs[p.id] || ''}
                        onChange={(e) =>
                          setPinInputs((prev) => ({
                            ...prev,
                            [p.id]: e.target.value.replace(/\D/g, '').slice(0, 4),
                          }))
                        }
                        placeholder="PIN entregado por el prestador"
                        className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] font-mono-tabular text-sm"
                      />
                      <button
                        type="submit"
                        className="min-h-[44px] px-5 rounded-xl bg-[#1FA855] text-white text-xs font-semibold whitespace-nowrap"
                      >
                        Validar y Ganar Crédito
                      </button>
                    </form>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB RUTA COLECTIVO & DESPACHO SOS */}
      {tab === 'RUTAS_SOS' && (
        <div className="space-y-6">
          <ColectivoSeatControl />
          <EmergencyDispatchCenter />
        </div>
      )}

      {/* TAB CONFIGURACIÓN COMPLETA DEL PANEL DEL NEGOCIO */}
      {tab === 'CONFIGURACION' && resumen && (
        <BusinessConfigTab
          negocioId={session.negocioId}
          token={session.token}
          resumen={resumen}
          onRefresh={() => loadWorkspace(true)}
          onFeedback={(msg) => setActionMsg(msg)}
        />
      )}

      {/* TAB GESTION */}
      {tab === 'GESTION' && resumen && (() => {
        const availableUnits = Array.from(
          new Set([
            ...(panelIa?.unidades_medida || []),
            ...(resumen.negocio.modalidades_venta || []),
            ...SALE_MODALITIES,
          ])
        );

        return (
          <div className="space-y-6">
            {panelIa && <AiDynamicToolsBar panelIa={panelIa} />}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 space-y-6">
                {session.rubro !== 'TRANSPORTE' && session.rubro !== 'CASA_CAMBIO' && (
                  <form
                    onSubmit={handleAddService}
                    className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-3.5"
                  >
                    <div>
                      <h2 className="font-display text-2xl font-semibold">
                        {panelIa?.terminologia.catalogoLabel || 'Agregar a mi Catálogo'}
                      </h2>
                      {panelIa && (
                        <p className="text-[11px] text-[#6A717E] dark:text-[#98A0AD]">
                          Formulario adaptado por IA para {panelIa.rubro_titulo}
                        </p>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      value={newServNombre}
                      onChange={(e) => setNewServNombre(e.target.value)}
                      placeholder={
                        panelIa
                          ? `Nombre (${panelIa.terminologia.nuevoItemBtn})`
                          : 'Nombre del producto o servicio'
                      }
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2.5">
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        required
                        value={newServPrecioSoles}
                        onChange={(e) => setNewServPrecioSoles(e.target.value)}
                        placeholder="Precio S/ (ej. 25.00)"
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm font-mono-tabular"
                      />
                      <select
                        value={newServUnidadMedida}
                        onChange={(e) => setNewServUnidadMedida(e.target.value)}
                        className="w-full min-h-[44px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs font-semibold"
                      >
                        {availableUnits.map((mod) => (
                          <option key={mod} value={mod}>
                            Por {mod}
                          </option>
                        ))}
                        <option value="__CUSTOM__">Otra unidad personalizada...</option>
                      </select>
                    </div>

                    {newServUnidadMedida === '__CUSTOM__' && (
                      <input
                        type="text"
                        required
                        value={newServCustomUnidad}
                        onChange={(e) => setNewServCustomUnidad(e.target.value)}
                        placeholder="Escribe la unidad (ej. Pulgada 3/4, Metro lineal, Amperio, Grano)"
                        className="w-full min-h-[40px] px-3.5 rounded-xl border border-[#2563EB]/35 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs"
                      />
                    )}

                    {/* Campos técnicos específicos generados por IA según el rubro */}
                    {panelIa && panelIa.campos_especificos.length > 0 && (
                      <div className="rounded-xl border border-[#2563EB]/25 bg-[#2563EB]/5 p-3 space-y-2.5">
                        <p className="text-[11px] font-bold text-[#1E40AF] dark:text-[#93C5FD]">
                          Especificaciones técnicas ({panelIa.rubro_titulo})
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {panelIa.campos_especificos.map((campo) => (
                            <div key={campo.key}>
                              <label className="block text-[10px] font-semibold text-[#555B66] dark:text-[#CBD5E1] mb-0.5">
                                {campo.label}
                                {campo.unidad ? ` (${campo.unidad})` : ''}
                              </label>
                              {campo.tipo === 'select' && Array.isArray(campo.opciones) && campo.opciones.length > 0 ? (
                                <select
                                  value={newServAtributos[campo.key] || ''}
                                  onChange={(e) =>
                                    setNewServAtributos((prev) => ({
                                      ...prev,
                                      [campo.key]: e.target.value,
                                    }))
                                  }
                                  className="w-full min-h-[36px] px-2.5 rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-[#0B0E14] text-xs"
                                >
                                  <option value="">Seleccionar...</option>
                                  {campo.opciones.map((op) => (
                                    <option key={op} value={op}>
                                      {op}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type={campo.tipo === 'number' ? 'number' : 'text'}
                                  step="any"
                                  value={newServAtributos[campo.key] || ''}
                                  onChange={(e) =>
                                    setNewServAtributos((prev) => ({
                                      ...prev,
                                      [campo.key]: e.target.value,
                                    }))
                                  }
                                  placeholder={campo.placeholder}
                                  className="w-full min-h-[36px] px-2.5 rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-[#0B0E14] text-xs"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <input
                      type="text"
                      value={newServDesc}
                      onChange={(e) => setNewServDesc(e.target.value)}
                      placeholder="Descripción breve o marca"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                    />
                    <button
                      type="submit"
                      className={`w-full min-h-[44px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${roleTheme.primaryBtn}`}
                    >
                      <Plus className="w-4 h-4" />
                      <span>
                        {panelIa?.terminologia.nuevoItemBtn || `Publicar en ${RUBRO_LABELS[session.rubro]}`}
                      </span>
                    </button>
                  </form>
                )}

                {session.rubro !== 'TRANSPORTE' && session.rubro !== 'CASA_CAMBIO' && (
                  <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-5 space-y-3">
                    <h3 className="font-display text-xl font-semibold">
                      Mi Catálogo Activo ({resumen.servicios.length})
                    </h3>
                    {resumen.servicios.length === 0 ? (
                      <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                        Agrega tu primer producto o servicio arriba.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {resumen.servicios.map((s) => (
                          <div
                            key={s.id}
                            className="rounded-xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] p-3 flex items-start justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0 space-y-1">
                              <p className="font-semibold truncate">{s.nombre}</p>
                              <p className="font-mono-tabular text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                                {formatSoles(s.precio_centavos)} / {s.unidad_medida || 'Unidad'} · Stock {s.stock}
                              </p>
                              {s.atributos && Object.keys(s.atributos).length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {Object.entries(s.atributos).map(([k, v]) => (
                                    <span
                                      key={k}
                                      className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-[10px] text-[#555B66] dark:text-[#CBD5E1]"
                                    >
                                      {k}: {v}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleDeleteServiceFromMgmt(s.id)}
                              title="Eliminar del catálogo"
                              className="p-1.5 rounded-lg text-[#C81E5B] hover:bg-[#C81E5B]/10 shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

            {session.rubro === 'CASA_CAMBIO' && resumen.tasas.length > 0 && (
              <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-4">
                <h2 className="font-display text-2xl font-semibold">Mis Tasas de Cambio</h2>
                {resumen.tasas.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold">
                      {t.moneda_origen}/{t.moneda_destino}
                    </span>
                    <span className="font-mono-tabular">
                      Compra {t.tasa_compra.toFixed(3)} · Venta {t.tasa_venta.toFixed(3)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateRate(
                          t.id,
                          Number((t.tasa_compra + 0.005).toFixed(3)),
                          Number((t.tasa_venta + 0.005).toFixed(3))
                        )
                      }
                      className="min-h-[40px] px-3 rounded-lg border border-black/15 dark:border-white/15"
                    >
                      +0.005
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-3">
              <h2 className="font-display text-xl font-semibold">Recargas Solicitadas</h2>
              {resumen.recargas.length === 0 ? (
                <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">Sin recargas registradas.</p>
              ) : (
                resumen.recargas.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-xs py-2 border-b border-black/8 dark:border-white/8 last:border-0"
                  >
                    <div>
                      <p className="font-mono-tabular font-semibold">{r.codigo_operacion}</p>
                      <p className="text-[#6A717E] dark:text-[#98A0AD]">
                        {r.metodo} · {r.estado}
                      </p>
                    </div>
                    <p className="font-mono-tabular font-semibold">{formatSoles(r.monto_centavos)}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Libro de movimientos del negocio */}
          <div className="lg:col-span-7 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-4 overflow-x-auto">
            <h2 className="font-display text-2xl font-semibold">Mis Movimientos Contables</h2>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-black/10 dark:border-white/10 text-[#6A717E] dark:text-[#98A0AD]">
                <tr>
                  <th className="py-2.5 pr-3">Tipo</th>
                  <th className="py-2.5 pr-3">Referencia</th>
                  <th className="py-2.5 pr-3 text-right">Saldo Δ</th>
                  <th className="py-2.5 pr-3 text-right">Retenido Δ</th>
                  <th className="py-2.5 text-right">Saldo Post.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/8 dark:divide-white/8">
                {resumen.movimientos.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2.5 pr-3 font-medium">{m.tipo}</td>
                    <td className="py-2.5 pr-3 font-mono-tabular">{m.referencia}</td>
                    <td className="py-2.5 pr-3 font-mono-tabular text-right">
                      {m.monto_centavos >= 0 ? '+' : ''}
                      {formatSoles(m.monto_centavos)}
                    </td>
                    <td className="py-2.5 pr-3 font-mono-tabular text-right">
                      {m.retenido_delta_centavos >= 0 ? '+' : ''}
                      {formatSoles(m.retenido_delta_centavos)}
                    </td>
                    <td className="py-2.5 font-mono-tabular text-right font-semibold">
                      {formatSoles(m.saldo_posterior_centavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL RECARGA SALDO */}
      {recargaOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Recargar Saldo"
          className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#121620] border border-black/10 dark:border-white/15 chuspa-google-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl font-semibold">Recargar Saldo Prepago</h3>
              <button
                type="button"
                onClick={() => setRecargaOpen(false)}
                aria-label="Cerrar recarga"
                className="min-h-[44px] min-w-[44px] rounded-xl border border-black/10 dark:border-white/10 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
              Envía tu Yape/Plin/Transferencia a La Chuspa (máx. S/ 5,000) e ingresa el código de operación único. El administrador aprobará tu saldo.
            </p>
            <form onSubmit={handleRequestRecharge} className="space-y-3">
              <input
                type="number"
                min="1"
                max="5000"
                step="1"
                required
                value={recargaSoles}
                onChange={(e) => setRecargaSoles(e.target.value)}
                placeholder="Monto en Soles"
                className="w-full min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] font-mono-tabular text-sm"
              />
              <select
                value={recargaMetodo}
                onChange={(e) => setRecargaMetodo(e.target.value as MetodoRecarga)}
                className="w-full min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
              >
                <option value="Yape">Yape</option>
                <option value="Plin">Plin</option>
                <option value="Transferencia">Transferencia Bancaria</option>
              </select>
              <input
                type="text"
                required
                value={recargaOpCode}
                onChange={(e) => setRecargaOpCode(e.target.value)}
                placeholder="Código de operación único (ej. YP-849201)"
                className="w-full min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] font-mono-tabular text-sm uppercase"
              />
              <button
                type="submit"
                className="w-full min-h-[48px] rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-sm font-semibold"
              >
                Registrar Solicitud de Recarga
              </button>
            </form>
          </div>
        </div>
      )}
      {/* MODAL SOLICITUD DE VIAJE MODO CONDUCTOR (ESTILO INDRIVE) */}
      {selectedRideOrder && session.rubro === 'TRANSPORTE' && (() => {
        const unit =
          resumen?.unidades.find((u) => u.id === activeUnitId) || resumen?.unidades[0];
        const oLat = selectedRideOrder.origen_lat ?? -13.5167;
        const oLng = selectedRideOrder.origen_lng ?? -71.9788;
        const dLat = selectedRideOrder.destino_lat ?? -13.5356;
        const dLng = selectedRideOrder.destino_lng ?? -71.9388;
        const drvLat = unit?.lat ?? selectedRideOrder.conductor_lat ?? -13.5174;
        const drvLng = unit?.lng ?? selectedRideOrder.conductor_lng ?? -71.9765;
        const baseCentavos = selectedRideOrder.monto_centavos;
        const offer10 = Math.max(500, Math.round((baseCentavos * 1.1) / 10) * 10);
        const offer20 = Math.max(500, Math.round((baseCentavos * 1.2) / 10) * 10);
        const kmLabel = `${(selectedRideOrder.distancia_km ?? 2.8).toFixed(1)} km`;

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Solicitud de viaje"
            className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
          >
            <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-[#121620] border border-black/15 dark:border-white/15 chuspa-google-border overflow-hidden shadow-2xl max-h-[94vh] flex flex-col">
              <div className="px-5 py-3.5 flex items-center justify-between border-b border-black/10 dark:border-white/10">
                <h3 className="font-display text-xl font-semibold">Solicitud de viaje</h3>
                <button
                  type="button"
                  onClick={() => setSelectedRideOrder(null)}
                  aria-label="Cerrar solicitud de viaje"
                  className="min-h-[40px] min-w-[40px] rounded-xl border border-black/10 dark:border-white/10 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1">
                <CuscoGeoMap
                  mode="TAXI"
                  userLat={oLat}
                  userLng={oLng}
                  originLabel={selectedRideOrder.origen_texto || 'Punto A'}
                  destLat={dLat}
                  destLng={dLng}
                  destLabel={selectedRideOrder.destino_texto || 'Destino B'}
                  driverLat={drvLat}
                  driverLng={drvLng}
                  driverLabel={unit ? `${unit.conductor_nombre} (${unit.placa})` : 'Tu Unidad'}
                  driverEtaBadge={`${selectedRideOrder.eta_min ?? 6} min\n${kmLabel}`}
                  routeBadge={`14 min\n${kmLabel}`}
                  pins={[]}
                  heightClass="h-[240px] sm:h-[280px]"
                />

                <div className="p-5 space-y-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-full bg-[#EFECE6] dark:bg-[#1E2534] border border-black/10 dark:border-white/10 flex items-center justify-center font-display font-bold text-lg shrink-0">
                      {selectedRideOrder.cliente_nombre.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-xs font-mono-tabular text-[#6A717E] dark:text-[#98A0AD]">
                          ~{kmLabel}
                        </span>
                        <span className="font-mono-tabular text-2xl font-extrabold">
                          {formatSoles(baseCentavos)}
                        </span>
                        <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                          Precio justo
                        </span>
                      </div>
                      <p className="text-xs font-semibold">
                        {selectedRideOrder.cliente_nombre}{' '}
                        {selectedRideOrder.cliente_documento_numero && (
                          <span className="font-mono-tabular text-emerald-600 dark:text-emerald-400">
                            · {selectedRideOrder.cliente_documento_tipo || 'DNI'}:{' '}
                            {selectedRideOrder.cliente_documento_numero}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                        Pasajero verificado · Sin facturación electrónica en taxi
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-md bg-[#2563EB] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        A
                      </span>
                      <p className="font-medium leading-snug">
                        {selectedRideOrder.origen_texto || 'Ubicación GPS del pasajero'}
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-md bg-[#16A34A] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        B
                      </span>
                      <p className="text-[#555B66] dark:text-[#A3A9B5] leading-snug">
                        {selectedRideOrder.destino_texto || 'Destino en Cusco'}
                      </p>
                    </div>
                    <div className="pt-1">
                      <span className="inline-block px-2.5 py-0.5 rounded-lg bg-[#B6F02B] text-[#0B0E14] text-xs font-bold">
                        {selectedRideOrder.metodo_pago}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const id = selectedRideOrder.id;
                      setSelectedRideOrder(null);
                      void handleAccept(id);
                    }}
                    className="w-full min-h-[50px] rounded-2xl bg-[#B6F02B] hover:bg-[#a6e01f] text-[#0B0E14] text-base font-extrabold shadow-md"
                  >
                    Aceptar por {formatSoles(baseCentavos)}
                  </button>

                  <div className="space-y-2 pt-1">
                    <p className="text-center text-xs font-semibold text-[#6A717E] dark:text-[#98A0AD]">
                      Ofrece tu tarifa
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSendCounterOffer(selectedRideOrder.id, offer10)}
                        className="min-h-[44px] rounded-xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] font-mono-tabular text-sm font-bold hover:border-[#B6F02B]"
                      >
                        {formatSoles(offer10)}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSendCounterOffer(selectedRideOrder.id, offer20)}
                        className="min-h-[44px] rounded-xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] font-mono-tabular text-sm font-bold hover:border-[#B6F02B]"
                      >
                        {formatSoles(offer20)}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomCounterOpen((v) => !v);
                          setCustomCounterSoles(((baseCentavos + 200) / 100).toFixed(2));
                        }}
                        aria-label="Editar contraoferta personalizada"
                        className="min-h-[44px] rounded-xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] flex items-center justify-center hover:border-[#B6F02B]"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>

                    {customCounterOpen && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const centavos = Math.round((Number(customCounterSoles) || 0) * 100);
                          if (centavos >= 500) {
                            void handleSendCounterOffer(selectedRideOrder.id, centavos);
                          }
                        }}
                        className="flex gap-2 pt-1"
                      >
                        <input
                          type="number"
                          min="5"
                          step="0.5"
                          required
                          value={customCounterSoles}
                          onChange={(e) => setCustomCounterSoles(e.target.value)}
                          placeholder="Monto S/"
                          className="flex-1 min-h-[42px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] font-mono-tabular text-sm"
                        />
                        <button
                          type="submit"
                          className="min-h-[42px] px-4 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-bold whitespace-nowrap"
                        >
                          Enviar oferta
                        </button>
                      </form>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedRideOrder(null)}
                    className="w-full min-h-[46px] rounded-2xl bg-[#EFECE6] dark:bg-[#0B0E14] text-sm font-bold"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL POPUP SOLICITUD DE PEDIDO (NEGOCIOS NO-TAXI) */}
      {selectedBizOrder && session.rubro !== 'TRANSPORTE' && (() => {
        const bizLat = resumen?.negocio.lat ?? -13.5167;
        const bizLng = resumen?.negocio.lng ?? -71.9788;
        const orderLat = selectedBizOrder.origen_lat ?? bizLat + 0.0028;
        const orderLng = selectedBizOrder.origen_lng ?? bizLng + 0.0028;
        const comprobanteLabel =
          (selectedBizOrder.cliente_documento_tipo || 'DNI') === 'RUC'
            ? 'Factura Electrónica (RUC 11 dígitos)'
            : 'Boleta de Venta Electrónica';

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Detalle del pedido entrante"
            className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
          >
            <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-[#121620] border border-black/15 dark:border-white/15 chuspa-google-border overflow-hidden shadow-2xl max-h-[94vh] flex flex-col">
              <div className="px-5 py-3.5 flex items-center justify-between border-b border-black/10 dark:border-white/10">
                <div>
                  <p className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#9A7B2C] dark:text-[#E5C158]">
                    {selectedBizOrder.codigo} · {selectedBizOrder.metodo_pago}
                  </p>
                  <h3 className="font-display text-xl font-semibold">Pedido entrante del cliente</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBizOrder(null)}
                  aria-label="Cerrar pedido entrante"
                  className="min-h-[40px] min-w-[40px] rounded-xl border border-black/10 dark:border-white/10 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1">
                <CuscoGeoMap
                  mode="MARKET"
                  userLat={orderLat}
                  userLng={orderLng}
                  originLabel={`Cliente: ${selectedBizOrder.cliente_nombre}`}
                  destLat={bizLat}
                  destLng={bizLng}
                  destLabel={resumen?.negocio.nombre || 'Tu local'}
                  pins={[
                    {
                      id: `popup-biz-${selectedBizOrder.id}`,
                      lat: orderLat,
                      lng: orderLng,
                      priceText: formatSoles(selectedBizOrder.monto_centavos),
                      sublabel: selectedBizOrder.cliente_nombre,
                      detailTitle: selectedBizOrder.item_nombre,
                      tier: 'cheapest',
                      kind: 'MARKET',
                      isOpen: true,
                    },
                  ]}
                  heightClass="h-[210px] sm:h-[250px]"
                />

                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-display text-2xl font-semibold">{selectedBizOrder.item_nombre}</h4>
                      <p className="text-xs text-[#6A717E] dark:text-[#98A0AD] mt-1">
                        {selectedBizOrder.transcripcion}
                      </p>
                    </div>
                    <p className="font-mono-tabular text-2xl font-extrabold shrink-0 text-[#1FA855]">
                      {formatSoles(selectedBizOrder.monto_centavos)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] p-4 space-y-1.5 text-xs">
                    <p className="font-semibold">
                      Titular: {selectedBizOrder.cliente_nombre}
                    </p>
                    {selectedBizOrder.cliente_documento_numero && (
                      <p className="font-mono-tabular text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1.5">
                        <BadgeCheck className="w-4 h-4 shrink-0" />
                        <span>
                          {selectedBizOrder.cliente_documento_tipo || 'DNI'}: {selectedBizOrder.cliente_documento_numero}
                          {selectedBizOrder.cliente_documento_verificado ? ' · Verificado RENIEC/SUNAT' : ''}
                        </span>
                      </p>
                    )}
                    {selectedBizOrder.cliente_direccion_fiscal && (
                      <p className="text-[#555B66] dark:text-[#A3A9B5]">
                        Dirección fiscal: {selectedBizOrder.cliente_direccion_fiscal}
                      </p>
                    )}
                    <p className="text-[#9A7B2C] dark:text-[#E5C158] font-medium">
                      Comprobante al finalizar: {comprobanteLabel}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const id = selectedBizOrder.id;
                        setSelectedBizOrder(null);
                        void handleReject(id);
                      }}
                      className="flex-1 min-h-[48px] rounded-2xl border border-[#C81E5B]/45 text-[#C81E5B] text-sm font-bold flex items-center justify-center gap-1.5"
                    >
                      <X className="w-4 h-4" />
                      <span>Rechazar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const id = selectedBizOrder.id;
                        setSelectedBizOrder(null);
                        void handleAccept(id);
                      }}
                      className="flex-1 min-h-[48px] rounded-2xl bg-[#1FA855] text-white text-sm font-bold flex items-center justify-center gap-1.5 shadow-md"
                    >
                      <Check className="w-4 h-4" />
                      <span>Aceptar Pedido</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL COMPROBANTE ELECTRÓNICO (SOLO NEGOCIOS NO-TAXI) */}
      {invoiceModal && session.rubro !== 'TRANSPORTE' && (
        <ElectronicInvoiceModal
          order={invoiceModal.order}
          comprobante={invoiceModal.comprobante}
          onClose={() => setInvoiceModal(null)}
        />
      )}
    </div>
  );
};
