import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  APILoadingStatus,
  Map as GoogleMap,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Crosshair,
  ExternalLink,
  Layers,
  Maximize2,
  Minimize2,
  Navigation,
  Scan,
} from 'lucide-react';

export interface GeoMapPin {
  id: string;
  lat: number;
  lng: number;
  priceText: string;
  sublabel?: string;
  detailTitle?: string;
  tier: 'cheapest' | 'mid' | 'high' | 'closed';
  kind: 'DRIVER' | 'MARKET' | 'BUSINESS';
  isOpen?: boolean;
}

export interface CuscoGeoMapProps {
  mode: 'TAXI' | 'MARKET';
  userLat: number;
  userLng: number;
  originLabel?: string;
  destLat?: number;
  destLng?: number;
  destLabel?: string;
  driverLat?: number;
  driverLng?: number;
  driverLabel?: string;
  driverEtaBadge?: string;
  routeBadge?: string;
  routeSummary?: string;
  pins: GeoMapPin[];
  selectedPinId?: string | null;
  onSelectPin?: (id: string) => void;
  onRequestPinAction?: (id: string) => void;
  onRouteComputed?: (info: { km: number; etaMin: number }) => void;
  onRequestGps?: () => void;
  onMapClick?: (lat: number, lng: number) => void;
  gpsLive?: boolean;
  followDriver?: boolean;
  activeLeg?: 'TO_PICKUP' | 'TO_DESTINATION' | 'BOTH';
  heightClass?: string;
}

const MAPS_API_KEY = String(
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_GOOGLE_MAPS_API_KEY || ''
).trim();

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildCuscoStreetGridFallback(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): Array<[number, number]> {
  const steps = 6;
  const pts: Array<[number, number]> = [[lat1, lng1]];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const prev = pts[pts.length - 1];
    const targetLat = lat1 + (lat2 - lat1) * t;
    const targetLng = lng1 + (lng2 - lng1) * t;
    if (i % 2 === 1) {
      pts.push([targetLat, prev[1]]);
    } else {
      pts.push([prev[0], targetLng]);
    }
  }
  pts.push([lat2, lng2]);
  return pts;
}

function approxKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface PolylineLike {
  setMap: (map: unknown) => void;
  setOptions: (opts: { strokeColor: string; strokeOpacity: number; strokeWeight: number }) => void;
}

interface GoogleRouteLineProps {
  origin: LatLngLiteral;
  destination: LatLngLiteral;
  strokeColor: string;
  outlineColor: string;
  badgeText?: string;
  onRouteComputed?: (info: { km: number; etaMin: number }) => void;
}

const GoogleRouteLine: React.FC<GoogleRouteLineProps> = ({
  origin,
  destination,
  strokeColor,
  outlineColor,
  badgeText,
  onRouteComputed,
}) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const mapsLib = useMapsLibrary('maps');
  const polylinesRef = useRef<PolylineLike[]>([]);
  const onRouteRef = useRef(onRouteComputed);
  onRouteRef.current = onRouteComputed;

  const [midPoint, setMidPoint] = useState<LatLngLiteral>({
    lat: (origin.lat + destination.lat) / 2,
    lng: (origin.lng + destination.lng) / 2,
  });

  useEffect(() => {
    if (!map) return;

    const cleanup = () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };

    const drawDirectFallback = () => {
      if (!mapsLib) return;
      cleanup();
      const PolylineCtor = (mapsLib as unknown as {
        Polyline: new (opts: Record<string, unknown>) => PolylineLike;
      }).Polyline;
      const grid = buildCuscoStreetGridFallback(
        origin.lat,
        origin.lng,
        destination.lat,
        destination.lng
      ).map(([lat, lng]) => ({ lat, lng }));
      const halo = new PolylineCtor({
        path: grid,
        strokeColor: outlineColor,
        strokeOpacity: 0.92,
        strokeWeight: 8,
        map,
      });
      const mainLine = new PolylineCtor({
        path: grid,
        strokeColor,
        strokeOpacity: 0.98,
        strokeWeight: 5,
        map,
      });
      polylinesRef.current = [halo, mainLine];
      setMidPoint(grid[Math.floor(grid.length / 2)] || origin);
      const km = Math.max(0.2, Number(approxKm(origin.lat, origin.lng, destination.lat, destination.lng).toFixed(1)));
      onRouteRef.current?.({ km, etaMin: Math.max(1, Math.round(km * 3.1 + 1)) });
    };

    if (!routesLib || !(routesLib as { Route?: unknown }).Route) {
      drawDirectFallback();
      return cleanup;
    }

    let cancelled = false;
    cleanup();

    const routeClass = (routesLib as unknown as {
      Route: {
        computeRoutes: (req: {
          origin: LatLngLiteral;
          destination: LatLngLiteral;
          travelMode: string;
          fields: string[];
        }) => Promise<{
          routes?: Array<{
            createPolylines: () => PolylineLike[];
            path?: Array<{ lat: () => number; lng: () => number } | LatLngLiteral>;
            distanceMeters?: number;
            durationMillis?: number;
          }>;
        }>;
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
        const created = primary.createPolylines();
        const outerCreated = primary.createPolylines();
        outerCreated.forEach((poly) => {
          poly.setOptions({
            strokeColor: outlineColor,
            strokeOpacity: 0.92,
            strokeWeight: 8,
          });
          poly.setMap(map);
        });
        created.forEach((poly) => {
          poly.setOptions({
            strokeColor,
            strokeOpacity: 0.98,
            strokeWeight: 5,
          });
          poly.setMap(map);
        });
        polylinesRef.current = [...outerCreated, ...created];

        const pathPts = primary.path;
        if (Array.isArray(pathPts) && pathPts.length > 0) {
          const mid = pathPts[Math.floor(pathPts.length / 2)];
          const latVal =
            typeof (mid as { lat?: unknown }).lat === 'function'
              ? (mid as { lat: () => number }).lat()
              : Number((mid as LatLngLiteral).lat);
          const lngVal =
            typeof (mid as { lng?: unknown }).lng === 'function'
              ? (mid as { lng: () => number }).lng()
              : Number((mid as LatLngLiteral).lng);
          if (Number.isFinite(latVal) && Number.isFinite(lngVal)) {
            setMidPoint({ lat: latVal, lng: lngVal });
          }
        }

        const km = Math.max(
          0.2,
          Number(
            (
              (primary.distanceMeters ??
                approxKm(origin.lat, origin.lng, destination.lat, destination.lng) * 1000) /
              1000
            ).toFixed(1)
          )
        );
        const etaMin = Math.max(
          1,
          Math.round((primary.durationMillis ?? km * 170_000) / 60_000)
        );
        onRouteRef.current?.({ km, etaMin });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err || '');
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('429') ||
          msg.includes('OVER_QUERY_LIMIT')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        drawDirectFallback();
      });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [
    map,
    routesLib,
    mapsLib,
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng,
    strokeColor,
    outlineColor,
  ]);

  if (!badgeText) return null;

  return (
    <AdvancedMarker position={midPoint} zIndex={620}>
      <div
        style={{ backgroundColor: strokeColor }}
        className="px-2.5 py-1 rounded-xl border-2 border-white text-white text-[11px] font-extrabold leading-tight text-center shadow-lg whitespace-pre-line pointer-events-none"
      >
        {badgeText}
      </div>
    </AdvancedMarker>
  );
};

