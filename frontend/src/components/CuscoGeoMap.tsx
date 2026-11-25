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
        strokeOpacity: 0.9,
        strokeWeight: 7,
        map,
      });
      const mainLine = new PolylineCtor({
        path: grid,
        strokeColor,
        strokeOpacity: 0.98,
        strokeWeight: 4.5,
        map,
      });
      polylinesRef.current = [halo, mainLine];
      setMidPoint(grid[Math.floor(grid.length / 2)] || origin);
      const km = Math.max(0.8, Number(approxKm(origin.lat, origin.lng, destination.lat, destination.lng).toFixed(1)));
      onRouteRef.current?.({ km, etaMin: Math.max(3, Math.round(km * 3.1 + 1)) });
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
            strokeOpacity: 0.88,
            strokeWeight: 7,
          });
          poly.setMap(map);
        });
        created.forEach((poly) => {
          poly.setOptions({
            strokeColor,
            strokeOpacity: 0.98,
            strokeWeight: 4.5,
          });
          poly.setMap(map);
        });
        polylinesRef.current = [...outerCreated, ...created];

        const pathPts = primary.path;
        if (Array.isArray(pathPts) && pathPts.length > 0) {
          const mid = pathPts[Math.floor(pathPts.length / 2)];
          const latVal = typeof (mid as { lat?: unknown }).lat === 'function'
            ? (mid as { lat: () => number }).lat()
            : Number((mid as LatLngLiteral).lat);
          const lngVal = typeof (mid as { lng?: unknown }).lng === 'function'
            ? (mid as { lng: () => number }).lng()
            : Number((mid as LatLngLiteral).lng);
          if (Number.isFinite(latVal) && Number.isFinite(lngVal)) {
            setMidPoint({ lat: latVal, lng: lngVal });
          }
        }

        const km = Math.max(
          0.6,
          Number(
            (
              (primary.distanceMeters ??
                approxKm(origin.lat, origin.lng, destination.lat, destination.lng) * 1000) /
              1000
            ).toFixed(1)
          )
        );
        const etaMin = Math.max(
          2,
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
  fitSignal,
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

  const fitAllBounds = useCallback(() => {
    if (!map || !coreLib) return;
    const BoundsCtor = (coreLib as unknown as {
      LatLngBounds?: new () => { extend: (p: LatLngLiteral) => void };
    }).LatLngBounds;
    if (!BoundsCtor) return;

    const pts: LatLngLiteral[] = [{ lat: userLat, lng: userLng }];
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
      (map as unknown as { fitBounds: (b: unknown, pad?: number) => void }).fitBounds(bounds, 52);
    } else {
      map.panTo({ lat: userLat, lng: userLng });
      map.setZoom(15);
    }
  }, [map, coreLib, mode, userLat, userLng, destLat, destLng, driverLat, driverLng, pins]);

  useEffect(() => {
    fitAllBounds();
  }, [fitAllBounds, fitSignal]);

  useEffect(() => {
    if (!selectedPinId || !map) return;
    const found = pins.find((p) => p.id === selectedPinId);
    if (found) {
      map.panTo({ lat: found.lat, lng: found.lng });
    }
  }, [selectedPinId, map, pins]);

  return (
    <GoogleMap
      mapId="DEMO_MAP_ID"
      defaultCenter={{ lat: userLat, lng: userLng }}
      defaultZoom={14.5}
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
      {/* Ruta Conductor -> Punto A */}
      {mode === 'TAXI' && driverLat !== undefined && driverLng !== undefined && (
        <GoogleRouteLine
          origin={{ lat: driverLat, lng: driverLng }}
          destination={{ lat: userLat, lng: userLng }}
          strokeColor="#2563EB"
          outlineColor="#FFFFFF"
          badgeText={driverEtaBadge}
        />
      )}

      {/* Ruta Punto A -> Destino B */}
      {mode === 'TAXI' && destLat !== undefined && destLng !== undefined && (
        <GoogleRouteLine
          origin={{ lat: userLat, lng: userLng }}
          destination={{ lat: destLat, lng: destLng }}
          strokeColor="#16A34A"
          outlineColor="#0F172A"
          badgeText={routeBadge || routeSummary}
          onRouteComputed={onRouteComputed}
        />
      )}

      {/* Marcador de Conductor (TAXI) */}
      {mode === 'TAXI' && driverLat !== undefined && driverLng !== undefined && (
        <AdvancedMarker
          position={{ lat: driverLat, lng: driverLng }}
          title={driverLabel || 'Conductor en ruta'}
          zIndex={700}
        >
          <div className="flex items-center gap-1.5">
            <div className="w-9 h-9 rounded-full bg-[#B6F02B] border-2 border-white shadow-lg flex items-center justify-center text-base">
              🚕
            </div>
            {driverLabel && (
              <span className="px-2 py-0.5 rounded-lg bg-[#0F172A] text-white border border-[#B6F02B] text-[10px] font-bold whitespace-nowrap shadow-md">
                {driverLabel}
              </span>
            )}
          </div>
        </AdvancedMarker>
      )}

      {/* Marcador GPS Cliente / Origen A */}
      {mode === 'TAXI' ? (
        <AdvancedMarker position={{ lat: userLat, lng: userLng }} title={originLabel} zIndex={500}>
          <div className="flex items-center gap-1.5 bg-[#111827] text-white px-2.5 py-1 rounded-xl border-2 border-white shadow-lg text-[11px] font-bold whitespace-nowrap">
            <span className="w-4 h-4 rounded bg-[#2563EB] text-white inline-flex items-center justify-center text-[10px] font-extrabold">
              A
            </span>
            <span className="max-w-[115px] truncate">{originLabel}</span>
          </div>
        </AdvancedMarker>
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
          zIndex={500}
        >
          <div className="flex items-center gap-1.5 bg-[#0F172A] text-white px-2.5 py-1 rounded-xl border-2 border-[#84CC16] shadow-lg text-[11px] font-bold whitespace-nowrap">
            <span className="w-4 h-4 rounded bg-[#16A34A] text-white inline-flex items-center justify-center text-[10px] font-extrabold">
              B
            </span>
            <span className="max-w-[125px] truncate">{destLabel || 'Destino'}</span>
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

// Respaldo Leaflet solo si falta clave o se excede cuota de Google Maps
const CuscoGeoLeafletFallback: React.FC<
  CuscoGeoMapProps & { isFullscreen: boolean; fitTrigger: number }
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
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

    const map = L.map(el, {
      center: [userLat, userLng],
      zoom: 14,
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current?.(Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5)));
    });

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    const ro = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  const fitAllBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts: L.LatLngExpression[] = [[userLat, userLng]];
    if (mode === 'TAXI' && destLat !== undefined && destLng !== undefined) {
      pts.push([destLat, destLng]);
    }
    if (mode === 'TAXI' && driverLat !== undefined && driverLng !== undefined) {
      pts.push([driverLat, driverLng]);
    }
    pins.forEach((p) => pts.push([p.lat, p.lng]));
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [46, 46], maxZoom: 15 });
    } else {
      map.setView([userLat, userLng], 15);
    }
  }, [mode, userLat, userLng, destLat, destLng, driverLat, driverLng, pins]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      mapRef.current?.invalidateSize({ pan: false });
      fitAllBounds();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [isFullscreen, fitTrigger, fitAllBounds]);

  useEffect(() => {
    if (mode !== 'TAXI' || destLat === undefined || destLng === undefined) {
      setStreetCoords([]);
      return;
    }
    const controller = new AbortController();
    const fallback = buildCuscoStreetGridFallback(userLat, userLng, destLat, destLng);
    setStreetCoords(fallback);
    const url = `https://router.project-osrm.org/route/v1/driving/${userLng},${userLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const route = data?.routes?.[0];
        const coords = route?.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          setStreetCoords(coords.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]));
          if (typeof route.distance === 'number' && typeof route.duration === 'number') {
            onRouteComputedRef.current?.({
              km: Math.max(0.8, Number((route.distance / 1000).toFixed(1))),
              etaMin: Math.max(3, Math.round(route.duration / 60)),
            });
          }
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [mode, userLat, userLng, destLat, destLng]);

  useEffect(() => {
    if (mode !== 'TAXI' || driverLat === undefined || driverLng === undefined) {
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
  }, [mode, driverLat, driverLng, userLat, userLng]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (mode === 'TAXI') {
      if (driverLat !== undefined && driverLng !== undefined) {
        const approachPts: L.LatLngExpression[] =
          driverStreetCoords.length >= 2
            ? driverStreetCoords
            : buildCuscoStreetGridFallback(driverLat, driverLng, userLat, userLng);
        L.polyline(approachPts, { color: '#FFFFFF', weight: 7, opacity: 0.9, lineJoin: 'round' }).addTo(group);
        L.polyline(approachPts, { color: '#2563EB', weight: 4.5, opacity: 0.98, lineJoin: 'round' }).addTo(group);
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
          L.marker(midApproach, { icon: blueBadge, interactive: false, zIndexOffset: 650 }).addTo(group);
        }
        const carIcon = L.divIcon({
          className: 'cusco-leaflet-pin',
          iconSize: [145, 42],
          iconAnchor: [20, 20],
          html: `<div style="display:flex;align-items:center;gap:6px;"><div style="width:36px;height:36px;border-radius:9999px;background:#B6F02B;border:3px solid #FFFFFF;box-shadow:0 6px 16px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:16px;">🚕</div>${
            driverLabel
              ? `<span style="background:#0F172A;color:#FFFFFF;padding:3px 8px;border-radius:8px;border:1.5px solid #B6F02B;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.35);">${escapeHtml(driverLabel)}</span>`
              : ''
          }</div>`,
        });
        L.marker([driverLat, driverLng], { icon: carIcon, zIndexOffset: 700 }).addTo(group);
      }

      const originIcon = L.divIcon({
        className: 'cusco-leaflet-pin',
        iconSize: [148, 38],
        iconAnchor: [18, 34],
        html: `<div style="display:flex;align-items:center;gap:6px;background:#111827;color:#FFFFFF;padding:5px 10px;border-radius:12px;border:2px solid #FFFFFF;box-shadow:0 8px 20px rgba(0,0,0,0.35);font-size:11px;font-weight:700;white-space:nowrap;"><span style="width:18px;height:18px;border-radius:6px;background:#2563EB;color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;">A</span><span style="max-width:105px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(originLabel)}</span></div>`,
      });
      L.marker([userLat, userLng], { icon: originIcon, zIndexOffset: 500 }).addTo(group);

      if (destLat !== undefined && destLng !== undefined) {
        const linePts: L.LatLngExpression[] =
          streetCoords.length >= 2
            ? streetCoords
            : buildCuscoStreetGridFallback(userLat, userLng, destLat, destLng);
        L.polyline(linePts, { color: '#0F172A', weight: 6.5, opacity: 0.85, lineJoin: 'round' }).addTo(group);
        L.polyline(linePts, { color: '#16A34A', weight: 4, opacity: 0.98, lineJoin: 'round' }).addTo(group);

        const greenLabel = routeBadge || routeSummary;
        if (greenLabel) {
          const midPt = linePts[Math.floor(linePts.length / 2)] || [
            (userLat + destLat) / 2,
            (userLng + destLng) / 2,
          ];
          const midIcon = L.divIcon({
            className: 'cusco-leaflet-pin',
            iconSize: [132, 42],
            iconAnchor: [66, 21],
            html: `<div style="background:#16A34A;color:#FFFFFF;padding:4px 10px;border-radius:10px;border:2px solid #FFFFFF;font-size:11px;font-weight:800;line-height:1.15;text-align:center;box-shadow:0 6px 16px rgba(22,163,74,0.4);white-space:pre-line;">${escapeHtml(greenLabel)}</div>`,
          });
          L.marker(midPt, { icon: midIcon, interactive: false, zIndexOffset: 620 }).addTo(group);
        }

        const destIcon = L.divIcon({
          className: 'cusco-leaflet-pin',
          iconSize: [160, 38],
          iconAnchor: [18, 34],
          html: `<div style="display:flex;align-items:center;gap:6px;background:#0F172A;color:#FFFFFF;padding:5px 10px;border-radius:12px;border:2px solid #84CC16;box-shadow:0 8px 20px rgba(0,0,0,0.35);font-size:11px;font-weight:700;white-space:nowrap;"><span style="width:18px;height:18px;border-radius:6px;background:#16A34A;color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;">B</span><span style="max-width:118px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(destLabel || 'Destino')}</span></div>`,
        });
        L.marker([destLat, destLng], { icon: destIcon, zIndexOffset: 500 }).addTo(group);
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
      className={`w-full ${isFullscreen ? 'h-full' : heightClass} cusco-osm-tiles`}
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
    pins,
    selectedPinId,
    onRequestPinAction,
    onRequestGps,
    gpsLive,
    heightClass = 'h-[360px] sm:h-[430px]',
  } = props;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapTypeId, setMapTypeId] = useState<'roadmap' | 'hybrid'>('roadmap');
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

  const externalMapsUrl =
    mode === 'TAXI' && destLat !== undefined && destLng !== undefined
      ? `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${destLat},${destLng}&travelmode=driving`
      : selectedPin
        ? `https://www.google.com/maps/search/?api=1&query=${selectedPin.lat},${selectedPin.lng}`
        : `https://www.google.com/maps/search/?api=1&query=${userLat},${userLng}`;

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-slate-200 dark:bg-[#0D1117]'
          : 'relative rounded-3xl overflow-hidden border border-white/15 bg-slate-200 dark:bg-[#0D1117] shadow-2xl chuspa-google-border'
      }
    >
      {canUseGoogleSdk ? (
        <div className={`w-full ${isFullscreen ? 'h-full' : heightClass}`}>
          <APIProvider apiKey={MAPS_API_KEY} language="es" region="PE" libraries={['routes', 'marker']}>
            <GoogleCuscoInner
              {...props}
              mapTypeId={mapTypeId}
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
        />
      )}

      {/* Indicador de Google Maps activo arriba a la izquierda */}
      <div className="pointer-events-none absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-1.5">
        <span className="px-2.5 py-1 rounded-xl bg-white/95 dark:bg-[#0D1117]/95 backdrop-blur border border-black/15 dark:border-white/15 text-[10px] font-bold text-[#14171F] dark:text-white flex items-center gap-1.5 shadow-md">
          <Navigation className="w-3 h-3 text-[#4285F4]" />
          <span>{canUseGoogleSdk ? 'Google Maps Real · Cusco' : 'Mapa GPS Cusco'}</span>
        </span>
      </div>

      {/* Controles flotantes de mapa */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setIsFullscreen((f) => !f)}
          title={isFullscreen ? 'Encoger mapa' : 'Agrandar mapa'}
          className="min-h-[38px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white/95 dark:bg-[#0D1117]/95 text-[#14171F] dark:text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Encoger</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Agrandar</span>
            </>
          )}
        </button>

        {canUseGoogleSdk && (
          <button
            type="button"
            onClick={() => setMapTypeId((t) => (t === 'roadmap' ? 'hybrid' : 'roadmap'))}
            title="Cambiar vista Mapa / Satélite"
            className="min-h-[38px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white/95 dark:bg-[#0D1117]/95 text-[#14171F] dark:text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md"
          >
            <Layers className="w-3.5 h-3.5 text-[#4285F4]" />
            <span>{mapTypeId === 'roadmap' ? 'Satélite' : 'Mapa'}</span>
          </button>
        )}

        {onRequestGps && (
          <button
            type="button"
            onClick={onRequestGps}
            title="Centrar en mi ubicación GPS"
            className={`min-h-[38px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-colors ${
              gpsLive
                ? 'bg-emerald-600/95 border-emerald-400 text-white'
                : 'bg-white/95 dark:bg-[#0D1117]/95 border-black/15 dark:border-white/15 text-[#14171F] dark:text-white'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>{gpsLive ? 'GPS Activo' : 'Mi GPS'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setFitSignal((s) => s + 1)}
          title="Ver todos los puntos en Cusco"
          className="min-h-[38px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white/95 dark:bg-[#0D1117]/95 text-[#14171F] dark:text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md"
        >
          <Scan className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>Encuadrar</span>
        </button>

        <a
          href={externalMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[38px] px-3 rounded-xl border border-[#4285F4]/35 bg-white/95 dark:bg-[#0D1117]/95 text-[#1E40AF] dark:text-[#8AB4F8] text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Google Maps</span>
        </a>
      </div>

      {/* Tarjeta interactiva en mapa cuando el usuario toca un pin */}
      {selectedPin && (
        <div className="absolute bottom-3 left-3 sm:left-4 right-3 sm:right-auto sm:max-w-xs z-[400] rounded-2xl border border-white/15 bg-white/95 dark:bg-[#0D1117]/95 backdrop-blur-md p-3 shadow-2xl flex items-center justify-between gap-2.5 chuspa-google-border">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-bold text-[#9A7B2C] dark:text-[#FBBC04]">
              {selectedPin.kind === 'DRIVER'
                ? 'Taxista en mapa'
                : selectedPin.kind === 'MARKET'
                  ? 'Minimarket en mapa'
                  : 'Negocio encontrado'}
            </p>
            <p className="text-xs font-bold text-[#14171F] dark:text-white truncate">
              {selectedPin.detailTitle || selectedPin.sublabel || selectedPin.priceText}
            </p>
            <p className="text-[11px] font-mono-tabular font-semibold text-emerald-600 dark:text-emerald-400">
              {selectedPin.priceText}
              {selectedPin.sublabel ? ` · ${selectedPin.sublabel}` : ''}
            </p>
          </div>
          {onRequestPinAction && (
            <button
              type="button"
              onClick={() => onRequestPinAction(selectedPin.id)}
              className="min-h-[38px] px-3 rounded-xl bg-gradient-to-r from-[#4285F4] via-[#34A853] to-[#D4AF37] text-white text-xs font-bold flex items-center gap-1 shrink-0 shadow chuspa-google-btn"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>{selectedPin.kind === 'MARKET' ? 'Elegir' : 'Solicitar'}</span>
            </button>
          )}
        </div>
      )}

      {/* Leyenda */}
      <div className="hidden sm:flex absolute bottom-3 right-3 z-[400] items-center gap-2 bg-white/95 dark:bg-[#0D1117]/95 backdrop-blur-md border border-black/10 dark:border-white/15 rounded-xl px-3 py-1.5 text-[10px] font-semibold shadow-md">
        <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> Mejor tarifa
        </span>
        <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Estándar
        </span>
      </div>
    </div>
  );
};
