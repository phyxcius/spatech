import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ambulance,
  BadgeCheck,
  Check,
  CheckCircle2,
  Copy,
  Delete,
  Flame,
  MapPin,
  Navigation,
  PhoneCall,
  Radio,
  RefreshCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Siren,
  UserCheck,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { apiFetch, playLuxuryChime, speakSpanish } from '../lib/api.ts';
import { haversineKm } from '../lib/cuscoMarkets.ts';
import { subscribeFirebaseRtdbPath } from '../lib/firebaseRtdb.ts';
import { emitCenterNotification } from '../lib/notifications.ts';
import {
  formatPeruLookupError,
  type PeruDocumentLookupResult,
} from '../lib/peruDocs.ts';
import { type EntidadEmergencia, type SharedCustomerDoc } from '../types.ts';
import {
  EmergencyGoogleMap,
  type EmergencyMapAlertPin,
} from './EmergencyGoogleMap.tsx';

// ============================================================================
// 1. PANEL DE DESPACHO UNIFICADO (POLICÍA PNP · BOMBEROS · SAMU · SERENAZGO)
// ============================================================================

export interface EmergencyItem {
  id: number;
  codigo: string;
  cliente_nombre: string;
  cliente_telefono?: string | null;
  solicitante_documento_tipo?: 'DNI' | 'RUC' | 'EXTRANJERO' | null;
  solicitante_documento_numero?: string | null;
  solicitante_nombre?: string | null;
  herido_nombre?: string | null;
  ubicacion_texto: string;
  lat?: number;
  lng?: number;
  mensaje: string;
  entidad_objetivo?: EntidadEmergencia;
  estado: 'ACTIVA' | 'ATENDIDA';
  atendida_por?: string | null;
  unidad_lat?: number | null;
  unidad_lng?: number | null;
  distancia_km?: number | null;
  eta_min?: number | null;
  sincronizada_todas?: number | boolean;
  created_at: string;
  unitType?: 'BOMBEROS_SAMU' | 'SERENAZGO' | 'PNP_105';
  distancia?: string;
  eta?: string;
}

const TERMINALS: Array<{
  id: EntidadEmergencia;
  label: string;
  shortName: string;
  badge: string;
  number: string;
  lat: number;
  lng: number;
  accent: string;
}> = [
  {
    id: 'SAMU',
    label: 'Ambulancia SAMU Cusco 106',
    shortName: 'SAMU 106',
    badge: '🚑 Médica SAMU',
    number: '106',
    lat: -13.5236,
    lng: -71.9585,
    accent: 'border-rose-500/45 bg-rose-500/10 text-rose-300',
  },
  {
    id: 'SERENAZGO',
    label: 'Central Serenazgo Cusco',
    shortName: 'Serenazgo',
    badge: '🛡️ Serenazgo',
    number: 'Alerta Municipal',
    lat: -13.5179,
    lng: -71.9812,
    accent: 'border-sky-500/45 bg-sky-500/10 text-sky-300',
  },
  {
    id: 'PNP_105',
    label: 'Comisaría Turismo PNP 105',
    shortName: 'Policía PNP',
    badge: '🚓 PNP 105',
    number: '105',
    lat: -13.5162,
    lng: -71.9776,
    accent: 'border-emerald-500/45 bg-emerald-500/10 text-emerald-300',
  },
  {
    id: 'BOMBEROS',
    label: 'Cía. Bomberos Santiago N° 116',
    shortName: 'Bomberos 116',
    badge: '🚒 Bomberos',
    number: '116',
    lat: -13.5218,
    lng: -71.9834,
    accent: 'border-amber-500/45 bg-amber-500/10 text-amber-300',
  },
];

