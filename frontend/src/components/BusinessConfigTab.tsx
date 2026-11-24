import React, { useEffect, useState } from 'react';
import {
  BadgeCheck,
  CarFront,
  CheckCircle2,
  Clock,
  FileCheck2,
  KeyRound,
  MapPin,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Volume2,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import {
  formatPeruLookupError,
  type PeruDocumentLookupResult,
} from '../lib/peruDocs.ts';
import {
  BUSINESS_CATEGORIES,
  formatSoles,
  RUBRO_LABELS,
  SALE_MODALITIES,
  type MetodoPago,
  type Rubro,
} from '../types.ts';

export interface BusinessConfigResumen {
  negocio: {
    id: number;
    codigo: string;
    rubro: Rubro;
    nombre: string;
    telefono?: string;
    descripcion?: string;
    zona: string;
    lat?: number;
    lng?: number;
    en_linea: boolean;
    horario_apertura?: string;
    horario_cierre?: string;
    abierto_24h?: boolean | number;
    metodos_pago_aceptados?: string;
    auto_aceptar_pedidos?: boolean | number;
    alerta_voz_activa?: boolean | number;
    tarifa_minima_centavos?: number;
    radio_cobertura_km?: number;
    tipo_persona?: 'NATURAL' | 'JURIDICA';
    documento_tipo?: 'DNI' | 'RUC';
    documento_numero?: string;
    razon_social?: string;
    tipo_negocio?: string;
    modalidades_venta?: string[];
  };
  servicios: Array<{
    id: number;
    nombre: string;
    descripcion?: string;
    precio_centavos: number;
    unidad_medida?: string;
    stock: number;
    disponible: number;
  }>;
  unidades: Array<{
    id: number;
    conductor_nombre: string;
    placa: string;
    modelo: string;
    color?: string;
    tarifa_base_centavos?: number;
    tarifa_km_centavos?: number;
    estado: string;
    certificada: number;
  }>;
  tasas: Array<{
    id: number;
    moneda_origen: string;
    moneda_destino: string;
    tasa_compra: number;
    tasa_venta: number;
    disponible?: number;
  }>;
  facturacion_apisperu_activa?: boolean;
}

interface BusinessConfigTabProps {
  negocioId: number;
  token: string;
  resumen: BusinessConfigResumen;
  onRefresh: () => Promise<void>;
  onFeedback: (msg: { type: 'ok' | 'err'; text: string }) => void;
}

const ALL_PAYMENTS: MetodoPago[] = ['Yape', 'Plin', 'Efectivo', 'Tarjeta'];

export const BusinessConfigTab: React.FC<BusinessConfigTabProps> = ({
  negocioId,
  token,
  resumen,
  onRefresh,
  onFeedback,
}) => {
  const n = resumen.negocio;

  const [nombre, setNombre] = useState(n.nombre);
  const [telefono, setTelefono] = useState(n.telefono || '+51984000000');
  const [zona, setZona] = useState(n.zona || 'Centro Histórico, Cusco');
  const [descripcion, setDescripcion] = useState(n.descripcion || '');
  const [lat, setLat] = useState(String(n.lat ?? -13.5167));
  const [lng, setLng] = useState(String(n.lng ?? -71.9788));
  const [enLinea, setEnLinea] = useState(Boolean(n.en_linea));
  const [horarioApertura, setHorarioApertura] = useState(n.horario_apertura || '07:00');
  const [horarioCierre, setHorarioCierre] = useState(n.horario_cierre || '22:30');
  const [abierto24h, setAbierto24h] = useState(Boolean(n.abierto_24h));
  const [pagos, setPagos] = useState<string[]>(() =>
    (n.metodos_pago_aceptados || 'Yape,Plin,Efectivo,Tarjeta')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const [autoAceptar, setAutoAceptar] = useState(Boolean(n.auto_aceptar_pedidos));
  const [alertaVoz, setAlertaVoz] = useState(n.alerta_voz_activa !== false && n.alerta_voz_activa !== 0);
  const [tarifaMinSoles, setTarifaMinSoles] = useState(
    String(((n.tarifa_minima_centavos ?? 600) / 100).toFixed(2))
  );
  const [radioKm, setRadioKm] = useState(String(n.radio_cobertura_km ?? 8));
  const [tipoPersona, setTipoPersona] = useState<'NATURAL' | 'JURIDICA'>(
    n.tipo_persona || (n.documento_tipo === 'DNI' ? 'NATURAL' : 'JURIDICA')
  );
  const [documentoNumero, setDocumentoNumero] = useState(n.documento_numero || '');
  const [razonSocial, setRazonSocial] = useState(n.razon_social || '');
  const [tipoNegocio, setTipoNegocio] = useState(n.tipo_negocio || BUSINESS_CATEGORIES[0]);
  const [modalidadesVenta, setModalidadesVenta] = useState<string[]>(() =>
    Array.isArray(n.modalidades_venta) && n.modalidades_venta.length > 0
      ? n.modalidades_venta
      : ['Unidad']
  );
  const [docLookupLoading, setDocLookupLoading] = useState(false);
  const [docVerified, setDocVerified] = useState<PeruDocumentLookupResult | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  // Cambio de PIN
  const [pinActual, setPinActual] = useState('');
  const [pinNuevo, setPinNuevo] = useState('');

  // Nueva unidad de taxi (TRANSPORTE)
  const [uConductor, setUConductor] = useState('');
  const [uPlaca, setUPlaca] = useState('');
  const [uModelo, setUModelo] = useState('');
  const [uColor, setUColor] = useState('Plata');
  const [uBaseSoles, setUBaseSoles] = useState('6.00');
  const [uKmSoles, setUKmSoles] = useState('2.20');

  // Nueva divisa (CASA_CAMBIO)
  const [fxMoneda, setFxMoneda] = useState('USD');
  const [fxCompra, setFxCompra] = useState('3.720');
  const [fxVenta, setFxVenta] = useState('3.760');

  useEffect(() => {
    setNombre(n.nombre);
    setTelefono(n.telefono || '+51984000000');
    setZona(n.zona || 'Centro Histórico, Cusco');
    setDescripcion(n.descripcion || '');
    setLat(String(n.lat ?? -13.5167));
    setLng(String(n.lng ?? -71.9788));
    setEnLinea(Boolean(n.en_linea));
    setHorarioApertura(n.horario_apertura || '07:00');
    setHorarioCierre(n.horario_cierre || '22:30');
    setAbierto24h(Boolean(n.abierto_24h));
    setPagos(
      (n.metodos_pago_aceptados || 'Yape,Plin,Efectivo,Tarjeta')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    setAutoAceptar(Boolean(n.auto_aceptar_pedidos));
    setAlertaVoz(n.alerta_voz_activa !== false && n.alerta_voz_activa !== 0);
    setTarifaMinSoles(String(((n.tarifa_minima_centavos ?? 600) / 100).toFixed(2)));
    setRadioKm(String(n.radio_cobertura_km ?? 8));
    setTipoPersona(n.tipo_persona || (n.documento_tipo === 'DNI' ? 'NATURAL' : 'JURIDICA'));
    setDocumentoNumero(n.documento_numero || '');
    setRazonSocial(n.razon_social || '');
    setTipoNegocio(n.tipo_negocio || BUSINESS_CATEGORIES[0]);
    setModalidadesVenta(
      Array.isArray(n.modalidades_venta) && n.modalidades_venta.length > 0
        ? n.modalidades_venta
        : ['Unidad']
    );
  }, [n.id, n.nombre, n.zona, n.en_linea, n.horario_apertura, n.horario_cierre]);

  function togglePago(p: MetodoPago) {
    setPagos((prev) => {
      if (prev.includes(p)) {
        return prev.length > 1 ? prev.filter((x) => x !== p) : prev;
      }
      return [...prev, p];
    });
  }

  function toggleModalidad(mod: string) {
    setModalidadesVenta((prev) => {
      if (prev.includes(mod)) {
        return prev.length > 1 ? prev.filter((x) => x !== mod) : prev;
      }
      return [...prev, mod];
    });
  }

  async function handleLookupBusinessDoc() {
    const docTipo = tipoPersona === 'NATURAL' ? 'DNI' : 'RUC';
    const clean = documentoNumero.replace(/\D/g, '');
    if (!clean) {
      onFeedback({ type: 'err', text: `Ingresa el ${docTipo} para validar con RENIEC/SUNAT.` });
      return;
    }
    setDocLookupLoading(true);
    try {
      const res = await apiFetch<PeruDocumentLookupResult>(
        `/api/public/consulta-documento?tipo=${docTipo}&numero=${encodeURIComponent(clean)}`
      );
      setDocVerified(res);
      if (res.nombre_completo) {
        setRazonSocial(res.nombre_completo);
        if (!nombre.trim()) setNombre(res.nombre_completo);
      }
      onFeedback({
        type: 'ok',
        text: `${res.tipo} ${res.numero} verificado (${res.fuente}): ${res.nombre_completo}`,
      });
    } catch (err) {
      setDocVerified(null);
      onFeedback({ type: 'err', text: formatPeruLookupError(err) });
    } finally {
      setDocLookupLoading(false);
    }
  }

  function detectGpsForBiz() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLng(pos.coords.longitude.toFixed(5));
      },
      () => onFeedback({ type: 'err', text: 'No se pudo obtener el GPS del navegador.' }),
      { timeout: 6000 }
    );
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    const docTipo = tipoPersona === 'NATURAL' ? 'DNI' : 'RUC';
    try {
      await apiFetch(`/api/negocio/${negocioId}/configuracion`, {
        method: 'PUT',
        body: {
          nombre,
          telefono,
          zona,
          descripcion,
          lat: Number(lat) || -13.5167,
          lng: Number(lng) || -71.9788,
          en_linea: enLinea,
          horario_apertura: horarioApertura,
          horario_cierre: horarioCierre,
          abierto_24h: abierto24h,
          metodos_pago_aceptados: pagos.join(','),
          auto_aceptar_pedidos: autoAceptar,
          alerta_voz_activa: alertaVoz,
          tarifa_minima_centavos: Math.max(100, Math.round((Number(tarifaMinSoles) || 6) * 100)),
          radio_cobertura_km: Math.max(1, Math.min(80, Number(radioKm) || 8)),
          tipo_persona: tipoPersona,
          documento_tipo: docTipo,
          documento_numero: documentoNumero.replace(/\D/g, ''),
          razon_social: razonSocial,
          tipo_negocio: tipoNegocio,
          modalidades_venta: modalidadesVenta,
        },
        token,
      });
      onFeedback({ type: 'ok', text: 'Configuración del panel guardada y sincronizada en vivo.' });
      await onRefresh();
    } catch (err) {
      onFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo guardar la configuración',
      });
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleChangePin(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch(`/api/negocio/${negocioId}/pin`, {
        method: 'PUT',
        body: { pin_actual: pinActual, pin_nuevo: pinNuevo },
        token,
      });
      setPinActual('');
      setPinNuevo('');
      onFeedback({ type: 'ok', text: 'PIN de seguridad del panel actualizado correctamente.' });
    } catch (err) {
      onFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error actualizando el PIN',
      });
    }
  }

  async function handleAddUnit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch(`/api/negocio/${negocioId}/unidades`, {
        method: 'POST',
        body: {
          conductor_nombre: uConductor,
          placa: uPlaca,
          modelo: uModelo,
          color: uColor,
          tarifa_base_centavos: Math.round((Number(uBaseSoles) || 6) * 100),
          tarifa_km_centavos: Math.round((Number(uKmSoles) || 2.2) * 100),
        },
        token,
      });
      setUConductor('');
      setUPlaca('');
      setUModelo('');
      onFeedback({ type: 'ok', text: 'Unidad vehicular añadida a tu flota activa.' });
      await onRefresh();
    } catch (err) {
      onFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error registrando unidad',
      });
    }
  }

  async function handleUnitPatch(
    unidadId: number,
    patch: { estado?: string; tarifa_base_centavos?: number; tarifa_km_centavos?: number }
  ) {
    try {
      await apiFetch(`/api/negocio/${negocioId}/unidades/${unidadId}`, {
        method: 'PATCH',
        body: patch,
        token,
      });
      onFeedback({ type: 'ok', text: 'Unidad actualizada.' });
      await onRefresh();
    } catch (err) {
      onFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo actualizar la unidad',
      });
    }
  }

  async function handleDeleteUnit(unidadId: number) {
    try {
      await apiFetch(`/api/negocio/${negocioId}/unidades/${unidadId}`, {
        method: 'DELETE',
        token,
      });
      onFeedback({ type: 'ok', text: 'Unidad retirada del panel.' });
      await onRefresh();
    } catch (err) {
      onFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo eliminar la unidad',
      });
    }
  }

  async function handleServiceToggle(servicioId: number, currentDisponible: number) {
    try {
      await apiFetch(`/api/negocio/${negocioId}/servicios/${servicioId}`, {
        method: 'PATCH',
        body: { disponible: currentDisponible !== 1 },
        token,
      });
      onFeedback({ type: 'ok', text: 'Disponibilidad de producto/servicio actualizada.' });
      await onRefresh();
    } catch (err) {
      onFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error actualizando servicio',
      });
    }
  }

  async function handleServicePriceDelta(servicioId: number, currentCentavos: number, deltaCentavos: number) {
    const next = Math.max(100, currentCentavos + deltaCentavos);
    try {
      await apiFetch(`/api/negocio/${negocioId}/servicios/${servicioId}`, {
        method: 'PATCH',
        body: { precio_centavos: next },
        token,
      });
      onFeedback({ type: 'ok', text: `Precio actualizado a ${formatSoles(next)}.` });
      await onRefresh();
    } catch (err) {
      onFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error actualizando precio',
      });
    }
  }

  async function handleDeleteService(servicioId: number) {
    try {
      await apiFetch(`/api/negocio/${negocioId}/servicios/${servicioId}`, {
        method: 'DELETE',
        token,
      });
      onFeedback({ type: 'ok', text: 'Ítem eliminado del catálogo.' });
      await onRefresh();
    } catch (err) {
      onFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo eliminar el ítem',
      });
    }
  }

  async function handleAddFxPair(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch(`/api/negocio/${negocioId}/divisas`, {
        method: 'POST',
        body: {
          moneda_origen: fxMoneda,
          tasa_compra: Number(fxCompra),
          tasa_venta: Number(fxVenta),
        },
        token,
      });
      onFeedback({ type: 'ok', text: `Par ${fxMoneda.toUpperCase()}/PEN configurado.` });
      await onRefresh();
    } catch (err) {
      onFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error guardando divisa',
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulario Principal de Configuración del Panel del Negocio */}
        <form
          onSubmit={handleSaveConfig}
          className="lg:col-span-7 rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Settings className="w-5 h-5 text-[#D4AF37]" />
              <div>
                <h2 className="font-display text-2xl font-semibold">
                  Configuración del Panel ({RUBRO_LABELS[n.rubro]})
                </h2>
                <p className="text-xs text-[#6A717E] dark:text-[#98A0AD]">
                  Personaliza tu perfil público, horarios de apertura, ubicación GPS, voz y tarifas
                </p>
              </div>
            </div>
            <label className="min-h-[38px] px-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={enLinea}
                onChange={(e) => setEnLinea(e.target.checked)}
                className="accent-emerald-600"
              />
              <span>{enLinea ? 'En Línea ●' : 'Pausado'}</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
                Nombre comercial público
              </label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
                WhatsApp / Teléfono de contacto
              </label>
              <input
                type="tel"
                required
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
              Dirección o zona en Cusco
            </label>
            <input
              type="text"
              required
              value={zona}
              onChange={(e) => setZona(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
            />
          </div>

          {/* Identidad Tributaria SUNAT / RENIEC + Categoría y Modalidades de Venta */}
          <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#9A7B2C] dark:text-[#D4AF37]">
                Identidad RUC / DNI (SUNAT & RENIEC) y Categoría
              </span>
              {docVerified?.validado && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  <BadgeCheck className="w-3.5 h-3.5" /> {docVerified.tipo} Verificado
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#6A717E] dark:text-[#98A0AD] mb-1">
                  Tipo de Persona
                </label>
                <select
                  value={tipoPersona}
                  onChange={(e) => {
                    setTipoPersona(e.target.value as 'NATURAL' | 'JURIDICA');
                    setDocVerified(null);
                  }}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs font-semibold"
                >
                  <option value="JURIDICA">Persona Jurídica (RUC 11 dígitos)</option>
                  <option value="NATURAL">Persona Natural (DNI 8 dígitos)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#6A717E] dark:text-[#98A0AD] mb-1">
                  {tipoPersona === 'NATURAL' ? 'Número de DNI' : 'Número de RUC'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={tipoPersona === 'NATURAL' ? 8 : 11}
                    value={documentoNumero}
                    onChange={(e) => {
                      setDocumentoNumero(e.target.value.replace(/\D/g, ''));
                      setDocVerified(null);
                    }}
                    placeholder={tipoPersona === 'NATURAL' ? '44556677' : '20601234561'}
                    className="flex-1 min-h-[40px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs font-mono-tabular"
                  />
                  <button
                    type="button"
                    onClick={handleLookupBusinessDoc}
                    disabled={docLookupLoading}
                    className="min-h-[40px] px-3 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-bold whitespace-nowrap"
                  >
                    {docLookupLoading ? 'Validando...' : 'Validar'}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#6A717E] dark:text-[#98A0AD] mb-1">
                  Razón Social / Titular SUNAT-RENIEC
                </label>
                <input
                  type="text"
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value)}
                  placeholder="Razón social o nombres completos"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#6A717E] dark:text-[#98A0AD] mb-1">
                  Categoría / Tipo de Negocio
                </label>
                <select
                  value={tipoNegocio}
                  onChange={(e) => setTipoNegocio(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs"
                >
                  {BUSINESS_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] text-[#6A717E] dark:text-[#98A0AD]">
                Modalidades de Venta (Kilos, Arrobas, Unidades, Medidas, etc.)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SALE_MODALITIES.map((mod) => {
                  const active = modalidadesVenta.includes(mod);
                  return (
                    <button
                      key={mod}
                      type="button"
                      onClick={() => toggleModalidad(mod)}
                      className={`min-h-[34px] px-3 rounded-xl text-xs font-semibold border transition-colors ${
                        active
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-[#555B66] dark:text-[#98A0AD]'
                      }`}
                    >
                      {mod}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
              Descripción visible para el agente de voz y clientes
            </label>
            <textarea
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-sm"
            />
          </div>

          {/* Coordenadas GPS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
                Latitud GPS
              </label>
              <input
                type="number"
                step="0.00001"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs text-[#6A717E] dark:text-[#98A0AD] mb-1">
                Longitud GPS
              </label>
              <input
                type="number"
                step="0.00001"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs font-mono-tabular"
              />
            </div>
            <button
              type="button"
              onClick={detectGpsForBiz}
              className="min-h-[42px] px-3 rounded-xl border border-[#D4AF37]/50 text-xs font-semibold text-[#9A7B2C] dark:text-[#E5C158] flex items-center justify-center gap-1.5"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Usar GPS actual</span>
            </button>
          </div>

          {/* Horario y cobertura */}
          <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#D4AF37]" /> Horario de Atención y Cobertura
              </span>
              <label className="text-xs font-semibold flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={abierto24h}
                  onChange={(e) => setAbierto24h(e.target.checked)}
                  className="accent-[#D4AF37]"
                />
                <span>Abierto 24 Horas</span>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-[#6A717E] dark:text-[#98A0AD] mb-1">
                  Apertura
                </label>
                <input
                  type="time"
                  disabled={abierto24h}
                  value={horarioApertura}
                  onChange={(e) => setHorarioApertura(e.target.value)}
                  className="w-full min-h-[40px] px-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs font-mono-tabular disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#6A717E] dark:text-[#98A0AD] mb-1">
                  Cierre
                </label>
                <input
                  type="time"
                  disabled={abierto24h}
                  value={horarioCierre}
                  onChange={(e) => setHorarioCierre(e.target.value)}
                  className="w-full min-h-[40px] px-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs font-mono-tabular disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#6A717E] dark:text-[#98A0AD] mb-1">
                  Tarifa mín. (S/)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  value={tarifaMinSoles}
                  onChange={(e) => setTarifaMinSoles(e.target.value)}
                  className="w-full min-h-[40px] px-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#6A717E] dark:text-[#98A0AD] mb-1">
                  Radio (km)
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="80"
                  value={radioKm}
                  onChange={(e) => setRadioKm(e.target.value)}
                  className="w-full min-h-[40px] px-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#121620] text-xs font-mono-tabular"
                />
              </div>
            </div>
          </div>

          {/* Métodos de pago aceptados y automatización */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-[#6A717E] dark:text-[#98A0AD]">
              Métodos de pago aceptados por tu negocio
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_PAYMENTS.map((p) => {
                const active = pagos.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePago(p)}
                    className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold border transition-colors ${
                      active
                        ? 'bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] border-transparent'
                        : 'border-black/15 dark:border-white/15 text-[#555B66] dark:text-[#98A0AD]'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-4 pt-1">
              <label className="text-xs flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alertaVoz}
                  onChange={(e) => setAlertaVoz(e.target.checked)}
                  className="accent-[#D4AF37]"
                />
                <Volume2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Leer nuevos pedidos por voz automáticamente</span>
              </label>

              <label className="text-xs flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAceptar}
                  onChange={(e) => setAutoAceptar(e.target.checked)}
                  className="accent-emerald-600"
                />
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Auto-confirmar si tengo saldo libre</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={savingConfig}
            className="w-full min-h-[48px] rounded-2xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{savingConfig ? 'Guardando configuración...' : 'Guardar Configuración del Panel'}</span>
          </button>
        </form>

        {/* Columna derecha: Seguridad PIN + Configuración específica por Rubro */}
        <div className="lg:col-span-5 space-y-6">
          {/* Cambio de PIN */}
          <form
            onSubmit={handleChangePin}
            className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-3"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#D4AF37]" />
              <h3 className="font-display text-xl font-semibold">Seguridad y Cambio de PIN</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                required
                value={pinActual}
                onChange={(e) => setPinActual(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="PIN actual"
                className="min-h-[42px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] font-mono-tabular text-sm"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                required
                value={pinNuevo}
                onChange={(e) => setPinNuevo(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Nuevo PIN"
                className="min-h-[42px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] font-mono-tabular text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[42px] rounded-xl border border-[#D4AF37]/60 text-xs font-bold text-[#9A7B2C] dark:text-[#E5C158] hover:bg-[#D4AF37]/10"
            >
              Actualizar PIN de Acceso
            </button>
          </form>

          {/* Facturación Electrónica ApisPeru (Solo negocios no-taxi) o Regla Taxi */}
          {n.rubro !== 'TRANSPORTE' ? (
            <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="font-display text-xl font-semibold">
                    Facturación Electrónica SUNAT (ApisPeru)
                  </h3>
                </div>
                <span
                  className={`text-[11px] font-bold ${
                    resumen.facturacion_apisperu_activa
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-[#9A7B2C] dark:text-[#E5C158]'
                  }`}
                >
                  {resumen.facturacion_apisperu_activa
                    ? 'Conectado en servidor'
                    : 'Comprobante local listo'}
                </span>
              </div>
              <p className="text-xs text-[#6A717E] dark:text-[#98A0AD] leading-relaxed">
                {resumen.facturacion_apisperu_activa
                  ? 'El servidor Node.js tiene activo el token de ApisPeru SUNAT. Al validar el PIN de entrega se emitirá automáticamente Boleta (DNI) o Factura (RUC) con IGV 18%.'
                  : 'Se generan Boletas (DNI) y Facturas (RUC) locales con IGV 18% al finalizar cada pedido, listas para envío a SUNAT desde el Historial cuando el token de servidor esté activo.'}
              </p>
            </div>
          ) : (
            <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#2563EB]" />
                <h3 className="font-display text-xl font-semibold">
                  Identificación de Pasajeros (Sin Facturación)
                </h3>
              </div>
              <p className="text-xs text-[#6A717E] dark:text-[#98A0AD] leading-relaxed">
                Para taxis y movilidad el sistema exige validar DNI (RENIEC), RUC (SUNAT) o Pasaporte/CE antes de solicitar el viaje para seguridad del conductor. No se emiten Boletas ni Facturas electrónicas en traslados de taxi.
              </p>
            </div>
          )}

          {/* Módulo Transporte: Configurar Unidades y Tarifas */}
          {n.rubro === 'TRANSPORTE' && (
            <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-4">
              <div className="flex items-center gap-2">
                <CarFront className="w-4 h-4 text-[#84CC16]" />
                <h3 className="font-display text-xl font-semibold">Mi Flota de Taxis y Tarifas</h3>
              </div>

              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {(resumen.unidades || []).map((u) => (
                  <div
                    key={u.id}
                    className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] p-3 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {u.conductor_nombre} · <span className="font-mono-tabular">{u.placa}</span>
                        </p>
                        <p className="text-[11px] text-[#6A717E] dark:text-[#98A0AD]">
                          {u.modelo} · Base {formatSoles(u.tarifa_base_centavos ?? 600)} +{' '}
                          {formatSoles(u.tarifa_km_centavos ?? 220)}/km
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteUnit(u.id)}
                        title="Eliminar unidad"
                        className="p-1.5 rounded-lg text-[#C81E5B] hover:bg-[#C81E5B]/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(['DISPONIBLE', 'OCUPADO', 'FUERA_SERVICIO'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => handleUnitPatch(u.id, { estado: st })}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                            u.estado === st
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'border-black/15 dark:border-white/15 text-[#6A717E]'
                          }`}
                        >
                          {st.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddUnit} className="space-y-2.5 pt-3 border-t border-black/10 dark:border-white/10">
                <p className="text-xs font-bold">Registrar nueva unidad / conductor</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    required
                    type="text"
                    value={uConductor}
                    onChange={(e) => setUConductor(e.target.value)}
                    placeholder="Conductor"
                    className="min-h-[38px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs"
                  />
                  <input
                    required
                    type="text"
                    value={uPlaca}
                    onChange={(e) => setUPlaca(e.target.value.toUpperCase())}
                    placeholder="Placa (X3A-901)"
                    className="min-h-[38px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs font-mono-tabular uppercase"
                  />
                  <input
                    required
                    type="text"
                    value={uModelo}
                    onChange={(e) => setUModelo(e.target.value)}
                    placeholder="Modelo (Toyota Yaris)"
                    className="min-h-[38px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs"
                  />
                  <input
                    type="text"
                    value={uColor}
                    onChange={(e) => setUColor(e.target.value)}
                    placeholder="Color"
                    className="min-h-[38px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs"
                  />
                  <input
                    type="number"
                    step="0.5"
                    value={uBaseSoles}
                    onChange={(e) => setUBaseSoles(e.target.value)}
                    placeholder="Base S/"
                    className="min-h-[38px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs font-mono-tabular"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={uKmSoles}
                    onChange={(e) => setUKmSoles(e.target.value)}
                    placeholder="Por km S/"
                    className="min-h-[38px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs font-mono-tabular"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full min-h-[40px] rounded-xl bg-[#84CC16] text-[#0B0E14] text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar Unidad</span>
                </button>
              </form>
            </div>
          )}

          {/* Módulo Casa de Cambio: Configurar Divisas */}
          {n.rubro === 'CASA_CAMBIO' && (
            <form
              onSubmit={handleAddFxPair}
              className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-3"
            >
              <h3 className="font-display text-xl font-semibold">Configurar Moneda (PEN)</h3>
              <div className="grid grid-cols-3 gap-2">
                <input
                  required
                  maxLength={3}
                  value={fxMoneda}
                  onChange={(e) => setFxMoneda(e.target.value.toUpperCase())}
                  placeholder="USD"
                  className="min-h-[40px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs font-mono-tabular uppercase"
                />
                <input
                  required
                  type="number"
                  step="0.001"
                  value={fxCompra}
                  onChange={(e) => setFxCompra(e.target.value)}
                  placeholder="Compra"
                  className="min-h-[40px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs font-mono-tabular"
                />
                <input
                  required
                  type="number"
                  step="0.001"
                  value={fxVenta}
                  onChange={(e) => setFxVenta(e.target.value)}
                  placeholder="Venta"
                  className="min-h-[40px] px-3 rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#0B0E14] text-xs font-mono-tabular"
                />
              </div>
              <button
                type="submit"
                className="w-full min-h-[42px] rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-bold"
              >
                Guardar / Actualizar Tasa
              </button>
            </form>
          )}

          {/* Módulo Otros Rubros: Edición Rápida de Productos / Servicios */}
          {n.rubro !== 'TRANSPORTE' && n.rubro !== 'CASA_CAMBIO' && (
            <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#121620] p-6 space-y-3">
              <h3 className="font-display text-xl font-semibold">
                Productos / Servicios Configurados ({(resumen.servicios || []).length})
              </h3>
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {(resumen.servicios || []).map((s) => (
                  <div
                    key={s.id}
                    className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F8F7F4] dark:bg-[#0B0E14] p-3 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{s.nombre}</p>
                      <p className="font-mono-tabular text-[11px] text-[#6A717E] dark:text-[#98A0AD]">
                        {formatSoles(s.precio_centavos)} / {s.unidad_medida || 'Unidad'} · Stock {s.stock}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleServicePriceDelta(s.id, s.precio_centavos, -200)}
                        className="px-2 py-1 rounded-lg border border-black/15 dark:border-white/15 font-mono-tabular"
                      >
                        -2
                      </button>
                      <button
                        type="button"
                        onClick={() => handleServicePriceDelta(s.id, s.precio_centavos, 200)}
                        className="px-2 py-1 rounded-lg border border-black/15 dark:border-white/15 font-mono-tabular"
                      >
                        +2
                      </button>
                      <button
                        type="button"
                        onClick={() => handleServiceToggle(s.id, s.disponible)}
                        className={`px-2 py-1 rounded-lg font-bold ${
                          s.disponible === 1
                            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-500/20 text-slate-400'
                        }`}
                      >
                        {s.disponible === 1 ? 'Activo' : 'Oculto'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteService(s.id)}
                        className="p-1.5 text-[#C81E5B] hover:bg-[#C81E5B]/10 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
