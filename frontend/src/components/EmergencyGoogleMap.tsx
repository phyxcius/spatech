import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  APILoadingStatus,
  Map as GoogleMap,
  Pin,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { ExternalLink, MapPin, Navigation } from 'lucide-react';
import { haversineKm } from '../lib/cuscoMarkets.ts';
import { type EntidadEmergencia } from '../types.ts';
import { CuscoGeoMap, type GeoMapPin } from './CuscoGeoMap.tsx';

export interface EmergencyMapAlertPin {
  codigo: string;
  lat: number;
  lng: number;
  heridoNombre: string;
  entidad: EntidadEmergencia;
  estado: 'ACTIVA' | 'ATENDIDA';
  ubicacionTexto: string;
}

export interface EmergencyGoogleMapProps {
  unitLat?: number | null;
  unitLng?: number | null;
  unitLabel?: string;
  unitEntity?: EntidadEmergencia;
  emergencyLat: number;
  emergencyLng: number;
  emergencyLabel: string;
  emergencySublabel?: string;
  showRoute?: boolean;
  alerts?: EmergencyMapAlertPin[];
  selectedCodigo?: string | null;
  onSelectAlert?: (codigo: string) => void;
  heightClass?: string;
  onRouteMetrics?: (info: { km: number; etaMin: number; source: 'google' | 'gps' }) => void;
}

const MAPS_API_KEY = String(
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_GOOGLE_MAPS_API_KEY || ''
).trim();

const ENTITY_COLORS: Record<EntidadEmergencia, { bg: string; glyph: string; short: string }> = {
  SAMU: { bg: '#DC2626', glyph: '🚑', short: 'SAMU 106' },
  PNP_105: { bg: '#059669', glyph: '🚓', short: 'PNP 105' },
  BOMBEROS: { bg: '#EA580C', glyph: '🚒', short: 'BOMBEROS' },
  SERENAZGO: { bg: '#0284C7', glyph: '🛡️', short: 'SERENAZGO' },
};

interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface PolylineLike {
  setMap: (map: unknown) => void;
  setOptions: (opts: { strokeColor: string; strokeOpacity: number; strokeWeight: number }) => void;
}

interface GoogleRouteOverlayProps {
  origin: LatLngLiteral;
  destination: LatLngLiteral;
  strokeColor: string;
  onRouteMetrics?: (info: { km: number; etaMin: number; source: 'google' | 'gps' }) => void;
}