interface GoogleCuscoInnerProps extends CuscoGeoMapProps {
  mapTypeId: 'roadmap' | 'hybrid';
  isFullscreen: boolean;
  fitSignal: number;
  onStatusFail: () => void;
}

const GoogleCuscoInner: React.FC<GoogleCuscoInnerProps> = ({
  mode,
  userLat,
  userLng,
  originLabel = 'Plaza de Armas, Cusco',
  destLat,
  destLng,
  destLabel,
  driverLat,
  driverLng,
  driverLabel,
  driverEtaBadge,
  routeBadge,
  routeSummary,
  pins,
  selectedPinId,
  onSelectPin,
  onRouteComputed,
  onMapClick,
  mapTypeId,
  isFullscreen,
  fitSignal,
  followDriver = false,
  activeLeg = 'BOTH',
  onStatusFail,
}) => {
  const status = useApiLoadingStatus();
  const map = useMap();
  const coreLib = useMapsLibrary('core');

  useEffect(() => {
    if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
      onStatusFail();
    }
  }, [status, onStatusFail]);

  // Refrescar viewport de Google Maps al agrandar/encoger
  useEffect(() => {
    if (!map) return;
    const gMaps = (window as { google?: { maps?: { event?: { trigger: (m: unknown, ev: string) => void } } } })
      .google?.maps;
    const t1 = window.setTimeout(() => gMaps?.event?.trigger(map, 'resize'), 60);
    const t2 = window.setTimeout(() => gMaps?.event?.trigger(map, 'resize'), 240);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [map, isFullscreen]);

  const fitAllBounds = useCallback(() => {
    if (!map || !coreLib) return;
    if (followDriver && driverLat !== undefined && driverLng !== undefined) {
      map.panTo({ lat: driverLat, lng: driverLng });
      const currentZoom = map.getZoom() ?? 14.5;
      if (currentZoom < 16) map.setZoom(16.5);
      return;
    }

    const BoundsCtor = (coreLib as unknown as {
      LatLngBounds?: new () => { extend: (p: LatLngLiteral) => void };
    }).LatLngBounds;
    if (!BoundsCtor) return;

    const pts: LatLngLiteral[] = [];
    if (activeLeg !== 'TO_DESTINATION') {
      pts.push({ lat: userLat, lng: userLng });
    }
    if (mode === 'TAXI' && destLat !== undefined && destLng !== undefined) {
      pts.push({ lat: destLat, lng: destLng });
    }
    if (mode === 'TAXI' && driverLat !== undefined && driverLng !== undefined) {
      pts.push({ lat: driverLat, lng: driverLng });
    }
    pins.forEach((p) => pts.push({ lat: p.lat, lng: p.lng }));

    if (pts.length > 1) {
      const bounds = new BoundsCtor();
      pts.forEach((pt) => bounds.extend(pt));
      (map as unknown as { fitBounds: (b: unknown, pad?: number) => void }).fitBounds(bounds, 54);
    } else {
      map.panTo({ lat: userLat, lng: userLng });
      map.setZoom(15);
    }
  }, [
    map,
    coreLib,
    mode,
    userLat,
    userLng,
    destLat,
    destLng,
    driverLat,
    driverLng,
    pins,
    followDriver,
    activeLeg,
  ]);

  useEffect(() => {
    fitAllBounds();
  }, [fitAllBounds, fitSignal]);

  // Centrar suavemente en el conductor cuando followDriver está activo
  useEffect(() => {
    if (!map || !followDriver || driverLat === undefined || driverLng === undefined) return;
    map.panTo({ lat: driverLat, lng: driverLng });
    const currentZoom = map.getZoom() ?? 14;
    if (currentZoom < 16) {
      map.setZoom(16.5);
    }
  }, [map, followDriver, driverLat, driverLng]);

  useEffect(() => {
    if (!selectedPinId || !map) return;
    const found = pins.find((p) => p.id === selectedPinId);
    if (found) {
      map.panTo({ lat: found.lat, lng: found.lng });
    }
  }, [selectedPinId, map, pins]);

  const showPickupLeg =
    mode === 'TAXI' &&
    activeLeg !== 'TO_DESTINATION' &&
    driverLat !== undefined &&
    driverLng !== undefined;

  const destinationOrigin: LatLngLiteral =
    activeLeg === 'TO_DESTINATION' && driverLat !== undefined && driverLng !== undefined
      ? { lat: driverLat, lng: driverLng }
      : { lat: userLat, lng: userLng };

  return (
    <GoogleMap
      mapId="DEMO_MAP_ID"
      defaultCenter={
        followDriver && driverLat !== undefined && driverLng !== undefined
          ? { lat: driverLat, lng: driverLng }
          : { lat: userLat, lng: userLng }
      }
      defaultZoom={followDriver ? 16.5 : 15}
      colorScheme="LIGHT"
      mapTypeId={mapTypeId}
      gestureHandling="greedy"
      disableDefaultUI={false}
      fullscreenControl={false}
      streetViewControl={false}
      mapTypeControl={false}
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      onClick={(ev) => {
        const latLng = ev.detail?.latLng;
        if (latLng && onMapClick) {
          onMapClick(Number(latLng.lat.toFixed(5)), Number(latLng.lng.toFixed(5)));
        }
      }}
      style={{ width: '100%', height: '100%' }}
    >
      {/* Ruta Conductor -> Punto A (antes de validar PIN) */}
      {showPickupLeg && driverLat !== undefined && driverLng !== undefined && (
        <GoogleRouteLine
          origin={{ lat: driverLat, lng: driverLng }}
          destination={{ lat: userLat, lng: userLng }}
          strokeColor="#2563EB"
          outlineColor="#FFFFFF"
          badgeText={driverEtaBadge}
        />
      )}

      {/* Ruta Activa hacia Destino B (desde Punto A o desde GPS del Conductor cuando PIN fue validado) */}
      {mode === 'TAXI' && destLat !== undefined && destLng !== undefined && (
        <GoogleRouteLine
          origin={destinationOrigin}
          destination={{ lat: destLat, lng: destLng }}
          strokeColor={activeLeg === 'TO_DESTINATION' ? '#4F46E5' : '#16A34A'}
          outlineColor={activeLeg === 'TO_DESTINATION' ? '#1E1B4B' : '#0F172A'}
          badgeText={routeBadge || routeSummary}
          onRouteComputed={onRouteComputed}
        />
      )}

      {/* Marcador de Conductor (TAXI) */}
      {mode === 'TAXI' && driverLat !== undefined && driverLng !== undefined && (
        <AdvancedMarker
          position={{ lat: driverLat, lng: driverLng }}
          title={driverLabel || 'Conductor en ruta'}
          zIndex={750}
        >
          <div className="flex items-center gap-1.5">
            <div className="relative w-10 h-10 rounded-full bg-[#2563EB] border-[3px] border-white shadow-xl flex items-center justify-center text-base">
              <span className="absolute -inset-1.5 rounded-full border-2 border-[#60A5FA]/70 animate-ping" />
              <span>🚕</span>
            </div>
            {driverLabel && (
              <span className="px-2.5 py-0.5 rounded-lg bg-[#0F172A]/95 text-white border border-[#60A5FA] text-[10px] font-bold whitespace-nowrap shadow-md">
                {driverLabel}
              </span>
            )}
          </div>
        </AdvancedMarker>
      )}

      {/* Marcador GPS Cliente / Origen A */}
      {mode === 'TAXI' ? (
        activeLeg !== 'TO_DESTINATION' && (
          <AdvancedMarker position={{ lat: userLat, lng: userLng }} title={originLabel} zIndex={500}>
            <div className="flex items-center gap-1.5 bg-[#111827] text-white px-2.5 py-1 rounded-xl border-2 border-white shadow-lg text-[11px] font-bold whitespace-nowrap">
              <span className="w-4 h-4 rounded bg-[#2563EB] text-white inline-flex items-center justify-center text-[10px] font-extrabold">
                A
              </span>
              <span className="max-w-[115px] truncate">{originLabel}</span>
            </div>
          </AdvancedMarker>
        )
      ) : (
        <AdvancedMarker position={{ lat: userLat, lng: userLng }} title="Tu ubicación GPS" zIndex={450}>
          <div className="relative w-7 h-7 flex items-center justify-center">
            <span className="absolute w-6 h-6 rounded-full bg-[#2563EB]/30 animate-ping" />
            <span className="w-3.5 h-3.5 rounded-full bg-[#2563EB] border-2 border-white shadow-md" />
          </div>
        </AdvancedMarker>
      )}

      {/* Marcador Destino B */}
      {mode === 'TAXI' && destLat !== undefined && destLng !== undefined && (
        <AdvancedMarker
          position={{ lat: destLat, lng: destLng }}
          title={destLabel || 'Destino'}
          zIndex={650}
        >
          <div className="flex items-center gap-1.5 bg-[#0F172A] text-white px-2.5 py-1 rounded-xl border-2 border-[#4F46E5] shadow-lg text-[11px] font-bold whitespace-nowrap">
            <span className="w-4 h-4 rounded bg-[#16A34A] text-white inline-flex items-center justify-center text-[10px] font-extrabold">
              B
            </span>
            <span className="max-w-[130px] truncate">{destLabel || 'Destino'}</span>
          </div>
        </AdvancedMarker>
      )}

      {/* Pines de negocios, taxistas y markets */}
      {pins.map((pin) => {
        const selected = pin.id === selectedPinId;
        const bg =
          pin.tier === 'closed'
            ? '#475569'
            : pin.tier === 'cheapest'
              ? '#16A34A'
              : pin.tier === 'high'
                ? '#DC2626'
                : '#FACC15';
        const fg = pin.tier === 'mid' ? '#0B0E14' : '#FFFFFF';
        const prefix = pin.kind === 'DRIVER' ? '🚕 ' : pin.kind === 'BUSINESS' ? '📍 ' : '';

        return (
          <AdvancedMarker
            key={pin.id}
            position={{ lat: pin.lat, lng: pin.lng }}
            title={pin.detailTitle || pin.sublabel || pin.priceText}
            zIndex={selected ? 900 : pin.tier === 'cheapest' ? 600 : 200}
            onClick={() => onSelectPin?.(pin.id)}
          >
            <div
              className={`flex flex-col items-center cursor-pointer transition-transform ${
                selected ? 'scale-110' : 'hover:scale-105'
              }`}
            >
              <div
                style={{
                  backgroundColor: bg,
                  color: fg,
                  borderColor: selected ? '#0B0E14' : '#FFFFFF',
                  boxShadow: selected
                    ? '0 0 0 3px #D4AF37, 0 10px 24px rgba(0,0,0,0.45)'
                    : '0 6px 16px rgba(0,0,0,0.32)',
                }}
                className="border-2 rounded-2xl px-2.5 py-1 flex flex-col items-center leading-tight whitespace-nowrap"
              >
                <span className="font-mono text-[11px] font-extrabold tracking-tight">
                  {prefix}
                  {pin.priceText}
                </span>
                {pin.sublabel && (
                  <span className="text-[9px] font-bold opacity-95 max-w-[100px] truncate">
                    {pin.sublabel}
                  </span>
                )}
              </div>
              <div
                style={{ borderTopColor: bg }}
                className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[7px] -mt-px"
              />
            </div>
          </AdvancedMarker>
        );
      })}
    </GoogleMap>
  );
};

