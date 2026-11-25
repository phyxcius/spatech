import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Navigation, Sparkles, Star } from 'lucide-react';

export interface EdgeCarouselItem {
  id: string;
  title: string;
  subtitle: string;
  priceText: string;
  badge?: string;
  etaText?: string;
  rating?: number;
  bestPrice?: boolean;
  closed?: boolean;
  actionLabel?: string;
}

interface MapEdgeCarouselProps {
  headerTitle: string;
  items: EdgeCarouselItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAction: (id: string) => void;
  accentHex?: string;
}

export const MapEdgeCarousel: React.FC<MapEdgeCarouselProps> = ({
  headerTitle,
  items,
  selectedId,
  onSelect,
  onAction,
  accentHex = '#4285F4',
}) => {
  const [collapsed, setCollapsed] = useState(false);

  if (items.length === 0) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Abrir lista carrusel del mapa"
        className="absolute top-1/2 -translate-y-1/2 right-0 z-[420] min-h-[112px] w-8 rounded-l-2xl bg-[#0B0E14]/90 text-white backdrop-blur-xl border border-r-0 border-white/20 shadow-2xl flex flex-col items-center justify-center gap-1.5 chuspa-google-border"
      >
        <ChevronLeft className="w-4 h-4 text-[#FBBC04]" />
        <span className="text-[10px] font-bold tracking-wider [writing-mode:vertical-rl] rotate-180">
          {items.length} opciones
        </span>
      </button>
    );
  }

  return (
    <aside
      aria-label={headerTitle}
      className="absolute top-2.5 bottom-2.5 right-2.5 z-[420] w-[158px] sm:w-[228px] rounded-[26px] bg-[#0B0E14]/84 text-white backdrop-blur-xl border border-white/15 shadow-[0_16px_48px_rgba(0,0,0,0.65)] flex flex-col overflow-hidden chuspa-google-border"
    >
      {/* Cabecera compacta tipo Edge Panel */}
      <div className="px-2.5 py-2 border-b border-white/12 flex items-center justify-between gap-1 shrink-0 bg-white/5">
        <div className="min-w-0 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-[#FBBC04] shrink-0" />
          <span className="text-[10px] font-extrabold uppercase tracking-wider truncate text-slate-100">
            {headerTitle}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Ocultar carrusel lateral"
          title="Ocultar panel lateral"
          className="w-7 h-7 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
        >
          <ChevronRight className="w-3.5 h-3.5 text-slate-200" />
        </button>
      </div>

      {/* Carrusel vertical desplazable arriba <-> abajo */}
      <div className="flex-1 overflow-y-auto overscroll-contain chuspa-edge-scroll p-2 space-y-2">
        {items.map((item, idx) => {
          const isSelected = item.id === selectedId;
          return (
            <React.Fragment key={item.id}>
              {idx === 1 && (
                <div
                  aria-hidden="true"
                  className="mx-2 my-1 border-t border-dotted border-white/25"
                />
              )}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(item.id);
                  }
                }}
                className={`w-full text-left rounded-2xl p-2 sm:p-2.5 transition-all cursor-pointer border space-y-1.5 ${
                  isSelected
                    ? 'bg-white/15 border-[#FBBC04]/85 shadow-[0_0_18px_rgba(251,188,4,0.28)]'
                    : item.bestPrice
                    ? 'bg-[#34A853]/14 border-[#34A853]/50 hover:bg-white/12'
                    : 'bg-white/7 border-white/10 hover:bg-white/12'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  {item.bestPrice ? (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md bg-[#34A853] text-white truncate">
                      Mejor precio
                    </span>
                  ) : item.badge ? (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-md truncate text-white"
                      style={{ backgroundColor: `${accentHex}55` }}
                    >
                      {item.badge}
                    </span>
                  ) : (
                    <span className="text-[9px] font-semibold text-slate-400">Verificado</span>
                  )}

                  {typeof item.rating === 'number' && (
                    <span className="text-[10px] font-mono-tabular text-[#FBBC04] flex items-center gap-0.5 shrink-0">
                      <Star className="w-2.5 h-2.5 fill-[#FBBC04] text-[#FBBC04]" />
                      {item.rating.toFixed(1)}
                    </span>
                  )}
                </div>

                <p className="text-[11px] sm:text-xs font-bold text-white leading-tight line-clamp-2">
                  {item.title}
                </p>
                <p className="text-[10px] text-slate-300 truncate">{item.subtitle}</p>

                <div className="flex items-center justify-between gap-1 pt-0.5">
                  <div className="min-w-0">
                    <p
                      className={`font-mono-tabular text-xs sm:text-sm font-black ${
                        item.closed
                          ? 'text-slate-400'
                          : item.bestPrice
                          ? 'text-[#34A853]'
                          : 'text-[#FBBC04]'
                      }`}
                    >
                      {item.priceText}
                    </p>
                    {item.etaText && (
                      <p className="text-[9px] font-mono-tabular text-slate-400 truncate">
                        {item.etaText}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={item.closed}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(item.id);
                      onAction(item.id);
                    }}
                    className="min-h-[30px] px-2.5 rounded-xl bg-gradient-to-r from-[#4285F4] via-[#34A853] to-[#D4AF37] text-white text-[10px] font-bold inline-flex items-center gap-1 shrink-0 disabled:opacity-40 chuspa-google-btn whitespace-nowrap"
                  >
                    <Navigation className="w-2.5 h-2.5" />
                    <span>{item.actionLabel || 'Solicitar'}</span>
                  </button>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </aside>
  );
};
