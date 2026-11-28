import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Loader2, Search, Sparkles, Tag, Wand2 } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import {
  buildUniversalOficioClientFallback,
  findExactOrSynonymOficioClient,
  searchOficiosLocal,
  UNIVERSAL_OFICIOS_CLIENT_SEED,
} from '../lib/oficiosUniversal.ts';
import { OFICIO_TARIFA_LABELS, type OficioNormalizado } from '../types.ts';

interface OficioAutocompleteProps {
  value: string;
  selectedOficio?: OficioNormalizado | null;
  onSelectOficio: (oficio: OficioNormalizado) => void;
  label?: string;
  placeholder?: string;
  darkSurface?: boolean;
}

export const OficioAutocomplete: React.FC<OficioAutocompleteProps> = ({
  value,
  selectedOficio,
  onSelectOficio,
  label = 'Categoría u Oficio Universal (cualquier oficio del mundo)',
  placeholder = 'Escribe tu oficio o rubro (ej: sastre, gasfitero, pintor, técnico de celulares, luthier...)',
  darkSurface = false,
}) => {
  const [inputText, setInputText] = useState(value);
  const [open, setOpen] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [suggestions, setSuggestions] = useState<OficioNormalizado[]>(
    () => searchOficiosLocal(value, UNIVERSAL_OFICIOS_CLIENT_SEED).oficios
  );
  const [exactMatch, setExactMatch] = useState<OficioNormalizado | null>(() =>
    findExactOrSynonymOficioClient(value, UNIVERSAL_OFICIOS_CLIENT_SEED)
  );
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setInputText(value);
  }, [value]);

  useEffect(() => {
    function handleOutside(ev: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    const q = inputText.trim();
    const localResults = searchOficiosLocal(q, UNIVERSAL_OFICIOS_CLIENT_SEED);
    setSuggestions(localResults.oficios);
    setExactMatch(localResults.exact_match);

    const timer = setTimeout(() => {
      setLoadingList(true);
      apiFetch<{ oficios: OficioNormalizado[]; exact_match: OficioNormalizado | null }>(
        `/api/public/oficios${q ? `?q=${encodeURIComponent(q)}` : ''}`
      )
        .then((res) => {
          if (Array.isArray(res?.oficios) && res.oficios.length > 0) {
            setSuggestions(res.oficios);
          }
          if (res?.exact_match !== undefined) {
            setExactMatch(res.exact_match || localResults.exact_match);
          }
        })
        .catch(() => {
          // Mantiene sugerencias locales sin bloquear al usuario
        })
        .finally(() => setLoadingList(false));
    }, 180);

    return () => clearTimeout(timer);
  }, [inputText]);

  const groupedSuggestions = useMemo(() => {
    const groups = new Map<string, OficioNormalizado[]>();
    for (const item of suggestions.slice(0, 18)) {
      const list = groups.get(item.macro_categoria) || [];
      list.push(item);
      groups.set(item.macro_categoria, list);
    }
    return Array.from(groups.entries());
  }, [suggestions]);

  async function handleNormalizeAndCreate(rawQuery: string) {
    const clean = rawQuery.trim();
    if (clean.length < 2 || normalizing) return;
    setNormalizing(true);
    setStatusNotice(null);
    try {
      const res = await apiFetch<{
        oficio: OficioNormalizado;
        created?: boolean;
        ai_used?: boolean;
      }>('/api/public/ai/normalizar-oficio', {
        method: 'POST',
        body: { query: clean },
      });
      if (res?.oficio) {
        setInputText(res.oficio.nombre_oficial);
        setExactMatch(res.oficio);
        onSelectOficio(res.oficio);
        setOpen(false);
        setStatusNotice(
          res.created
            ? `Oficio "${res.oficio.nombre_oficial}" normalizado y añadido al catálogo universal.`
            : `Oficio "${res.oficio.nombre_oficial}" vinculado desde el catálogo universal.`
        );
      }
    } catch {
      const fallback = buildUniversalOficioClientFallback(clean);
      setInputText(fallback.nombre_oficial);
      setExactMatch(fallback);
      onSelectOficio(fallback);
      setOpen(false);
      setStatusNotice(`Oficio "${fallback.nombre_oficial}" normalizado localmente.`);
    } finally {
      setNormalizing(false);
    }
  }

  function handleChoose(item: OficioNormalizado) {
    setInputText(item.nombre_oficial);
    setExactMatch(item);
    setOpen(false);
    setStatusNotice(null);
    onSelectOficio(item);
  }

  const trimmed = inputText.trim();
  const showAiCreateCta =
    trimmed.length >= 2 &&
    (!exactMatch ||
      exactMatch.nombre_oficial.toLowerCase() !== trimmed.toLowerCase());

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      {label && (
        <label
          className={`block text-[11px] font-semibold ${
            darkSurface ? 'text-slate-300' : 'text-[#555B66] dark:text-[#98A0AD]'
          }`}
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        <Search
          className={`w-4 h-4 absolute left-3 pointer-events-none ${
            darkSurface ? 'text-amber-400' : 'text-[#2563EB]'
          }`}
        />
        <input
          type="text"
          value={inputText}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setInputText(e.target.value);
            setOpen(true);
            setStatusNotice(null);
          }}
          placeholder={placeholder}
          className={`w-full min-h-[42px] pl-9 pr-9 rounded-xl border text-xs sm:text-sm focus:outline-none focus-visible:ring-2 ${
            darkSurface
              ? 'border-white/15 bg-[#07090E] text-white placeholder:text-slate-400 focus-visible:ring-amber-400'
              : 'border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-[#14171F] dark:text-white placeholder:text-[#6A717E] focus-visible:ring-[#2563EB]'
          }`}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Ver catálogo universal de oficios"
          className={`absolute right-2 p-1.5 rounded-lg ${
            darkSurface ? 'text-slate-400 hover:text-white' : 'text-[#6A717E] hover:text-[#14171F] dark:hover:text-white'
          }`}
        >
          {loadingList ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Badge de clasificación normalizada activa */}
      {(selectedOficio || exactMatch) && (
        <div
          className={`flex flex-wrap items-center gap-1.5 text-[10px] ${
            darkSurface ? 'text-slate-300' : 'text-[#555B66] dark:text-slate-300'
          }`}
        >
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 font-bold">
            <CheckCircle2 className="w-3 h-3" />
            {(selectedOficio || exactMatch)!.macro_categoria}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#2563EB]/10 border border-[#2563EB]/25 text-[#1E40AF] dark:text-[#93C5FD] font-semibold">
            <Tag className="w-2.5 h-2.5" />
            {OFICIO_TARIFA_LABELS[(selectedOficio || exactMatch)!.tipo_tarifa_sugerida] || 'Por servicio'}
          </span>
        </div>
      )}

      {statusNotice && (
        <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <Sparkles className="w-3 h-3 shrink-0" />
          <span>{statusNotice}</span>
        </p>
      )}

      {open && (
        <div
          className={`absolute z-40 left-0 right-0 mt-1 rounded-2xl border shadow-2xl max-h-80 overflow-y-auto p-2 space-y-2 ${
            darkSurface
              ? 'border-amber-500/30 bg-[#0D1117] text-slate-100'
              : 'border-black/15 dark:border-white/15 bg-white dark:bg-[#0D1322] text-[#14171F] dark:text-white'
          }`}
        >
          {showAiCreateCta && (
            <button
              type="button"
              disabled={normalizing}
              onClick={() => void handleNormalizeAndCreate(trimmed)}
              className="w-full text-left rounded-xl border border-[#2563EB]/40 bg-gradient-to-r from-[#2563EB]/15 to-[#D4AF37]/15 px-3 py-2.5 flex items-center justify-between gap-2 hover:border-[#2563EB] transition-colors"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#1E40AF] dark:text-[#93C5FD] flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {normalizing
                      ? `Normalizando «${trimmed}» con IA...`
                      : `Crear y normalizar «${trimmed}» con IA`}
                  </span>
                </p>
                <p className="text-[10px] opacity-80">
                  La IA clasifica macro-categoría, sinónimos, tarifa y atributos técnicos al instante
                </p>
              </div>
              {normalizing && <Loader2 className="w-4 h-4 animate-spin shrink-0 text-[#2563EB]" />}
            </button>
          )}

          {groupedSuggestions.map(([macro, items]) => (
            <div key={macro} className="space-y-1">
              <p className="px-2 pt-1 text-[10px] uppercase tracking-wider font-bold text-[#9A7B2C] dark:text-[#E5C158]">
                {macro}
              </p>
              {items.map((item) => {
                const isSelected = selectedOficio?.oficio_id === item.oficio_id;
                return (
                  <button
                    key={item.oficio_id}
                    type="button"
                    onClick={() => handleChoose(item)}
                    className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition-colors flex items-start justify-between gap-2 ${
                      isSelected
                        ? 'border-[#2563EB] bg-[#2563EB]/10'
                        : darkSurface
                        ? 'border-transparent hover:bg-white/5'
                        : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-bold truncate">{item.nombre_oficial}</p>
                      <p className="text-[10px] opacity-75 truncate">
                        {item.sinonimos.slice(0, 4).join(' · ')}
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10 shrink-0">
                      {OFICIO_TARIFA_LABELS[item.tipo_tarifa_sugerida]}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}

          {groupedSuggestions.length === 0 && !showAiCreateCta && (
            <p className="px-3 py-2 text-xs opacity-75">
              Escribe cualquier oficio, profesión o servicio para clasificarlo automáticamente.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
