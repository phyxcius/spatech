import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Maximize2 } from 'lucide-react';

export interface GeoMapPin {
  id: string;
  lat: number;
  lng: number;
  priceText: string;
  sublabel?: string;
  tier: 'cheapest' | 'mid' | 'high' | 'closed';
  kind: 'DRIVER' | 'MARKET';
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
  routeSummary?: string;
  pins: GeoMapPin[];
  selectedPinId?: string | null;
  onSelectPin?: (id: string) => void;
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

export const CuscoGeoMap: React.FC<CuscoGeoMapProps> = ({
  mode,
  userLat,
  userLng,
  originLabel = 'Plaza de Armas, Cusco',
  destLat,
  destLng,
  destLabel,
  routeSummary,
  pins,
  selectedPinId,
  onSelectPin,
  onRequestGps,
  gpsLive,
  heightClass = 'h-[360px] sm:h-[430px]',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const onSelectPinRef = useRef(onSelectPin);
  onSelectPinRef.current = onSelectPin;

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

  function fitAllBounds() {
    const map = mapRef.current;
    if (!map) return;
    const pts: L.LatLngExpression[] = [[userLat, userLng]];
    if (mode === 'TAXI' && destLat !== undefined && destLng !== undefined) {
      pts.push([destLat, destLng]);
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

    // 1. User GPS / Origin marker
    if (mode === 'TAXI') {
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

      // Destination B marker + curved route polyline
      if (destLat !== undefined && destLng !== undefined) {
        const midLat = (userLat + destLat) / 2 + 0.0022;
        const midLng = (userLng + destLng) / 2 - 0.0018;
        L.polyline(
          [
            [userLat, userLng],
            [midLat, midLng],
            [destLat, destLng],
          ],
          {
            color: '#111827',
            weight: 4.5,
            opacity: 0.85,
          }
        ).addTo(group);

        L.polyline(
          [
            [userLat, userLng],
            [midLat, midLng],
            [destLat, destLng],
          ],
          {
            color: '#C2F238',
            weight: 2,
            dashArray: '6 6',
            opacity: 0.95,
          }
        ).addTo(group);

        if (routeSummary) {
          const midIcon = L.divIcon({
            className: 'cusco-leaflet-pin',
            iconSize: [120, 26],
            iconAnchor: [60, 13],
            html: `
              <div style="background:#0B0E14;color:#FACC15;padding:3px 9px;border-radius:999px;border:1px solid rgba(250,204,21,0.5);font-size:10px;font-weight:700;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.35);white-space:nowrap;">
                ${escapeHtml(routeSummary)}
              </div>
            `,
          });
          L.marker([midLat, midLng], { icon: midIcon, interactive: false }).addTo(group);
        }

        const destIcon = L.divIcon({
          className: 'cusco-leaflet-pin',
          iconSize: [160, 38],
          iconAnchor: [18, 34],
          html: `
            <div style="display:flex;align-items:center;gap:6px;background:#0F172A;color:#FFFFFF;padding:5px 10px;border-radius:12px;border:2px solid #84CC16;box-shadow:0 8px 20px rgba(0,0,0,0.35);font-size:11px;font-weight:700;white-space:nowrap;">
              <span style="width:18px;height:18px;border-radius:6px;background:#84CC16;color:#0B0E14;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;">B</span>
              <span style="max-width:118px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(destLabel || 'Destino')}</span>
            </div>
          `,
        });
        L.marker([destLat, destLng], { icon: destIcon, zIndexOffset: 500 }).addTo(group);
      }
    } else {
      // MARKET mode: blue GPS dot
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

    // 2. Price Tag Markers (Facilito / InDrive style)
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
      const iconPrefix = pin.kind === 'DRIVER' ? '🚕 ' : '';

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
  }, [mode, userLat, userLng, originLabel, destLat, destLng, destLabel, routeSummary, pins, selectedPinId]);

  useEffect(() => {
    fitAllBounds();
  }, [mode, destLat, destLng, pins.length]);

  return (
    <div className="relative rounded-3xl overflow-hidden border border-black/15 dark:border-white/15 bg-slate-200 dark:bg-[#0D1117] shadow-xl">
      <div ref={containerRef} className={`w-full ${heightClass} cusco-osm-tiles`} />

      {/* Controles flotantes de mapa (GPS + Reencuadrar) */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
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
          <Maximize2 className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>Encuadrar</span>
        </button>
      </div>

      {/* Leyenda estilo Facilito */}
      <div className="absolute bottom-3 right-3 z-[400] flex items-center gap-2 bg-white/95 dark:bg-[#0D1117]/95 backdrop-blur-md border border-black/10 dark:border-white/15 rounded-xl px-3 py-1.5 text-[10px] font-semibold shadow-md">
        <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> Más económico
        </span>
        <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Intermedio
        </span>
      </div>
    </div>
  );
};