const GoogleRouteOverlay: React.FC<GoogleRouteOverlayProps> = ({
  origin,
  destination,
  strokeColor,
  onRouteMetrics,
}) => {
  const map = useMap();
  const coreLib = useMapsLibrary('core');
  const routesLib = useMapsLibrary('routes');
  const mapsLib = useMapsLibrary('maps');
  const polylinesRef = useRef<PolylineLike[]>([]);

  useEffect(() => {
    if (!map) return;

    const cleanupPolylines = () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };

    const drawDirectFallback = () => {
      if (!mapsLib) return;
      cleanupPolylines();
      const PolylineCtor = (mapsLib as unknown as {
        Polyline: new (opts: Record<string, unknown>) => PolylineLike;
      }).Polyline;
      const line = new PolylineCtor({
        path: [origin, destination],
        geodesic: true,
        strokeColor,
        strokeOpacity: 0.85,
        strokeWeight: 5,
        map,
      });
      polylinesRef.current = [line];

      if (coreLib && (coreLib as unknown as { LatLngBounds?: new () => { extend: (p: LatLngLiteral) => void } }).LatLngBounds) {
        const BoundsCtor = (coreLib as unknown as {
          LatLngBounds: new () => { extend: (p: LatLngLiteral) => void };
        }).LatLngBounds;
        const bounds = new BoundsCtor();
        bounds.extend(origin);
        bounds.extend(destination);
        (map as unknown as { fitBounds: (b: unknown, pad?: number) => void }).fitBounds(bounds, 48);
      }

      const km = Number(
        Math.max(0.15, haversineKm(origin.lat, origin.lng, destination.lat, destination.lng)).toFixed(2)
      );
      const etaMin = Math.max(1, Math.round(km * 2.4 + 1));
      onRouteMetrics?.({ km, etaMin, source: 'gps' });
    };

    if (!routesLib || !(routesLib as { Route?: unknown }).Route) {
      drawDirectFallback();
      return cleanupPolylines;
    }

    let cancelled = false;
    cleanupPolylines();

    const routeClass = (routesLib as unknown as {
      Route: {
        computeRoutes: (req: {
          origin: LatLngLiteral;
          destination: LatLngLiteral;
          travelMode: string;
          fields: string[];
        }) => Promise<{ routes?: Array<{
          createPolylines: () => PolylineLike[];
          viewport?: unknown;
          distanceMeters?: number;
          durationMillis?: number;
        }> }>;
      };
    }).Route;

    routeClass
      .computeRoutes({
        origin,
        destination,
        travelMode: 'DRIVING',
        fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'legs'],
      })
      .then(({ routes }) => {
        if (cancelled) return;
        const primary = routes?.[0];
        if (!primary) {
          drawDirectFallback();
          return;
        }
        const newLines = primary.createPolylines();
        newLines.forEach((poly) => {
          poly.setOptions({
            strokeColor,
            strokeOpacity: 0.94,
            strokeWeight: 6,
          });
          poly.setMap(map);
        });
        polylinesRef.current = newLines;

        if (primary.viewport) {
          (map as unknown as { fitBounds: (b: unknown, pad?: number) => void }).fitBounds(primary.viewport, 42);
        }

        const km = Number(
          Math.max(
            0.1,
            (primary.distanceMeters ?? haversineKm(origin.lat, origin.lng, destination.lat, destination.lng) * 1000) /
              1000
          ).toFixed(2)
        );
        const etaMin = Math.max(
          1,
          Math.round((primary.durationMillis ?? km * 140_000) / 60_000)
        );
        onRouteMetrics?.({ km, etaMin, source: 'google' });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err || '');
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429') || msg.includes('OVER_QUERY_LIMIT')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        drawDirectFallback();
      });

    return () => {
      cancelled = true;
      cleanupPolylines();
    };
  }, [map, coreLib, routesLib, mapsLib, origin.lat, origin.lng, destination.lat, destination.lng, strokeColor, onRouteMetrics]);

  return null;
};

interface GoogleMapInnerProps extends EmergencyGoogleMapProps {
  onStatusFail: () => void;
}