// Respaldo de alta definición (CartoDB Voyager Retina + Esri Satélite con calles) si falta clave o cuota
const CuscoGeoLeafletFallback: React.FC<
  CuscoGeoMapProps & {
    isFullscreen: boolean;
    fitTrigger: number;
    mapTypeId: 'roadmap' | 'hybrid';
  }
> = ({
  mode,
  userLat,
  userLng,
  originLabel = 'Plaza de Armas, Cusco',
  destLat,
  destLng,
  destLabel,
  driverLat,
  driverLng,
  driverLabel,
  driverEtaBadge,
  routeBadge,
  routeSummary,
  pins,
  selectedPinId,
  onSelectPin,
  onRouteComputed,
  onMapClick,
  heightClass = 'h-[360px] sm:h-[430px]',
  isFullscreen,
  fitTrigger,
  mapTypeId,
  followDriver = false,
  activeLeg = 'BOTH',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseTileGroupRef = useRef<L.LayerGroup | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const onSelectPinRef = useRef(onSelectPin);
  onSelectPinRef.current = onSelectPin;
  const onRouteComputedRef = useRef(onRouteComputed);
  onRouteComputedRef.current = onRouteComputed;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  const [streetCoords, setStreetCoords] = useState<Array<[number, number]>>([]);
  const [driverStreetCoords, setDriverStreetCoords] = useState<Array<[number, number]>>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const initialCenter: [number, number] =
      followDriver && driverLat !== undefined && driverLng !== undefined
        ? [driverLat, driverLng]
        : [userLat, userLng];

    const map = L.map(el, {
      center: initialCenter,
      zoom: followDriver ? 16 : 15,
      maxZoom: 21,
      minZoom: 11,
      zoomControl: false,
      attributionControl: true,
    });

    const baseGroup = L.layerGroup().addTo(map);
    const group = L.layerGroup().addTo(map);

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current?.(Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5)));
    });

    mapRef.current = map;
    baseTileGroupRef.current = baseGroup;
    layerGroupRef.current = group;

    const ro = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      baseTileGroupRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Capas nítidas tipo Google Maps (Mapa callejero moderno / Híbrido Satélite + Calles)
  useEffect(() => {
    const baseGroup = baseTileGroupRef.current;
    if (!baseGroup) return;
    baseGroup.clearLayers();

    if (mapTypeId === 'hybrid') {
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxNativeZoom: 19,
          maxZoom: 21,
          attribution: '&copy; Esri &amp; GIS',
        }
      ).addTo(baseGroup);
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
        {
          subdomains: 'abcd',
          maxNativeZoom: 19,
          maxZoom: 21,
          attribution: '&copy; CARTO',
        }
      ).addTo(baseGroup);
    } else {
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        {
          subdomains: 'abcd',
          maxNativeZoom: 19,
          maxZoom: 21,
          attribution: '&copy; CARTO &copy; OpenStreetMap',
        }
      ).addTo(baseGroup);
    }
  }, [mapTypeId]);

  const fitAllBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (followDriver && driverLat !== undefined && driverLng !== undefined) {
      map.setView([driverLat, driverLng], Math.max(map.getZoom(), 16.5), { animate: true });
      return;
    }

    const pts: L.LatLngExpression[] = [];
    if (activeLeg !== 'TO_DESTINATION') {
      pts.push([userLat, userLng]);
    }
    if (mode === 'TAXI' && destLat !== undefined && destLng !== undefined) {
      pts.push([destLat, destLng]);
    }
    if (mode === 'TAXI' && driverLat !== undefined && driverLng !== undefined) {
      pts.push([driverLat, driverLng]);
    }
    pins.forEach((p) => pts.push([p.lat, p.lng]));

    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [46, 46], maxZoom: 17 });
    } else {
      map.setView([userLat, userLng], 15.5);
    }
  }, [mode, userLat, userLng, destLat, destLng, driverLat, driverLng, pins, followDriver, activeLeg]);

  // Refresco robusto multi-tick al agrandar/encoger para evitar lienzos oscuros o vacíos
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t1 = window.setTimeout(() => {
      map.invalidateSize({ pan: false });
      fitAllBounds();
    }, 45);
    const t2 = window.setTimeout(() => {
      map.invalidateSize({ pan: false });
    }, 180);
    const t3 = window.setTimeout(() => {
      map.invalidateSize({ pan: false });
      fitAllBounds();
    }, 380);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [isFullscreen, fitTrigger, fitAllBounds]);

  // Seguimiento GPS en vivo centrado en el conductor cuando PIN fue validado
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !followDriver || driverLat === undefined || driverLng === undefined) return;
    map.panTo([driverLat, driverLng], { animate: true, duration: 0.55 });
    if (map.getZoom() < 16) {
      map.setZoom(16.5);
    }
  }, [followDriver, driverLat, driverLng]);

  const activeStartLat =
    activeLeg === 'TO_DESTINATION' && driverLat !== undefined ? driverLat : userLat;
  const activeStartLng =
    activeLeg === 'TO_DESTINATION' && driverLng !== undefined ? driverLng : userLng;

  useEffect(() => {
    if (mode !== 'TAXI' || destLat === undefined || destLng === undefined) {
      setStreetCoords([]);
      return;
    }
    const controller = new AbortController();
    const fallback = buildCuscoStreetGridFallback(activeStartLat, activeStartLng, destLat, destLng);
    setStreetCoords(fallback);
    const url = `https://router.project-osrm.org/route/v1/driving/${activeStartLng},${activeStartLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const route = data?.routes?.[0];
        const coords = route?.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          setStreetCoords(
            coords.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])
          );
          if (typeof route.distance === 'number' && typeof route.duration === 'number') {
            onRouteComputedRef.current?.({
              km: Math.max(0.2, Number((route.distance / 1000).toFixed(1))),
              etaMin: Math.max(1, Math.round(route.duration / 60)),
            });
          }
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [mode, activeStartLat, activeStartLng, destLat, destLng]);

  useEffect(() => {
    if (
      mode !== 'TAXI' ||
      activeLeg === 'TO_DESTINATION' ||
      driverLat === undefined ||
      driverLng === undefined
    ) {
      setDriverStreetCoords([]);
      return;
    }
    const controller = new AbortController();
    const fallback = buildCuscoStreetGridFallback(driverLat, driverLng, userLat, userLng);
    setDriverStreetCoords(fallback);
    const url = `https://router.project-osrm.org/route/v1/driving/${driverLng},${driverLat};${userLng},${userLat}?overview=full&geometries=geojson`;
    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const coords = data?.routes?.[0]?.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          setDriverStreetCoords(
            coords.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])
          );
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [mode, activeLeg, driverLat, driverLng, userLat, userLng]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (mode === 'TAXI') {
      if (activeLeg !== 'TO_DESTINATION' && driverLat !== undefined && driverLng !== undefined) {
        const approachPts: L.LatLngExpression[] =
          driverStreetCoords.length >= 2
            ? driverStreetCoords
            : buildCuscoStreetGridFallback(driverLat, driverLng, userLat, userLng);
        L.polyline(approachPts, {
          color: '#FFFFFF',
          weight: 8,
          opacity: 0.92,
          lineJoin: 'round',
        }).addTo(group);
        L.polyline(approachPts, {
          color: '#2563EB',
          weight: 5,
          opacity: 0.98,
          lineJoin: 'round',
        }).addTo(group);
        if (driverEtaBadge) {
          const midApproach = approachPts[Math.floor(approachPts.length / 2)] || [
            (driverLat + userLat) / 2,
            (driverLng + userLng) / 2,
          ];
          const blueBadge = L.divIcon({
            className: 'cusco-leaflet-pin',
            iconSize: [86, 42],
            iconAnchor: [43, 21],
            html: `<div style="background:#2563EB;color:#FFFFFF;padding:4px 10px;border-radius:10px;border:2px solid #FFFFFF;font-size:11px;font-weight:800;line-height:1.15;text-align:center;box-shadow:0 6px 16px rgba(37,99,235,0.45);white-space:pre-line;">${escapeHtml(driverEtaBadge)}</div>`,
          });
          L.marker(midApproach, { icon: blueBadge, interactive: false, zIndexOffset: 650 }).addTo(
            group
          );
        }
      }

      if (driverLat !== undefined && driverLng !== undefined) {
        const carIcon = L.divIcon({
          className: 'cusco-leaflet-pin',
          iconSize: [160, 44],
          iconAnchor: [20, 20],
          html: `<div style="display:flex;align-items:center;gap:6px;"><div style="width:38px;height:38px;border-radius:9999px;background:#2563EB;border:3px solid #FFFFFF;box-shadow:0 6px 18px rgba(37,99,235,0.55);display:flex;align-items:center;justify-content:center;font-size:17px;">🚕</div>${
            driverLabel
              ? `<span style="background:#0F172A;color:#FFFFFF;padding:3px 9px;border-radius:9px;border:1.5px solid #60A5FA;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.35);">${escapeHtml(driverLabel)}</span>`
              : ''
          }</div>`,
        });
        L.marker([driverLat, driverLng], { icon: carIcon, zIndexOffset: 750 }).addTo(group);
      }

      if (activeLeg !== 'TO_DESTINATION') {
        const originIcon = L.divIcon({
          className: 'cusco-leaflet-pin',
          iconSize: [148, 38],
          iconAnchor: [18, 34],
          html: `<div style="display:flex;align-items:center;gap:6px;background:#111827;color:#FFFFFF;padding:5px 10px;border-radius:12px;border:2px solid #FFFFFF;box-shadow:0 8px 20px rgba(0,0,0,0.35);font-size:11px;font-weight:700;white-space:nowrap;"><span style="width:18px;height:18px;border-radius:6px;background:#2563EB;color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;">A</span><span style="max-width:105px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(originLabel)}</span></div>`,
        });
        L.marker([userLat, userLng], { icon: originIcon, zIndexOffset: 500 }).addTo(group);
      }

      if (destLat !== undefined && destLng !== undefined) {
        const linePts: L.LatLngExpression[] =
          streetCoords.length >= 2
            ? streetCoords
            : buildCuscoStreetGridFallback(activeStartLat, activeStartLng, destLat, destLng);
        const navColor = activeLeg === 'TO_DESTINATION' ? '#4F46E5' : '#16A34A';
        const navHalo = activeLeg === 'TO_DESTINATION' ? '#1E1B4B' : '#0F172A';
        L.polyline(linePts, { color: navHalo, weight: 8, opacity: 0.9, lineJoin: 'round' }).addTo(
          group
        );
        L.polyline(linePts, { color: navColor, weight: 5, opacity: 0.98, lineJoin: 'round' }).addTo(
          group
        );

        const routeLabel = routeBadge || routeSummary;
        if (routeLabel) {
          const midPt = linePts[Math.floor(linePts.length / 2)] || [
            (activeStartLat + destLat) / 2,
            (activeStartLng + destLng) / 2,
          ];
          const midIcon = L.divIcon({
            className: 'cusco-leaflet-pin',
            iconSize: [132, 42],
            iconAnchor: [66, 21],
            html: `<div style="background:${navColor};color:#FFFFFF;padding:4px 10px;border-radius:10px;border:2px solid #FFFFFF;font-size:11px;font-weight:800;line-height:1.15;text-align:center;box-shadow:0 6px 16px rgba(15,23,42,0.45);white-space:pre-line;">${escapeHtml(routeLabel)}</div>`,
          });
          L.marker(midPt, { icon: midIcon, interactive: false, zIndexOffset: 620 }).addTo(group);
        }

        const destIcon = L.divIcon({
          className: 'cusco-leaflet-pin',
          iconSize: [160, 38],
          iconAnchor: [18, 34],
          html: `<div style="display:flex;align-items:center;gap:6px;background:#0F172A;color:#FFFFFF;padding:5px 10px;border-radius:12px;border:2px solid #4F46E5;box-shadow:0 8px 20px rgba(0,0,0,0.35);font-size:11px;font-weight:700;white-space:nowrap;"><span style="width:18px;height:18px;border-radius:6px;background:#16A34A;color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;">B</span><span style="max-width:118px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(destLabel || 'Destino')}</span></div>`,
        });
        L.marker([destLat, destLng], { icon: destIcon, zIndexOffset: 650 }).addTo(group);
      }
    } else {
      const gpsIcon = L.divIcon({
        className: 'cusco-leaflet-pin',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        html: `<div style="position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center;"><span style="position:absolute;width:24px;height:24px;border-radius:9999px;background:rgba(37,99,235,0.25);"></span><span style="width:13px;height:13px;border-radius:9999px;background:#2563EB;border:2.5px solid #FFFFFF;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></span></div>`,
      });
      L.marker([userLat, userLng], { icon: gpsIcon, zIndexOffset: 450 }).addTo(group);
    }

    pins.forEach((pin) => {
      const selected = pin.id === selectedPinId;
      const bg =
        pin.tier === 'closed'
          ? '#475569'
          : pin.tier === 'cheapest'
            ? '#16A34A'
            : pin.tier === 'high'
              ? '#DC2626'
              : '#FACC15';
      const fg = pin.tier === 'mid' ? '#0B0E14' : '#FFFFFF';
      const borderColor = selected ? '#0B0E14' : '#FFFFFF';
      const scale = selected ? 'transform:scale(1.1);' : '';
      const shadow = selected
        ? '0 0 0 3px #D4AF37, 0 10px 24px rgba(0,0,0,0.45)'
        : '0 6px 16px rgba(0,0,0,0.32)';
      const iconPrefix =
        pin.kind === 'DRIVER' ? '🚕 ' : pin.kind === 'BUSINESS' ? '📍 ' : '';

      const pinIcon = L.divIcon({
        className: 'cusco-leaflet-pin',
        iconSize: [120, 44],
        iconAnchor: [60, 42],
        html: `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;${scale}transition:transform .15s ease;"><div style="background:${bg};color:${fg};border:2px solid ${borderColor};border-radius:14px;padding:4px 10px;box-shadow:${shadow};display:flex;flex-direction:column;align-items:center;line-height:1.1;white-space:nowrap;"><span style="font-family:var(--font-mono);font-size:12px;font-weight:800;letter-spacing:-0.02em;">${iconPrefix}${escapeHtml(pin.priceText)}</span>${
          pin.sublabel
            ? `<span style="font-size:9px;font-weight:700;opacity:0.92;max-width:96px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(pin.sublabel)}</span>`
            : ''
        }</div><div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${bg};margin-top:-1px;"></div></div>`,
      });

      const marker = L.marker([pin.lat, pin.lng], {
        icon: pinIcon,
        zIndexOffset: selected ? 900 : pin.tier === 'cheapest' ? 600 : 200,
      }).addTo(group);

      marker.on('click', () => onSelectPinRef.current?.(pin.id));
    });
  }, [
    mode,
    activeLeg,
    activeStartLat,
    activeStartLng,
    userLat,
    userLng,
    originLabel,
    destLat,
    destLng,
    destLabel,
    driverLat,
    driverLng,
    driverLabel,
    driverEtaBadge,
    routeBadge,
    routeSummary,
    streetCoords,
    driverStreetCoords,
    pins,
    selectedPinId,
  ]);

  useEffect(() => {
    if (!selectedPinId || !mapRef.current) return;
    const found = pins.find((p) => p.id === selectedPinId);
    if (found) {
      mapRef.current.panTo([found.lat, found.lng], { animate: true, duration: 0.45 });
    }
  }, [selectedPinId, pins]);

  return (
    <div
      ref={containerRef}
      className={`w-full ${isFullscreen ? 'h-full' : heightClass} bg-[#E5E3DF]`}
    />
  );
};

