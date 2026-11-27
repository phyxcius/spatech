import React, { useEffect, useState } from 'react';
import {
  Briefcase,
  Building2,
  Globe2,
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
        `Ingresa tu número de WhatsApp válido de ${selectedCountry.name} (${selectedCountry.dialCode}).`
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
      className="fixed inset-0 z-50 bg-[#031F2E]/82 backdrop-blur-md flex flex-col justify-between p-3 sm:p-6 overflow-y-auto"
    >
      <div className="my-auto mx-auto w-full max-w-lg rounded-3xl border border-[#F5C400]/35 dark:border-[#F5C400]/25 bg-white dark:bg-[#052030] text-[#0B2538] dark:text-[#F1F5F9] shadow-[0_28px_70px_-15px_rgba(3,31,46,0.65)] overflow-hidden">
        {/* Cabecera Imperial Cusco */}
        <div
          className="bg-[#04334B] text-white px-6 sm:px-8 pt-6 pb-5 relative overflow-hidden border-b border-[#F5C400]/35"
          style={{
            backgroundImage:
              'radial-gradient(circle at 90% 10%, rgba(245, 196, 0, 0.22), transparent 55%), linear-gradient(160deg, #04334B 0%, #064566 60%, #032638 100%)',
          }}
        >
          <div className="relative flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 32 32" className="w-6 h-6 shrink-0" aria-hidden="true">
                  <circle cx="16" cy="16" r="10" fill="none" stroke="#F5C400" strokeWidth="1.5" />
                  <circle cx="16" cy="16" r="5" fill="#F5C400" />
                  <path
                    d="M16 1v4M16 27v4M1 16h4M27 16h4M5.4 5.4l2.8 2.8M23.8 23.8l2.8 2.8M26.6 5.4l-2.8 2.8M8.2 23.8l-2.8 2.8"
                    stroke="#F5C400"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="font-display text-lg sm:text-xl font-bold tracking-wide text-[#F5C400]">
                  La Chuspa
                </span>
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold leading-tight text-white">
                Identifícate para ingresar
              </h2>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                Bienvenido a Cusco. Registra tu DNI, RUC o Pasaporte y tu WhatsApp para disfrutar taxis, comercios y asistencia inmediata.
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
                  ? 'Número de DNI peruano (8 dígitos)'
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
                WhatsApp con código de país
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

            {error && (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-xs text-rose-700 dark:text-rose-300 font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[50px] rounded-2xl bg-gradient-to-r from-[#F5C400] via-[#FFD83B] to-[#E5B200] hover:brightness-95 text-[#04334B] text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-60 transition-all shadow-md"
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
        </div>

        {/* Menú inferior centrado estilo barra principal para Negocio/Taxis, Emergencias y Admin */}
        {onSwitchView && (
          <nav
            aria-label="Accesos de operación"
            className="h-16 border-t border-[#D8E2EC] dark:border-[#064666] bg-[#F7FAFC]/95 dark:bg-[#031B29]/95 grid grid-cols-3 items-center px-2"
          >
            <button
              type="button"
              onClick={() => onSwitchView('NEGOCIO')}
              className="h-full flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-[#0B2538] dark:text-slate-200 hover:text-[#1565F5] dark:hover:text-[#F5C400] transition-colors"
            >
              <Briefcase className="w-5 h-5 text-[#1565F5] dark:text-[#60A5FA]" />
              <span className="truncate max-w-[110px]">Negocio / Taxis</span>
            </button>
            <button
              type="button"
              onClick={() => onSwitchView('CENTRAL_SOS')}
              className="h-full flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 transition-colors"
            >
              <Siren className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              <span className="truncate max-w-[110px]">Emergencias</span>
            </button>
            <button
              type="button"
              onClick={() => onSwitchView('ADMIN')}
              className="h-full flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-[#0B2538] dark:text-slate-200 hover:text-[#1565F5] dark:hover:text-[#F5C400] transition-colors"
            >
              <Shield className="w-5 h-5 text-[#04334B] dark:text-[#F5C400]" />
              <span className="truncate max-w-[110px]">Admin</span>
            </button>
          </nav>
        )}
      </div>
    </div>
  );
};
