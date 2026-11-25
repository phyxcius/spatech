import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Maximize2, Minimize2, Navigation, Scan } from 'lucide-react';

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

interface CuscoGeoMapProps {
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
  gpsLive?: boolean;
  heightClass?: string;
}

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

export const CuscoGeoMap: React.FC<CuscoGeoMapProps> = ({
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
  onRequestPinAction,
  onRouteComputed,
  onRequestGps,
  gpsLive,
  heightClass = 'h-[360px] sm:h-[430px]',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const onSelectPinRef = useRef(onSelectPin);
  onSelectPinRef.current = onSelectPin;
  const onRouteComputedRef = useRef(onRouteComputed);
  onRouteComputedRef.current = onRouteComputed;

  const [isFullscreen, setIsFullscreen] = useState(false);
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

  // Re-evaluate Leaflet tile geometry cleanly after fullscreen toggle
  useEffect(() => {
    const timer = window.setTimeout(() => {
      mapRef.current?.invalidateSize({ pan: false });
      fitAllBounds();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [isFullscreen]);

  // Real street-following route via OSRM A -> B
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
          const leafletPts = coords.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
          setStreetCoords(leafletPts);
          if (typeof route.distance === 'number' && typeof route.duration === 'number') {
            onRouteComputedRef.current?.({
              km: Math.max(0.8, Number((route.distance / 1000).toFixed(1))),
              etaMin: Math.max(3, Math.round(route.duration / 60)),
            });
          }
        }
      })
      .catch(() => {
        // Keep street-grid fallback on network error/abort
      });

    return () => controller.abort();
  }, [mode, userLat, userLng, destLat, destLng]);

  // Real street-following route via OSRM Conductor -> Punto A
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
      .catch(() => {
        // Keep fallback route
      });

    return () => controller.abort();
  }, [mode, driverLat, driverLng, userLat, userLng]);

  function fitAllBounds() {
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
      const bounds = L.latLngBounds(pts);
      map.fitBounds(bounds, { padding: [46, 46], maxZoom: 15 });
    } else {
      map.setView([userLat, userLng], 15);
    }
  }

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (mode === 'TAXI') {
      // Ruta Conductor -> Punto A en azul (estilo inDrive)
      if (driverLat !== undefined && driverLng !== undefined) {
        const approachPts: L.LatLngExpression[] =
          driverStreetCoords.length >= 2
            ? driverStreetCoords
            : buildCuscoStreetGridFallback(driverLat, driverLng, userLat, userLng);

        L.polyline(approachPts, {
          color: '#FFFFFF',
          weight: 7,
          opacity: 0.9,
          lineJoin: 'round',
        }).addTo(group);

        L.polyline(approachPts, {
          color: '#2563EB',
          weight: 4.5,
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
            html: `
              <div style="background:#2563EB;color:#FFFFFF;padding:4px 10px;border-radius:10px;border:2px solid #FFFFFF;font-size:11px;font-weight:800;line-height:1.15;text-align:center;box-shadow:0 6px 16px rgba(37,99,235,0.45);white-space:pre-line;">
                ${escapeHtml(driverEtaBadge)}
              </div>
            `,
          });
          L.marker(midApproach, { icon: blueBadge, interactive: false, zIndexOffset: 650 }).addTo(group);
        }

        const carIcon = L.divIcon({
          className: 'cusco-leaflet-pin',
          iconSize: [145, 42],
          iconAnchor: [20, 20],
          html: `
            <div style="display:flex;align-items:center;gap:6px;">
              <div style="width:36px;height:36px;border-radius:9999px;background:#B6F02B;border:3px solid #FFFFFF;box-shadow:0 6px 16px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:16px;">🚕</div>
              ${
                driverLabel
                  ? `<span style="background:#0F172A;color:#FFFFFF;padding:3px 8px;border-radius:8px;border:1.5px solid #B6F02B;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.35);">${escapeHtml(
                      driverLabel
                    )}</span>`
                  : ''
              }
            </div>
          `,
        });
        L.marker([driverLat, driverLng], { icon: carIcon, zIndexOffset: 700 }).addTo(group);
      }

      const originIcon = L.divIcon({
        className: 'cusco-leaflet-pin',
        iconSize: [148, 38],
        iconAnchor: [18, 34],
        html: `
          <div style="display:flex;align-items:center;gap:6px;background:#111827;color:#FFFFFF;padding:5px 10px;border-radius:12px;border:2px solid #FFFFFF;box-shadow:0 8px 20px rgba(0,0,0,0.35);font-size:11px;font-weight:700;white-space:nowrap;">
            <span style="width:18px;height:18px;border-radius:6px;background:#2563EB;color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;">A</span>
            <span style="max-width:105px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(originLabel)}</span>
          </div>
        `,
      });
      L.marker([userLat, userLng], { icon: originIcon, zIndexOffset: 500 }).addTo(group);

      if (destLat !== undefined && destLng !== undefined) {
        const linePts: L.LatLngExpression[] =
          streetCoords.length >= 2
            ? streetCoords
            : buildCuscoStreetGridFallback(userLat, userLng, destLat, destLng);

        L.polyline(linePts, {
          color: '#0F172A',
          weight: 6.5,
          opacity: 0.85,
          lineJoin: 'round',
        }).addTo(group);

        L.polyline(linePts, {
          color: '#16A34A',
          weight: 4,
          opacity: 0.98,
          lineJoin: 'round',
        }).addTo(group);

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
            html: routeBadge
              ? `<div style="background:#16A34A;color:#FFFFFF;padding:4px 10px;border-radius:10px;border:2px solid #FFFFFF;font-size:11px;font-weight:800;line-height:1.15;text-align:center;box-shadow:0 6px 16px rgba(22,163,74,0.4);white-space:pre-line;">${escapeHtml(
                  routeBadge
                )}</div>`
              : `<div style="background:#0B0E14;color:#FACC15;padding:3px 9px;border-radius:999px;border:1px solid rgba(250,204,21,0.5);font-size:10px;font-weight:700;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.35);white-space:nowrap;">${escapeHtml(
                  greenLabel
                )}</div>`,
          });
          L.marker(midPt, { icon: midIcon, interactive: false, zIndexOffset: 620 }).addTo(group);
        }

        const destIcon = L.divIcon({
          className: 'cusco-leaflet-pin',
          iconSize: [160, 38],
          iconAnchor: [18, 34],
          html: `
            <div style="display:flex;align-items:center;gap:6px;background:#0F172A;color:#FFFFFF;padding:5px 10px;border-radius:12px;border:2px solid #84CC16;box-shadow:0 8px 20px rgba(0,0,0,0.35);font-size:11px;font-weight:700;white-space:nowrap;">
              <span style="width:18px;height:18px;border-radius:6px;background:#16A34A;color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;">B</span>
              <span style="max-width:118px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(destLabel || 'Destino')}</span>
            </div>
          `,
        });
        L.marker([destLat, destLng], { icon: destIcon, zIndexOffset: 500 }).addTo(group);
      }
    } else {
      const gpsIcon = L.divIcon({
        className: 'cusco-leaflet-pin',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        html: `
          <div style="position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center;">
            <span style="position:absolute;width:24px;height:24px;border-radius:9999px;background:rgba(37,99,235,0.25);"></span>
            <span style="width:13px;height:13px;border-radius:9999px;background:#2563EB;border:2.5px solid #FFFFFF;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></span>
          </div>
        `,
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
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;${scale}transition:transform .15s ease;">
            <div style="background:${bg};color:${fg};border:2px solid ${borderColor};border-radius:14px;padding:4px 10px;box-shadow:${shadow};display:flex;flex-direction:column;align-items:center;line-height:1.1;white-space:nowrap;">
              <span style="font-family:var(--font-mono);font-size:12px;font-weight:800;letter-spacing:-0.02em;">
                ${iconPrefix}${escapeHtml(pin.priceText)}
              </span>
              ${
                pin.sublabel
                  ? `<span style="font-size:9px;font-weight:700;opacity:0.92;max-width:96px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(
                      pin.sublabel
                    )}</span>`
                  : ''
              }
            </div>
            <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${bg};margin-top:-1px;"></div>
          </div>
        `,
      });

      const marker = L.marker([pin.lat, pin.lng], {
        icon: pinIcon,
        zIndexOffset: selected ? 900 : pin.tier === 'cheapest' ? 600 : 200,
      }).addTo(group);

      marker.on('click', () => {
        onSelectPinRef.current?.(pin.id);
      });
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
    fitAllBounds();
  }, [mode, userLat, userLng, destLat, destLng, driverLat, driverLng, pins.length]);

  useEffect(() => {
    if (!selectedPinId || !mapRef.current) return;
    const found = pins.find((p) => p.id === selectedPinId);
    if (found) {
      mapRef.current.panTo([found.lat, found.lng], { animate: true, duration: 0.45 });
    }
  }, [selectedPinId]);

  const selectedPin = useMemo(
    () => pins.find((p) => p.id === selectedPinId) || null,
    [pins, selectedPinId]
  );

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-40 bg-slate-200 dark:bg-[#0D1117]'
          : 'relative rounded-3xl overflow-hidden border border-white/15 bg-slate-200 dark:bg-[#0D1117] shadow-2xl chuspa-google-border'
      }
    >
      <div
        ref={containerRef}
        className={`w-full ${isFullscreen ? 'h-full' : heightClass} cusco-osm-tiles`}
      />

      {/* Controles flotantes de mapa (GPS + Reencuadrar + Agrandar/Encoger) */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setIsFullscreen((f) => !f)}
          title={isFullscreen ? 'Encoger mapa' : 'Agrandar mapa'}
          className="min-h-[40px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white/95 dark:bg-[#0D1117]/95 text-[#14171F] dark:text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md"
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

        {onRequestGps && (
          <button
            type="button"
            onClick={onRequestGps}
            title="Centrar en mi ubicación GPS"
            className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-colors ${
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
          onClick={fitAllBounds}
          title="Ver todos los puntos en Cusco"
          className="min-h-[40px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white/95 dark:bg-[#0D1117]/95 text-[#14171F] dark:text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md"
        >
          <Scan className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>Encuadrar</span>
        </button>
      </div>

      {/* Tarjeta interactiva en mapa cuando el cliente toca un pin */}
      {selectedPin && (
        <div className="absolute bottom-3 left-14 sm:left-16 right-3 sm:right-auto sm:max-w-xs z-[400] rounded-2xl border border-white/15 bg-white/95 dark:bg-[#0D1117]/95 backdrop-blur-md p-3 shadow-2xl flex items-center justify-between gap-2.5 chuspa-google-border">
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

      {/* Leyenda estilo Facilito */}
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
