import React, { useEffect, useState } from 'react';
import {
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
import { formatSoles, RUBRO_LABELS, type Rubro } from '../types.ts';

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

  // Rechazo motivo
  const [rejectMotivos, setRejectMotivos] = useState<Record<number, string>>({});

  // Ajuste manual
  const [adjNegId, setAdjNegId] = useState<number>(1);
  const [adjSoles, setAdjSoles] = useState('');
  const [adjMotivo, setAdjMotivo] = useState('');

  // Registro nuevo negocio
  const [newNegRubro, setNewNegRubro] = useState<Rubro>('RESTAURANTE');
  const [newNegNombre, setNewNegNombre] = useState('');
  const [newNegTel, setNewNegTel] = useState('');
  const [newNegZona, setNewNegZona] = useState('Plaza de Armas, Cusco');
  const [createdPinOnce, setCreatedPinOnce] = useState<{ nombre: string; codigo: string; pin: string } | null>(null);

  // Nuevo partner
  const [partnerCode, setPartnerCode] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [partnerPct, setPartnerPct] = useState('10');

  useEffect(() => {
    apiFetch<{ configured: boolean; requires_claim: boolean }>('/api/admin/bootstrap-status')
      .then((res) => setRequiresClaim(res.requires_claim))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (token) loadPanel();
  }, [token]);

  async function loadPanel() {
    if (!token) return;
    try {
      const res = await apiFetch<AdminPanelData>('/api/admin/panel', { token });
      setData(res);
      if (res.negocios.length > 0 && !res.negocios.some((n) => n.id === adjNegId)) {
        setAdjNegId(res.negocios[0].id);
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

  async function handleCreateBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setStatusMsg(null);
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
      await loadPanel();
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Error creando negocio' });
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
                Nace con saldo S/ 0.00 y un PIN aleatorio mostrado una sola vez.
              </p>
              <select
                value={newNegRubro}
                onChange={(e) => setNewNegRubro(e.target.value as Rubro)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs"
              >
                {(Object.keys(RUBRO_LABELS) as Rubro[]).map((r) => (
                  <option key={r} value={r}>
                    {RUBRO_LABELS[r]}
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                value={newNegNombre}
                onChange={(e) => setNewNegNombre(e.target.value)}
                placeholder="Nombre comercial"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
              />
              <input
                type="tel"
                required
                value={newNegTel}
                onChange={(e) => setNewNegTel(e.target.value)}
                placeholder="Teléfono WhatsApp"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
              />
              <input
                type="text"
                value={newNegZona}
                onChange={(e) => setNewNegZona(e.target.value)}
                placeholder="Zona / Dirección"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
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
              <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-3 overflow-x-auto">
                <h2 className="font-display text-2xl font-semibold">Negocios Registrados</h2>
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-black/10 dark:border-white/10 text-[#6A717E] dark:text-[#98A0AD]">
                    <tr>
                      <th className="py-2 pr-3">Negocio</th>
                      <th className="py-2 pr-3">Rubro</th>
                      <th className="py-2 pr-3 text-right">Saldo</th>
                      <th className="py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/8 dark:divide-white/8">
                    {data.negocios.map((n) => (
                      <tr key={n.id}>
                        <td className="py-2.5 pr-3">
                          <div className="font-medium">{n.nombre}</div>
                          <div className="font-mono-tabular text-[11px] text-[#6A717E]">
                            {n.codigo}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">{RUBRO_LABELS[n.rubro]}</td>
                        <td className="py-2.5 pr-3 font-mono-tabular text-right">
                          {formatSoles(n.saldo)}
                        </td>
                        <td className="py-2.5 text-right space-x-2">
                          {n.bloqueado && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/admin/negocios/${n.id}/unlock`, {
                                  method: 'POST',
                                  body: {},
                                  token: token!,
                                });
                                loadPanel();
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-[#D4AF37] text-[#D4AF37] inline-flex items-center gap-1"
                            >
                              <LockOpen className="w-3 h-3" />
                              <span>Desbloquear PIN</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/negocios/${n.id}/estado`, {
                                method: 'PATCH',
                                body: { activo: n.activo !== 1 },
                                token: token!,
                              });
                              loadPanel();
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-black/15 dark:border-white/15"
                          >
                            {n.activo === 1 ? 'Desactivar' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
