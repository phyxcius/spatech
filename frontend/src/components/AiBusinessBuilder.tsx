import React, { useState } from 'react';
import {
  Calculator,
  Check,
  Cpu,
  Layers,
  Plus,
  Ruler,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { buildClientFallbackPanelForRubro } from '../lib/aiPanelBuilder.ts';
import {
  formatSoles,
  OFICIO_TARIFA_LABELS,
  type AiBusinessPanelSchema,
} from '../types.ts';

interface AiBusinessBuilderProps {
  nombreComercial?: string;
  zona?: string;
  value: AiBusinessPanelSchema | null;
  onChange: (next: AiBusinessPanelSchema) => void;
}

const PRESET_INDUSTRIES = [
  'Sastre / Modista',
  'Gasfitero / Fontanero',
  'Pintor de Casas y Obras',
  'Albañil / Maestro de Obra',
  'Electricista Domiciliario',
  'Carpintero / Ebanista',
  'Técnico de Celulares',
  'Mecánico Automotriz',
  'Estibador / Mudanza',
  'Ferretería & Materiales',
  'Hotel Boutique',
  'Restaurante / Pollería',
] as const;

export const AiBusinessBuilder: React.FC<AiBusinessBuilderProps> = ({
  nombreComercial,
  zona,
  value,
  onChange,
}) => {
  const [rubroPrompt, setRubroPrompt] = useState(value?.rubro_usuario || '');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [customUnitInput, setCustomUnitInput] = useState('');

  async function generateWithAi(customPrompt?: string) {
    const target = (customPrompt ?? rubroPrompt).trim();
    if (target.length < 2) {
      setErrorMsg('Escribe el rubro de tu negocio (ej: Ferretería, Hotel, Empleos, Piñatería).');
      return;
    }
    setRubroPrompt(target);
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ panel_ia: AiBusinessPanelSchema }>(
        '/api/public/ai/generar-panel-rubro',
        {
          method: 'POST',
          body: {
            rubro_usuario: target,
            nombre: nombreComercial || undefined,
            zona: zona || 'Cusco, Perú',
          },
        }
      );
      if (res?.panel_ia) {
        onChange(res.panel_ia);
      }
    } catch (err) {
      const fallback = buildClientFallbackPanelForRubro({
        rubro_usuario: target,
        nombre: nombreComercial,
      });
      onChange(fallback);
      setErrorMsg(
        err instanceof Error && err.message.includes('GEMINI_API_KEY')
          ? 'Modo diseñador multi-rubro local aplicado (configura GEMINI_API_KEY en el servidor para diseño Gemini en la nube).'
          : null
      );
    } finally {
      setLoading(false);
    }
  }

  function handleAddCustomUnit() {
    if (!value) return;
    const clean = customUnitInput.trim();
    if (!clean) return;
    if (!value.unidades_medida.includes(clean)) {
      onChange({
        ...value,
        unidades_medida: [...value.unidades_medida, clean],
      });
    }
    setCustomUnitInput('');
  }

  function handleRemoveStarterItem(idx: number) {
    if (!value) return;
    onChange({
      ...value,
      catalogo_inicial: value.catalogo_inicial.filter((_, i) => i !== idx),
    });
  }

  return (
    <div className="rounded-2xl border border-[#2563EB]/35 bg-gradient-to-br from-[#EEF4FF] via-white to-[#FFFBEB] dark:from-[#0C162E] dark:via-[#0B101E] dark:to-[#17120A] p-4 space-y-3.5 shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] font-bold text-[#2563EB] dark:text-[#60A5FA] flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5" />
            <span>Agente IA Multi-Rubro · Constructor de Panel</span>
          </p>
          <h3 className="text-sm font-bold text-[#14171F] dark:text-white mt-0.5">
            Describe cualquier negocio del mundo y la IA arma tu panel y unidades
          </h3>
        </div>
        {value && (
          <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
            {value.generado_por === 'gemini' ? 'Gemini AI' : 'IA Multi-Rubro'}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESET_INDUSTRIES.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={loading}
            onClick={() => void generateWithAi(preset)}
            className="px-2.5 py-1 rounded-lg border border-black/10 dark:border-white/10 bg-white/90 dark:bg-[#131C33] text-[11px] font-semibold text-[#14171F] dark:text-[#E2E8F0] hover:border-[#2563EB] transition-colors"
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={rubroPrompt}
          onChange={(e) => setRubroPrompt(e.target.value)}
          placeholder='Ej: "Sastre", "Gasfitero", "Pintor", "Albañil", "Técnico de celulares", "Ferretería"...'
          className="flex-1 min-h-[42px] px-3.5 rounded-xl border border-[#2563EB]/30 bg-white dark:bg-[#0B0E14] text-xs sm:text-sm text-[#14171F] dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => void generateWithAi()}
          className="min-h-[42px] px-4 rounded-xl bg-gradient-to-r from-[#2563EB] via-[#4285F4] to-[#D4AF37] text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 shadow chuspa-google-btn disabled:opacity-60"
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>{loading ? 'Construyendo panel...' : 'Diseñar Panel con IA'}</span>
        </button>
      </div>

      {errorMsg && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
          {errorMsg}
        </p>
      )}

      {value && (
        <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white/90 dark:bg-[#0B0E14]/90 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/8 dark:border-white/8 pb-2.5">
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-wider font-bold text-[#9A7B2C] dark:text-[#E5C158]">
                {value.badge_panel}
              </p>
              <p className="text-sm font-bold text-[#14171F] dark:text-white">
                {value.rubro_titulo}
              </p>
              <p className="text-[11px] text-[#6A717E] dark:text-[#98A0AD]">
                {value.subtitulo_panel}
              </p>
              {(value.macro_categoria || value.tipo_tarifa_sugerida) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                  {value.macro_categoria && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold">
                      {value.macro_categoria}
                    </span>
                  )}
                  {value.tipo_tarifa_sugerida && (
                    <span className="px-2 py-0.5 rounded bg-[#2563EB]/10 text-[#1E40AF] dark:text-[#93C5FD] font-semibold">
                      Tarifa: {OFICIO_TARIFA_LABELS[value.tipo_tarifa_sugerida] || value.tipo_tarifa_sugerida}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono-tabular">
              <span
                className="w-4 h-4 rounded border border-white shadow"
                style={{ backgroundColor: value.tema_color.primaryHex }}
              />
              <span
                className="w-4 h-4 rounded border border-white shadow"
                style={{ backgroundColor: value.tema_color.accentHex }}
              />
            </div>
          </div>

          {/* Unidades de medida generadas */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#14171F] dark:text-white flex items-center gap-1">
                <Ruler className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Unidades y Medidas Activas ({value.unidades_medida.length})</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {value.unidades_medida.map((unit) => (
                <span
                  key={unit}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#2563EB]/10 border border-[#2563EB]/25 text-[10px] font-semibold text-[#1E40AF] dark:text-[#93C5FD]"
                >
                  <Check className="w-2.5 h-2.5" />
                  {unit}
                </span>
              ))}
            </div>
            <div className="flex gap-1.5 pt-1">
              <input
                type="text"
                value={customUnitInput}
                onChange={(e) => setCustomUnitInput(e.target.value)}
                placeholder="Añadir otra medida (ej: Tonelada, Pulgada 3/4, Amperio...)"
                className="flex-1 min-h-[34px] px-2.5 rounded-lg border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#111624] text-[11px]"
              />
              <button
                type="button"
                onClick={handleAddCustomUnit}
                className="min-h-[34px] px-3 rounded-lg bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-[11px] font-bold flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Agregar</span>
              </button>
            </div>
          </div>

          {/* Campos técnicos y módulos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
            <div className="rounded-xl border border-black/8 dark:border-white/8 p-2.5 space-y-1">
              <p className="font-bold text-[#14171F] dark:text-white flex items-center gap-1">
                <Layers className="w-3 h-3 text-emerald-500" />
                <span>Campos de Producto ({value.campos_especificos.length})</span>
              </p>
              {value.campos_especificos.map((c) => (
                <p key={c.key} className="text-[10px] text-[#6A717E] dark:text-[#98A0AD]">
                  • <span className="font-semibold text-[#14171F] dark:text-[#E2E8F0]">{c.label}</span>
                  {c.unidad ? ` (${c.unidad})` : ''}
                  {c.tipo === 'boolean' ? ' [Sí/No]' : ''}
                </p>
              ))}
            </div>

            <div className="rounded-xl border border-black/8 dark:border-white/8 p-2.5 space-y-1">
              <p className="font-bold text-[#14171F] dark:text-white flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                <span>Módulos del Panel ({value.modulos_panel.length})</span>
              </p>
              {value.modulos_panel.map((m) => (
                <p key={m.id} className="text-[10px] text-[#6A717E] dark:text-[#98A0AD]">
                  • <span className="font-semibold text-[#14171F] dark:text-[#E2E8F0]">{m.titulo}</span>
                </p>
              ))}
            </div>
          </div>

          {/* Catálogo inicial auto-generado */}
          {value.catalogo_inicial.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-[#14171F] dark:text-white">
                Catálogo Inicial Sugerido ({value.catalogo_inicial.length} ítems listos al crear):
              </p>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {value.catalogo_inicial.map((item, idx) => (
                  <div
                    key={`${item.nombre}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-black/8 dark:border-white/8 px-2.5 py-1.5 text-[11px]"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate text-[#14171F] dark:text-white">
                        {item.nombre}
                      </p>
                      <p className="text-[10px] text-[#6A717E] dark:text-[#98A0AD]">
                        Por {item.unidad_medida} · Stock {item.stock} ·{' '}
                        <span className="font-mono-tabular font-bold text-emerald-600 dark:text-emerald-400">
                          {formatSoles(item.precio_centavos)}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStarterItem(idx)}
                      title="Quitar ítem inicial"
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface AiDynamicToolsBarProps {
  panelIa: AiBusinessPanelSchema;
}

export const AiDynamicToolsBar: React.FC<AiDynamicToolsBarProps> = ({ panelIa }) => {
  const [lengthInput, setLengthInput] = useState('1');
  const [lengthUnit, setLengthUnit] = useState<'m' | 'in' | 'ft'>('m');
  const [volL, setVolL] = useState('2');
  const [volW, setVolW] = useState('1.5');
  const [volH, setVolH] = useState('1');
  const [watts, setWatts] = useState('3500');
  const [volts, setVolts] = useState('220');

  const valNum = Number(lengthInput) || 0;
  const meters =
    lengthUnit === 'm' ? valNum : lengthUnit === 'in' ? valNum * 0.0254 : valNum * 0.3048;
  const inches = meters / 0.0254;
  const feet = meters / 0.3048;

  const cubicMeters = (Number(volL) || 0) * (Number(volW) || 0) * (Number(volH) || 0);
  const liters = cubicMeters * 1000;
  const amps = (Number(watts) || 0) / Math.max(1, Number(volts) || 220);

  const hasCalc = panelIa.modulos_panel.some(
    (m) => m.tipo_herramienta === 'CALCULADORA_MEDIDAS' || m.tipo_herramienta === 'COTIZADOR_VOLUMEN'
  );

  return (
    <section
      style={{ borderColor: `${panelIa.tema_color.primaryHex}55` }}
      className="rounded-3xl border bg-white dark:bg-[#0D1322] p-5 space-y-4 shadow-lg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p
            style={{ color: panelIa.tema_color.primaryHex }}
            className="text-[11px] uppercase tracking-[0.16em] font-bold flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{panelIa.badge_panel}</span>
          </p>
          <h2 className="font-display text-xl font-semibold text-[#14171F] dark:text-white">
            {panelIa.rubro_titulo}
          </h2>
          <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">{panelIa.subtitulo_panel}</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {panelIa.unidades_medida.slice(0, 8).map((u) => (
            <span
              key={u}
              className="px-2 py-0.5 rounded-lg border border-black/10 dark:border-white/10 text-[10px] font-semibold text-[#555B66] dark:text-[#CBD5E1]"
            >
              {u}
            </span>
          ))}
        </div>
      </div>

      {/* Módulos de negocio generados por IA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {panelIa.modulos_panel.map((mod) => (
          <div
            key={mod.id}
            className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#12192D] p-3.5 space-y-1"
          >
            <p className="text-xs font-bold text-[#14171F] dark:text-white flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5 text-[#4285F4]" />
              <span>{mod.titulo}</span>
            </p>
            <p className="text-[11px] text-[#6A717E] dark:text-[#98A0AD]">{mod.descripcion}</p>
          </div>
        ))}
      </div>

      {/* Herramientas interactivas reales cuando el rubro maneja medidas/volumen/amperaje */}
      {hasCalc && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 pt-1">
          <div className="rounded-2xl border border-[#2563EB]/25 bg-[#2563EB]/5 p-3 space-y-2">
            <p className="text-[11px] font-bold text-[#1E40AF] dark:text-[#93C5FD]">
              Conversor Longitud (m / in / ft)
            </p>
            <div className="flex gap-1.5">
              <input
                type="number"
                step="0.1"
                value={lengthInput}
                onChange={(e) => setLengthInput(e.target.value)}
                className="w-24 min-h-[34px] px-2.5 rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-[#0B0E14] text-xs font-mono-tabular"
              />
              <select
                value={lengthUnit}
                onChange={(e) => setLengthUnit(e.target.value as 'm' | 'in' | 'ft')}
                className="flex-1 min-h-[34px] px-2 rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-[#0B0E14] text-xs"
              >
                <option value="m">Metros (m)</option>
                <option value="in">Pulgadas (in)</option>
                <option value="ft">Pies (ft)</option>
              </select>
            </div>
            <p className="text-[11px] font-mono-tabular text-[#14171F] dark:text-[#E2E8F0]">
              = {meters.toFixed(2)} m · {inches.toFixed(2)} in · {feet.toFixed(2)} ft
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-2">
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
              Cubicación / Volumen (m³ · Cubos · Litros)
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              <input
                type="number"
                step="0.1"
                value={volL}
                onChange={(e) => setVolL(e.target.value)}
                placeholder="Largo m"
                className="min-h-[34px] px-2 rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-[#0B0E14] text-xs font-mono-tabular"
              />
              <input
                type="number"
                step="0.1"
                value={volW}
                onChange={(e) => setVolW(e.target.value)}
                placeholder="Ancho m"
                className="min-h-[34px] px-2 rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-[#0B0E14] text-xs font-mono-tabular"
              />
              <input
                type="number"
                step="0.1"
                value={volH}
                onChange={(e) => setVolH(e.target.value)}
                placeholder="Alto m"
                className="min-h-[34px] px-2 rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-[#0B0E14] text-xs font-mono-tabular"
              />
            </div>
            <p className="text-[11px] font-mono-tabular text-[#14171F] dark:text-[#E2E8F0]">
              = {cubicMeters.toFixed(2)} m³ (cubos) · {liters.toFixed(0)} L
            </p>
          </div>

          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3 space-y-2">
            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
              Carga Eléctrica (Amperios A = W / V)
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="number"
                value={watts}
                onChange={(e) => setWatts(e.target.value)}
                placeholder="Watts (W)"
                className="min-h-[34px] px-2 rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-[#0B0E14] text-xs font-mono-tabular"
              />
              <input
                type="number"
                value={volts}
                onChange={(e) => setVolts(e.target.value)}
                placeholder="Voltios (V)"
                className="min-h-[34px] px-2 rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-[#0B0E14] text-xs font-mono-tabular"
              />
            </div>
            <p className="text-[11px] font-mono-tabular text-[#14171F] dark:text-[#E2E8F0]">
              = {amps.toFixed(2)} Amperios (A)
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