export const CuscoGeoMap: React.FC<CuscoGeoMapProps> = (props) => {
  const {
    mode,
    userLat,
    userLng,
    destLat,
    destLng,
    driverLat,
    driverLng,
    pins,
    selectedPinId,
    onRequestPinAction,
    onRequestGps,
    gpsLive,
    followDriver = false,
    activeLeg = 'BOTH',
    heightClass = 'h-[360px] sm:h-[430px]',
  } = props;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapTypeId, setMapTypeId] = useState<'roadmap' | 'hybrid'>('hybrid');
  const [fitSignal, setFitSignal] = useState(0);
  const [googleFailed, setGoogleFailed] = useState(false);

  useEffect(() => {
    const onQuota = () => setGoogleFailed(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  const canUseGoogleSdk = Boolean(MAPS_API_KEY) && !googleFailed;

  const selectedPin = useMemo(
    () => pins.find((p) => p.id === selectedPinId) || null,
    [pins, selectedPinId]
  );

  const navOriginLat =
    activeLeg === 'TO_DESTINATION' && driverLat !== undefined ? driverLat : userLat;
  const navOriginLng =
    activeLeg === 'TO_DESTINATION' && driverLng !== undefined ? driverLng : userLng;

  const externalMapsUrl =
    mode === 'TAXI' && destLat !== undefined && destLng !== undefined
      ? `https://www.google.com/maps/dir/?api=1&origin=${navOriginLat},${navOriginLng}&destination=${destLat},${destLng}&travelmode=driving`
      : selectedPin
        ? `https://www.google.com/maps/search/?api=1&query=${selectedPin.lat},${selectedPin.lng}`
        : `https://www.google.com/maps/search/?api=1&query=${userLat},${userLng}`;

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-[#E5E3DF]'
          : 'relative rounded-3xl overflow-hidden border border-black/15 dark:border-white/20 bg-[#E5E3DF] shadow-2xl chuspa-google-border'
      }
    >
      {canUseGoogleSdk ? (
        <div className={`w-full ${isFullscreen ? 'h-full' : heightClass}`}>
          <APIProvider apiKey={MAPS_API_KEY} language="es" region="PE" libraries={['routes', 'marker']}>
            <GoogleCuscoInner
              {...props}
              mapTypeId={mapTypeId}
              isFullscreen={isFullscreen}
              fitSignal={fitSignal}
              onStatusFail={() => setGoogleFailed(true)}
            />
          </APIProvider>
        </div>
      ) : (
        <CuscoGeoLeafletFallback
          {...props}
          isFullscreen={isFullscreen}
          fitTrigger={fitSignal}
          mapTypeId={mapTypeId}
        />
      )}

      {/* Indicador estilo Google Maps arriba a la izquierda */}
      <div className="pointer-events-none absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-1.5">
        <span className="px-3 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-black/10 text-[11px] font-bold text-[#14171F] flex items-center gap-1.5 shadow-lg">
          <Navigation className="w-3.5 h-3.5 text-[#2563EB]" />
          <span>
            {followDriver
              ? 'Navegación GPS en Vivo'
              : canUseGoogleSdk
                ? 'Google Maps · Cusco'
                : 'Mapa HD · Cusco'}
          </span>
        </span>
      </div>

      {/* Controles flotantes blancos modernos estilo Google Maps Mobile */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setIsFullscreen((f) => !f)}
          title={isFullscreen ? 'Encoger mapa' : 'Agrandar mapa'}
          className="min-h-[38px] px-3 rounded-full border border-black/10 bg-white/95 text-[#14171F] text-xs font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-md hover:bg-white"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Encoger</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Agrandar</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setMapTypeId((t) => (t === 'roadmap' ? 'hybrid' : 'roadmap'))}
          title="Cambiar vista Mapa / Satélite"
          className="min-h-[38px] px-3 rounded-full border border-black/10 bg-white/95 text-[#14171F] text-xs font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-md hover:bg-white"
        >
          <Layers className="w-3.5 h-3.5 text-[#2563EB]" />
          <span>{mapTypeId === 'roadmap' ? 'Satélite' : 'Mapa'}</span>
        </button>

        {onRequestGps && (
          <button
            type="button"
            onClick={onRequestGps}
            title="Centrar en mi ubicación GPS"
            className={`min-h-[38px] px-3 rounded-full border text-xs font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-colors ${
              gpsLive
                ? 'bg-[#2563EB] border-[#60A5FA] text-white'
                : 'bg-white/95 border-black/10 text-[#14171F] hover:bg-white'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>{gpsLive ? 'GPS Activo' : 'Mi GPS'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setFitSignal((s) => s + 1)}
          title="Encuadrar ruta y pines"
          className="min-h-[38px] px-3 rounded-full border border-black/10 bg-white/95 text-[#14171F] text-xs font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-md hover:bg-white"
        >
          <Scan className="w-3.5 h-3.5 text-[#D97706]" />
          <span>Encuadrar</span>
        </button>

        <a
          href={externalMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[38px] px-3 rounded-full border border-[#2563EB]/25 bg-white/95 text-[#1E40AF] text-xs font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-md hover:bg-white"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Google Maps</span>
        </a>
      </div>

      {/* Tarjeta interactiva en mapa cuando el usuario toca un pin */}
      {selectedPin && (
        <div className="absolute bottom-3 left-3 sm:left-4 right-3 sm:right-auto sm:max-w-xs z-[400] rounded-2xl border border-black/10 bg-white/95 backdrop-blur-md p-3 shadow-2xl flex items-center justify-between gap-2.5 chuspa-google-border">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-bold text-[#9A7B2C]">
              {selectedPin.kind === 'DRIVER'
                ? 'Taxista en mapa'
                : selectedPin.kind === 'MARKET'
                  ? 'Minimarket en mapa'
                  : 'Negocio encontrado'}
            </p>
            <p className="text-xs font-bold text-[#14171F] truncate">
              {selectedPin.detailTitle || selectedPin.sublabel || selectedPin.priceText}
            </p>
            <p className="text-[11px] font-mono-tabular font-semibold text-emerald-700">
              {selectedPin.priceText}
              {selectedPin.sublabel ? ` · ${selectedPin.sublabel}` : ''}
            </p>
          </div>
          {onRequestPinAction && (
            <button
              type="button"
              onClick={() => onRequestPinAction(selectedPin.id)}
              className="min-h-[38px] px-3 rounded-xl bg-gradient-to-r from-[#2563EB] via-[#16A34A] to-[#D4AF37] text-white text-xs font-bold flex items-center gap-1 shrink-0 shadow chuspa-google-btn"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>{selectedPin.kind === 'MARKET' ? 'Elegir' : 'Solicitar'}</span>
            </button>
          )}
        </div>
      )}

      {/* Leyenda */}
      <div className="hidden sm:flex absolute bottom-3 right-3 z-[400] items-center gap-2 bg-white/95 backdrop-blur-md border border-black/10 rounded-full px-3 py-1.5 text-[10px] font-bold shadow-md">
        <span className="flex items-center gap-1 text-emerald-700">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> Mejor tarifa
        </span>
        <span className="flex items-center gap-1 text-amber-700">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Estándar
        </span>
      </div>
    </div>
  );
};