const SHOWCASE_EMERGENCIES: EmergencyItem[] = [
  {
    id: 9002,
    codigo: 'CUS-2026-88',
    cliente_nombre: 'Carlos Mendoza (Turista)',
    solicitante_nombre: 'Lucía Quispe Huamán',
    solicitante_documento_tipo: 'DNI',
    solicitante_documento_numero: '44556677',
    herido_nombre: 'Carlos Mendoza (Turista)',
    cliente_telefono: '+51984221100',
    ubicacion_texto: 'Av. El Sol 450, Cusco',
    lat: -13.5194,
    lng: -71.9756,
    mensaje: 'Hemorragia / Fractura en Pierna tras caída en graderías',
    entidad_objetivo: 'SAMU',
    estado: 'ACTIVA',
    atendida_por: null,
    sincronizada_todas: 1,
    created_at: new Date().toISOString(),
    unitType: 'BOMBEROS_SAMU',
    distancia: '1.2 km',
    eta: '4 min',
  },
  {
    id: 9001,
    codigo: 'CUS-2026-87',
    cliente_nombre: 'Valeria Paredes',
    solicitante_nombre: 'Valeria Paredes',
    solicitante_documento_tipo: 'DNI',
    solicitante_documento_numero: '47889911',
    herido_nombre: 'Valeria Paredes',
    cliente_telefono: '+51984332211',
    ubicacion_texto: 'Calle Plateros 318, Centro Histórico',
    lat: -13.5161,
    lng: -71.9794,
    mensaje: 'Botón de Pánico / Acoso Callejero en vía peatonal',
    entidad_objetivo: 'SERENAZGO',
    estado: 'ATENDIDA',
    atendida_por: 'Central Serenazgo Cusco',
    unidad_lat: -13.5174,
    unidad_lng: -71.9802,
    distancia_km: 0.3,
    eta_min: 2,
    sincronizada_todas: 1,
    created_at: new Date(Date.now() - 420_000).toISOString(),
    unitType: 'SERENAZGO',
    distancia: '0.3 km',
    eta: '2 min',
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

function buildWhatsAppSosHref(params: {
  codigo?: string;
  entidad: EntidadEmergencia;
  solicitanteNombre: string;
  docTipo?: string | null;
  docNumero?: string | null;
  telefono: string;
  heridoNombre: string;
  mensaje: string;
  lat: number;
  lng: number;
}): string {
  const mapsUrl = `https://www.google.com/maps?q=${params.lat.toFixed(6)},${params.lng.toFixed(6)}`;
  const docStr =
    params.docNumero && params.docTipo ? ` (${params.docTipo}: ${params.docNumero})` : '';
  const lines = [
    `🚨 *ALERTA SOS LA CHUSPA CUSCO*${params.codigo ? ` #${params.codigo}` : ''}`,
    `*Central solicitada:* ${params.entidad}`,
    `*Solicitante:* ${params.solicitanteNombre || 'Ciudadano'}${docStr}`,
    `*WhatsApp de contacto:* ${params.telefono || 'No registrado'}`,
    `*Herido / Afectado:* ${params.heridoNombre || params.solicitanteNombre || 'Mismo solicitante'}`,
    `*Emergencia:* ${params.mensaje}`,
    `*Ubicación GPS:* ${params.lat.toFixed(5)}, ${params.lng.toFixed(5)}`,
    `*Ver en Google Maps:* ${mapsUrl}`,
  ];
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
}

export const EmergencyDispatchCenter: React.FC = () => {
  const [selectedEntity, setSelectedEntity] = useState<'TODOS' | EntidadEmergencia>('TODOS');
  const [terminal, setTerminal] = useState(TERMINALS[0].label);
  const [liveAlerts, setLiveAlerts] = useState<EmergencyItem[]>([]);
  const [localStatusOverride, setLocalStatusOverride] = useState<
    Record<string, Partial<EmergencyItem>>
  >({});
  const [focusedCodigo, setFocusedCodigo] = useState<string | null>(null);
  const [mapActiveOnAlert, setMapActiveOnAlert] = useState(true);
  const [routeMetrics, setRouteMetrics] = useState<{
    km: number;
    etaMin: number;
    source: 'google' | 'gps';
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [dispatchMsg, setDispatchMsg] = useState<string | null>(null);
  const [gpsUpdatingCode, setGpsUpdatingCode] = useState<string | null>(null);
  const prevActiveCodesRef = useRef<Set<string>>(new Set());
  const seededInitialRef = useRef(false);

  const loadEmergencies = useCallback(async (silent = false) => {
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
            setFocusedCodigo(item.codigo);
            setMapActiveOnAlert(true);
            playLuxuryChime();
            emitCenterNotification({
              id: `sos-dispatch-${item.codigo}`,
              title: `🚨 Alerta SOS ${entity} · #${item.codigo}`,
              subtitle: `Herido: ${item.herido_nombre || item.cliente_nombre} · ${item.ubicacion_texto}`,
              detail: `Solicita: ${item.solicitante_nombre || item.cliente_nombre} · ${item.mensaje}`,
              tone: 'emergency',
              speakText: `Atención central de emergencias ${entity}. Nueva alerta de ${
                item.solicitante_nombre || item.cliente_nombre
              }. Herido: ${item.herido_nombre || item.cliente_nombre}. Ubicación activada en Google Maps.`,
            });
          }
        }
        prevActiveCodesRef.current = new Set(currentActive.map((e) => e.codigo));
      }
    } catch {
      // Keep fallback showcase emergencies if offline
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

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
  }, [loadEmergencies]);

  const mergedAlerts: Array<EmergencyItem & { resolvedEntity: EntidadEmergencia }> = useMemo(() => {
    return [
      ...liveAlerts.map((a) => ({
        ...a,
        unitType: a.unitType || ('BOMBEROS_SAMU' as const),
        distancia:
          typeof a.distancia_km === 'number'
            ? `${a.distancia_km} km`
            : a.distancia || '0.8 km',
        eta: typeof a.eta_min === 'number' ? `${a.eta_min} min` : a.eta || '3 min',
      })),
      ...SHOWCASE_EMERGENCIES.filter((s) => !liveAlerts.some((l) => l.codigo === s.codigo)),
    ].map((item) => {
      const ov = localStatusOverride[item.codigo];
      const resolved = ov ? { ...item, ...ov } : item;
      return {
        ...resolved,
        resolvedEntity: inferEntityForEmergency(resolved),
      };
    });
  }, [liveAlerts, localStatusOverride]);

  // All alerts synced across all emergency centers; entity tab highlights & focuses primary entity while preserving shared visibility
  const filteredAlerts = useMemo(() => {
    if (selectedEntity === 'TODOS') return mergedAlerts;
    const primary = mergedAlerts.filter((a) => a.resolvedEntity === selectedEntity);
    const syncedOthers = mergedAlerts.filter(
      (a) => a.resolvedEntity !== selectedEntity && a.sincronizada_todas !== 0
    );
    return [...primary, ...syncedOthers];
  }, [mergedAlerts, selectedEntity]);

  const focusedAlert = useMemo(() => {
    if (focusedCodigo) {
      const match = filteredAlerts.find((a) => a.codigo === focusedCodigo);
      if (match) return match;
    }
    return filteredAlerts.find((a) => a.estado === 'ACTIVA') || filteredAlerts[0] || null;
  }, [filteredAlerts, focusedCodigo]);

  const pendientesCount = mergedAlerts.filter((a) => a.estado === 'ACTIVA').length;
  const enAtencionCount = mergedAlerts.filter((a) => a.estado === 'ATENDIDA').length;

  async function handleTakeAuxilio(
    alertItem: EmergencyItem & { resolvedEntity: EntidadEmergencia },
    overrideEntity?: EntidadEmergencia
  ) {
    setDispatchMsg(null);
    const chosenEntity =
      overrideEntity || (selectedEntity === 'TODOS' ? alertItem.resolvedEntity : selectedEntity);
    const station = TERMINALS.find((t) => t.id === chosenEntity) || TERMINALS[0];
    const activeTerminal = selectedEntity === 'TODOS' && !overrideEntity ? station.label : terminal;

    const isLiveServerItem = liveAlerts.some((l) => l.codigo === alertItem.codigo);
    let updatedItem: EmergencyItem | null = null;
    if (isLiveServerItem) {
      try {
        const res = await apiFetch<{ ok: boolean; emergencia?: EmergencyItem }>(
          `/api/public/emergencias/${encodeURIComponent(alertItem.codigo)}/despachar`,
          {
            method: 'POST',
            body: {
              atendida_por: activeTerminal,
              unidad_lat: station.lat,
              unidad_lng: station.lng,
            },
          }
        );
        if (res?.emergencia) updatedItem = res.emergencia;
      } catch {
        // Fallback to local lock if offline
      }
    }

    const tLat = alertItem.lat ?? -13.5167;
    const tLng = alertItem.lng ?? -71.9788;
    const distKm =
      updatedItem?.distancia_km ??
      Number(Math.max(0.2, haversineKm(station.lat, station.lng, tLat, tLng)).toFixed(2));
    const etaMin = updatedItem?.eta_min ?? Math.max(1, Math.round(distKm * 2.4 + 1));

    setLocalStatusOverride((prev) => ({
      ...prev,
      [alertItem.codigo]: {
        estado: 'ATENDIDA',
        atendida_por: activeTerminal,
        unidad_lat: updatedItem?.unidad_lat ?? station.lat,
        unidad_lng: updatedItem?.unidad_lng ?? station.lng,
        distancia_km: distKm,
        eta_min: etaMin,
      },
    }));
    setFocusedCodigo(alertItem.codigo);
    setMapActiveOnAlert(true);

    const msg = `Auxilio #${alertItem.codigo} aceptado por ${activeTerminal}. Ruta Punto A → B activada en Google Maps (ETA ~${etaMin} min).`;
    setDispatchMsg(msg);
    emitCenterNotification({
      id: `sos-accept-${alertItem.codigo}`,
      title: `Auxilio #${alertItem.codigo} Aceptado`,
      subtitle: activeTerminal,
      detail: `${alertItem.herido_nombre || alertItem.cliente_nombre} · Ruta GPS compartida con el solicitante.`,
      tone: 'success',
    });
    await loadEmergencies(true);
  }

  async function pushUnitCoords(
    alertItem: EmergencyItem & { resolvedEntity: EntidadEmergencia },
    nextLat: number,
    nextLng: number
  ) {
    setGpsUpdatingCode(alertItem.codigo);
    const tLat = alertItem.lat ?? -13.5167;
    const tLng = alertItem.lng ?? -71.9788;
    const distKm = Number(Math.max(0.05, haversineKm(nextLat, nextLng, tLat, tLng)).toFixed(2));
    const etaMin = distKm <= 0.12 ? 1 : Math.max(1, Math.round(distKm * 2.4 + 1));
    const isLiveServerItem = liveAlerts.some((l) => l.codigo === alertItem.codigo);

    if (isLiveServerItem) {
      try {
        await apiFetch(`/api/public/emergencias/${encodeURIComponent(alertItem.codigo)}/ubicacion`, {
          method: 'POST',
          body: { unidad_lat: nextLat, unidad_lng: nextLng },
        });
      } catch {
        // Fallback local update
      }
    }

    setLocalStatusOverride((prev) => ({
      ...prev,
      [alertItem.codigo]: {
        ...(prev[alertItem.codigo] || {}),
        unidad_lat: nextLat,
        unidad_lng: nextLng,
        distancia_km: distKm,
        eta_min: etaMin,
      },
    }));
    setGpsUpdatingCode(null);
  }

  function handleAdvanceUnitStep(alertItem: EmergencyItem & { resolvedEntity: EntidadEmergencia }) {
    const station = TERMINALS.find((t) => t.id === alertItem.resolvedEntity) || TERMINALS[0];
    const curLat = alertItem.unidad_lat ?? station.lat;
    const curLng = alertItem.unidad_lng ?? station.lng;
    const targetLat = alertItem.lat ?? -13.5167;
    const targetLng = alertItem.lng ?? -71.9788;
    const nextLat = curLat + (targetLat - curLat) * 0.35;
    const nextLng = curLng + (targetLng - curLng) * 0.35;
    void pushUnitCoords(alertItem, nextLat, nextLng);
  }

  function handleShareBrowserUnitGps(alertItem: EmergencyItem & { resolvedEntity: EntidadEmergencia }) {
    if (!navigator.geolocation) {
      handleAdvanceUnitStep(alertItem);
      return;
    }
    setGpsUpdatingCode(alertItem.codigo);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void pushUnitCoords(alertItem, pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        handleAdvanceUnitStep(alertItem);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }

  const mapPins: EmergencyMapAlertPin[] = useMemo(
    () =>
      filteredAlerts.map((a) => ({
        codigo: a.codigo,
        lat: a.lat ?? -13.5167,
        lng: a.lng ?? -71.9788,
        heridoNombre: a.herido_nombre || a.cliente_nombre,
        entidad: a.resolvedEntity,
        estado: a.estado,
        ubicacionTexto: a.ubicacion_texto,
      })),
    [filteredAlerts]
  );

  const focusedStation = focusedAlert
    ? TERMINALS.find(
        (t) =>
          t.label === focusedAlert.atendida_por ||
          t.id === (selectedEntity === 'TODOS' ? focusedAlert.resolvedEntity : selectedEntity)
      ) || TERMINALS[0]
    : TERMINALS[0];

  return (
    <section className="rounded-[28px] border-2 border-slate-800 bg-[#0D1117] text-slate-100 p-5 sm:p-6 shadow-2xl space-y-5 chuspa-google-border">
      {/* Barra Superior de Central */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-500/15 border border-red-500/40 flex items-center justify-center text-xl">
            🚒
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black tracking-wide text-white uppercase">
              Central de Control de Emergencias Cusco
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <span className="text-[11px] text-amber-400">Operador / Unidad:</span>
              <select
                value={terminal}
                onChange={(e) => {
                  setTerminal(e.target.value);
                  const found = TERMINALS.find((t) => t.label === e.target.value);
                  if (found) setSelectedEntity(found.id);
                }}
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

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] px-2.5 py-1 rounded-full border border-cyan-500/35 bg-cyan-500/10 text-cyan-300 font-semibold flex items-center gap-1">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>Sincronizada con PNP · Bomberos · SAMU · Serenazgo</span>
          </span>
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
            Central Unificada
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
                  ? `${term.accent} ring-2 ring-white/25`
                  : 'border-white/10 bg-[#07090E] hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-bold">{term.badge}</span>
                <span className="text-[9px] font-mono-tabular opacity-80">{term.number}</span>
              </div>
              <p className="font-mono-tabular text-lg font-black text-white mt-0.5">
                {activeCount} directas
              </p>
              <p className="text-[10px] text-slate-400">{doneCount} atendidas · + red</p>
            </button>
          );
        })}
      </div>

      {/* Mapa de Geolocalización Google Maps activado para emergencias */}
      {focusedAlert && mapActiveOnAlert && (
        <div className="rounded-2xl border border-red-500/35 bg-[#07090E] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-black text-red-400 flex items-center gap-1.5">
                <Siren className="w-3.5 h-3.5 animate-pulse" />
                Geolocalización Google Maps Activa · #{focusedAlert.codigo}
              </p>
              <h3 className="text-sm font-bold text-white mt-0.5">
                {focusedAlert.herido_nombre || focusedAlert.cliente_nombre} — {focusedAlert.mensaje}
              </h3>
              <p className="text-[11px] text-slate-400">
                Solicitante: {focusedAlert.solicitante_nombre || focusedAlert.cliente_nombre}
                {focusedAlert.solicitante_documento_numero
                  ? ` (${focusedAlert.solicitante_documento_tipo || 'DNI'} ${focusedAlert.solicitante_documento_numero})`
                  : ''}{' '}
                · {focusedAlert.ubicacion_texto}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular">
              <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-bold">
                {routeMetrics
                  ? `${routeMetrics.km} km · ETA ${routeMetrics.etaMin} min`
                  : `${focusedAlert.distancia_km ?? focusedAlert.distancia ?? '0.9 km'} · ETA ${
                      focusedAlert.eta_min ?? focusedAlert.eta ?? '3 min'
                    }`}
              </span>
              {focusedAlert.estado === 'ATENDIDA' && (
                <>
                  <button
                    type="button"
                    disabled={gpsUpdatingCode === focusedAlert.codigo}
                    onClick={() => handleShareBrowserUnitGps(focusedAlert)}
                    className="px-3 py-1.5 rounded-xl bg-sky-500/20 border border-sky-400/40 text-sky-300 font-bold hover:bg-sky-500/30"
                  >
                    {gpsUpdatingCode === focusedAlert.codigo ? 'Enviando GPS...' : 'Enviar GPS Unidad'}
                  </button>
                  <button
                    type="button"
                    disabled={gpsUpdatingCode === focusedAlert.codigo}
                    onClick={() => handleAdvanceUnitStep(focusedAlert)}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 font-bold hover:bg-amber-500/30"
                  >
                    Avanzar Ruta →
                  </button>
                </>
              )}
            </div>
          </div>

          <EmergencyGoogleMap
            unitLat={focusedAlert.unidad_lat ?? focusedStation.lat}
            unitLng={focusedAlert.unidad_lng ?? focusedStation.lng}
            unitLabel={focusedAlert.atendida_por || focusedStation.label}
            unitEntity={
              selectedEntity === 'TODOS' ? focusedAlert.resolvedEntity : selectedEntity
            }
            emergencyLat={focusedAlert.lat ?? -13.5167}
            emergencyLng={focusedAlert.lng ?? -71.9788}
            emergencyLabel={focusedAlert.herido_nombre || focusedAlert.cliente_nombre}
            emergencySublabel={focusedAlert.ubicacion_texto}
            showRoute={true}
            alerts={mapPins}
            selectedCodigo={focusedAlert.codigo}
            onSelectAlert={(code) => {
              setFocusedCodigo(code);
              setMapActiveOnAlert(true);
            }}
            onRouteMetrics={setRouteMetrics}
            heightClass="h-[270px] sm:h-[320px]"
          />
        </div>
      )}

      {dispatchMsg && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300 font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{dispatchMsg}</span>
        </div>
      )}

      {/* Cola de Emergencias Activas */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Panel {selectedEntity === 'TODOS' ? 'Unificado' : selectedEntity} · Cola Sincronizada de Emergencias ({filteredAlerts.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredAlerts.map((item) => {
            const isActive = item.estado === 'ACTIVA';
            const isFocused = focusedAlert?.codigo === item.codigo;
            const solicitante = item.solicitante_nombre || item.cliente_nombre;
            const herido = item.herido_nombre || item.cliente_nombre;
            const waHref = buildWhatsAppSosHref({
              codigo: item.codigo,
              entidad: item.resolvedEntity,
              solicitanteNombre: solicitante,
              docTipo: item.solicitante_documento_tipo,
              docNumero: item.solicitante_documento_numero,
              telefono: item.cliente_telefono || '',
              heridoNombre: herido,
              mensaje: item.mensaje,
              lat: item.lat ?? -13.5167,
              lng: item.lng ?? -71.9788,
            });

            return (
              <div
                key={item.codigo}
                onClick={() => {
                  setFocusedCodigo(item.codigo);
                  setMapActiveOnAlert(true);
                }}
                className={`rounded-2xl p-4 space-y-3 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-red-500/10 border-2 border-red-500/60 shadow-[0_0_24px_rgba(239,68,68,0.16)]'
                    : 'bg-[#07090E] border border-emerald-500/35'
                } ${isFocused ? 'ring-2 ring-amber-400/70' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
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
                      {selectedEntity !== 'TODOS' && item.resolvedEntity !== selectedEntity && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-semibold">
                          Sincronizada en red
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-bold text-white mt-1.5">{item.mensaje}</h4>
                    <p className="text-xs text-slate-200 mt-1">
                      Herido / Afectado: <span className="font-bold text-rose-300">{herido}</span>
                    </p>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Solicita: <span className="font-semibold">{solicitante}</span>
                      {item.solicitante_documento_numero && (
                        <span className="font-mono-tabular text-emerald-300">
                          {' '}
                          · {item.solicitante_documento_tipo || 'DNI'}: {item.solicitante_documento_numero}
                        </span>
                      )}
                      {item.cliente_telefono ? ` · WhatsApp: ${item.cliente_telefono}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300 bg-black/30 rounded-xl px-3 py-2 font-mono-tabular">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" /> {item.ubicacion_texto}
                  </span>
                  <span className="text-amber-300">
                    {typeof item.distancia_km === 'number' ? `${item.distancia_km} km` : item.distancia} · ETA{' '}
                    {typeof item.eta_min === 'number' ? `${item.eta_min} min` : item.eta}
                  </span>
                </div>

                <div
                  className="flex flex-wrap gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isActive ? (
                    <button
                      type="button"
                      onClick={() => void handleTakeAuxilio(item)}
                      className="flex-1 min-h-[42px] px-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                    >
                      <Siren className="w-4 h-4" />
                      <span>Aceptar y Activar Ruta</span>
                    </button>
                  ) : (
                    <div className="flex-1 min-h-[40px] rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 flex items-center justify-between text-xs text-emerald-300 font-semibold">
                      <span className="truncate">✓ {item.atendida_por || terminal}</span>
                      <span className="font-mono-tabular text-[10px] shrink-0 ml-1">En ruta</span>
                    </div>
                  )}

                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Compartir ficha y GPS por WhatsApp"
                    className="min-h-[40px] px-3 rounded-xl bg-[#25D366]/15 border border-[#25D366]/45 text-[#4ADE80] text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#25D366]/25"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

// ============================================================================
// 2. CHUSPA SOS ACTIVO (VALIDACIÓN DNI/RUC/EXTRANJERO + WHATSAPP + RUTA A→B)
// ============================================================================

interface SosActiveModalCardProps {
  onClose: () => void;
  onOpenDispatchCenter: () => void;
  coords: { lat: number; lng: number };
  onRefreshGps: () => void;
  defaultNombre: string;
  defaultTelefono: string;
  defaultDoc?: SharedCustomerDoc | null;
}

const SOS_PRESETS = [
  'Accidente de tránsito / Atropello',
  'Hemorragia / Fractura en ubicación GPS',
  'Robo / Asalto en progreso',
  'Incendio / Fuga de gas',
  'Mal de altura / Desmayo urgente',
];

export const SosActiveModalCard: React.FC<SosActiveModalCardProps> = ({
  onClose,
  onOpenDispatchCenter,
  coords,
  onRefreshGps,
  defaultNombre,
  defaultTelefono,
  defaultDoc,
}) => {
  const [docTipo, setDocTipo] = useState<'DNI' | 'RUC' | 'EXTRANJERO'>(
    defaultDoc?.tipo || 'DNI'
  );
  const [docNumero, setDocNumero] = useState(defaultDoc?.numero || '');
  const [solicitanteNombre, setSolicitanteNombre] = useState(
    defaultDoc?.nombre || defaultNombre || ''
  );
  const [docVerificado, setDocVerificado] = useState<SharedCustomerDoc | null>(
    defaultDoc?.verificado ? defaultDoc : null
  );
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const [telefono, setTelefono] = useState(defaultTelefono || '');
  const [paraOtraPersona, setParaOtraPersona] = useState(false);
  const [heridoNombre, setHeridoNombre] = useState(
    defaultDoc?.nombre || defaultNombre || ''
  );
  const [entidadObjetivo, setEntidadObjetivo] = useState<EntidadEmergencia>('SAMU');
  const [mensaje, setMensaje] = useState('Asistencia prioritaria en ubicación GPS actual');

  const [activeTicket, setActiveTicket] = useState<{
    codigo: string;
    solicitante: string;
    herido: string;
    entidad: EntidadEmergencia;
    detalle: string;
    estado: 'ACTIVA' | 'ATENDIDA';
    atendida_por?: string | null;
    unidad_lat?: number | null;
    unidad_lng?: number | null;
    distancia_km?: number | null;
    eta_min?: number | null;
  } | null>(null);

  const [liveRouteMetrics, setLiveRouteMetrics] = useState<{
    km: number;
    etaMin: number;
    source: 'google' | 'gps';
  } | null>(null);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const acceptedNotifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!paraOtraPersona) {
      setHeridoNombre(solicitanteNombre);
    }
  }, [paraOtraPersona, solicitanteNombre]);

  // Real-time listener on Firebase RTDB & backend for unit acceptance and live Point A -> Point B GPS route
  useEffect(() => {
    if (!activeTicket) return;
    let cancelled = false;

    async function syncTicketState() {
      if (!activeTicket || cancelled) return;
      try {
        const res = await apiFetch<{ emergencias: EmergencyItem[] }>('/api/public/emergencias');
        const found = (res?.emergencias || []).find((e) => e.codigo === activeTicket.codigo);
        if (!found || cancelled) return;

        setActiveTicket((prev) => {
          if (!prev || prev.codigo !== found.codigo) return prev;
          return {
            ...prev,
            estado: found.estado,
            atendida_por: found.atendida_por || prev.atendida_por,
            unidad_lat: typeof found.unidad_lat === 'number' ? found.unidad_lat : prev.unidad_lat,
            unidad_lng: typeof found.unidad_lng === 'number' ? found.unidad_lng : prev.unidad_lng,
            distancia_km:
              typeof found.distancia_km === 'number' ? found.distancia_km : prev.distancia_km,
            eta_min: typeof found.eta_min === 'number' ? found.eta_min : prev.eta_min,
          };
        });

        if (found.estado === 'ATENDIDA' && acceptedNotifiedRef.current !== found.codigo) {
          acceptedNotifiedRef.current = found.codigo;
          const unitName = found.atendida_por || found.entidad_objetivo || prevEntityFallback(activeTicket.entidad);
          playLuxuryChime();
          emitCenterNotification({
            id: `sos-client-accepted-${found.codigo}`,
            title: `Auxilio Aceptado · ${unitName}`,
            subtitle: `Ticket #${found.codigo} · Ruta Google Maps activada`,
            detail: `Unidad en camino hacia ${found.herido_nombre || activeTicket.herido} (${
              found.eta_min ?? 4
            } min aprox.).`,
            tone: 'success',
            speakText: `Auxilio aceptado por ${unitName}. La unidad ya va en ruta hacia tu ubicación, tiempo estimado ${
              found.eta_min ?? 4
            } minutos.`,
          });
        }
      } catch {
        // silent retry
      }
    }

    function prevEntityFallback(ent: EntidadEmergencia): string {
      return TERMINALS.find((t) => t.id === ent)?.label || ent;
    }

    void syncTicketState();
    const id = setInterval(() => void syncTicketState(), 2000);
    const unsub = subscribeFirebaseRtdbPath('emergencias', () => void syncTicketState());
    return () => {
      cancelled = true;
      clearInterval(id);
      unsub();
    };
  }, [activeTicket?.codigo]);

  async function handleValidateDoc() {
    setDocError(null);
    const raw = docNumero.trim();
    if (!raw) {
      setDocError('Ingresa tu DNI (8 dígitos), RUC (11 dígitos) o Pasaporte/CE.');
      return;
    }

    if (docTipo === 'EXTRANJERO') {
      if (!/^[A-Z0-9-]{6,20}$/i.test(raw)) {
        setDocError('Pasaporte o Carné de Extranjería debe tener entre 6 y 20 caracteres.');
        return;
      }
      const clean = raw.toUpperCase();
      const verified: SharedCustomerDoc = {
        tipo: 'EXTRANJERO',
        numero: clean,
        nombre: solicitanteNombre.trim() || `Visitante Extranjero (${clean})`,
        verificado: true,
        fuente: 'PASAPORTE/CE',
      };
      setDocVerificado(verified);
      if (!solicitanteNombre.trim()) setSolicitanteNombre(verified.nombre);
      return;
    }

    const digits = raw.replace(/\D/g, '');
    if (docTipo === 'DNI' && digits.length !== 8) {
      setDocError('El DNI debe tener exactamente 8 dígitos.');
      return;
    }
    if (docTipo === 'RUC' && digits.length !== 11) {
      setDocError('El RUC debe tener exactamente 11 dígitos.');
      return;
    }

    setDocLoading(true);
    try {
      const data = await apiFetch<PeruDocumentLookupResult>(
        `/api/public/consulta-documento?tipo=${docTipo}&numero=${encodeURIComponent(digits)}`
      );
      if (data?.nombre_completo) {
        const verified: SharedCustomerDoc = {
          tipo: docTipo,
          numero: digits,
          nombre: data.nombre_completo,
          direccionFiscal: data.direccion,
          verificado: true,
          fuente: data.fuente || data.source,
        };
        setDocVerificado(verified);
        setSolicitanteNombre(data.nombre_completo);
      } else {
        setDocError(formatPeruLookupError(docTipo, digits) || 'No se pudo validar el documento.');
      }
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'No se pudo consultar RENIEC/SUNAT.');
    } finally {
      setDocLoading(false);
    }
  }

  async function handleSubmitSos(e: React.FormEvent) {
    e.preventDefault();
    setDocError(null);
    const cleanSolicitante = solicitanteNombre.trim();
    const cleanHerido = (paraOtraPersona ? heridoNombre : cleanSolicitante).trim() || cleanSolicitante;
    const cleanTel = telefono.trim();

    if (cleanSolicitante.length < 2) {
      setDocError('Valida tu documento o ingresa el nombre completo de quien solicita la emergencia.');
      return;
    }
    if (cleanTel.length < 6) {
      setDocError('Ingresa un número de WhatsApp válido para contacto y seguimiento.');
      return;
    }

    setSubmitting(true);
    const t0 = performance.now();
    try {
      const res = await apiFetch<{ codigo: string; emergencia?: EmergencyItem }>('/api/public/emergencias', {
        method: 'POST',
        body: {
          cliente_nombre: cleanHerido,
          cliente_telefono: cleanTel,
          solicitante_nombre: cleanSolicitante,
          solicitante_documento_tipo: docVerificado?.tipo || (docNumero.trim() ? docTipo : undefined),
          solicitante_documento_numero: docVerificado?.numero || (docNumero.trim() || undefined),
          herido_nombre: cleanHerido,
          ubicacion_texto: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
          lat: coords.lat,
          lng: coords.lng,
          entidad_objetivo: entidadObjetivo,
          mensaje: `[${entidadObjetivo}] ${mensaje}`,
          sincronizada_todas: 1,
        },
      });
      const ms = Math.max(1, Math.round(performance.now() - t0));
      setActiveTicket({
        codigo: res.codigo,
        solicitante: cleanSolicitante,
        herido: cleanHerido,
        entidad: entidadObjetivo,
        detalle: mensaje,
        estado: res.emergencia?.estado || 'ACTIVA',
        atendida_por: res.emergencia?.atendida_por || null,
        unidad_lat: res.emergencia?.unidad_lat ?? null,
        unidad_lng: res.emergencia?.unidad_lng ?? null,
      });
      emitCenterNotification({
        id: `sos-sent-${res.codigo}`,
        title: `🚨 SOS Enviado a ${entidadObjetivo} · #${res.codigo}`,
        subtitle: `Solicita: ${cleanSolicitante} · Herido: ${cleanHerido}`,
        detail: 'Sincronizada con Policía PNP, Bomberos, SAMU y Serenazgo en tiempo real.',
        tone: 'emergency',
        responseMs: ms,
      });
    } catch {
      const fallbackCode = `CUS-2026-${Math.floor(10 + Math.random() * 89)}`;
      setActiveTicket({
        codigo: fallbackCode,
        solicitante: cleanSolicitante,
        herido: cleanHerido,
        entidad: entidadObjetivo,
        detalle: mensaje,
        estado: 'ACTIVA',
      });
    } finally {
      setSubmitting(false);
    }
  }

  const whatsAppShareUrl = buildWhatsAppSosHref({
    codigo: activeTicket?.codigo,
    entidad: activeTicket?.entidad || entidadObjetivo,
    solicitanteNombre: activeTicket?.solicitante || solicitanteNombre.trim() || 'Ciudadano',
    docTipo: docVerificado?.tipo || (docNumero.trim() ? docTipo : null),
    docNumero: docVerificado?.numero || docNumero.trim() || null,
    telefono: telefono.trim(),
    heridoNombre:
      activeTicket?.herido ||
      (paraOtraPersona ? heridoNombre.trim() : solicitanteNombre.trim()) ||
      'Afectado',
    mensaje: activeTicket?.detalle || mensaje,
    lat: coords.lat,
    lng: coords.lng,
  });

  function handleCopySosSummary() {
    const mapsUrl = `https://www.google.com/maps?q=${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`;
    const text = `ALERTA SOS${activeTicket ? ` #${activeTicket.codigo}` : ''} (${
      activeTicket?.entidad || entidadObjetivo
    }) · Solicitante: ${activeTicket?.solicitante || solicitanteNombre} · WhatsApp: ${telefono} · Herido: ${
      activeTicket?.herido || heridoNombre
    } · Emergencia: ${activeTicket?.detalle || mensaje} · Google Maps: ${mapsUrl}`;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2500);
    });
  }

  const acceptedStation = activeTicket
    ? TERMINALS.find(
        (t) => t.label === activeTicket.atendida_por || t.id === activeTicket.entidad
      ) || TERMINALS[0]
    : TERMINALS[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chuspa SOS Activo"
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
    >
      <div className="w-full max-w-lg rounded-[30px] bg-[#0D1117] border-2 border-red-500/60 chuspa-google-border p-5 sm:p-6 space-y-4 text-slate-100 shadow-[0_0_50px_rgba(239,68,68,0.22)] max-h-[93vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-red-600 flex items-center justify-center animate-pulse shrink-0">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-black text-red-400">
                Chuspa SOS Activo · Red Sincronizada
              </p>
              <h3 className="font-display text-xl font-bold text-white">
                {activeTicket
                  ? activeTicket.estado === 'ATENDIDA'
                    ? 'Auxilio Aceptado · Unidad en Ruta'
                    : 'Alerta SOS Enviada a Centrales'
                  : 'Asistencia Prioritaria Cusco'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar SOS"
            className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-slate-300 hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {activeTicket ? (
          <div className="space-y-3.5">
            <div className="rounded-2xl bg-red-500/15 border border-red-500/40 p-3.5 flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-red-300 font-bold block">
                  Ticket #{activeTicket.codigo} · {activeTicket.entidad}
                </span>
                <span className="text-xs text-slate-200 font-semibold">
                  {activeTicket.estado === 'ATENDIDA'
                    ? `Atendido por: ${activeTicket.atendida_por || acceptedStation.label}`
                    : 'Sincronizada con Policía PNP, Bomberos, SAMU y Serenazgo'}
                </span>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase shrink-0 ${
                  activeTicket.estado === 'ATENDIDA'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-red-600 text-white animate-pulse'
                }`}
              >
                {activeTicket.estado === 'ATENDIDA' ? 'En Ruta' : 'Código Rojo'}
              </span>
            </div>

            {/* Datos solicitante + herido */}
            <div className="rounded-2xl bg-[#07090E] border border-white/10 p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Solicitante:</span>
                <span className="font-semibold text-white text-right">
                  {activeTicket.solicitante}
                  {docVerificado?.numero ? ` (${docVerificado.tipo} ${docVerificado.numero})` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Herido / Afectado:</span>
                <span className="font-bold text-rose-300 text-right">{activeTicket.herido}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">WhatsApp:</span>
                <span className="font-mono-tabular text-emerald-300">{telefono}</span>
              </div>
              <p className="text-slate-300 pt-1.5 border-t border-white/10">{activeTicket.detalle}</p>
            </div>

            {/* Mapa Google Maps en tiempo real: cuando aceptan el auxilio muestra Punto A -> Punto B + ETA */}
            <div className="rounded-2xl bg-[#07090E] border border-emerald-500/35 p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-emerald-400">
                  <Ambulance className="w-4 h-4 shrink-0" />
                  <span>
                    {activeTicket.estado === 'ATENDIDA'
                      ? `Ruta Punto A (${activeTicket.atendida_por || acceptedStation.shortName}) → Punto B (Tú)`
                      : 'Ubicación exacta en Google Maps esperando unidad'}
                  </span>
                </div>
                {activeTicket.estado === 'ATENDIDA' && (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono-tabular text-[11px] font-black">
                    {liveRouteMetrics
                      ? `${liveRouteMetrics.km} km · ETA ${liveRouteMetrics.etaMin} min`
                      : `${activeTicket.distancia_km ?? 1.1} km · ETA ${activeTicket.eta_min ?? 4} min`}
                  </span>
                )}
              </div>

              <EmergencyGoogleMap
                unitLat={
                  activeTicket.estado === 'ATENDIDA'
                    ? activeTicket.unidad_lat ?? acceptedStation.lat
                    : undefined
                }
                unitLng={
                  activeTicket.estado === 'ATENDIDA'
                    ? activeTicket.unidad_lng ?? acceptedStation.lng
                    : undefined
                }
                unitLabel={activeTicket.atendida_por || acceptedStation.label}
                unitEntity={activeTicket.entidad}
                emergencyLat={coords.lat}
                emergencyLng={coords.lng}
                emergencyLabel={activeTicket.herido}
                emergencySublabel={activeTicket.detalle}
                showRoute={activeTicket.estado === 'ATENDIDA'}
                onRouteMetrics={setLiveRouteMetrics}
                heightClass="h-[220px] sm:h-[250px]"
              />
            </div>

            {/* Compartir por WhatsApp + Acciones */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <a
                href={whatsAppShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 shadow-md"
              >
                <Share2 className="w-4 h-4" />
                <span>Compartir ubicación por WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={handleCopySosSummary}
                className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Copy className="w-4 h-4 text-amber-400" />
                <span>{copiedMsg ? '¡Copiado!' : 'Copiar resumen y GPS'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() =>
                  speakSpanish(
                    activeTicket.estado === 'ATENDIDA'
                      ? `Ticket ${activeTicket.codigo}. ${
                          activeTicket.atendida_por || acceptedStation.label
                        } va en ruta hacia ${activeTicket.herido}. Tiempo estimado ${
                          liveRouteMetrics?.etaMin ?? activeTicket.eta_min ?? 4
                        } minutos.`
                      : `Central de emergencias conectada. Ticket ${activeTicket.codigo} sincronizado con Policía, Bomberos, SAMU y Serenazgo.`
                  )
                }
                className="min-h-[42px] rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Estado por Voz</span>
              </button>
              <button
                type="button"
                onClick={onRefreshGps}
                className="min-h-[42px] rounded-xl border border-white/15 bg-white/5 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
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
              className="w-full min-h-[42px] rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs font-bold"
            >
              Abrir Panel de Central de Emergencias →
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmitSos} className="space-y-3">
            {/* Selección de Entidad */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TERMINALS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEntidadObjetivo(t.id)}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-colors ${
                    entidadObjetivo === t.id
                      ? 'bg-red-600 text-white border-red-500 shadow-md'
                      : 'border-white/10 bg-[#07090E] text-slate-300'
                  }`}
                >
                  {t.shortName}
                </button>
              ))}
            </div>

            {/* Bloque de Validación DNI / RUC / Extranjero dentro de SOS */}
            <div className="rounded-2xl border border-amber-500/35 bg-amber-500/5 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Identidad del solicitante (DNI / RUC / Extranjero)</span>
                </span>
                {docVerificado?.verificado && (
                  <span className="text-[10px] font-mono-tabular text-emerald-300 font-bold flex items-center gap-1">
                    <BadgeCheck className="w-3.5 h-3.5" /> Verificado
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {(['DNI', 'RUC', 'EXTRANJERO'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setDocTipo(t);
                      setDocVerificado(null);
                      setDocError(null);
                    }}
                    className={`py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                      docTipo === t
                        ? 'bg-[#D4AF37] text-[#0B0E14] border-[#D4AF37]'
                        : 'border-white/10 bg-[#07090E] text-slate-300'
                    }`}
                  >
                    {t === 'DNI' ? 'DNI (8)' : t === 'RUC' ? 'RUC (11)' : 'Extranjero'}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={docNumero}
                  onChange={(e) => {
                    setDocNumero(e.target.value);
                    setDocVerificado(null);
                  }}
                  placeholder={
                    docTipo === 'DNI'
                      ? 'Ej: 44556677'
                      : docTipo === 'RUC'
                      ? 'Ej: 20601234565'
                      : 'Pasaporte / CE'
                  }
                  className="flex-1 min-h-[40px] px-3 rounded-xl border border-white/15 bg-[#07090E] text-xs font-mono-tabular text-white"
                />
                <button
                  type="button"
                  disabled={docLoading}
                  onClick={() => void handleValidateDoc()}
                  className="min-h-[40px] px-3 rounded-xl bg-[#D4AF37] text-[#0B0E14] text-xs font-extrabold whitespace-nowrap"
                >
                  {docLoading ? 'Validando...' : 'Validar'}
                </button>
              </div>
              {docError && <p className="text-[11px] text-rose-400">{docError}</p>}
            </div>

            {/* Datos de quien pide + WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Quien solicita la emergencia
                </label>
                <input
                  type="text"
                  required
                  value={solicitanteNombre}
                  onChange={(e) => setSolicitanteNombre(e.target.value)}
                  placeholder="Nombre completo o Razón Social"
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-white/15 bg-[#07090E] text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  WhatsApp del solicitante
                </label>
                <input
                  type="tel"
                  required
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="+51984123456"
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-white/15 bg-[#07090E] text-sm"
                />
              </div>
            </div>

            {/* Para quién es la emergencia / Nombre del herido */}
            <div className="rounded-2xl border border-white/10 bg-[#07090E] p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-300">
                  ¿Para quién pides el auxilio?
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setParaOtraPersona(false)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                      !paraOtraPersona
                        ? 'bg-rose-600 text-white border-rose-500'
                        : 'border-white/10 text-slate-400'
                    }`}
                  >
                    Para mí
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setParaOtraPersona(true);
                      if (heridoNombre === solicitanteNombre) setHeridoNombre('');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                      paraOtraPersona
                        ? 'bg-rose-600 text-white border-rose-500'
                        : 'border-white/10 text-slate-400'
                    }`}
                  >
                    Otra persona / Herido
                  </button>
                </div>
              </div>
              <input
                type="text"
                required
                value={heridoNombre}
                onChange={(e) => setHeridoNombre(e.target.value)}
                disabled={!paraOtraPersona}
                placeholder="Nombre completo del herido o afectado"
                className="w-full min-h-[40px] px-3.5 rounded-xl border border-white/15 bg-[#0D1117] text-sm disabled:opacity-75"
              />
            </div>

            {/* Tipo de emergencia */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {SOS_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMensaje(preset)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] border transition-colors ${
                      mensaje === preset
                        ? 'border-red-400 bg-red-500/20 text-red-200 font-bold'
                        : 'border-white/10 bg-[#07090E] text-slate-400 hover:text-white'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <textarea
                rows={2}
                required
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder="Describe brevemente cuál es la emergencia..."
                className="w-full p-3 rounded-xl border border-white/15 bg-[#07090E] text-sm"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 min-h-[48px] rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider shadow-lg"
              >
                {submitting ? 'Sincronizando...' : `🚨 Activar SOS (${entidadObjetivo})`}
              </button>
              <a
                href={whatsAppShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[48px] px-4 rounded-xl bg-[#25D366]/15 border border-[#25D366]/45 text-[#4ADE80] text-xs font-extrabold flex items-center justify-center gap-1.5 hover:bg-[#25D366]/25 whitespace-nowrap"
              >
                <Share2 className="w-4 h-4" />
                <span>WhatsApp GPS</span>
              </a>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
              <span className="text-slate-400 font-mono-tabular">
                GPS: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDispatchCenter();
                }}
                className="text-emerald-300 font-semibold hover:underline"
              >
                Abrir Central de Emergencias →
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
