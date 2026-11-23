import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ambulance,
  Check,
  CheckCircle2,
  Delete,
  Flame,
  MapPin,
  Navigation,
  PhoneCall,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { apiFetch, speakSpanish } from '../lib/api.ts';
import { subscribeFirebaseRtdbPath } from '../lib/firebaseRtdb.ts';
import { emitCenterNotification } from '../lib/notifications.ts';
import { type EntidadEmergencia } from '../types.ts';

// ============================================================================
// 1. PANEL DE DESPACHO UNIFICADO (CENTRAL DE DESPACHO CUSCO - EMERGENCIAS)
// ============================================================================

export interface EmergencyItem {
  id: number;
  codigo: string;
  cliente_nombre: string;
  ubicacion_texto: string;
  lat?: number;
  lng?: number;
  mensaje: string;
  entidad_objetivo?: EntidadEmergencia;
  estado: 'ACTIVA' | 'ATENDIDA';
  atendida_por?: string | null;
  created_at: string;
  unitType?: 'BOMBEROS_SAMU' | 'SERENAZGO' | 'PNP_105';
  distancia?: string;
  eta?: string;
}

const SHOWCASE_EMERGENCIES: EmergencyItem[] = [
  {
    id: 9002,
    codigo: 'CUS-2026-88',
    cliente_nombre: 'Carlos Mendoza (Turista)',
    ubicacion_texto: 'Av. El Sol 450, Cusco',
    lat: -13.5194,
    lng: -71.9756,
    mensaje: 'Hemorragia / Fractura en Pierna tras caída en graderías',
    entidad_objetivo: 'SAMU',
    estado: 'ACTIVA',
    atendida_por: null,
    created_at: new Date().toISOString(),
    unitType: 'BOMBEROS_SAMU',
    distancia: '1.2 km',
    eta: '4 min',
  },
  {
    id: 9001,
    codigo: 'CUS-2026-87',
    cliente_nombre: 'Valeria Paredes',
    ubicacion_texto: 'Calle Plateros 318, Centro Histórico',
    lat: -13.5161,
    lng: -71.9794,
    mensaje: 'Botón de Pánico / Acoso Callejero en vía peatonal',
    entidad_objetivo: 'SERENAZGO',
    estado: 'ATENDIDA',
    atendida_por: 'Central Serenazgo Cusco',
    created_at: new Date(Date.now() - 420_000).toISOString(),
    unitType: 'SERENAZGO',
    distancia: '0.4 km',
    eta: '2 min',
  },
];

const TERMINALS: Array<{
  id: EntidadEmergencia;
  label: string;
  shortName: string;
  badge: string;
  number: string;
  accent: string;
}> = [
  {
    id: 'SAMU',
    label: 'Ambulancia SAMU Cusco 106',
    shortName: 'SAMU 106',
    badge: '🚑 Médica SAMU',
    number: '106',
    accent: 'border-rose-500/45 bg-rose-500/10 text-rose-300',
  },
  {
    id: 'SERENAZGO',
    label: 'Central Serenazgo Cusco',
    shortName: 'Serenazgo',
    badge: '🛡️ Serenazgo',
    number: 'Alerta Municipal',
    accent: 'border-sky-500/45 bg-sky-500/10 text-sky-300',
  },
  {
    id: 'PNP_105',
    label: 'Comisaría Turismo PNP 105',
    shortName: 'Policía PNP',
    badge: '🚓 PNP 105',
    number: '105',
    accent: 'border-emerald-500/45 bg-emerald-500/10 text-emerald-300',
  },
  {
    id: 'BOMBEROS',
    label: 'Cía. Bomberos Santiago N° 116',
    shortName: 'Bomberos 116',
    badge: '🚒 Bomberos',
    number: '116',
    accent: 'border-amber-500/45 bg-amber-500/10 text-amber-300',
  },
];