const GoogleMapInner: React.FC<GoogleMapInnerProps> = ({
  unitLat,
  unitLng,
  unitLabel = 'Unidad de Auxilio',
  unitEntity = 'SAMU',
  emergencyLat,
  emergencyLng,
  emergencyLabel,
  showRoute = false,
  alerts = [],
  selectedCodigo,
  onSelectAlert,
  onStatusFail,
  onRouteMetrics,
}) => {
  const status = useApiLoadingStatus();
  const map = useMap();

  useEffect(() => {
    if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
      onStatusFail();
    }
  }, [status, onStatusFail]);

  useEffect(() => {
    if (!map || showRoute) return;
    map.panTo({ lat: emergencyLat, lng: emergencyLng });
    map.setZoom(15);
  }, [map, showRoute, emergencyLat, emergencyLng]);

  const entityStyle = ENTITY_COLORS[unitEntity] || ENTITY_COLORS.SAMU;
  const hasUnit = typeof unitLat === 'number' && typeof unitLng === 'number';

  return (
    <GoogleMap
      mapId="DEMO_MAP_ID"
      defaultCenter={{ lat: emergencyLat, lng: emergencyLng }}
      defaultZoom={15}
      colorScheme="LIGHT"
      gestureHandling="greedy"
      disableDefaultUI={false}
      fullscreenControl={false}
      streetViewControl={false}
      mapTypeControl={false}
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      style={{ width: '100%', height: '100%' }}
    >
      {hasUnit && showRoute && (
        <GoogleRouteOverlay
          origin={{ lat: unitLat, lng: unitLng }}
          destination={{ lat: emergencyLat, lng: emergencyLng }}
          strokeColor={entityStyle.bg}
          onRouteMetrics={onRouteMetrics}
        />
      )}

      {hasUnit && (
        <AdvancedMarker position={{ lat: unitLat, lng: unitLng }} title={unitLabel}>
          <div
            style={{ backgroundColor: entityStyle.bg }}
            className="px-2.5 py-1 rounded-full text-white text-[11px] font-black shadow-lg border-2 border-white flex items-center gap-1 whitespace-nowrap"
          >
            <span>{entityStyle.glyph}</span>
            <span>A · {entityStyle.short}</span>
          </div>
        </AdvancedMarker>
      )}

      <AdvancedMarker
        position={{ lat: emergencyLat, lng: emergencyLng }}
        title={emergencyLabel}
      >
        <div className="flex flex-col items-center">
          <div className="px-2.5 py-1 rounded-full bg-rose-600 text-white text-[11px] font-black shadow-lg border-2 border-white whitespace-nowrap animate-pulse">
            🚨 B · {emergencyLabel}
          </div>
          <Pin background="#DC2626" borderColor="#FFFFFF" glyphColor="#FFFFFF" />
        </div>
      </AdvancedMarker>

      {alerts
        .filter((a) => a.codigo !== selectedCodigo)
        .map((a) => (
          <AdvancedMarker
            key={a.codigo}
            position={{ lat: a.lat, lng: a.lng }}
            title={`${a.codigo} · ${a.heridoNombre}`}
            onClick={() => onSelectAlert?.(a.codigo)}
          >
            <div
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shadow cursor-pointer whitespace-nowrap ${
                a.estado === 'ACTIVA'
                  ? 'bg-red-600 text-white border-white animate-pulse'
                  : 'bg-emerald-600 text-white border-white'
              }`}
            >
              {ENTITY_COLORS[a.entidad]?.glyph || '🚨'} #{a.codigo}
            </div>
          </AdvancedMarker>
        ))}
    </GoogleMap>
  );
};

export const EmergencyGoogleMap: React.FC<EmergencyGoogleMapProps> = (props) => {
  const {
    unitLat,
    unitLng,
    unitLabel = 'Unidad en Ruta',
    unitEntity = 'SAMU',
    emergencyLat,
    emergencyLng,
    emergencyLabel,
    emergencySublabel,
    showRoute = false,
    alerts = [],
    selectedCodigo,
    onSelectAlert,
    heightClass = 'h-[270px] sm:h-[320px]',
    onRouteMetrics,
  } = props;

  const [googleFailed, setGoogleFailed] = useState(false);

  useEffect(() => {
    const onQuota = () => setGoogleFailed(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  const canUseGoogleSdk = Boolean(MAPS_API_KEY) && !googleFailed;
  const hasUnit = typeof unitLat === 'number' && typeof unitLng === 'number';

  const fallbackKm = useMemo(() => {
    if (!hasUnit) return null;
    return Number(
      Math.max(0.15, haversineKm(unitLat, unitLng, emergencyLat, emergencyLng)).toFixed(2)
    );
  }, [hasUnit, unitLat, unitLng, emergencyLat, emergencyLng]);

  const fallbackEta = useMemo(() => {
    if (fallbackKm === null) return null;
    return Math.max(1, Math.round(fallbackKm * 2.4 + 1));
  }, [fallbackKm]);

  const googleMapsExternalUrl = hasUnit
    ? `https://www.google.com/maps/dir/?api=1&origin=${unitLat},${unitLng}&destination=${emergencyLat},${emergencyLng}&travelmode=driving`
    : `https://www.google.com/maps/search/?api=1&query=${emergencyLat},${emergencyLng}`;

  const fallbackPins: GeoMapPin[] = useMemo(() => {
    const list: GeoMapPin[] = alerts.map((a) => ({
      id: a.codigo,
      lat: a.lat,
      lng: a.lng,
      priceText: `${ENTITY_COLORS[a.entidad]?.glyph || '🚨'} #${a.codigo}`,
      sublabel: a.heridoNombre,
      detailTitle: `${a.entidad} · ${a.ubicacionTexto}`,
      tier: a.codigo === selectedCodigo ? 'cheapest' : a.estado === 'ACTIVA' ? 'high' : 'mid',
      kind: 'BUSINESS',
      isOpen: true,
    }));
    if (!list.some((p) => p.id === (selectedCodigo || 'SOS-TARGET'))) {
      list.push({
        id: selectedCodigo || 'SOS-TARGET',
        lat: emergencyLat,
        lng: emergencyLng,
        priceText: '🚨 Emergencia',
        sublabel: emergencyLabel,
        detailTitle: emergencySublabel || 'Punto de auxilio SOS',
        tier: 'high',
        kind: 'BUSINESS',
        isOpen: true,
      });
    }
    return list;
  }, [alerts, selectedCodigo, emergencyLat, emergencyLng, emergencyLabel, emergencySublabel]);

  return (
    <div className="space-y-2">
      <div
        className={`relative w-full ${heightClass} rounded-2xl overflow-hidden border border-red-500/35 bg-[#07090E]`}
        style={{ minHeight: '240px' }}
      >
        {canUseGoogleSdk ? (
          <APIProvider apiKey={MAPS_API_KEY} language="es" region="PE" libraries={['routes', 'marker']}>
            <GoogleMapInner
              {...props}
              onStatusFail={() => setGoogleFailed(true)}
            />
          </APIProvider>
        ) : (
          <CuscoGeoMap
            mode="TAXI"
            userLat={emergencyLat}
            userLng={emergencyLng}
            originLabel={`Punto B (Emergencia): ${emergencyLabel}`}
            destLat={hasUnit && showRoute ? unitLat : undefined}
            destLng={hasUnit && showRoute ? unitLng : undefined}
            destLabel={unitLabel}
            driverLat={hasUnit ? unitLat : undefined}
            driverLng={hasUnit ? unitLng : undefined}
            driverLabel={unitLabel}
            driverEtaBadge={
              fallbackEta !== null && fallbackKm !== null
                ? `${fallbackEta} min\n${fallbackKm} km`
                : undefined
            }
            routeBadge={
              hasUnit && fallbackEta !== null && fallbackKm !== null
                ? `${fallbackEta} min\n${fallbackKm} km`
                : undefined
            }
            pins={fallbackPins}
            selectedPinId={selectedCodigo || null}
            onSelectPin={(id) => onSelectAlert?.(id)}
            onRequestPinAction={(id) => onSelectAlert?.(id)}
            onRouteComputed={(info) =>
              onRouteMetrics?.({ km: info.km, etaMin: info.etaMin, source: 'gps' })
            }
            heightClass={heightClass}
          />
        )}

        <div className="pointer-events-none absolute top-2.5 left-2.5 z-10 flex flex-wrap items-center gap-1.5">
          <span className="px-2.5 py-1 rounded-full bg-black/80 backdrop-blur text-[10px] font-bold text-white border border-white/15 flex items-center gap-1">
            <Navigation className="w-3 h-3 text-emerald-400" />
            <span>
              {canUseGoogleSdk
                ? 'Google Maps Platform · Ruta en vivo'
                : googleFailed
                  ? 'Mapa Respaldo · Error/Cuota Google'
                  : 'Mapa Respaldo · Falta API Key Google'}
            </span>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-300 font-mono-tabular">
          <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span>
            {emergencyLat.toFixed(5)}, {emergencyLng.toFixed(5)}
          </span>
        </div>

        <a
          href={googleMapsExternalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#4285F4]/15 border border-[#4285F4]/45 text-[#8AB4F8] hover:bg-[#4285F4]/25 font-semibold transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>{hasUnit ? 'Ver ruta A→B en Google Maps' : 'Abrir ubicación en Google Maps'}</span>
        </a>
      </div>
    </div>
  );
};
