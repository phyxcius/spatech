import React, { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Briefcase,
  Building2,
  Crosshair,
  Globe2,
  MapPin,
  Phone,
  Shield,
  ShieldCheck,
  Siren,
  UserCheck,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { formatWhatsAppNumber, WHATSAPP_COUNTRIES } from '../lib/countries.ts';
import {
  formatPeruLookupError,
  isValidForeignDoc,
  type PeruDocumentLookupResult,
} from '../lib/peruDocs.ts';
import type { SharedCustomerDoc } from '../types.ts';

interface IdentityGateOverlayProps {
  isOpen: boolean;
  initialDoc?: SharedCustomerDoc | null;
  canClose?: boolean;
  onClose?: () => void;
  onVerified: (doc: SharedCustomerDoc) => void;
  onSwitchView?: (view: 'NEGOCIO' | 'CENTRAL_SOS' | 'ADMIN') => void;
}

type DocTab = 'DNI' | 'RUC' | 'EXTRANJERO';

export const IdentityGateOverlay: React.FC<IdentityGateOverlayProps> = ({
  isOpen,
  initialDoc,
  canClose = false,
  onClose,
  onVerified,
  onSwitchView,
}) => {
  const [tipo, setTipo] = useState<DocTab>(initialDoc?.tipo || 'DNI');
  const [numero, setNumero] = useState(initialDoc?.numero || '');
  const [nombreExtranjero, setNombreExtranjero] = useState(
    initialDoc?.tipo === 'EXTRANJERO' ? initialDoc.nombre : ''
  );
  const [paisCodigo, setPaisCodigo] = useState(initialDoc?.paisCodigo || '+51');
  const [whatsappLocal, setWhatsappLocal] = useState(() => {
    if (!initialDoc?.whatsapp) return '';
    const code = initialDoc.paisCodigo || '+51';
    return initialDoc.whatsapp.startsWith(code)
      ? initialDoc.whatsapp.slice(code.length).trim()
      : initialDoc.whatsapp;
  });
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(
    typeof initialDoc?.lat === 'number' && typeof initialDoc?.lng === 'number'
      ? { lat: initialDoc.lat, lng: initialDoc.lng }
      : null
  );
  const [gpsState, setGpsState] = useState<'idle' | 'loading' | 'live' | 'denied'>(
    initialDoc?.gpsVerificado ? 'live' : 'idle'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && initialDoc?.verificado) {
      setTipo(initialDoc.tipo);
      setNumero(initialDoc.numero);
      if (initialDoc.tipo === 'EXTRANJERO') {
        setNombreExtranjero(initialDoc.nombre);
      }
      if (initialDoc.paisCodigo) setPaisCodigo(initialDoc.paisCodigo);
      if (initialDoc.whatsapp) {
        const code = initialDoc.paisCodigo || '+51';
        setWhatsappLocal(
          initialDoc.whatsapp.startsWith(code)
            ? initialDoc.whatsapp.slice(code.length).trim()
            : initialDoc.whatsapp
        );
      }
      if (typeof initialDoc.lat === 'number' && typeof initialDoc.lng === 'number') {
        setGpsCoords({ lat: initialDoc.lat, lng: initialDoc.lng });
        setGpsState(initialDoc.gpsVerificado ? 'live' : 'idle');
      }
      setError(null);
    }
  }, [
    isOpen,
    initialDoc?.verificado,
    initialDoc?.tipo,
    initialDoc?.numero,
    initialDoc?.nombre,
    initialDoc?.whatsapp,
    initialDoc?.paisCodigo,
    initialDoc?.lat,
    initialDoc?.lng,
    initialDoc?.gpsVerificado,
  ]);

  function requestCellLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsState('denied');
      return;
    }
    setGpsState('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsState('live');
      },
      () => {
        setGpsState('denied');
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  }

  useEffect(() => {
    if (isOpen && gpsState === 'idle') {
      requestCellLocation();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedCountry =
    WHATSAPP_COUNTRIES.find((c) => c.dialCode === paisCodigo) || WHATSAPP_COUNTRIES[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const localDigits = whatsappLocal.replace(/\D/g, '');
    if (localDigits.length < 6) {
      setError(
        `Ingresa tu número de WhatsApp válido de ${selectedCountry.name} (${selectedCountry.dialCode}) para no volver a pedirlo en tus pedidos.`
      );
      return;
    }
    const formattedWa = formatWhatsAppNumber(paisCodigo, whatsappLocal);
    const latFinal = gpsCoords?.lat ?? -13.5167;
    const lngFinal = gpsCoords?.lng ?? -71.9788;
    const gpsOk = gpsState === 'live';

    if (tipo === 'EXTRANJERO') {
      const cleanDoc = numero.trim().toUpperCase();
      const cleanName = nombreExtranjero.trim();
      if (!isValidForeignDoc(cleanDoc)) {
        setError('Ingresa un Pasaporte o Carné de Extranjería válido (6 a 20 caracteres alfanuméricos).');
        return;
      }
      if (cleanName.length < 3) {
        setError('Ingresa tu nombre completo tal como figura en tu Pasaporte o Carné de Extranjería.');
        return;
      }
      setLoading(true);
      try {
        const res = await apiFetch<PeruDocumentLookupResult>(
          `/api/public/consulta-documento?tipo=EXTRANJERO&numero=${encodeURIComponent(
            cleanDoc
          )}&nombre=${encodeURIComponent(cleanName)}`
        );
        onVerified({
          tipo: 'EXTRANJERO',
          numero: res.numero || cleanDoc,
          nombre: res.nombre_completo || cleanName,
          direccionFiscal: res.direccion,
          verificado: true,
          fuente: res.fuente || res.source || 'MIGRACIONES_EXTRANJERO',
          whatsapp: formattedWa,
          paisCodigo,
          paisNombre: selectedCountry.name,
          lat: latFinal,
          lng: lngFinal,
          gpsVerificado: gpsOk,
        });
      } catch (err) {
        setError(formatPeruLookupError(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    const digits = numero.replace(/\D/g, '');
    const resolvedTipo: 'DNI' | 'RUC' =
      digits.length === 11 ? 'RUC' : digits.length === 8 ? 'DNI' : tipo;
    if (resolvedTipo !== tipo) setTipo(resolvedTipo);

    const localErr = formatPeruLookupError(resolvedTipo, digits);
    if (localErr) {
      setError(localErr);
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<PeruDocumentLookupResult>(
        `/api/public/consulta-documento?tipo=${resolvedTipo}&numero=${encodeURIComponent(digits)}`
      );
      onVerified({
        tipo: res.tipo,
        numero: res.numero,
        nombre: res.nombre_completo,
        direccionFiscal: res.direccion,
        verificado: true,
        fuente: res.fuente || res.source,
        whatsapp: formattedWa,
        paisCodigo,
        paisNombre: selectedCountry.name,
        lat: latFinal,
        lng: lngFinal,
        gpsVerificado: gpsOk,
      });
    } catch (err) {
      setError(formatPeruLookupError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Identificación Obligatoria del Titular"
      className="fixed inset-0 z-50 bg-[#04334B]/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="w-full max-w-lg rounded-3xl border border-[#D8E2EC] dark:border-white/15 bg-white dark:bg-[#052030] text-[#0B2538] dark:text-[#F1F5F9] shadow-2xl overflow-hidden my-auto">
        {/* Cabecera Azul Marino Profundo con marca blanca y dorada */}
        <div className="bg-[#04334B] text-white px-6 sm:px-8 pt-6 pb-5 relative">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] font-bold text-[#F5C400]">
                <ShieldCheck className="w-4 h-4" />
                <span>La Chuspa Cusco · Identidad y GPS</span>
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold leading-tight text-white">
                Identifícate para ingresar
              </h2>
              <p className="text-xs sm:text-sm text-slate-200">
                Registra una sola vez tu DNI, RUC o Extranjero, tu WhatsApp y tu ubicación para todos tus pedidos y emergencias.
              </p>
            </div>
            {canClose && onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar identificación"
                className="min-h-[40px] min-w-[40px] rounded-xl border border-white/20 flex items-center justify-center text-slate-200 hover:text-white hover:bg-white/10 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          {/* Selector DNI / RUC / Extranjero */}
          <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-[#F7FAFC] dark:bg-[#031622] border border-[#D8E2EC] dark:border-white/10">
            <button
              type="button"
              onClick={() => {
                setTipo('DNI');
                setNumero('');
                setError(null);
              }}
              className={`min-h-[42px] px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                tipo === 'DNI'
                  ? 'bg-[#1565F5] text-white shadow-sm'
                  : 'text-[#516478] dark:text-slate-300 hover:text-[#0B2538]'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>DNI (8)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTipo('RUC');
                setNumero('');
                setError(null);
              }}
              className={`min-h-[42px] px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                tipo === 'RUC'
                  ? 'bg-[#1565F5] text-white shadow-sm'
                  : 'text-[#516478] dark:text-slate-300 hover:text-[#0B2538]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>RUC (11)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTipo('EXTRANJERO');
                setNumero('');
                setError(null);
              }}
              className={`min-h-[42px] px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                tipo === 'EXTRANJERO'
                  ? 'bg-[#1565F5] text-white shadow-sm'
                  : 'text-[#516478] dark:text-slate-300 hover:text-[#0B2538]'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5" />
              <span>Extranjero</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#1565F5] dark:text-[#60A5FA]">
                {tipo === 'DNI'
                  ? 'Número de DNI peruano (8 dígitos · sincronizado RENIEC)'
                  : tipo === 'RUC'
                  ? 'Número de RUC (11 dígitos · Facturación Electrónica)'
                  : 'Número de Pasaporte o Carné de Extranjería'}
              </label>
              <input
                type="text"
                required
                autoFocus
                inputMode={tipo === 'EXTRANJERO' ? 'text' : 'numeric'}
                maxLength={tipo === 'DNI' ? 8 : tipo === 'RUC' ? 11 : 20}
                value={numero}
                onChange={(e) => {
                  setError(null);
                  if (tipo === 'EXTRANJERO') {
                    setNumero(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''));
                  } else {
                    const digits = e.target.value.replace(/\D/g, '');
                    setNumero(digits);
                    if (digits.length > 8 && tipo !== 'RUC') setTipo('RUC');
                  }
                }}
                placeholder={
                  tipo === 'DNI'
                    ? 'Ej: 44556677'
                    : tipo === 'RUC'
                    ? 'Ej: 20601234565'
                    : 'Ej: PA998877 o CE-123456'
                }
                className="w-full min-h-[48px] px-4 rounded-2xl border border-[#1565F5]/45 bg-white dark:bg-[#031622] text-base font-mono-tabular font-semibold tracking-wide text-[#0B2538] dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1565F5]"
              />
            </div>

            {tipo === 'EXTRANJERO' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#516478] dark:text-slate-300">
                  Nombre completo del titular (Pasaporte / CE)
                </label>
                <input
                  type="text"
                  required
                  value={nombreExtranjero}
                  onChange={(e) => {
                    setError(null);
                    setNombreExtranjero(e.target.value);
                  }}
                  placeholder="Ej: Johnathan Miller"
                  className="w-full min-h-[48px] px-4 rounded-2xl border border-[#D8E2EC] dark:border-white/15 bg-white dark:bg-[#031622] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1565F5]"
                />
              </div>
            )}

            {/* WhatsApp con Selector de País */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#516478] dark:text-slate-300">
                WhatsApp con código de país (se guardará para todos tus pedidos y SOS)
              </label>
              <div className="flex gap-2">
                <select
                  aria-label="País para WhatsApp"
                  value={paisCodigo}
                  onChange={(e) => {
                    setPaisCodigo(e.target.value);
                    setError(null);
                  }}
                  className="min-h-[48px] max-w-[160px] px-2.5 rounded-2xl border border-[#D8E2EC] dark:border-white/15 bg-white dark:bg-[#031622] text-xs font-semibold text-[#0B2538] dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1565F5]"
                >
                  {WHATSAPP_COUNTRIES.map((c) => (
                    <option key={c.iso} value={c.dialCode}>
                      {c.flag} {c.name} ({c.dialCode})
                    </option>
                  ))}
                </select>
                <div className="relative flex-1 flex items-center">
                  <Phone className="w-4 h-4 text-[#1565F5] absolute left-3.5 pointer-events-none" />
                  <input
                    type="tel"
                    required
                    inputMode="tel"
                    value={whatsappLocal}
                    onChange={(e) => {
                      setError(null);
                      setWhatsappLocal(e.target.value.replace(/[^0-9\s-]/g, ''));
                    }}
                    placeholder={selectedCountry.sample}
                    className="w-full min-h-[48px] pl-10 pr-4 rounded-2xl border border-[#D8E2EC] dark:border-white/15 bg-white dark:bg-[#031622] text-sm font-mono-tabular font-semibold text-[#0B2538] dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1565F5]"
                  />
                </div>
              </div>
            </div>

            {/* Captura de Ubicación GPS del Celular */}
            <div className="rounded-2xl border border-[#D8E2EC] dark:border-white/15 bg-[#F7FAFC] dark:bg-[#031622] p-3 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <MapPin className="w-4 h-4 text-[#1565F5] shrink-0 mt-0.5" />
                <div className="text-[11px]">
                  <p className="font-bold text-[#0B2538] dark:text-white">
                    {gpsState === 'live' && gpsCoords
                      ? `Ubicación GPS activa (${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)})`
                      : gpsState === 'loading'
                      ? 'Obteniendo ubicación GPS del celular...'
                      : 'Ubicación del celular (Cusco · Centro por defecto)'}
                  </p>
                  <p className="text-[#516478] dark:text-slate-400">
                    Para ubicarte cuando solicites taxi, negocios o emergencias SOS.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={requestCellLocation}
                className="min-h-[34px] px-3 rounded-xl border border-[#1565F5]/30 bg-[#1565F5]/10 text-[#1565F5] dark:text-[#60A5FA] text-[11px] font-bold inline-flex items-center gap-1.5 shrink-0 hover:bg-[#1565F5]/15"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>{gpsState === 'live' ? 'Actualizar GPS' : 'Activar GPS'}</span>
              </button>
            </div>

            {error && (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-xs text-rose-700 dark:text-rose-300 font-medium">
                {error}
              </div>
            )}

            <div className="rounded-2xl border border-[#1565F5]/20 bg-[#EBF3FF] dark:bg-[#1565F5]/12 px-3.5 py-2.5 text-[11px] text-[#0B2538] dark:text-slate-200 flex items-start gap-2">
              <BadgeCheck className="w-4 h-4 text-[#1565F5] shrink-0 mt-0.5" />
              <span>
                Tu nombre, documento y WhatsApp quedarán fijados arriba para no volver a pedirlos en pedidos, taxis ni SOS.
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[50px] rounded-2xl bg-[#F5C400] hover:bg-[#E2B400] text-[#04334B] text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors shadow-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>
                {loading
                  ? 'Validando identidad...'
                  : tipo === 'EXTRANJERO'
                  ? 'Continuar al Sistema'
                  : 'Validar y Continuar'}
              </span>
            </button>
          </form>

          {onSwitchView && (
            <div className="pt-4 border-t border-[#D8E2EC] dark:border-white/10 space-y-2.5 text-xs">
              <span className="block text-[#516478] dark:text-slate-400">
                ¿Eres socio conductor, empresa o central de emergencias?
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSwitchView('NEGOCIO')}
                  className="min-h-[38px] px-3.5 rounded-xl border border-[#CBD5E1] dark:border-white/20 bg-white dark:bg-[#031622] text-[#0B2538] dark:text-white hover:border-[#1565F5] font-semibold inline-flex items-center gap-1.5"
                >
                  <Briefcase className="w-3.5 h-3.5 text-[#1565F5]" />
                  <span>Panel Negocio / Taxi</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchView('CENTRAL_SOS')}
                  className="min-h-[38px] px-3.5 rounded-xl border border-rose-500/35 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 font-semibold inline-flex items-center gap-1.5"
                >
                  <Siren className="w-3.5 h-3.5 text-rose-600" />
                  <span>Central Emergencias</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchView('ADMIN')}
                  className="min-h-[38px] px-3.5 rounded-xl border border-[#CBD5E1] dark:border-white/20 text-[#1565F5] dark:text-[#60A5FA] hover:border-[#1565F5] font-semibold inline-flex items-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Admin →</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