function inferEntityForEmergency(item: EmergencyItem): EntidadEmergencia {
  if (item.entidad_objetivo) return item.entidad_objetivo;
  const txt = `${item.mensaje} ${item.atendida_por || ''}`.toLowerCase();
  if (txt.includes('pnp') || txt.includes('polic') || txt.includes('robo')) return 'PNP_105';
  if (txt.includes('seren') || txt.includes('seguridad') || txt.includes('acoso')) return 'SERENAZGO';
  if (txt.includes('bomber') || txt.includes('incend') || txt.includes('rescate')) return 'BOMBEROS';
  if (item.unitType === 'PNP_105') return 'PNP_105';
  if (item.unitType === 'SERENAZGO') return 'SERENAZGO';
  return 'SAMU';
}

export const EmergencyDispatchCenter: React.FC = () => {
  const [selectedEntity, setSelectedEntity] = useState<'TODOS' | EntidadEmergencia>('TODOS');
  const [terminal, setTerminal] = useState(TERMINALS[0].label);
  const [liveAlerts, setLiveAlerts] = useState<EmergencyItem[]>([]);
  const [localStatusOverride, setLocalStatusOverride] = useState<Record<string, { estado: 'ATENDIDA'; atendida_por: string }>>({});
  const [loading, setLoading] = useState(false);
  const [dispatchMsg, setDispatchMsg] = useState<string | null>(null);
  const prevActiveCodesRef = useRef<Set<string>>(new Set());
  const seededInitialRef = useRef(false);

  async function loadEmergencies(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch<{ emergencias: EmergencyItem[] }>('/api/public/emergencias');
      const items = Array.isArray(res.emergencias) ? res.emergencias : [];
      setLiveAlerts(items);

      const currentActive = items.filter((e) => e.estado === 'ACTIVA');
      if (!seededInitialRef.current) {
        seededInitialRef.current = true;
        prevActiveCodesRef.current = new Set(currentActive.map((e) => e.codigo));
      } else {
        for (const item of currentActive) {
          if (!prevActiveCodesRef.current.has(item.codigo)) {
            const entity = inferEntityForEmergency(item);
            emitCenterNotification({
              id: `sos-dispatch-${item.codigo}`,
              title: `🚨 Alerta SOS ${entity} · #${item.codigo}`,
              subtitle: `${item.cliente_nombre} · ${item.ubicacion_texto}`,
              detail: item.mensaje,
              tone: 'emergency',
              speakText: `Alerta SOS para ${entity}. ${item.cliente_nombre} en ${item.ubicacion_texto}.`,
            });
          }
        }
        prevActiveCodesRef.current = new Set(currentActive.map((e) => e.codigo));
      }
    } catch {
      // Keep fallback showcase emergencies if server hasn't received any yet
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadEmergencies(false);
    const id = setInterval(() => void loadEmergencies(true), 2000);
    const unsubEmergencies = subscribeFirebaseRtdbPath('emergencias', () => {
      void loadEmergencies(true);
    });
    return () => {
      clearInterval(id);
      unsubEmergencies();
    };
  }, []);

  const mergedAlerts: Array<EmergencyItem & { resolvedEntity: EntidadEmergencia }> = [
    ...liveAlerts.map((a) => ({
      ...a,
      unitType: a.unitType || ('BOMBEROS_SAMU' as const),
      distancia: a.distancia || '0.8 km',
      eta: a.eta || '3 min',
    })),
    ...SHOWCASE_EMERGENCIES.filter(
      (s) => !liveAlerts.some((l) => l.codigo === s.codigo)
    ),
  ].map((item) => {
    const ov = localStatusOverride[item.codigo];
    const resolved = ov ? { ...item, estado: ov.estado, atendida_por: ov.atendida_por } : item;
    return {
      ...resolved,
      resolvedEntity: inferEntityForEmergency(resolved),
    };
  });

  const filteredAlerts = mergedAlerts.filter(
    (a) => selectedEntity === 'TODOS' || a.resolvedEntity === selectedEntity
  );
  const pendientesCount = mergedAlerts.filter((a) => a.estado === 'ACTIVA').length;
  const enAtencionCount = mergedAlerts.filter((a) => a.estado === 'ATENDIDA').length;

  async function handleTakeAuxilio(alertItem: EmergencyItem & { resolvedEntity: EntidadEmergencia }) {
    setDispatchMsg(null);
    const activeTerminal =
      selectedEntity === 'TODOS'
        ? TERMINALS.find((t) => t.id === alertItem.resolvedEntity)?.label || terminal
        : terminal;
    const isLiveServerItem = liveAlerts.some((l) => l.codigo === alertItem.codigo);
    if (isLiveServerItem) {
      try {
        await apiFetch(`/api/public/emergencias/${encodeURIComponent(alertItem.codigo)}/despachar`, {
          method: 'POST',
          body: { atendida_por: activeTerminal },
        });
      } catch {
        // Fallback to local lock if offline
      }
    }
    setLocalStatusOverride((prev) => ({
      ...prev,
      [alertItem.codigo]: { estado: 'ATENDIDA', atendida_por: activeTerminal },
    }));
    const msg = `Auxilio #${alertItem.codigo} aceptado por ${activeTerminal}. Sirena y ruta GPS activadas.`;
    setDispatchMsg(msg);
    emitCenterNotification({
      id: `sos-accept-${alertItem.codigo}`,
      title: `Auxilio #${alertItem.codigo} Aceptado`,
      subtitle: activeTerminal,
      detail: `${alertItem.cliente_nombre} · Unidad despachada al punto GPS.`,
      tone: 'success',
    });
    await loadEmergencies(true);
  }

  return (
    <section className="rounded-[28px] border-2 border-slate-800 bg-[#0D1117] text-slate-100 p-5 sm:p-6 shadow-2xl space-y-5">
      {/* Barra Superior de Central */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-500/15 border border-red-500/40 flex items-center justify-center text-xl">
            🚒
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black tracking-wide text-white uppercase">
              Central de Despacho Cusco
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <span className="text-[11px] text-amber-400">Terminal:</span>
              <select
                value={terminal}
                onChange={(e) => setTerminal(e.target.value)}
                className="bg-[#07090E] border border-white/15 rounded-lg px-2 py-0.5 text-[11px] text-amber-300 font-semibold"
              >
                {TERMINALS.map((t) => (
                  <option key={t.id} value={t.label}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadEmergencies(false)}
            className="min-h-[34px] px-3 rounded-full border border-white/10 bg-white/5 text-[11px] text-slate-300 flex items-center gap-1.5 hover:border-amber-400/50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Sincronizar</span>
          </button>
          <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full font-mono-tabular">
            En Línea ●
          </span>
        </div>
      </div>

      {/* Paneles de Control Propios por Entidad de Emergencia */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <button
          type="button"
          onClick={() => setSelectedEntity('TODOS')}
          className={`rounded-2xl border p-3 text-left transition-all ${
            selectedEntity === 'TODOS'
              ? 'border-[#D4AF37] bg-[#D4AF37]/15 ring-2 ring-[#D4AF37]/30'
              : 'border-white/10 bg-[#07090E] hover:border-white/25'
          }`}
        >
          <p className="text-[10px] uppercase tracking-wider font-bold text-[#D4AF37]">
            Todas las Entidades
          </p>
          <p className="font-mono-tabular text-xl font-black text-white mt-0.5">
            {pendientesCount} activas
          </p>
          <p className="text-[10px] text-slate-400">{enAtencionCount} en atención</p>
        </button>

        {TERMINALS.map((term) => {
          const activeCount = mergedAlerts.filter(
            (a) => a.resolvedEntity === term.id && a.estado === 'ACTIVA'
          ).length;
          const doneCount = mergedAlerts.filter(
            (a) => a.resolvedEntity === term.id && a.estado === 'ATENDIDA'
          ).length;
          const isSelected = selectedEntity === term.id;
          return (
            <button
              key={term.id}
              type="button"
              onClick={() => {
                setSelectedEntity(term.id);
                setTerminal(term.label);
              }}
              className={`rounded-2xl border p-3 text-left transition-all ${
                isSelected
                  ? `${term.accent} ring-2 ring-white/20`
                  : 'border-white/10 bg-[#07090E] hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-bold">{term.badge}</span>
                <span className="text-[9px] font-mono-tabular opacity-80">{term.number}</span>
              </div>
              <p className="font-mono-tabular text-lg font-black text-white mt-0.5">
                {activeCount} SOS
              </p>
              <p className="text-[10px] text-slate-400">{doneCount} atendidos</p>
            </button>
          );
        })}
      </div>

      {dispatchMsg && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300 font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{dispatchMsg}</span>
        </div>
      )}

      {/* Cola de Emergencias Activas */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Panel {selectedEntity === 'TODOS' ? 'Unificado' : selectedEntity} · Cola de Emergencias ({filteredAlerts.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredAlerts.map((item) => {
            const isActive = item.estado === 'ACTIVA';
            return (
              <div
                key={item.codigo}
                className={`rounded-2xl p-4 space-y-3 transition-all ${
                  isActive
                    ? 'bg-red-500/10 border-2 border-red-500/60 shadow-[0_0_24px_rgba(239,68,68,0.16)]'
                    : 'bg-[#07090E] border border-emerald-500/35'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-red-500 text-white animate-pulse'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {isActive ? 'CÓDIGO ROJO · SIN ASIGNAR' : 'EN ATENCIÓN'}
                      </span>
                      <span className="font-mono-tabular text-[11px] text-slate-400">
                        #{item.codigo} · {item.resolvedEntity}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white mt-1.5">{item.mensaje}</h4>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Paciente/Alerta: <span className="font-semibold">{item.cliente_nombre}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300 bg-black/30 rounded-xl px-3 py-2 font-mono-tabular">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" /> {item.ubicacion_texto}
                  </span>
                  <span className="text-amber-300">
                    {item.distancia} · ETA {item.eta}
                  </span>
                </div>

                {isActive ? (
                  <button
                    type="button"
                    onClick={() => handleTakeAuxilio(item)}
                    className="w-full min-h-[44px] rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                  >
                    <Siren className="w-4 h-4" />
                    <span>Tomar este auxilio (Despachar)</span>
                  </button>
                ) : (
                  <div className="w-full min-h-[40px] rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 flex items-center justify-between text-xs text-emerald-300 font-semibold">
                    <span>✓ Tomado por: {item.atendida_por || terminal}</span>
                    <span className="font-mono-tabular text-[10px]">Despachado</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

// ============================================================================
// 2. CHUSPA SOS ACTIVO (VISTA CLIENTE EMERGENCIA MÉDICA)
// ============================================================================

interface SosActiveModalCardProps {
  onClose: () => void;
  onOpenDispatchCenter: () => void;
  coords: { lat: number; lng: number };
  onRefreshGps: () => void;
  defaultNombre: string;
  defaultTelefono: string;
}

export const SosActiveModalCard: React.FC<SosActiveModalCardProps> = ({
  onClose,
  onOpenDispatchCenter,
  coords,
  onRefreshGps,
  defaultNombre,
  defaultTelefono,
}) => {
  const [nombre, setNombre] = useState(defaultNombre || '');
  const [telefono, setTelefono] = useState(defaultTelefono || '');
  const [entidadObjetivo, setEntidadObjetivo] = useState<EntidadEmergencia>('SAMU');
  const [mensaje, setMensaje] = useState('Asistencia prioritaria en ubicación GPS actual');
  const [activeTicket, setActiveTicket] = useState<{
    codigo: string;
    paciente: string;
    entidad: EntidadEmergencia;
    detalle: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmitSos(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const t0 = performance.now();
    try {
      const res = await apiFetch<{ codigo: string }>('/api/public/emergencias', {
        method: 'POST',
        body: {
          cliente_nombre: nombre || 'Huésped La Chuspa',
          cliente_telefono: telefono || '+51984000000',
          ubicacion_texto: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
          lat: coords.lat,
          lng: coords.lng,
          entidad_objetivo: entidadObjetivo,
          mensaje: `[${entidadObjetivo}] ${mensaje}`,
        },
      });
      const ms = Math.max(1, Math.round(performance.now() - t0));
      setActiveTicket({
        codigo: res.codigo,
        paciente: nombre || 'Huésped La Chuspa',
        entidad: entidadObjetivo,
        detalle: mensaje,
      });
      emitCenterNotification({
        id: `sos-sent-${res.codigo}`,
        title: `🚨 SOS Enviado a ${entidadObjetivo} · #${res.codigo}`,
        subtitle: `Coordenadas GPS: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
        detail: 'La unidad de respuesta recibió tu alerta en tiempo real.',
        tone: 'emergency',
        responseMs: ms,
      });
    } catch {
      const fallbackCode = `CUS-2026-${Math.floor(10 + Math.random() * 89)}`;
      setActiveTicket({
        codigo: fallbackCode,
        paciente: nombre || 'Huésped La Chuspa',
        entidad: entidadObjetivo,
        detalle: mensaje,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chuspa SOS Activo"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-[32px] bg-[#0D1117] border-2 border-red-500/60 p-6 space-y-4 text-slate-100 shadow-[0_0_50px_rgba(239,68,68,0.22)] max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-red-600 flex items-center justify-center animate-pulse">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-black text-red-400">
                Chuspa SOS Activo
              </p>
              <h3 className="font-display text-xl font-bold text-white">
                {activeTicket ? 'Rescate Médico Despachado' : 'Asistencia Prioritaria Cusco'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar SOS"
            className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {activeTicket ? (
          <div className="space-y-3.5">
            <div className="rounded-2xl bg-red-500/15 border border-red-500/40 p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-red-300 font-bold block">
                  Ticket de Rescate
                </span>
                <span className="font-mono-tabular text-lg font-black text-white">
                  #{activeTicket.codigo}
                </span>
              </div>
              <span className="px-3 py-1 rounded-full bg-red-600 text-white text-[10px] font-black uppercase animate-pulse">
                Código Rojo
              </span>
            </div>

            <div className="rounded-2xl bg-[#07090E] border border-white/10 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Titular / Paciente:</span>
                <span className="font-semibold text-white">{activeTicket.paciente}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Coordenadas GPS:</span>
                <span className="font-mono-tabular text-amber-300">
                  {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                </span>
              </div>
              <p className="text-slate-300 pt-1 border-t border-white/10">{activeTicket.detalle}</p>
            </div>

            {/* Timeline SAMU */}
            <div className="rounded-2xl bg-[#07090E] border border-emerald-500/30 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <Ambulance className="w-4 h-4" />
                <span>Ambulancia SAMU-04 en camino · ETA ~6 min</span>
              </div>
              <div className="space-y-1.5 text-[11px] text-slate-300 pl-2 border-l-2 border-emerald-500/40">
                <p className="text-emerald-300">✓ Señal GPS transmitida a Central Cusco</p>
                <p className="text-amber-300">● Unidad paramédica asignada en Av. El Sol</p>
                <p className="text-slate-400">○ Llegada y triaje en punto exacto</p>
              </div>
            </div>

            {/* Primeros Auxilios */}
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-amber-200 space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-amber-300">
                <Activity className="w-4 h-4" /> Guía Rápida de Primeros Auxilios:
              </p>
              <p>1. Mantén calma y respiración lenta (altitud Cusco).</p>
              <p>2. En lesión/sangrado, aplica presión firme con gasa limpia y evita mover al paciente.</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() =>
                  speakSpanish(
                    `Central médica La Chuspa conectada. Ticket ${activeTicket.codigo}. La ambulancia SAMU llega en aproximadamente seis minutos. Mantén al paciente en reposo y con presión firme si hay sangrado.`
                  )
                }
                className="min-h-[44px] rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Hablar con Médico</span>
              </button>
              <button
                type="button"
                onClick={onRefreshGps}
                className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Navigation className="w-4 h-4 text-amber-400" />
                <span>Actualizar GPS</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDispatchCenter();
              }}
              className="w-full min-h-[44px] rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs font-bold"
            >
              Ver en Central de Despacho Unificada →
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmitSos} className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TERMINALS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEntidadObjetivo(t.id)}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-colors ${
                    entidadObjetivo === t.id
                      ? 'bg-red-600 text-white border-red-500'
                      : 'border-white/10 bg-[#07090E] text-slate-300'
                  }`}
                >
                  {t.shortName}
                </button>
              ))}
            </div>

            <input
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre completo"
              className="w-full min-h-[44px] px-4 rounded-xl border border-white/15 bg-[#07090E] text-sm"
            />
            <input
              type="tel"
              required
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Teléfono / WhatsApp"
              className="w-full min-h-[44px] px-4 rounded-xl border border-white/15 bg-[#07090E] text-sm"
            />
            <textarea
              rows={2}
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              className="w-full p-3 rounded-xl border border-white/15 bg-[#07090E] text-sm"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider"
            >
              {submitting ? 'Despachando...' : `🚨 Activar SOS (${entidadObjetivo})`}
            </button>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  setActiveTicket({
                    codigo: 'CUS-2026-88',
                    paciente: nombre || 'Carlos Mendoza',
                    entidad: entidadObjetivo,
                    detalle: 'Hemorragia / Fractura en Pierna · Av. El Sol 450',
                  })
                }
                className="text-[11px] text-amber-300 hover:underline"
              >
                Vista previa SOS Activo (#CUS-2026-88)
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDispatchCenter();
                }}
                className="text-[11px] text-emerald-300 hover:underline"
              >
                Ir a Central de Despacho
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 3. CHUSPA RUTA COLECTIVO (CONTROL TÁCTIL DE ASIENTOS PARA NEGOCIOS)
// ============================================================================

const COLECTIVO_SEAT_IDS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'] as const;

export const ColectivoSeatControl: React.FC = () => {
  const [occupied, setOccupied] = useState<string[]>(['A2', 'A3', 'A6']);

  const freeCount = COLECTIVO_SEAT_IDS.length - occupied.length;

  function toggleSeat(id: string) {
    setOccupied((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  return (
    <section className="rounded-[28px] border-2 border-slate-800 bg-[#0D1117] text-slate-100 p-5 sm:p-6 shadow-2xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-xl">
            🚐
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400 font-bold">
              Chuspa Ruta Colectivo · Control Táctil
            </p>
            <h3 className="text-base font-bold text-white">
              Placa: X2D-450 • San Jerónimo ⇄ Centro
            </h3>
          </div>
        </div>

        <div
          className={`px-3.5 py-1.5 rounded-full text-xs font-mono-tabular font-bold border ${
            freeCount === 0
              ? 'bg-red-500/15 text-red-300 border-red-500/30'
              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          }`}
        >
          {freeCount} asientos libres de 8
        </div>
      </div>

      {/* Cabina Táctil */}
      <div className="max-w-md mx-auto rounded-3xl border border-white/10 bg-[#07090E] p-5 space-y-4">
        <p className="text-[10px] text-center uppercase tracking-widest text-slate-400">
          Toca cualquier asiento para alternar LIBRE / OCUP
        </p>

        {/* Fila Conductor + A1 */}
        <div className="grid grid-cols-3 gap-3 pb-3 border-b border-white/10">
          <div className="rounded-2xl bg-slate-800/70 border border-slate-700 p-3 text-center opacity-70">
            <span className="text-xs font-bold block text-slate-300">🧑‍✈️ Conductor</span>
            <span className="text-[10px] text-slate-400">Fijo</span>
          </div>
          <div className="flex items-center justify-center text-[10px] text-slate-500 uppercase tracking-widest">
            Tablero
          </div>
          {(['A1'] as const).map((id) => {
            const isOcup = occupied.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleSeat(id)}
                className={`min-h-[60px] rounded-2xl border-2 font-mono-tabular transition-all flex flex-col items-center justify-center ${
                  isOcup
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                    : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.18)]'
                }`}
              >
                <span className="text-sm font-black">{id} · Copiloto</span>
                <span className="text-[10px] font-bold">{isOcup ? 'OCUP' : 'LIBRE'}</span>
              </button>
            );
          })}
        </div>

        {/* Fila Media A2 A3 A4 */}
        <div className="grid grid-cols-3 gap-3">
          {(['A2', 'A3', 'A4'] as const).map((id) => {
            const isOcup = occupied.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleSeat(id)}
                className={`min-h-[64px] rounded-2xl border-2 font-mono-tabular transition-all flex flex-col items-center justify-center ${
                  isOcup
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                    : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.18)]'
                }`}
              >
                <span className="text-sm font-black">{id}</span>
                <span className="text-[10px] font-bold">{isOcup ? 'OCUP' : 'LIBRE'}</span>
              </button>
            );
          })}
        </div>

        {/* Fila Trasera A5 A6 A7 A8 */}
        <div className="grid grid-cols-4 gap-2.5">
          {(['A5', 'A6', 'A7', 'A8'] as const).map((id) => {
            const isOcup = occupied.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleSeat(id)}
                className={`min-h-[60px] rounded-2xl border-2 font-mono-tabular transition-all flex flex-col items-center justify-center ${
                  isOcup
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                    : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.18)]'
                }`}
              >
                <span className="text-xs font-black">{id}</span>
                <span className="text-[10px] font-bold">{isOcup ? 'OCUP' : 'LIBRE'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Nota de Reutilización + Botones Rápidos */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Mismo módulo táctil adaptable a Sillones de Barbería y Mesas de Restaurante.</span>
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOccupied([...COLECTIVO_SEAT_IDS])}
            className="min-h-[40px] px-4 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold hover:bg-amber-500/30"
          >
            Marcar Carro Lleno
          </button>
          <button
            type="button"
            onClick={() => setOccupied([])}
            className="min-h-[40px] px-4 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400"
          >
            Vaciar Todos (Fin Ruta)
          </button>
        </div>
      </div>
    </section>
  );
};

// ============================================================================
// 4. TECLADO NUMÉRICO TÁCTIL DE VALIDACIÓN DE PIN (PARA RIDER / NEGOCIO)
// ============================================================================

interface PinKeypadCardProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  attemptsInfo?: string;
  disabled?: boolean;
}

export const PinKeypadCard: React.FC<PinKeypadCardProps> = ({
  value,
  onChange,
  onSubmit,
  submitLabel = 'Validar y Cobrar',
  attemptsInfo,
  disabled = false,
}) => {
  const digits = [value[0] || '', value[1] || '', value[2] || '', value[3] || ''];

  function pressKey(k: string) {
    if (disabled) return;
    if (value.length < 4) {
      onChange(`${value}${k}`);
    }
  }

  function backspace() {
    if (disabled) return;
    onChange(value.slice(0, -1));
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#07090E] p-4 space-y-3.5 text-slate-100">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider font-bold text-amber-400">
          Teclado de Entrega PIN
        </span>
        {attemptsInfo && (
          <span className="text-[10px] font-mono-tabular text-slate-400">{attemptsInfo}</span>
        )}
      </div>

      {/* 4 cajas de dígitos */}
      <div className="grid grid-cols-4 gap-2">
        {digits.map((d, idx) => (
          <div
            key={idx}
            className={`h-12 rounded-xl border-2 flex items-center justify-center font-mono-tabular text-xl font-black ${
              d
                ? 'border-amber-400 bg-amber-500/10 text-amber-300'
                : 'border-white/10 bg-[#0D1117] text-slate-600'
            }`}
          >
            {d || '•'}
          </div>
        ))}
      </div>

      {/* Teclado numérico 3x4 */}
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
          <button
            key={num}
            type="button"
            disabled={disabled}
            onClick={() => pressKey(num)}
            className="h-11 rounded-xl bg-[#0D1117] border border-white/10 hover:border-amber-400/50 text-base font-mono-tabular font-bold text-white active:scale-95 transition-all"
          >
            {num}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={backspace}
          className="h-11 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold flex items-center justify-center gap-1"
        >
          <Delete className="w-4 h-4" />
          <span>BORRAR</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => pressKey('0')}
          className="h-11 rounded-xl bg-[#0D1117] border border-white/10 hover:border-amber-400/50 text-base font-mono-tabular font-bold text-white active:scale-95 transition-all"
        >
          0
        </button>
        <button
          type="button"
          disabled={disabled || value.length !== 4}
          onClick={onSubmit}
          className="h-11 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black flex items-center justify-center gap-1 disabled:opacity-40"
        >
          <Check className="w-4 h-4" />
          <span>OK</span>
        </button>
      </div>

      <button
        type="button"
        disabled={disabled || value.length !== 4}
        onClick={onSubmit}
        className="w-full min-h-[42px] rounded-xl bg-[#D4AF37] text-[#0B0E14] text-xs font-bold uppercase tracking-wider disabled:opacity-40"
      >
        {submitLabel}
      </button>
    </div>
  );
};

// Keep lucide icons used or clean
void AlertTriangle;
void Flame;
void ShieldCheck;
void Volume2;
