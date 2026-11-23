import React, { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  KeyRound,
  LockOpen,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api.ts';
import { subscribeFirebaseRtdbPath } from '../lib/firebaseRtdb.ts';
import { emitCenterNotification } from '../lib/notifications.ts';
import {
  formatPeruLookupError,
  type PeruDocumentLookupResult,
} from '../lib/peruDocs.ts';
import {
  BUSINESS_CATEGORIES,
  formatSoles,
  RUBRO_LABELS,
  SALE_MODALITIES,
  type EstadoRegla,
  type Rubro,
} from '../types.ts';

type AdminTab = 'RECARGAS' | 'LIBRO' | 'COMISIONES' | 'NEGOCIOS' | 'ALERTAS';

interface AdminPanelData {
  recargas: Array<{
    id: number;
    negocio_id: number;
    negocio_nombre: string;
    negocio_codigo: string;
    rubro: Rubro;
    monto_centavos: number;
    metodo: string;
    codigo_operacion: string;
    estado: string;
    motivo_rechazo: string | null;
    created_at: string;
  }>;
  negocios: Array<{
    id: number;
    codigo: string;
    rubro: Rubro;
    nombre: string;
    telefono: string;
    activo: number;
    estado_regla?: EstadoRegla;
    motivo_estado?: string | null;
    tipo_persona?: 'NATURAL' | 'JURIDICA';
    documento_tipo?: 'DNI' | 'RUC';
    documento_numero?: string;
    razon_social?: string;
    tipo_negocio?: string;
    modalidades_venta?: string[];
    saldo: number;
    saldo_retenido: number;
    saldo_libre: number;
    bloqueado: boolean;
  }>;
  reglas_comision: Array<{
    rubro: Rubro;
    porcentaje_plataforma: number;
    porcentaje_referido: number;
  }>;
  unidades: Array<{
    id: number;
    negocio_nombre: string;
    conductor_nombre: string;
    placa: string;
    modelo: string;
    certificada: number;
  }>;
  emergencias: Array<{
    id: number;
    codigo: string;
    cliente_nombre: string;
    cliente_telefono: string;
    ubicacion_texto: string;
    mensaje: string;
    entidad_objetivo?: string;
    estado: string;
    atendida_por: string | null;
    created_at: string;
  }>;
  partners: Array<{
    id: number;
    codigo: string;
    nombre: string;
    porcentaje_comision: number;
    pedidos_atribuidos: number;
    comision_acumulada_centavos: number;
  }>;
  auditoria: {
    cuadra: boolean;
    ingresos_plataforma_centavos: number;
    verificacion_negocios: Array<{
      negocio_id: number;
      codigo: string;
      nombre: string;
      saldo_cache: number;
      saldo_libro: number;
      retenido_cache: number;
      retenido_libro: number;
      cuadra: boolean;
    }>;
    movimientos: Array<{
      id: number;
      cuenta_tipo: string;
      negocio_nombre: string | null;
      tipo: string;
      monto_centavos: number;
      retenido_delta_centavos: number;
      saldo_posterior_centavos: number;
      referencia: string;
      motivo: string | null;
      created_at: string;
    }>;
  };
}

export const AdminPanel: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [requiresClaim, setRequiresClaim] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [tab, setTab] = useState<AdminTab>('RECARGAS');
  const [data, setData] = useState<AdminPanelData | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Rechazo motivo y motivos de regla de negocio
  const [rejectMotivos, setRejectMotivos] = useState<Record<number, string>>({});
  const [estadoMotivos, setEstadoMotivos] = useState<Record<number, string>>({});

  // Ajuste manual
  const [adjNegId, setAdjNegId] = useState<number>(1);
  const [adjSoles, setAdjSoles] = useState('');
  const [adjMotivo, setAdjMotivo] = useState('');

  // Registro nuevo negocio con RUC/DNI + categoría + modalidades
  const [newNegRubro, setNewNegRubro] = useState<Rubro>('RESTAURANTE');
  const [newNegTipoPersona, setNewNegTipoPersona] = useState<'NATURAL' | 'JURIDICA'>('JURIDICA');
  const [newNegDocNumero, setNewNegDocNumero] = useState('');
  const [newNegRazonSocial, setNewNegRazonSocial] = useState('');
  const [newNegDocVerified, setNewNegDocVerified] = useState<PeruDocumentLookupResult | null>(null);
  const [newNegDocLoading, setNewNegDocLoading] = useState(false);
  const [newNegTipoNegocio, setNewNegTipoNegocio] = useState<string>(BUSINESS_CATEGORIES[0]);
  const [newNegModalidades, setNewNegModalidades] = useState<string[]>(['Unidad', 'Kilo']);
  const [newNegNombre, setNewNegNombre] = useState('');
  const [newNegTel, setNewNegTel] = useState('');
  const [newNegZona, setNewNegZona] = useState('Plaza de Armas, Cusco');
  const [createdPinOnce, setCreatedPinOnce] = useState<{ nombre: string; codigo: string; pin: string } | null>(null);

  // Nuevo partner
  const [partnerCode, setPartnerCode] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [partnerPct, setPartnerPct] = useState('10');

  const seenRechargeIdsRef = useRef<Set<number>>(new Set());
  const seenSosIdsRef = useRef<Set<number>>(new Set());
  const seededAdminRef = useRef(false);

  useEffect(() => {
    apiFetch<{ configured: boolean; requires_claim: boolean }>('/api/admin/bootstrap-status')
      .then((res) => setRequiresClaim(res.requires_claim))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) {
      seededAdminRef.current = false;
      seenRechargeIdsRef.current.clear();
      seenSosIdsRef.current.clear();
      return;
    }
    void loadPanel();
    const id = setInterval(() => void loadPanel(), 4000);
    const unsubRec = subscribeFirebaseRtdbPath('recargas', () => void loadPanel());
    const unsubSos = subscribeFirebaseRtdbPath('emergencias', () => void loadPanel());
    return () => {
      clearInterval(id);
      unsubRec();
      unsubSos();
    };
  }, [token]);

  async function loadPanel() {
    if (!token) return;
    const t0 = performance.now();
    try {
      const res = await apiFetch<AdminPanelData>('/api/admin/panel', { token });
      const safeRecargas = Array.isArray(res.recargas) ? res.recargas : [];
      const safeNegocios = Array.isArray(res.negocios) ? res.negocios : [];
      const safeEmergencias = Array.isArray(res.emergencias) ? res.emergencias : [];
      setData({
        ...res,
        recargas: safeRecargas,
        negocios: safeNegocios,
        reglas_comision: Array.isArray(res.reglas_comision) ? res.reglas_comision : [],
        unidades: Array.isArray(res.unidades) ? res.unidades : [],
        emergencias: safeEmergencias,
        partners: Array.isArray(res.partners) ? res.partners : [],
      });
      if (safeNegocios.length > 0 && !safeNegocios.some((n) => n.id === adjNegId)) {
        setAdjNegId(safeNegocios[0].id);
      }

      const pendingRec = safeRecargas.filter((r) => r.estado === 'PENDIENTE');
      const activeSos = safeEmergencias.filter((e) => e.estado === 'ACTIVA');
      if (!seededAdminRef.current) {
        seededAdminRef.current = true;
        seenRechargeIdsRef.current = new Set(pendingRec.map((r) => r.id));
        seenSosIdsRef.current = new Set(activeSos.map((e) => e.id));
      } else {
        const ms = Math.max(1, Math.round(performance.now() - t0));
        for (const r of pendingRec) {
          if (!seenRechargeIdsRef.current.has(r.id)) {
            emitCenterNotification({
              id: `admin-rec-${r.id}`,
              title: `Nueva Recarga Pendiente · ${r.negocio_nombre}`,
              subtitle: `${formatSoles(r.monto_centavos)} · ${r.metodo} (${r.codigo_operacion})`,
              detail: 'Lista para verificación y aprobación contable en Panel Admin.',
              tone: 'ai',
              responseMs: ms,
            });
          }
        }
        for (const e of activeSos) {
          if (!seenSosIdsRef.current.has(e.id)) {
            emitCenterNotification({
              id: `admin-sos-${e.id}`,
              title: `🚨 Nueva Alerta SOS · ${e.codigo}`,
              subtitle: `${e.cliente_nombre} · ${e.ubicacion_texto}`,
              detail: e.mensaje,
              tone: 'emergency',
              responseMs: ms,
            });
          }
        }
        seenRechargeIdsRef.current = new Set(pendingRec.map((r) => r.id));
        seenSosIdsRef.current = new Set(activeSos.map((e) => e.id));
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        setAuthError('Sesión de administrador expirada.');
      }
    }
  }

  async function handleAdminAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    try {
      const endpoint = requiresClaim ? '/api/admin/bootstrap-claim' : '/api/admin/login';
      const res = await apiFetch<{ token: string }>(endpoint, {
        method: 'POST',
        body: { pin: pinInput },
      });
      setToken(res.token);
      setRequiresClaim(false);
      setPinInput('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Error de autenticación');
    }
  }

  async function handleApproveRecharge(id: number) {
    if (!token) return;
    setStatusMsg(null);
    try {
      await apiFetch(`/api/admin/recargas/${id}/aprobar`, { method: 'POST', body: {}, token });
      setStatusMsg({ type: 'ok', text: 'Recarga aprobada y acreditada en el libro contable.' });
      await loadPanel();
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Error aprobando recarga' });
    }
  }

  async function handleRejectRecharge(id: number) {
    if (!token) return;
    setStatusMsg(null);
    try {
      await apiFetch(`/api/admin/recargas/${id}/rechazar`, {
        method: 'POST',
        body: { motivo: rejectMotivos[id] || 'Comprobante no verificado' },
        token,
      });
      setStatusMsg({ type: 'ok', text: 'Recarga rechazada.' });
      await loadPanel();
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Error rechazando' });
    }
  }

  async function handleAdjustBalance(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setStatusMsg(null);
    try {
      const deltaCentavos = Math.round((Number(adjSoles) || 0) * 100);
      await apiFetch('/api/admin/ajustes-saldo', {
        method: 'POST',
        body: { negocio_id: adjNegId, delta_centavos: deltaCentavos, motivo: adjMotivo },
        token,
      });
      setAdjSoles('');
      setAdjMotivo('');
      setStatusMsg({ type: 'ok', text: 'Ajuste manual registrado en el libro contable.' });
      await loadPanel();
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Error en ajuste' });
    }
  }

  async function handleUpdateRule(rubro: Rubro, plat: number, ref: number) {
    if (!token) return;
    setStatusMsg(null);
    try {
      await apiFetch(`/api/admin/reglas-comision/${rubro}`, {
        method: 'PUT',
        body: { porcentaje_plataforma: plat, porcentaje_referido: ref },
        token,
      });
      setStatusMsg({ type: 'ok', text: `Regla de comisión para ${RUBRO_LABELS[rubro]} actualizada.` });
      await loadPanel();
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Error actualizando regla' });
    }
  }

  async function handleLookupNewNegDoc() {
    const docTipo = newNegTipoPersona === 'NATURAL' ? 'DNI' : 'RUC';
    const clean = newNegDocNumero.replace(/\D/g, '');
    setStatusMsg(null);
    if (!clean) {
      setStatusMsg({ type: 'err', text: `Ingresa el ${docTipo} para validar con RENIEC/SUNAT.` });
      return;
    }
    setNewNegDocLoading(true);
    try {
      const res = await apiFetch<PeruDocumentLookupResult>(
        `/api/public/consulta-documento?tipo=${docTipo}&numero=${encodeURIComponent(clean)}`
      );
      setNewNegDocVerified(res);
      if (res.nombre_completo) {
        setNewNegRazonSocial(res.nombre_completo);
        if (!newNegNombre.trim()) setNewNegNombre(res.nombre_completo);
      }
      setStatusMsg({ type: 'ok', text: `${res.tipo} ${res.numero} verificado (${res.fuente}).` });
    } catch (err) {
      setNewNegDocVerified(null);
      setStatusMsg({ type: 'err', text: formatPeruLookupError(err) });
    } finally {
      setNewNegDocLoading(false);
    }
  }

  async function handleCreateBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setStatusMsg(null);
    const docTipo = newNegTipoPersona === 'NATURAL' ? 'DNI' : 'RUC';
    try {
      const res = await apiFetch<{
        negocio: { nombre: string; codigo: string };
        pin_inicial: string;
      }>('/api/admin/negocios', {
        method: 'POST',
        body: {
          rubro: newNegRubro,
          nombre: newNegNombre,
          telefono: newNegTel,
          zona: newNegZona,
          tipo_persona: newNegTipoPersona,
          documento_tipo: docTipo,
          documento_numero: newNegDocNumero.replace(/\D/g, ''),
          razon_social: newNegRazonSocial || newNegNombre,
          tipo_negocio: newNegTipoNegocio,
          modalidades_venta: newNegModalidades,
        },
        token,
      });
      setCreatedPinOnce({
        nombre: res.negocio.nombre,
        codigo: res.negocio.codigo,
        pin: res.pin_inicial,
      });
      setNewNegNombre('');
      setNewNegTel('');
      setNewNegDocNumero('');
      setNewNegRazonSocial('');
      setNewNegDocVerified(null);
      await loadPanel();
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Error creando negocio' });
    }
  }

  async function handleChangeBusinessEstado(
    negocioId: number,
    negocioNombre: string,
    estadoRegla: EstadoRegla
  ) {
    if (!token) return;
    setStatusMsg(null);
    const motivo = (estadoMotivos[negocioId] || '').trim();
    const defaultMotivo =
      estadoRegla === 'ACTIVO'
        ? 'Cumplimiento verificado y habilitado'
        : estadoRegla === 'INCUMPLIMIENTO'
        ? 'Incumplimiento de tiempos o condiciones del servicio'
        : 'Reporte crítico por estafa o cobro irregular';
    try {
      await apiFetch(`/api/admin/negocios/${negocioId}/estado`, {
        method: 'PATCH',
        body: {
          activo: estadoRegla === 'ACTIVO',
          estado_regla: estadoRegla,
          motivo_estado: motivo || defaultMotivo,
        },
        token,
      });
      setStatusMsg({
        type: 'ok',
        text: `${negocioNombre} actualizado a ${estadoRegla}.`,
      });
      emitCenterNotification({
        id: `admin-rule-${negocioId}-${estadoRegla}-${Date.now()}`,
        title: `Estado Regla: ${estadoRegla}`,
        subtitle: negocioNombre,
        detail: motivo || defaultMotivo,
        tone: estadoRegla === 'ACTIVO' ? 'success' : estadoRegla === 'INCUMPLIMIENTO' ? 'warning' : 'emergency',
      });
      await loadPanel();
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error cambiando estado del negocio',
      });
    }
  }

  async function handleCreatePartner(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      await apiFetch('/api/admin/partners', {
        method: 'POST',
        body: {
          codigo: partnerCode,
          nombre: partnerName,
          porcentaje_comision: Number(partnerPct) || 10,
        },
        token,
      });
      setPartnerCode('');
      setPartnerName('');
      setStatusMsg({ type: 'ok', text: 'Promotor creado correctamente.' });
      await loadPanel();
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Error creando promotor' });
    }
  }

  if (!token) {
    return (
      <div className="max-w-md mx-auto py-8 pb-24">
        <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 sm:p-8 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#9A7B2C] dark:text-[#D4AF37]">
              Tesorería & Auditoría
            </p>
            <h1 className="font-display text-3xl font-semibold mt-1">
              {requiresClaim ? 'Configurar PIN Maestro' : 'Administrador La Chuspa'}
            </h1>
            <p className="text-xs text-[#6A717E] dark:text-[#98A0AD] mt-1">
              {requiresClaim
                ? 'Primer arranque en vista previa: define tu PIN maestro de administración (mínimo 4 caracteres).'
                : 'Ingresa el PIN maestro de administración para auditar el libro contable y aprobar recargas.'}
            </p>
          </div>

          {authError && (
            <div className="rounded-xl border border-[#C81E5B]/40 bg-[#C81E5B]/10 px-4 py-3 text-xs text-[#C81E5B]">
              {authError}
            </div>
          )}

          <form onSubmit={handleAdminAuth} className="space-y-4">
            <div className="relative">
              <KeyRound className="w-4 h-4 text-[#8A8F99] absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder={requiresClaim ? 'Define nuevo PIN maestro' : 'PIN maestro'}
                className="w-full min-h-[48px] pl-10 pr-4 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm font-mono-tabular"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-sm font-semibold"
            >
              {requiresClaim ? 'Guardar PIN Maestro e Ingresar' : 'Ingresar a Administración'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-12">
      {/* Cabecera Admin */}
      <section className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#9A7B2C] dark:text-[#D4AF37]">
              Control Central · La Chuspa HQ
            </p>
            <h1 className="font-display text-3xl font-semibold mt-0.5">
              Tesorería, Comisiones & Auditoría
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadPanel}
              className="min-h-[44px] px-3.5 rounded-xl border border-black/10 dark:border-white/10 text-xs flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Actualizar</span>
            </button>
            <button
              type="button"
              onClick={() => setToken(null)}
              className="min-h-[44px] px-3.5 rounded-xl border border-black/10 dark:border-white/10 text-xs text-[#C81E5B] flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>

        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-black/8 dark:border-white/8">
            <div className="p-4 rounded-2xl bg-[#F8F7F4] dark:bg-[#0B0E14]">
              <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">Cuadre del Libro Contable</p>
              <p
                className={`text-lg font-semibold mt-1 flex items-center gap-2 ${
                  data.auditoria.cuadra ? 'text-[#1FA855]' : 'text-[#C81E5B]'
                }`}
              >
                <ShieldCheck className="w-5 h-5" />
                <span>{data.auditoria.cuadra ? 'Cuadre Verificado (100%)' : 'Descuadre Detectado'}</span>
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-[#F8F7F4] dark:bg-[#0B0E14]">
              <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">Ingreso Neto Plataforma</p>
              <p className="font-mono-tabular text-2xl font-semibold mt-1">
                {formatSoles(data.auditoria.ingresos_plataforma_centavos)}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-[#F8F7F4] dark:bg-[#0B0E14]">
              <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">Recargas Pendientes</p>
              <p className="font-mono-tabular text-2xl font-semibold mt-1">
                {data.recargas.filter((r) => r.estado === 'PENDIENTE').length}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'RECARGAS', label: 'Recargas' },
              { id: 'LIBRO', label: 'Libro Contable y Ajustes' },
              { id: 'COMISIONES', label: 'Reglas de Comisión' },
              { id: 'NEGOCIOS', label: 'Negocios y Unidades' },
              { id: 'ALERTAS', label: 'Emergencias SOS y Partners' },
            ] as Array<{ id: AdminTab; label: string }>
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold border whitespace-nowrap shrink-0 ${
                tab === t.id
                  ? 'bg-[#14213D] text-white border-[#14213D] dark:bg-[#D4AF37] dark:text-[#0B0E14] dark:border-[#D4AF37]'
                  : 'border-black/10 dark:border-white/10 text-[#555B66] dark:text-[#A3A9B5]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {statusMsg && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs sm:text-sm ${
            statusMsg.type === 'ok'
              ? 'border-[#1FA855]/40 bg-[#1FA855]/10 text-[#1FA855]'
              : 'border-[#C81E5B]/40 bg-[#C81E5B]/10 text-[#C81E5B]'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {data && tab === 'RECARGAS' && (
        <div className="space-y-4">
          {data.recargas.length === 0 ? (
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-10 text-center text-sm text-[#6A717E] dark:text-[#98A0AD]">
              No hay solicitudes de recarga registradas.
            </div>
          ) : (
            data.recargas.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <p className="font-mono-tabular text-xs text-[#9A7B2C] dark:text-[#E5C158]">
                    {r.codigo_operacion} · {r.metodo} · {r.estado}
                  </p>
                  <p className="font-display text-2xl font-semibold">
                    {r.negocio_nombre} ({r.negocio_codigo})
                  </p>
                  <p className="font-mono-tabular text-lg font-semibold">
                    {formatSoles(r.monto_centavos)}
                  </p>
                </div>
                {r.estado === 'PENDIENTE' ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      value={rejectMotivos[r.id] || ''}
                      onChange={(e) =>
                        setRejectMotivos((prev) => ({ ...prev, [r.id]: e.target.value }))
                      }
                      placeholder="Motivo si rechazas"
                      className="min-h-[44px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleRejectRecharge(r.id)}
                      className="min-h-[44px] px-4 rounded-xl border border-[#C81E5B]/40 text-[#C81E5B] text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Rechazar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveRecharge(r.id)}
                      className="min-h-[44px] px-5 rounded-xl bg-[#1FA855] text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Aprobar</span>
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                    {r.motivo_rechazo ? `Motivo: ${r.motivo_rechazo}` : 'Procesada'}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {data && tab === 'LIBRO' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleAdjustBalance}
            className="lg:col-span-4 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-4 h-fit"
          >
            <h2 className="font-display text-2xl font-semibold">Ajuste Manual de Saldo</h2>
            <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
              Exige motivo obligatorio. Un débito superior al saldo libre será rechazado.
            </p>
            <select
              value={adjNegId}
              onChange={(e) => setAdjNegId(Number(e.target.value))}
              className="w-full min-h-[44px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs"
            >
              {data.negocios.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.codigo} · {n.nombre} (Libre: {formatSoles(n.saldo_libre)})
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.5"
              required
              value={adjSoles}
              onChange={(e) => setAdjSoles(e.target.value)}
              placeholder="Monto S/ (+ crédito o - débito)"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] font-mono-tabular text-sm"
            />
            <input
              type="text"
              required
              value={adjMotivo}
              onChange={(e) => setAdjMotivo(e.target.value)}
              placeholder="Motivo obligatorio del ajuste"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
            />
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-semibold"
            >
              Registrar Ajuste en Libro
            </button>
          </form>

          <div className="lg:col-span-8 space-y-6">
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 overflow-x-auto">
              <h2 className="font-display text-2xl font-semibold mb-3">
                Reconciliación Caché vs Libro Contable
              </h2>
              <table className="w-full text-left text-xs">
                <thead className="border-b border-black/10 dark:border-white/10 text-[#6A717E] dark:text-[#98A0AD]">
                  <tr>
                    <th className="py-2 pr-3">Negocio</th>
                    <th className="py-2 pr-3 text-right">Saldo Caché</th>
                    <th className="py-2 pr-3 text-right">Suma Libro</th>
                    <th className="py-2 pr-3 text-right">Retenido</th>
                    <th className="py-2 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/8 dark:divide-white/8">
                  {data.auditoria.verificacion_negocios.map((v) => (
                    <tr key={v.negocio_id}>
                      <td className="py-2 pr-3">{v.nombre}</td>
                      <td className="py-2 pr-3 font-mono-tabular text-right">
                        {formatSoles(v.saldo_cache)}
                      </td>
                      <td className="py-2 pr-3 font-mono-tabular text-right">
                        {formatSoles(v.saldo_libro)}
                      </td>
                      <td className="py-2 pr-3 font-mono-tabular text-right">
                        {formatSoles(v.retenido_cache)}
                      </td>
                      <td
                        className={`py-2 text-right font-semibold ${
                          v.cuadra ? 'text-[#1FA855]' : 'text-[#C81E5B]'
                        }`}
                      >
                        {v.cuadra ? 'Cuadra' : 'Error'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 overflow-x-auto">
              <h2 className="font-display text-2xl font-semibold mb-3">
                Libro Inmutable (Últimos Movimientos)
              </h2>
              <table className="w-full text-left text-xs">
                <thead className="border-b border-black/10 dark:border-white/10 text-[#6A717E] dark:text-[#98A0AD]">
                  <tr>
                    <th className="py-2 pr-3">Cuenta</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Referencia</th>
                    <th className="py-2 pr-3 text-right">Monto Δ</th>
                    <th className="py-2 text-right">Saldo Post.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/8 dark:divide-white/8">
                  {data.auditoria.movimientos.slice(0, 25).map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 pr-3">
                        {m.cuenta_tipo === 'PLATAFORMA' ? 'La Chuspa HQ' : m.negocio_nombre}
                      </td>
                      <td className="py-2 pr-3">{m.tipo}</td>
                      <td className="py-2 pr-3 font-mono-tabular">{m.referencia}</td>
                      <td className="py-2 pr-3 font-mono-tabular text-right">
                        {m.monto_centavos >= 0 ? '+' : ''}
                        {formatSoles(m.monto_centavos)}
                      </td>
                      <td className="py-2 font-mono-tabular text-right">
                        {formatSoles(m.saldo_posterior_centavos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {data && tab === 'COMISIONES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.reglas_comision.map((r) => (
            <CommissionRuleCard key={r.rubro} rule={r} onSave={handleUpdateRule} />
          ))}
        </div>
      )}

      {data && tab === 'NEGOCIOS' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleCreateBusiness}
              className="lg:col-span-4 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-3 h-fit"
            >
              <h2 className="font-display text-2xl font-semibold">Registrar Negocio</h2>
              <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                Incluye RUC/DNI SUNAT-RENIEC, categoría y modalidades de venta.
              </p>
              <select
                value={newNegRubro}
                onChange={(e) => setNewNegRubro(e.target.value as Rubro)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs"
              >
                {(Object.keys(RUBRO_LABELS) as Rubro[]).map((r) => (
                  <option key={r} value={r}>
                    {RUBRO_LABELS[r]}
                  </option>
                ))}
              </select>

              <select
                value={newNegTipoNegocio}
                onChange={(e) => setNewNegTipoNegocio(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs"
              >
                {BUSINESS_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <div className="rounded-xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <select
                    value={newNegTipoPersona}
                    onChange={(e) => {
                      setNewNegTipoPersona(e.target.value as 'NATURAL' | 'JURIDICA');
                      setNewNegDocVerified(null);
                    }}
                    className="min-h-[34px] px-2 rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-[11px] font-semibold"
                  >
                    <option value="JURIDICA">Persona Jurídica (RUC)</option>
                    <option value="NATURAL">Persona Natural (DNI)</option>
                  </select>
                  {newNegDocVerified?.validado && (
                    <BadgeCheck className="w-4 h-4 text-emerald-500" />
                  )}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={newNegTipoPersona === 'NATURAL' ? 8 : 11}
                    value={newNegDocNumero}
                    onChange={(e) => {
                      setNewNegDocNumero(e.target.value.replace(/\D/g, ''));
                      setNewNegDocVerified(null);
                    }}
                    placeholder={newNegTipoPersona === 'NATURAL' ? 'DNI 8 dígitos' : 'RUC 11 dígitos'}
                    className="flex-1 min-h-[38px] px-2.5 rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs font-mono-tabular"
                  />
                  <button
                    type="button"
                    onClick={handleLookupNewNegDoc}
                    disabled={newNegDocLoading}
                    className="min-h-[38px] px-2.5 rounded-lg bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-[11px] font-bold"
                  >
                    {newNegDocLoading ? '...' : 'Validar'}
                  </button>
                </div>
                {newNegRazonSocial && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 truncate">
                    {newNegRazonSocial}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {SALE_MODALITIES.map((mod) => {
                  const active = newNegModalidades.includes(mod);
                  return (
                    <button
                      key={mod}
                      type="button"
                      onClick={() =>
                        setNewNegModalidades((prev) =>
                          prev.includes(mod)
                            ? prev.length > 1
                              ? prev.filter((x) => x !== mod)
                              : prev
                            : [...prev, mod]
                        )
                      }
                      className={`px-2 py-1 rounded-lg text-[10px] font-semibold border ${
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

              <input
                type="text"
                required
                value={newNegNombre}
                onChange={(e) => setNewNegNombre(e.target.value)}
                placeholder="Nombre comercial"
                className="w-full min-h-[42px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
              />
              <input
                type="tel"
                required
                value={newNegTel}
                onChange={(e) => setNewNegTel(e.target.value)}
                placeholder="Teléfono WhatsApp"
                className="w-full min-h-[42px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
              />
              <input
                type="text"
                value={newNegZona}
                onChange={(e) => setNewNegZona(e.target.value)}
                placeholder="Zona / Dirección"
                className="w-full min-h-[42px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
              />
              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Crear Negocio</span>
              </button>

              {createdPinOnce && (
                <div className="rounded-xl border border-[#D4AF37] bg-[#D4AF37]/10 p-4 space-y-1">
                  <p className="text-xs font-semibold text-[#9A7B2C] dark:text-[#E5C158]">
                    PIN inicial (se muestra una única vez)
                  </p>
                  <p className="text-xs">
                    {createdPinOnce.nombre} ({createdPinOnce.codigo})
                  </p>
                  <p className="font-mono-tabular text-2xl font-bold tracking-[0.25em]">
                    {createdPinOnce.pin}
                  </p>
                </div>
              )}
            </form>

            <div className="lg:col-span-8 space-y-4">
              <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-2xl font-semibold">
                    Negocios Registrados y Reglas de Cumplimiento
                  </h2>
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/35">
                      ● ACTIVO
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/35">
                      ● INCUMPLIMIENTO
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/35">
                      ● ESTAFA
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  {data.negocios.map((n) => {
                    const rule: EstadoRegla =
                      n.estado_regla || (n.activo === 1 ? 'ACTIVO' : 'INCUMPLIMIENTO');
                    const cardTone =
                      rule === 'ACTIVO'
                        ? 'border-emerald-500/45 bg-emerald-500/5'
                        : rule === 'ESTAFA'
                        ? 'border-rose-500/60 bg-rose-500/10'
                        : 'border-amber-500/55 bg-amber-500/10';
                    const badgeTone =
                      rule === 'ACTIVO'
                        ? 'bg-emerald-600 text-white'
                        : rule === 'ESTAFA'
                        ? 'bg-rose-600 text-white'
                        : 'bg-amber-500 text-[#0B0E14]';
                    const mods = Array.isArray(n.modalidades_venta) ? n.modalidades_venta : [];

                    return (
                      <div
                        key={n.id}
                        className={`rounded-2xl border-2 p-4 space-y-3 transition-colors ${cardTone}`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${badgeTone}`}
                              >
                                {rule === 'ACTIVO'
                                  ? 'ACTIVO · HABILITADO'
                                  : rule === 'ESTAFA'
                                  ? 'DESACTIVADO · ESTAFA'
                                  : 'DESACTIVADO · INCUMPLIMIENTO'}
                              </span>
                              <span className="font-mono-tabular text-[11px] text-[#6A717E] dark:text-[#98A0AD]">
                                {n.codigo} · {RUBRO_LABELS[n.rubro]}
                              </span>
                            </div>
                            <h3 className="text-base font-bold text-[#14171F] dark:text-white">
                              {n.nombre}
                            </h3>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#555B66] dark:text-[#A3A9B5]">
                              {n.documento_numero && (
                                <span className="font-mono-tabular">
                                  {n.documento_tipo || 'RUC'}: {n.documento_numero}
                                </span>
                              )}
                              {n.tipo_negocio && <span>· {n.tipo_negocio}</span>}
                              {mods.length > 0 && <span>· Venta: {mods.join(', ')}</span>}
                            </div>
                            {n.motivo_estado && (
                              <p className="text-xs font-medium text-[#14171F] dark:text-[#F4F1EA]">
                                Regla aplicada: {n.motivo_estado}
                              </p>
                            )}
                          </div>

                          <div className="text-left sm:text-right shrink-0">
                            <p className="text-[10px] uppercase text-[#6A717E] dark:text-[#98A0AD]">
                              Saldo Total
                            </p>
                            <p className="font-mono-tabular text-lg font-bold">
                              {formatSoles(n.saldo)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-black/8 dark:border-white/10">
                          <input
                            type="text"
                            value={estadoMotivos[n.id] || ''}
                            onChange={(e) =>
                              setEstadoMotivos((prev) => ({ ...prev, [n.id]: e.target.value }))
                            }
                            placeholder="Motivo de activación o suspensión (ej. Demora o estafa)"
                            className="flex-1 min-h-[38px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#0B0E14] text-xs"
                          />
                          <div className="flex flex-wrap gap-1.5">
                            {n.bloqueado && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiFetch(`/api/admin/negocios/${n.id}/unlock`, {
                                    method: 'POST',
                                    body: {},
                                    token: token!,
                                  });
                                  await loadPanel();
                                }}
                                className="min-h-[38px] px-2.5 rounded-xl border border-[#D4AF37] text-[#D4AF37] text-xs font-bold inline-flex items-center gap-1"
                              >
                                <LockOpen className="w-3.5 h-3.5" />
                                <span>Desbloquear PIN</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleChangeBusinessEstado(n.id, n.nombre, 'ACTIVO')}
                              className="min-h-[38px] px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                            >
                              Activar
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleChangeBusinessEstado(n.id, n.nombre, 'INCUMPLIMIENTO')
                              }
                              className="min-h-[38px] px-3 rounded-xl bg-amber-500 text-[#0B0E14] text-xs font-bold"
                            >
                              Incumplimiento
                            </button>
                            <button
                              type="button"
                              onClick={() => handleChangeBusinessEstado(n.id, n.nombre, 'ESTAFA')}
                              className="min-h-[38px] px-3 rounded-xl bg-rose-600 text-white text-xs font-bold"
                            >
                              Estafa
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-3">
                <h2 className="font-display text-2xl font-semibold">
                  Certificación de Unidades de Transporte
                </h2>
                {data.unidades.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-4 py-2 border-b border-black/8 dark:border-white/8 last:border-0 text-xs"
                  >
                    <div>
                      <p className="font-semibold">
                        {u.modelo} ({u.placa}) · {u.conductor_nombre}
                      </p>
                      <p className="text-[#6A717E]">{u.negocio_nombre}</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/unidades/${u.id}/certificar`, {
                          method: 'POST',
                          body: { certificada: u.certificada !== 1 },
                          token: token!,
                        });
                        loadPanel();
                      }}
                      className={`min-h-[40px] px-3.5 rounded-xl border font-semibold ${
                        u.certificada === 1
                          ? 'border-[#1FA855]/40 text-[#1FA855]'
                          : 'border-black/15 dark:border-white/15'
                      }`}
                    >
                      {u.certificada === 1 ? 'Certificada' : 'Certificar Unidad'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {data && tab === 'ALERTAS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-4">
            <h2 className="font-display text-2xl font-semibold">Monitor de Emergencias SOS</h2>
            {data.emergencias.length === 0 ? (
              <p className="text-xs text-[#6A717E]">Sin alertas SOS activas.</p>
            ) : (
              data.emergencias.map((em) => (
                <div
                  key={em.id}
                  className="rounded-xl border border-black/10 dark:border-white/10 p-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-mono-tabular text-xs text-[#C81E5B] font-semibold">
                      {em.codigo} · {em.estado}
                    </p>
                    <p className="text-sm font-medium">
                      {em.cliente_nombre} ({em.cliente_telefono})
                    </p>
                    <p className="text-xs text-[#6A717E]">
                      {em.ubicacion_texto} — {em.mensaje}
                    </p>
                  </div>
                  {em.estado === 'ACTIVA' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/emergencias/${em.id}/atender`, {
                          method: 'POST',
                          body: { atendida_por: 'Central La Chuspa' },
                          token: token!,
                        });
                        loadPanel();
                      }}
                      className="min-h-[44px] px-4 rounded-xl bg-[#1FA855] text-white text-xs font-semibold shrink-0"
                    >
                      Marcar Atendida
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="lg:col-span-5 space-y-4">
            <form
              onSubmit={handleCreatePartner}
              className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-3"
            >
              <h2 className="font-display text-2xl font-semibold">Promotores & Partners</h2>
              <input
                type="text"
                required
                value={partnerCode}
                onChange={(e) => setPartnerCode(e.target.value)}
                placeholder="Código (ej. HOTELVIP)"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] font-mono-tabular text-sm uppercase"
              />
              <input
                type="text"
                required
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder="Nombre del promotor"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
              />
              <input
                type="number"
                min="1"
                max="25"
                required
                value={partnerPct}
                onChange={(e) => setPartnerPct(e.target.value)}
                placeholder="% de comisión sobre plataforma"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] font-mono-tabular text-sm"
              />
              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-semibold"
              >
                Registrar Promotor
              </button>
            </form>

            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-2.5">
              {data.partners.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs py-1.5 border-b border-black/8 dark:border-white/8 last:border-0"
                >
                  <div>
                    <p className="font-mono-tabular font-semibold">{p.codigo}</p>
                    <p className="text-[#6A717E]">{p.nombre}</p>
                  </div>
                  <div className="text-right font-mono-tabular">
                    <p>{p.porcentaje_comision}% · {p.pedidos_atribuidos} ped.</p>
                    <p>{formatSoles(p.comision_acumulada_centavos)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CommissionRuleCard: React.FC<{
  rule: { rubro: Rubro; porcentaje_plataforma: number; porcentaje_referido: number };
  onSave: (rubro: Rubro, plat: number, ref: number) => void;
}> = ({ rule, onSave }) => {
  const [plat, setPlat] = useState(String(rule.porcentaje_plataforma));
  const [ref, setRef] = useState(String(rule.porcentaje_referido));

  return (
    <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-5 space-y-4">
      <h3 className="font-display text-2xl font-semibold">{RUBRO_LABELS[rule.rubro]}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-[#6A717E] dark:text-[#98A0AD] mb-1">
            % Plataforma
          </label>
          <input
            type="number"
            min="0"
            max="50"
            value={plat}
            onChange={(e) => setPlat(e.target.value)}
            className="w-full min-h-[44px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] font-mono-tabular text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] text-[#6A717E] dark:text-[#98A0AD] mb-1">
            % Referido
          </label>
          <input
            type="number"
            min="0"
            max="50"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            className="w-full min-h-[44px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] font-mono-tabular text-sm"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => onSave(rule.rubro, Number(plat) || 0, Number(ref) || 0)}
        className="w-full min-h-[44px] rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-semibold"
      >
        Guardar Regla
      </button>
    </div>
  );
};
