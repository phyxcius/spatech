import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  KeyRound,
  LogOut,
  Plus,
  Power,
  RefreshCw,
  Send,
  Settings,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch, ApiError, playLuxuryChime, speakSpanish } from '../lib/api.ts';
import {
  ESTADO_LABELS,
  formatSoles,
  RUBRO_LABELS,
  type DirectorioNegocio,
  type MetodoPago,
  type MetodoRecarga,
  type PedidoNegocio,
  type Rubro,
} from '../types.ts';
import { BusinessConfigTab } from './BusinessConfigTab.tsx';
import {
  ColectivoSeatControl,
  EmergencyDispatchCenter,
  PinKeypadCard,
} from './DispatchAndRouteModules.tsx';

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
    precio_centavos: number;
    stock: number;
    disponible: number;
  }>;
  unidades: Array<{
    id: number;
    conductor_nombre: string;
    placa: string;
    modelo: string;
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
}

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

  // Registro de nuevo negocio multirubro
  const [regRubro, setRegRubro] = useState<Rubro>('RESTAURANTE');
  const [regNombre, setRegNombre] = useState('');
  const [regTelefono, setRegTelefono] = useState('');
  const [regZona, setRegZona] = useState('Centro Histórico, Cusco');
  const [regPin, setRegPin] = useState('');

  const [tab, setTab] = useState<BizTab>('NUEVOS');
  const [resumen, setResumen] = useState<ResumenData | null>(null);
  const [pedidos, setPedidos] = useState<PedidoNegocio[]>([]);
  const [pinInputs, setPinInputs] = useState<Record<number, string>>({});
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevPendingCountRef = useRef<number>(0);

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
    if (!session) return;
    loadWorkspace(true);
    const id = setInterval(() => loadWorkspace(true), 6000);
    return () => clearInterval(id);
  }, [session?.negocioId, session?.token]);

  async function loadWorkspace(silent = false) {
    if (!session) return;
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
        setResumen({
          ...resRes,
          movimientos: Array.isArray(resRes.movimientos) ? resRes.movimientos : [],
          recargas: Array.isArray(resRes.recargas) ? resRes.recargas : [],
          servicios: Array.isArray(resRes.servicios) ? resRes.servicios : [],
          unidades: Array.isArray(resRes.unidades) ? resRes.unidades : [],
          tasas: Array.isArray(resRes.tasas) ? resRes.tasas : [],
        });
      }
      const nextPedidos = Array.isArray(pedRes?.pedidos) ? pedRes.pedidos : [];
      const nextGuias = Array.isArray(guiasRes?.guias) ? guiasRes.guias : [];
      setPedidos(nextPedidos);
      setGuias(nextGuias);
      if (nextGuias.length > 0 && !refGuiaKey) {
        const g = nextGuias[0];
        setRefGuiaKey(`${g.negocio_id}:${g.servicio_id}`);
      }

      const pendingCount = nextPedidos.filter(
        (p) => p.estado === 'PENDIENTE_CONFIRMACION' && p.negocio_id === session.negocioId
      ).length;
      if (soundEnabled && pendingCount > prevPendingCountRef.current) {
        playLuxuryChime();
        if (resRes.negocio.alerta_voz_activa !== false) {
          const newest = nextPedidos.find(
            (p) => p.estado === 'PENDIENTE_CONFIRMACION' && p.negocio_id === session.negocioId
          );
          if (newest) {
            speakSpanish(
              `Nuevo pedido para ${resRes.negocio.nombre}: ${newest.item_nombre}, por ${(
                newest.monto_centavos / 100
              ).toFixed(2)} soles.`
            );
          }
        }
      }
      prevPendingCountRef.current = pendingCount;
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

  async function handleRegisterBusiness(e: React.FormEvent) {
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
      }>('/api/public/negocios/registro', {
        method: 'POST',
        body: {
          rubro: regRubro,
          nombre: regNombre,
          telefono: regTelefono,
          zona: regZona,
          pin: regPin,
        },
      });
      setSession({
        token: res.token,
        negocioId: res.negocio.id,
        nombre: res.negocio.nombre,
        codigo: res.negocio.codigo,
        rubro: res.negocio.rubro,
      });
      setTab('CONFIGURACION');
      setActionMsg({
        type: 'ok',
        text: `¡Negocio registrado! Tu código de acceso es ${res.negocio.codigo}. Configura ahora tus horarios, tarifas y catálogo.`,
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
      setActionMsg({ type: 'ok', text: 'Pedido aceptado. Comisión retenida en garantía.' });
      await loadWorkspace(true);
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

  async function submitPinValidation(pedidoId: number) {
    if (!session) return;
    setActionMsg(null);
    try {
      const res = await apiFetch<{ puntos_otorgados: number }>(
        `/api/negocio/${session.negocioId}/pedidos/${pedidoId}/entregar`,
        {
          method: 'POST',
          body: { pin: pinInputs[pedidoId] || '' },
          token: session.token,
        }
      );
      setActionMsg({
        type: 'ok',
        text: `PIN validado. Servicio completado y liquidado (+${res.puntos_otorgados} pts al cliente).`,
      });
      setPinInputs((prev) => ({ ...prev, [pedidoId]: '' }));
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
    try {
      await apiFetch(`/api/negocio/${session.negocioId}/servicios`, {
        method: 'POST',
        body: {
          nombre: newServNombre,
          descripcion: newServDesc,
          precio_centavos: Math.round((Number(newServPrecioSoles) || 0) * 100),
          stock: 20,
          duracion_min: 45,
        },
        token: session.token,
      });
      setNewServNombre('');
      setNewServPrecioSoles('');
      setNewServDesc('');
      setActionMsg({ type: 'ok', text: 'Servicio agregado a tu catálogo.' });
      await loadWorkspace(true);
    } catch (err) {
      setActionMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error agregando servicio',
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
      <div className="max-w-lg mx-auto py-8 pb-24">
        <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 sm:p-8 space-y-6">
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
            <form onSubmit={handleRegisterBusiness} className="space-y-3.5">
              <div>
                <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
                  Rubro del negocio
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
              <input
                type="text"
                required
                value={regNombre}
                onChange={(e) => setRegNombre(e.target.value)}
                placeholder="Nombre comercial (ej. Taxis Imperiales Cusco)"
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
              <button
                type="submit"
                className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold"
              >
                Crear y Configurar Mi Panel
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

  return (
    <div className="space-y-6 pb-24 md:pb-12">
      {/* Cabecera financiera del negocio */}
      <section className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[#9A7B2C] dark:text-[#E5C158] font-medium">
              {session.codigo} · {RUBRO_LABELS[session.rubro]}
            </p>
            <h1 className="font-display text-3xl font-semibold">{session.nombre}</h1>
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
              onClick={() => loadWorkspace(false)}
              className="min-h-[44px] px-3.5 rounded-xl border border-black/10 dark:border-white/10 text-xs flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Actualizar</span>
            </button>
            <button
              type="button"
              onClick={() => setRecargaOpen(true)}
              className="min-h-[44px] px-4 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-semibold flex items-center gap-1.5"
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
            <div className="p-4 rounded-2xl bg-[#F8F7F4] dark:bg-[#0B0E14]">
              <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">Saldo Total</p>
              <p className="font-mono-tabular text-2xl font-semibold mt-1">
                {formatSoles(resumen.negocio.saldo)}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-[#F8F7F4] dark:bg-[#0B0E14]">
              <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">Retenido en Curso</p>
              <p className="font-mono-tabular text-2xl font-semibold mt-1 text-[#D97706]">
                {formatSoles(resumen.negocio.saldo_retenido)}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-[#F8F7F4] dark:bg-[#0B0E14]">
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
                  ? 'bg-[#14213D] text-white border-[#14213D] dark:bg-[#D4AF37] dark:text-[#0B0E14] dark:border-[#D4AF37]'
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

      {/* TAB NUEVOS */}
      {tab === 'NUEVOS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {nuevos.length === 0 ? (
            <div className="md:col-span-2 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-10 text-center text-sm text-[#6A717E] dark:text-[#98A0AD]">
              No hay solicitudes nuevas en este momento. Solo recibes pedidos de tu categoría ({RUBRO_LABELS[session.rubro]}).
            </div>
          ) : (
            nuevos.map((p) => (
              <article
                key={p.id}
                className="rounded-2xl border border-[#D4AF37]/40 bg-white dark:bg-[#121620] p-6 space-y-4"
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
                  </div>
                  <p className="font-mono-tabular text-xl font-semibold shrink-0">
                    {formatSoles(p.monto_centavos)}
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleReject(p.id)}
                    className="flex-1 min-h-[48px] rounded-xl border border-[#C81E5B]/40 text-[#C81E5B] text-sm font-semibold flex items-center justify-center gap-1.5"
                  >
                    <X className="w-4 h-4" />
                    <span>Rechazar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAccept(p.id)}
                    className="flex-1 min-h-[48px] rounded-xl bg-[#1FA855] text-white text-sm font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Aceptar</span>
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {/* TAB EN CURSO */}
      {tab === 'EN_CURSO' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {enCurso.length === 0 ? (
            <div className="md:col-span-2 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-10 text-center text-sm text-[#6A717E] dark:text-[#98A0AD]">
              Sin servicios en curso.
            </div>
          ) : (
            enCurso.map((p) => (
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
            ))
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
                <th className="py-3.5 px-4 font-medium">Servicio</th>
                <th className="py-3.5 px-4 font-medium">Estado</th>
                <th className="py-3.5 px-4 font-medium text-right">Monto</th>
                <th className="py-3.5 px-4 font-medium text-right">Comisión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/8 dark:divide-white/8">
              {historial.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 px-4 font-mono-tabular">{p.codigo}</td>
                  <td className="py-3 px-4">{p.item_nombre}</td>
                  <td className="py-3 px-4">{ESTADO_LABELS[p.estado]}</td>
                  <td className="py-3 px-4 font-mono-tabular text-right">
                    {formatSoles(p.monto_centavos)}
                  </td>
                  <td className="py-3 px-4 font-mono-tabular text-right">
                    {formatSoles(p.comision_retenida_centavos)}
                  </td>
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
      {tab === 'GESTION' && resumen && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-6">
            {session.rubro !== 'TRANSPORTE' && session.rubro !== 'CASA_CAMBIO' && (
              <form
                onSubmit={handleAddService}
                className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-3"
              >
                <h2 className="font-display text-2xl font-semibold">Agregar a mi Catálogo</h2>
                <input
                  type="text"
                  required
                  value={newServNombre}
                  onChange={(e) => setNewServNombre(e.target.value)}
                  placeholder="Nombre del producto o servicio"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                />
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  required
                  value={newServPrecioSoles}
                  onChange={(e) => setNewServPrecioSoles(e.target.value)}
                  placeholder="Precio en Soles (ej. 85)"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm font-mono-tabular"
                />
                <input
                  type="text"
                  value={newServDesc}
                  onChange={(e) => setNewServDesc(e.target.value)}
                  placeholder="Descripción breve"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
                />
                <button
                  type="submit"
                  className="w-full min-h-[44px] rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Publicar en {RUBRO_LABELS[session.rubro]}</span>
                </button>
              </form>
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
      )}

      {/* MODAL RECARGA SALDO */}
      {recargaOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Recargar Saldo"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#121620] border border-black/10 dark:border-white/15 p-6 space-y-4">
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
    </div>
  );
};
