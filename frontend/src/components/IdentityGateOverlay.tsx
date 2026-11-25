import React, { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Briefcase,
  Building2,
  Globe2,
  Shield,
  ShieldCheck,
  Siren,
  UserCheck,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && initialDoc?.verificado) {
      setTipo(initialDoc.tipo);
      setNumero(initialDoc.numero);
      if (initialDoc.tipo === 'EXTRANJERO') {
        setNombreExtranjero(initialDoc.nombre);
      }
      setError(null);
    }
  }, [isOpen, initialDoc?.verificado, initialDoc?.tipo, initialDoc?.numero, initialDoc?.nombre]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
      className="fixed inset-0 z-50 bg-[#07090E]/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="w-full max-w-lg rounded-3xl border border-[#D4AF37]/35 bg-white dark:bg-[#0D1117] text-[#14171F] dark:text-[#F4F1EA] shadow-2xl p-6 sm:p-8 space-y-6 my-auto">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] font-bold text-[#9A7B2C] dark:text-[#E5C158]">
              <ShieldCheck className="w-4 h-4" />
              <span>La Chuspa Cusco · Identidad Verificada</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold leading-tight">
              Identifícate para ingresar al sistema
            </h2>
            <p className="text-xs sm:text-sm text-[#6A717E] dark:text-[#98A0AD]">
              Valida tu DNI (RENIEC), RUC de empresa (SUNAT) o documento de extranjero para realizar pedidos a tu nombre y ver conductores en vivo.
            </p>
          </div>
          {canClose && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar identificación"
              className="min-h-[42px] min-w-[42px] rounded-xl border border-black/15 dark:border-white/15 flex items-center justify-center text-[#6A717E] hover:text-[#14171F] dark:hover:text-white shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Selector DNI / RUC / Extranjero */}
        <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-[#F8F7F4] dark:bg-[#121620] border border-black/10 dark:border-white/10">
          <button
            type="button"
            onClick={() => {
              setTipo('DNI');
              setNumero('');
              setError(null);
            }}
            className={`min-h-[42px] px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
              tipo === 'DNI'
                ? 'bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14]'
                : 'text-[#6A717E] dark:text-[#98A0AD]'
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
                ? 'bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14]'
                : 'text-[#6A717E] dark:text-[#98A0AD]'
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
                ? 'bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14]'
                : 'text-[#6A717E] dark:text-[#98A0AD]'
            }`}
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span>Extranjero</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[#555B66] dark:text-[#A3A9B5]">
              {tipo === 'DNI'
                ? 'Número de DNI peruano (8 dígitos · sincronizado RENIEC)'
                : tipo === 'RUC'
                ? 'Número de RUC (11 dígitos · Facturación Electrónica en comercios)'
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
              className="w-full min-h-[48px] px-4 rounded-2xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#121620] text-base font-mono-tabular tracking-wide focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
            />
          </div>

          {tipo === 'EXTRANJERO' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#555B66] dark:text-[#A3A9B5]">
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
                className="w-full min-h-[48px] px-4 rounded-2xl border border-black/15 dark:border-white/15 bg-[#F8F7F4] dark:bg-[#121620] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              />
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-[#C81E5B]/45 bg-[#C81E5B]/10 px-4 py-3 text-xs text-[#C81E5B]">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-3.5 py-2.5 text-[11px] text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
            <BadgeCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Tus datos aparecerán en la parte superior del sistema para todos tus pedidos. En minimarkets y comercios se emitirá Boleta o Factura; en taxis solo identifica al pasajero.
            </span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[50px] rounded-2xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-sm font-bold flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60 transition-opacity shadow-lg"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>
              {loading
                ? 'Validando identidad...'
                : tipo === 'EXTRANJERO'
                ? 'Validar Documento e Ingresar'
                : 'Validar RENIEC / SUNAT e Ingresar'}
            </span>
          </button>
        </form>

        {onSwitchView && (
          <div className="pt-4 border-t border-black/10 dark:border-white/10 space-y-2.5 text-xs">
            <span className="block text-[#6A717E] dark:text-[#98A0AD]">
              ¿Eres socio conductor, empresa o central de emergencias?
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onSwitchView('NEGOCIO')}
                className="min-h-[38px] px-3 rounded-xl border border-black/15 dark:border-white/15 hover:border-[#D4AF37] font-semibold inline-flex items-center gap-1.5"
              >
                <Briefcase className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Panel Negocio / Taxi</span>
              </button>
              <button
                type="button"
                onClick={() => onSwitchView('CENTRAL_SOS')}
                className="min-h-[38px] px-3 rounded-xl border border-rose-500/45 bg-rose-500/10 text-rose-600 dark:text-rose-300 hover:bg-rose-500/20 font-semibold inline-flex items-center gap-1.5"
              >
                <Siren className="w-3.5 h-3.5 text-rose-500" />
                <span>Central Emergencias (PNP / Bomberos / SAMU / Serenazgo)</span>
              </button>
              <button
                type="button"
                onClick={() => onSwitchView('ADMIN')}
                className="min-h-[38px] px-3 rounded-xl border border-black/15 dark:border-white/15 hover:border-[#D4AF37] font-semibold inline-flex items-center gap-1.5"
              >
                <Shield className="w-3.5 h-3.5 text-[#9A7B2C] dark:text-[#E5C158]" />
                <span>Admin</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
