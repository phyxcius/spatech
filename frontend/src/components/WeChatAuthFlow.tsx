import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  Building2,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Globe2,
  Info,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Siren,
  UserCheck,
  X,
} from 'lucide-react';
import welcomeEarthImg from '../assets/images/chuspa_earth_welcome.jpg';
import { apiFetch, ApiError } from '../lib/api.ts';
import { formatWhatsAppNumber, WHATSAPP_COUNTRIES } from '../lib/countries.ts';
import {
  formatPeruLookupError,
  isValidForeignDoc,
  isValidPeruvianDni,
  isValidPeruvianRuc,
  type PeruDocumentLookupResult,
} from '../lib/peruDocs.ts';
import type { UserAccount } from '../types.ts';

interface WeChatAuthFlowProps {
  initialLanguage?: string;
  onLanguageChange?: (lang: string) => void;
  onAuthenticated: (payload: { token: string; usuario: UserAccount }) => void;
  onSwitchOperationalView: (view: 'NEGOCIO' | 'CENTRAL_SOS' | 'ADMIN') => void;
}

type AuthScreen = 'WELCOME' | 'REGISTER' | 'VERIFY_WHATSAPP' | 'LOGIN';
type NationalityMode = 'PERUANO' | 'EXTRANJERO';

const LANGUAGES = [
  'Automático',
  'Español',
  'English',
  'Português',
  'Français',
  'Italiano',
  'Deutsch',
  '简体中文',
  '繁體中文（台灣）',
  '繁體中文（香港）',
  '한국어',
  '日本語',
  'Русский',
  'Bahasa Indonesia',
];

export const WeChatAuthFlow: React.FC<WeChatAuthFlowProps> = ({
  initialLanguage = 'Español',
  onLanguageChange,
  onAuthenticated,
  onSwitchOperationalView,
}) => {
  const [screen, setScreen] = useState<AuthScreen>('WELCOME');
  const [language, setLanguage] = useState(initialLanguage);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState(initialLanguage);

  // Registro (Caso 1)
  const [regNationality, setRegNationality] = useState<NationalityMode>('PERUANO');
  const [regDocNumero, setRegDocNumero] = useState('');
  const [regReniecInfo, setRegReniecInfo] = useState<PeruDocumentLookupResult | null>(null);
  const [regDocLoading, setRegDocLoading] = useState(false);
  const [regDocError, setRegDocError] = useState<string | null>(null);
  const [regForeignName, setRegForeignName] = useState('');
  const [regPaisCodigo, setRegPaisCodigo] = useState('+51');
  const [regWhatsappLocal, setRegWhatsappLocal] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regShowPassword, setRegShowPassword] = useState(false);
  const [regTermsAccepted, setRegTermsAccepted] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Selector de país modal
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  // Términos y privacidad modal
  const [legalModal, setLegalModal] = useState<'TERMS' | 'PRIVACY' | null>(null);

  // Verificación de seguridad (Info -> Puzle deslizante)
  const [securityModalStep, setSecurityModalStep] = useState<'NONE' | 'INFO' | 'PUZZLE'>('NONE');
  const [puzzleSlider, setPuzzleSlider] = useState(12);
  const [puzzleTarget] = useState(72);
  const [puzzleError, setPuzzleError] = useState<string | null>(null);

  // Paso de validación WhatsApp OTP
  const [otpDocTipo, setOtpDocTipo] = useState<'DNI' | 'RUC' | 'EXTRANJERO'>('DNI');
  const [otpDocNumero, setOtpDocNumero] = useState('');
  const [otpWhatsappDisplay, setOtpWhatsappDisplay] = useState('');
  const [otpCodeInput, setOtpCodeInput] = useState('');
  const [otpPreviewCode, setOtpPreviewCode] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpCooldown, setOtpCooldown] = useState(0);

  // Login (Caso 2)
  const [loginNationality, setLoginNationality] = useState<NationalityMode>('PERUANO');
  const [loginDocNumero, setLoginDocNumero] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginShowPassword, setLoginShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBanner, setLoginBanner] = useState<string | null>(null);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = window.setInterval(() => {
      setOtpCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [otpCooldown]);

  const selectedCountry = useMemo(
    () => WHATSAPP_COUNTRIES.find((c) => c.dialCode === regPaisCodigo) || WHATSAPP_COUNTRIES[0],
    [regPaisCodigo]
  );

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return WHATSAPP_COUNTRIES;
    return WHATSAPP_COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.toLowerCase().includes(q) ||
        c.iso.toLowerCase().includes(q)
    );
  }, [countrySearch]);

  const detectedPeruDocType: 'DNI' | 'RUC' = useMemo(() => {
    const digits = regDocNumero.replace(/\D/g, '');
    return digits.length > 8 ? 'RUC' : 'DNI';
  }, [regDocNumero]);

  async function syncReniecSunat(rawNumber?: string) {
    const digits = (rawNumber ?? regDocNumero).replace(/\D/g, '');
    const tipo: 'DNI' | 'RUC' = digits.length === 11 ? 'RUC' : 'DNI';
    const localErr = formatPeruLookupError(tipo, digits);
    if (localErr) {
      setRegDocError(localErr);
      setRegReniecInfo(null);
      return null;
    }
    setRegDocLoading(true);
    setRegDocError(null);
    try {
      const res = await apiFetch<PeruDocumentLookupResult>(
        `/api/public/consulta-documento?tipo=${tipo}&numero=${encodeURIComponent(digits)}`
      );
      setRegReniecInfo(res);
      return res;
    } catch (err) {
      setRegReniecInfo(null);
      setRegDocError(formatPeruLookupError(err));
      return null;
    } finally {
      setRegDocLoading(false);
    }
  }

  // Sincronización automática con RENIEC/SUNAT al completar 8 (DNI) u 11 (RUC) dígitos
  useEffect(() => {
    if (screen !== 'REGISTER' || regNationality !== 'PERUANO') return;
    const digits = regDocNumero.replace(/\D/g, '');
    if (digits.length === 8 && isValidPeruvianDni(digits)) {
      if (regReniecInfo?.numero !== digits) {
        void syncReniecSunat(digits);
      }
    } else if (digits.length === 11 && isValidPeruvianRuc(digits)) {
      if (regReniecInfo?.numero !== digits) {
        void syncReniecSunat(digits);
      }
    } else if (regReniecInfo) {
      setRegReniecInfo(null);
    }
  }, [regDocNumero, regNationality, screen]);

  function validateRegisterBeforeSecurity(): boolean {
    setRegError(null);
    if (regNationality === 'PERUANO') {
      const digits = regDocNumero.replace(/\D/g, '');
      if (digits.length !== 8 && digits.length !== 11) {
        setRegError('Ingresa tu DNI (8 dígitos) o RUC (11 dígitos) para sincronizar con RENIEC / SUNAT.');
        return false;
      }
      const tipo: 'DNI' | 'RUC' = digits.length === 11 ? 'RUC' : 'DNI';
      const err = formatPeruLookupError(tipo, digits);
      if (err) {
        setRegError(err);
        return false;
      }
    } else {
      const cleanDoc = regDocNumero.trim().toUpperCase();
      if (!isValidForeignDoc(cleanDoc)) {
        setRegError('Ingresa un Pasaporte o Carné de Extranjería válido (6 a 20 caracteres).');
        return false;
      }
      if (regForeignName.trim().length < 3) {
        setRegError('Ingresa tu nombre completo tal como figura en tu Pasaporte o ID.');
        return false;
      }
    }

    const waDigits = regWhatsappLocal.replace(/\D/g, '');
    if (waDigits.length < 6) {
      setRegError(`Ingresa un número de WhatsApp válido de ${selectedCountry.name}.`);
      return false;
    }
    if (regPassword.length < 6) {
      setRegError('Crea una contraseña de al menos 6 caracteres.');
      return false;
    }
    if (!regTermsAccepted) {
      setRegError('Debes aceptar los Términos de servicio y Política de Privacidad para continuar.');
      return false;
    }
    return true;
  }

  function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateRegisterBeforeSecurity()) return;
    setPuzzleSlider(12);
    setPuzzleError(null);
    setSecurityModalStep('INFO');
  }

  async function executeCompleteRegistration() {
    setRegLoading(true);
    setRegError(null);
    try {
      const tipo: 'DNI' | 'RUC' | 'EXTRANJERO' =
        regNationality === 'EXTRANJERO' ? 'EXTRANJERO' : detectedPeruDocType;
      const numero =
        tipo === 'EXTRANJERO'
          ? regDocNumero.trim().toUpperCase()
          : regDocNumero.replace(/\D/g, '');
      const whatsapp = formatWhatsAppNumber(regPaisCodigo, regWhatsappLocal);

      const res = await apiFetch<{
        ok: boolean;
        requires_whatsapp_verification: boolean;
        preview_otp_code?: string;
        usuario: UserAccount;
      }>('/api/public/usuarios/registro', {
        method: 'POST',
        body: {
          documento_tipo: tipo,
          documento_numero: numero,
          nombre:
            tipo === 'EXTRANJERO'
              ? regForeignName.trim()
              : regReniecInfo?.nombre_completo || undefined,
          pais_codigo: regPaisCodigo,
          pais_nombre: selectedCountry.name,
          whatsapp,
          password: regPassword,
          acepto_terminos: true,
          idioma: language === 'Automático' ? 'Español' : language,
        },
      });

      setSecurityModalStep('NONE');
      setOtpDocTipo(tipo);
      setOtpDocNumero(numero);
      setOtpWhatsappDisplay(whatsapp);
      setOtpCodeInput('');
      setOtpPreviewCode(res.preview_otp_code || null);
      setOtpError(null);
      setOtpCooldown(60);
      setScreen('VERIFY_WHATSAPP');
    } catch (err) {
      setSecurityModalStep('NONE');
      setRegError(err instanceof Error ? err.message : 'No se pudo completar el registro.');
    } finally {
      setRegLoading(false);
    }
  }

  function handlePuzzleRelease(value: number) {
    if (Math.abs(value - puzzleTarget) <= 7) {
      setPuzzleError(null);
      void executeCompleteRegistration();
    } else {
      setPuzzleError('Alinea la pieza del puzle sobre el recuadro punteado para verificar.');
    }
  }

  async function handleResendOtp() {
    if (otpCooldown > 0 || otpLoading) return;
    setOtpLoading(true);
    setOtpError(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        whatsapp_masked?: string;
        preview_otp_code?: string;
      }>('/api/public/usuarios/reenviar-codigo', {
        method: 'POST',
        body: {
          documento_tipo: otpDocTipo,
          documento_numero: otpDocNumero,
        },
      });
      if (res.preview_otp_code) {
        setOtpPreviewCode(res.preview_otp_code);
      }
      setOtpCooldown(60);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'No se pudo reenviar el código.');
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleVerifyOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOtpError(null);
    const cleanCode = otpCodeInput.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setOtpError('Ingresa el código de 6 dígitos enviado a tu WhatsApp.');
      return;
    }
    setOtpLoading(true);
    try {
      await apiFetch<{ ok: boolean; verified: boolean; message?: string }>(
        '/api/public/usuarios/verificar-whatsapp',
        {
          method: 'POST',
          body: {
            documento_tipo: otpDocTipo,
            documento_numero: otpDocNumero,
            codigo: cleanCode,
          },
        }
      );

      setLoginNationality(otpDocTipo === 'EXTRANJERO' ? 'EXTRANJERO' : 'PERUANO');
      setLoginDocNumero(otpDocNumero);
      setLoginPassword('');
      setLoginError(null);
      setLoginBanner(
        'WhatsApp validado correctamente. Ahora inicia sesión con tu documento y contraseña.'
      );
      setScreen('LOGIN');
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Código de validación incorrecto.');
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoginBanner(null);

    const rawNum = loginDocNumero.trim();
    const tipo: 'DNI' | 'RUC' | 'EXTRANJERO' =
      loginNationality === 'EXTRANJERO'
        ? 'EXTRANJERO'
        : rawNum.replace(/\D/g, '').length === 11
        ? 'RUC'
        : 'DNI';
    const numero = tipo === 'EXTRANJERO' ? rawNum.toUpperCase() : rawNum.replace(/\D/g, '');

    if (tipo === 'DNI' && !isValidPeruvianDni(numero)) {
      setLoginError('Ingresa un DNI válido de 8 dígitos.');
      return;
    }
    if (tipo === 'RUC' && !isValidPeruvianRuc(numero)) {
      setLoginError('Ingresa un RUC válido de 11 dígitos.');
      return;
    }
    if (tipo === 'EXTRANJERO' && !isValidForeignDoc(numero)) {
      setLoginError('Ingresa tu Pasaporte o ID de Extranjero (6 a 20 caracteres).');
      return;
    }
    if (!loginPassword) {
      setLoginError('Ingresa tu contraseña.');
      return;
    }

    setLoginLoading(true);
    try {
      const res = await apiFetch<{ token: string; usuario: UserAccount }>(
        '/api/public/usuarios/login',
        {
          method: 'POST',
          body: {
            documento_tipo: tipo,
            documento_numero: numero,
            password: loginPassword,
          },
        }
      );
      onAuthenticated(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar sesión.';
      if ((err instanceof ApiError && err.status === 403) || /no ha validado el c[óo]digo/i.test(msg)) {
        setOtpDocTipo(tipo);
        setOtpDocNumero(numero);
        setOtpWhatsappDisplay('WhatsApp registrado');
        setOtpError('Tu cuenta aún requiere validar el código de WhatsApp. Solicita un reenvío si no lo tienes.');
        setScreen('VERIFY_WHATSAPP');
        return;
      }
      setLoginError(msg);
    } finally {
      setLoginLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#04141E] text-white relative overflow-x-hidden">
      {/* Fondo Cósmico estilo WeChat + Tierra / Cordillera Andina */}
      {screen === 'WELCOME' ? (
        <div className="relative flex-1 flex flex-col justify-between min-h-screen">
          <div className="absolute inset-0">
            <img
              src={welcomeEarthImg}
              alt="La Chuspa Cusco - Conexión global"
              className="w-full h-full object-cover object-center"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(4,20,30,0.45) 0%, rgba(4,20,30,0.22) 45%, rgba(4,20,30,0.88) 82%, rgba(4,20,30,0.98) 100%)',
              }}
            />
          </div>

          {/* Top Bar: Marca + Selector de Idioma */}
          <header className="relative z-10 max-w-6xl w-full mx-auto px-5 pt-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-full bg-[#04334B]/90 border border-[#F5C400]/60 flex items-center justify-center shadow-lg">
                <svg viewBox="0 0 32 32" className="w-5 h-5" aria-hidden="true">
                  <circle cx="16" cy="16" r="8" fill="none" stroke="#F5C400" strokeWidth="1.8" />
                  <circle cx="16" cy="16" r="4" fill="#F5C400" />
                  <path
                    d="M16 2v4M16 26v4M2 16h4M26 16h4"
                    stroke="#F5C400"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="font-display text-2xl font-bold tracking-tight">
                <span className="text-[#F5C400]">La</span> <span className="text-white">Chuspa</span>
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setPendingLanguage(language);
                setLanguageModalOpen(true);
              }}
              className="min-h-[40px] px-3.5 rounded-xl bg-black/35 hover:bg-black/55 backdrop-blur-md border border-white/15 text-xs font-medium text-white flex items-center gap-1.5 transition-colors"
            >
              <Globe2 className="w-3.5 h-3.5 text-[#F5C400]" />
              <span>{language === 'Automático' ? 'Idioma' : language}</span>
            </button>
          </header>

          {/* Centro / Pie Hero adaptable a Desktop 1440px y Móvil */}
          <main className="relative z-10 max-w-6xl w-full mx-auto px-5 pb-8 pt-10 lg:pb-14 flex flex-col lg:flex-row lg:items-end justify-between gap-10">
            <div className="max-w-xl space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[#F5C400] font-semibold">
                Cusco · Súper App Multinegocio &amp; Concierge
              </p>
              <h1 className="font-display text-3xl sm:text-5xl font-bold leading-[1.08] text-white">
                Conecta con Cusco en un toque.
              </h1>
              <p className="text-sm sm:text-base text-slate-200 leading-relaxed max-w-lg">
                Chats en vivo con el Agente Solar Inca, taxis verificados, boticas, gastronomía, oficios y emergencias SOS con respaldo de identidad RENIEC, SUNAT y Pasaporte.
              </p>
            </div>

            {/* Tarjeta de botones Iniciar / Registrarse */}
            <div className="w-full max-w-md space-y-4">
              <div className="grid grid-cols-2 gap-3.5">
                <button
                  type="button"
                  onClick={() => {
                    setLoginError(null);
                    setLoginBanner(null);
                    setScreen('LOGIN');
                  }}
                  className="min-h-[52px] rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white text-base font-bold shadow-lg transition-colors"
                >
                  Iniciar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRegError(null);
                    setScreen('REGISTER');
                  }}
                  className="min-h-[52px] rounded-xl bg-white hover:bg-slate-100 text-[#111827] text-base font-bold shadow-lg transition-colors"
                >
                  Registrarse
                </button>
              </div>

              {/* Accesos operativos directos (Negocios / Taxis, Emergencias, Admin) */}
              <div className="rounded-2xl bg-[#041D2C]/85 backdrop-blur-md border border-white/15 grid grid-cols-3 divide-x divide-white/10">
                <button
                  type="button"
                  onClick={() => onSwitchOperationalView('NEGOCIO')}
                  className="min-h-[52px] px-2 py-2 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-200 hover:text-[#F5C400] transition-colors"
                >
                  <Briefcase className="w-4 h-4 text-[#60A5FA]" />
                  <span>Negocio / Taxis</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchOperationalView('CENTRAL_SOS')}
                  className="min-h-[52px] px-2 py-2 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-rose-300 hover:text-rose-200 transition-colors"
                >
                  <Siren className="w-4 h-4 text-rose-400" />
                  <span>Emergencias SOS</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchOperationalView('ADMIN')}
                  className="min-h-[52px] px-2 py-2 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-200 hover:text-[#F5C400] transition-colors"
                >
                  <Shield className="w-4 h-4 text-[#F5C400]" />
                  <span>Admin</span>
                </button>
              </div>
            </div>
          </main>
        </div>
      ) : (
        /* Pantallas limpias estilo WeChat (Registro, Verificar WhatsApp, Iniciar sesión) */
        <div className="min-h-screen bg-[#EDEDED] dark:bg-[#041824] text-[#111827] dark:text-[#F1F5F9] flex flex-col">
          {/* Header minimalista estilo WeChat */}
          <header className="h-14 bg-[#EDEDED] dark:bg-[#04334B] border-b border-black/5 dark:border-white/10 px-4 flex items-center justify-between sticky top-0 z-20">
            <button
              type="button"
              onClick={() => {
                if (screen === 'VERIFY_WHATSAPP') {
                  setScreen('REGISTER');
                } else {
                  setScreen('WELCOME');
                }
              }}
              aria-label="Volver"
              className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-[#111827] dark:text-white rounded-xl hover:bg-black/5"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-bold text-[#04334B] dark:text-[#F5C400]">
              {screen === 'REGISTER'
                ? 'Registro La Chuspa'
                : screen === 'VERIFY_WHATSAPP'
                ? 'Validar WhatsApp'
                : 'Iniciar sesión'}
            </span>
            <button
              type="button"
              onClick={() => {
                setPendingLanguage(language);
                setLanguageModalOpen(true);
              }}
              className="min-h-[40px] px-2.5 text-xs font-semibold text-[#576B95] dark:text-[#93C5FD] flex items-center gap-1"
            >
              <Globe2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{language}</span>
            </button>
          </header>

          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Panel informativo lateral en Desktop 1440px */}
              <aside className="hidden lg:flex lg:col-span-5 rounded-3xl overflow-hidden relative bg-[#04334B] text-white p-7 flex-col justify-between shadow-xl border border-[#F5C400]/25">
                <img
                  src={welcomeEarthImg}
                  alt="Cusco La Chuspa"
                  className="absolute inset-0 w-full h-full object-cover opacity-35"
                />
                <div className="relative z-10 space-y-3">
                  <span className="font-display text-2xl font-bold text-[#F5C400]">La Chuspa</span>
                  <h2 className="font-display text-2xl font-bold leading-snug text-white">
                    {screen === 'REGISTER'
                      ? 'Identidad verificada con RENIEC, SUNAT y WhatsApp.'
                      : screen === 'VERIFY_WHATSAPP'
                      ? 'Validación de código de seguridad en WhatsApp.'
                      : 'Ingresa con tu documento y contraseña.'}
                  </h2>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    Tu cuenta única sincroniza automáticamente tus comprobantes electrónicos, pedidos de taxis InDrive, compras en mercados y emergencias SOS.
                  </p>
                </div>

                <div className="relative z-10 space-y-2.5 text-xs text-slate-200 border-t border-white/15 pt-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#07C160] shrink-0" />
                    <span>Peruanos: DNI o RUC sincronizado + WhatsApp + contraseña</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe2 className="w-4 h-4 text-[#F5C400] shrink-0" />
                    <span>Extranjeros: Pasaporte / ID + WhatsApp + contraseña</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#60A5FA] shrink-0" />
                    <span>Código de validación de 6 dígitos al WhatsApp antes de navegar</span>
                  </div>
                </div>
              </aside>

              {/* Tarjeta principal del formulario */}
              <section className="lg:col-span-7 bg-white dark:bg-[#052030] rounded-3xl border border-black/8 dark:border-white/10 p-6 sm:p-8 shadow-sm">
                {/* ==================== CASO 1: REGISTRARSE ==================== */}
                {screen === 'REGISTER' && (
                  <form onSubmit={handleRegisterSubmit} className="space-y-5">
                    <div className="text-center space-y-1">
                      <h1 className="text-xl sm:text-2xl font-bold text-[#111827] dark:text-white">
                        Registrarse con documento y WhatsApp
                      </h1>
                      <p className="text-xs text-[#6B7280] dark:text-slate-300">
                        Paso 1: Crea tu cuenta. Te enviaremos un código de confirmación a tu WhatsApp.
                      </p>
                    </div>

                    {/* Selector Peruano vs Extranjero */}
                    <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#F3F4F6] dark:bg-[#031622]">
                      <button
                        type="button"
                        onClick={() => {
                          setRegNationality('PERUANO');
                          setRegDocNumero('');
                          setRegReniecInfo(null);
                          setRegDocError(null);
                          setRegError(null);
                        }}
                        className={`min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                          regNationality === 'PERUANO'
                            ? 'bg-white dark:bg-[#04334B] text-[#04334B] dark:text-[#F5C400] shadow-xs'
                            : 'text-[#6B7280] dark:text-slate-300'
                        }`}
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>Peruano (DNI / RUC)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRegNationality('EXTRANJERO');
                          setRegDocNumero('');
                          setRegReniecInfo(null);
                          setRegDocError(null);
                          setRegError(null);
                        }}
                        className={`min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                          regNationality === 'EXTRANJERO'
                            ? 'bg-white dark:bg-[#04334B] text-[#04334B] dark:text-[#F5C400] shadow-xs'
                            : 'text-[#6B7280] dark:text-slate-300'
                        }`}
                      >
                        <Globe2 className="w-4 h-4" />
                        <span>Extranjero (Pasaporte)</span>
                      </button>
                    </div>

                    {/* Campos estilo filas limpias WeChat */}
                    <div className="divide-y divide-[#E5E7EB] dark:divide-white/10 border-y border-[#E5E7EB] dark:border-white/10">
                      {regNationality === 'PERUANO' ? (
                        <div className="py-3 space-y-2">
                          <div className="flex items-center gap-3">
                            <label className="w-28 sm:w-32 text-xs sm:text-sm font-semibold text-[#111827] dark:text-slate-200 shrink-0">
                              DNI / RUC
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={11}
                              required
                              value={regDocNumero}
                              onChange={(e) => {
                                setRegDocNumero(e.target.value.replace(/\D/g, ''));
                                setRegError(null);
                                setRegDocError(null);
                              }}
                              placeholder="8 dígitos DNI o 11 RUC"
                              className="flex-1 min-h-[44px] bg-transparent text-sm font-mono-tabular font-semibold text-[#111827] dark:text-white focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => void syncReniecSunat()}
                              disabled={regDocLoading}
                              className="min-h-[38px] px-3 rounded-lg bg-[#04334B] text-[#F5C400] text-xs font-bold flex items-center gap-1 shrink-0 disabled:opacity-60"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${regDocLoading ? 'animate-spin' : ''}`} />
                              <span>{detectedPeruDocType === 'RUC' ? 'SUNAT' : 'RENIEC'}</span>
                            </button>
                          </div>
                          {regReniecInfo && (
                            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-700/40 px-3 py-2 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-200">
                              <BadgeCheck className="w-4 h-4 text-[#07C160] shrink-0" />
                              <div className="min-w-0">
                                <p className="font-bold truncate">{regReniecInfo.nombre_completo}</p>
                                <p className="text-[11px] opacity-85 truncate">
                                  Sincronizado con {regReniecInfo.fuente || regReniecInfo.source}
                                  {regReniecInfo.direccion ? ` · ${regReniecInfo.direccion}` : ''}
                                </p>
                              </div>
                            </div>
                          )}
                          {regDocError && (
                            <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{regDocError}</p>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="py-3 flex items-center gap-3">
                            <label className="w-28 sm:w-32 text-xs sm:text-sm font-semibold text-[#111827] dark:text-slate-200 shrink-0">
                              Pasaporte / ID
                            </label>
                            <input
                              type="text"
                              maxLength={20}
                              required
                              value={regDocNumero}
                              onChange={(e) => {
                                setRegDocNumero(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''));
                                setRegError(null);
                              }}
                              placeholder="Ej: PA998877 o CE-123456"
                              className="flex-1 min-h-[44px] bg-transparent text-sm font-mono-tabular font-semibold text-[#111827] dark:text-white focus:outline-none"
                            />
                          </div>
                          <div className="py-3 flex items-center gap-3">
                            <label className="w-28 sm:w-32 text-xs sm:text-sm font-semibold text-[#111827] dark:text-slate-200 shrink-0">
                              Nombre completo
                            </label>
                            <input
                              type="text"
                              required
                              value={regForeignName}
                              onChange={(e) => {
                                setRegForeignName(e.target.value);
                                setRegError(null);
                              }}
                              placeholder="Ej: Johnathan Miller"
                              className="flex-1 min-h-[44px] bg-transparent text-sm text-[#111827] dark:text-white focus:outline-none"
                            />
                          </div>
                        </>
                      )}

                      {/* País / Región */}
                      <div className="py-3 flex items-center gap-3">
                        <label className="w-28 sm:w-32 text-xs sm:text-sm font-semibold text-[#111827] dark:text-slate-200 shrink-0">
                          País / Región
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setCountrySearch('');
                            setCountryModalOpen(true);
                          }}
                          className="flex-1 min-h-[44px] flex items-center justify-between text-left text-sm font-medium text-[#111827] dark:text-white"
                        >
                          <span>
                            {selectedCountry.flag} {selectedCountry.name} ({selectedCountry.dialCode})
                          </span>
                          <ChevronRight className="w-4 h-4 text-[#9CA3AF]" />
                        </button>
                      </div>

                      {/* WhatsApp */}
                      <div className="py-3 flex items-center gap-3">
                        <label className="w-28 sm:w-32 text-xs sm:text-sm font-semibold text-[#111827] dark:text-slate-200 shrink-0">
                          WhatsApp
                        </label>
                        <span className="text-sm font-mono-tabular font-semibold text-[#6B7280] dark:text-slate-300 shrink-0">
                          {selectedCountry.dialCode}
                        </span>
                        <input
                          type="tel"
                          inputMode="tel"
                          required
                          value={regWhatsappLocal}
                          onChange={(e) => {
                            setRegWhatsappLocal(e.target.value.replace(/[^0-9\s-]/g, ''));
                            setRegError(null);
                          }}
                          placeholder={`Ej: ${selectedCountry.sample}`}
                          className="flex-1 min-h-[44px] bg-transparent text-sm font-mono-tabular font-semibold text-[#111827] dark:text-white focus:outline-none"
                        />
                      </div>

                      {/* Contraseña */}
                      <div className="py-3 flex items-center gap-3">
                        <label className="w-28 sm:w-32 text-xs sm:text-sm font-semibold text-[#111827] dark:text-slate-200 shrink-0">
                          Contraseña
                        </label>
                        <input
                          type={regShowPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={regPassword}
                          onChange={(e) => {
                            setRegPassword(e.target.value);
                            setRegError(null);
                          }}
                          placeholder="Mínimo 6 caracteres"
                          className="flex-1 min-h-[44px] bg-transparent text-sm text-[#111827] dark:text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setRegShowPassword((v) => !v)}
                          aria-label={regShowPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#6B7280]"
                        >
                          {regShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Aceptación de Términos estilo WeChat */}
                    <label className="flex items-start gap-2.5 text-xs text-[#6B7280] dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={regTermsAccepted}
                        onChange={(e) => {
                          setRegTermsAccepted(e.target.checked);
                          setRegError(null);
                        }}
                        className="mt-0.5 w-4 h-4 rounded accent-[#07C160]"
                      />
                      <span>
                        He leído y acepto los{' '}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setLegalModal('TERMS');
                          }}
                          className="text-[#576B95] dark:text-[#93C5FD] font-semibold underline"
                        >
                          Términos de servicio
                        </button>{' '}
                        y la{' '}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setLegalModal('PRIVACY');
                          }}
                          className="text-[#576B95] dark:text-[#93C5FD] font-semibold underline"
                        >
                          Política de Privacidad
                        </button>{' '}
                        de La Chuspa.
                      </span>
                    </label>

                    {regError && (
                      <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/35 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300 font-medium">
                        {regError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={regLoading}
                      className="w-full min-h-[50px] rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white text-sm font-bold shadow-sm transition-colors disabled:opacity-60"
                    >
                      {regLoading ? 'Enviando código a WhatsApp...' : 'Aceptar y continuar'}
                    </button>

                    <div className="text-center text-xs text-[#6B7280] dark:text-slate-300">
                      ¿Ya tienes una cuenta verificada?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setLoginError(null);
                          setScreen('LOGIN');
                        }}
                        className="text-[#576B95] dark:text-[#93C5FD] font-bold"
                      >
                        Iniciar sesión
                      </button>
                    </div>
                  </form>
                )}

                {/* ==================== VALIDAR CÓDIGO WHATSAPP ==================== */}
                {screen === 'VERIFY_WHATSAPP' && (
                  <form onSubmit={handleVerifyOtpSubmit} className="space-y-5">
                    <div className="text-center space-y-1.5">
                      <div className="w-12 h-12 rounded-2xl bg-[#07C160]/12 text-[#07C160] mx-auto flex items-center justify-center">
                        <MessageSquare className="w-6 h-6" />
                      </div>
                      <h1 className="text-xl sm:text-2xl font-bold text-[#111827] dark:text-white">
                        Verificar con WhatsApp
                      </h1>
                      <p className="text-xs text-[#6B7280] dark:text-slate-300">
                        Ingresa el código de confirmación de 6 dígitos enviado a tu WhatsApp para habilitar tu cuenta en La Chuspa.
                      </p>
                    </div>

                    <div className="divide-y divide-[#E5E7EB] dark:divide-white/10 border-y border-[#E5E7EB] dark:border-white/10">
                      <div className="py-3 flex items-center gap-3">
                        <span className="w-28 text-xs sm:text-sm font-semibold text-[#111827] dark:text-slate-200">
                          Documento
                        </span>
                        <span className="text-sm font-mono-tabular text-[#6B7280] dark:text-slate-300">
                          {otpDocTipo} · {otpDocNumero}
                        </span>
                      </div>
                      <div className="py-3 flex items-center gap-3">
                        <span className="w-28 text-xs sm:text-sm font-semibold text-[#111827] dark:text-slate-200">
                          WhatsApp
                        </span>
                        <span className="text-sm font-mono-tabular text-[#6B7280] dark:text-slate-300">
                          {otpWhatsappDisplay}
                        </span>
                      </div>
                      <div className="py-3 flex items-center gap-3">
                        <label className="w-28 text-xs sm:text-sm font-semibold text-[#111827] dark:text-slate-200 shrink-0">
                          Código
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          required
                          autoFocus
                          value={otpCodeInput}
                          onChange={(e) => {
                            setOtpCodeInput(e.target.value.replace(/\D/g, ''));
                            setOtpError(null);
                          }}
                          placeholder="6 dígitos"
                          className="flex-1 min-h-[44px] bg-transparent text-base font-mono-tabular font-bold tracking-[0.2em] text-[#111827] dark:text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleResendOtp}
                          disabled={otpCooldown > 0 || otpLoading}
                          className="min-h-[38px] px-3 rounded-lg bg-[#F3F4F6] dark:bg-white/10 text-xs font-semibold text-[#111827] dark:text-white shrink-0 disabled:opacity-50"
                        >
                          {otpCooldown > 0 ? `Reenviar (${otpCooldown}s)` : 'Recibir código'}
                        </button>
                      </div>
                    </div>

                    {otpPreviewCode && (
                      <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/35 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
                        <span>
                          Código enviado al buzón WhatsApp de prueba:{' '}
                          <strong className="font-mono-tabular text-sm">{otpPreviewCode}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setOtpCodeInput(otpPreviewCode)}
                          className="px-2.5 py-1 rounded-lg bg-amber-200/70 dark:bg-amber-800 font-bold text-[11px]"
                        >
                          Autocompletar
                        </button>
                      </div>
                    )}

                    {otpError && (
                      <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/35 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300 font-medium">
                        {otpError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={otpLoading}
                      className="w-full min-h-[50px] rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white text-sm font-bold shadow-sm transition-colors disabled:opacity-60"
                    >
                      {otpLoading ? 'Validando código...' : 'Enviar y activar cuenta'}
                    </button>
                  </form>
                )}

                {/* ==================== CASO 2: INICIAR SESIÓN ==================== */}
                {screen === 'LOGIN' && (
                  <form onSubmit={handleLoginSubmit} className="space-y-5">
                    <div className="text-center space-y-1">
                      <h1 className="text-xl sm:text-2xl font-bold text-[#111827] dark:text-white">
                        Iniciar sesión en La Chuspa
                      </h1>
                      <p className="text-xs text-[#6B7280] dark:text-slate-300">
                        Ingresa con tu DNI o RUC (peruano) o Pasaporte (extranjero) y tu contraseña.
                      </p>
                    </div>

                    {loginBanner && (
                      <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/35 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-200 font-semibold flex items-center gap-2">
                        <BadgeCheck className="w-4 h-4 text-[#07C160] shrink-0" />
                        <span>{loginBanner}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#F3F4F6] dark:bg-[#031622]">
                      <button
                        type="button"
                        onClick={() => {
                          setLoginNationality('PERUANO');
                          setLoginDocNumero('');
                          setLoginError(null);
                        }}
                        className={`min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                          loginNationality === 'PERUANO'
                            ? 'bg-white dark:bg-[#04334B] text-[#04334B] dark:text-[#F5C400] shadow-xs'
                            : 'text-[#6B7280] dark:text-slate-300'
                        }`}
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>Peruano (DNI / RUC)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLoginNationality('EXTRANJERO');
                          setLoginDocNumero('');
                          setLoginError(null);
                        }}
                        className={`min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                          loginNationality === 'EXTRANJERO'
                            ? 'bg-white dark:bg-[#04334B] text-[#04334B] dark:text-[#F5C400] shadow-xs'
                            : 'text-[#6B7280] dark:text-slate-300'
                        }`}
                      >
                        <Globe2 className="w-4 h-4" />
                        <span>Extranjero (Pasaporte)</span>
                      </button>
                    </div>

                    <div className="divide-y divide-[#E5E7EB] dark:divide-white/10 border-y border-[#E5E7EB] dark:border-white/10">
                      <div className="py-3 flex items-center gap-3">
                        <label className="w-28 sm:w-32 text-xs sm:text-sm font-semibold text-[#111827] dark:text-slate-200 shrink-0">
                          {loginNationality === 'PERUANO' ? 'DNI / RUC' : 'Pasaporte / ID'}
                        </label>
                        <input
                          type="text"
                          required
                          autoFocus
                          inputMode={loginNationality === 'EXTRANJERO' ? 'text' : 'numeric'}
                          maxLength={loginNationality === 'EXTRANJERO' ? 20 : 11}
                          value={loginDocNumero}
                          onChange={(e) => {
                            setLoginError(null);
                            if (loginNationality === 'EXTRANJERO') {
                              setLoginDocNumero(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''));
                            } else {
                              setLoginDocNumero(e.target.value.replace(/\D/g, ''));
                            }
                          }}
                          placeholder={
                            loginNationality === 'PERUANO' ? 'Ej: 44556677 o 20601234565' : 'Ej: PA998877'
                          }
                          className="flex-1 min-h-[44px] bg-transparent text-sm font-mono-tabular font-semibold text-[#111827] dark:text-white focus:outline-none"
                        />
                      </div>

                      <div className="py-3 flex items-center gap-3">
                        <label className="w-28 sm:w-32 text-xs sm:text-sm font-semibold text-[#111827] dark:text-slate-200 shrink-0">
                          Contraseña
                        </label>
                        <input
                          type={loginShowPassword ? 'text' : 'password'}
                          required
                          value={loginPassword}
                          onChange={(e) => {
                            setLoginPassword(e.target.value);
                            setLoginError(null);
                          }}
                          placeholder="Tu contraseña de La Chuspa"
                          className="flex-1 min-h-[44px] bg-transparent text-sm text-[#111827] dark:text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setLoginShowPassword((v) => !v)}
                          aria-label={loginShowPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#6B7280]"
                        >
                          {loginShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {loginError && (
                      <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/35 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300 font-medium">
                        {loginError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loginLoading}
                      className="w-full min-h-[50px] rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white text-sm font-bold shadow-sm transition-colors disabled:opacity-60"
                    >
                      {loginLoading ? 'Verificando credenciales...' : 'Iniciar sesión'}
                    </button>

                    <div className="flex items-center justify-between text-xs text-[#576B95] dark:text-[#93C5FD] pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setRegError(null);
                          setScreen('REGISTER');
                        }}
                        className="font-semibold"
                      >
                        Crear nueva cuenta
                      </button>
                      <button
                        type="button"
                        onClick={() => onSwitchOperationalView('CENTRAL_SOS')}
                        className="text-rose-600 dark:text-rose-400 font-semibold"
                      >
                        Emergencias SOS
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Modal Selector de Idioma (Screenshot WeChat Idioma) */}
      {languageModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Seleccionar idioma"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white dark:bg-[#052030] text-[#111827] dark:text-white rounded-3xl overflow-hidden shadow-2xl border border-black/10">
            <div className="px-4 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setLanguageModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#6B7280]"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-base font-bold">Idioma</h3>
              <button
                type="button"
                onClick={() => {
                  setLanguage(pendingLanguage);
                  onLanguageChange?.(pendingLanguage);
                  setLanguageModalOpen(false);
                }}
                className="min-h-[36px] px-3.5 rounded-lg bg-[#07C160] text-white text-xs font-bold"
              >
                Guardar
              </button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto divide-y divide-black/5 dark:divide-white/10">
              {LANGUAGES.map((lang) => {
                const active = pendingLanguage === lang;
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setPendingLanguage(lang)}
                    className="w-full min-h-[48px] px-5 flex items-center justify-between text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <span>{lang}</span>
                    {active && <Check className="w-4 h-4 text-[#07C160]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal Selector País / Región */}
      {countryModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Seleccionar país o región"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white dark:bg-[#052030] text-[#111827] dark:text-white rounded-3xl overflow-hidden shadow-2xl border border-black/10">
            <div className="px-4 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
              <h3 className="text-base font-bold">País / Región</h3>
              <button
                type="button"
                onClick={() => setCountryModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#6B7280]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 border-b border-black/5 dark:border-white/10">
              <div className="flex items-center gap-2 px-3 rounded-xl bg-[#F3F4F6] dark:bg-[#031622]">
                <Search className="w-4 h-4 text-[#9CA3AF]" />
                <input
                  type="text"
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  placeholder="Buscar país o código (+51, +1...)"
                  className="w-full min-h-[40px] bg-transparent text-sm focus:outline-none"
                />
              </div>
            </div>
            <div className="max-h-[58vh] overflow-y-auto divide-y divide-black/5 dark:divide-white/10">
              {filteredCountries.map((c) => (
                <button
                  key={c.iso}
                  type="button"
                  onClick={() => {
                    setRegPaisCodigo(c.dialCode);
                    setCountryModalOpen(false);
                  }}
                  className="w-full min-h-[48px] px-5 flex items-center justify-between text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span>
                    {c.flag} {c.name}
                  </span>
                  <span className="font-mono-tabular text-xs text-[#6B7280] dark:text-slate-300">
                    {c.dialCode}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Términos de Servicio / Política de Privacidad */}
      {legalModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg bg-white dark:bg-[#052030] text-[#111827] dark:text-white rounded-3xl overflow-hidden shadow-2xl border border-black/10">
            <div className="px-5 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#07C160]" />
                <h3 className="text-base font-bold">
                  {legalModal === 'TERMS' ? 'Términos de servicio de La Chuspa' : 'Política de Privacidad'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#6B7280]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto text-xs sm:text-sm text-[#4B5563] dark:text-slate-300 space-y-3 leading-relaxed">
              {legalModal === 'TERMS' ? (
                <>
                  <p>
                    1. <strong>Identidad verificada:</strong> La Chuspa valida tu documento (DNI o RUC con RENIEC/SUNAT, o Pasaporte para visitantes extranjeros) y tu número de WhatsApp para garantizar operaciones seguras en taxis, comercios y emergencias SOS.
                  </p>
                  <p>
                    2. <strong>Uso del Agente y Pagos:</strong> Las tarifas mostradas corresponden a comercios y conductores registrados. Los cobros con Yape/Plin se procesan bajo confirmación del usuario.
                  </p>
                  <p>
                    3. <strong>Conducta:</strong> Está prohibido suplantar documentos o generar pedidos ficticios.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Tu documento, dirección fiscal y WhatsApp se utilizan únicamente para validar tu cuenta, autocompletar comprobantes electrónicos (Boleta/Factura) y coordinar entregas o auxilios SOS.
                  </p>
                  <p>
                    Las contraseñas y códigos OTP de WhatsApp se protegen mediante hash criptográfico seguro. Puedes editar tu perfil o cambiar tu contraseña en cualquier momento desde Yo &gt; Configuración.
                  </p>
                </>
              )}
            </div>
            <div className="p-4 border-t border-black/10 dark:border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setRegTermsAccepted(true);
                  setLegalModal(null);
                }}
                className="min-h-[44px] px-5 rounded-xl bg-[#07C160] text-white text-xs font-bold"
              >
                Aceptar y cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Verificación de Seguridad (Info -> Puzle Deslizante) */}
      {securityModalStep !== 'NONE' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Verificación de seguridad"
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white dark:bg-[#052030] text-[#111827] dark:text-white rounded-3xl overflow-hidden shadow-2xl border border-black/10">
            <div className="px-4 py-3 flex items-center justify-between border-b border-black/5 dark:border-white/10">
              <button
                type="button"
                onClick={() => setSecurityModalStep('NONE')}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#6B7280]"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="text-sm font-bold">Verificación de seguridad</span>
              <span className="w-10" />
            </div>

            {securityModalStep === 'INFO' ? (
              <div className="p-7 text-center space-y-6">
                <div className="w-16 h-16 rounded-full border-2 border-[#38BDF8] text-[#38BDF8] mx-auto flex items-center justify-center">
                  <Info className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold">Verificación de seguridad</h3>
                  <p className="text-sm text-[#4B5563] dark:text-slate-300 leading-relaxed">
                    Por cuestiones de seguridad de su cuenta, verifique el código de verificación de seguridad para proceder con el registro.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSecurityModalStep('PUZZLE')}
                  className="w-full min-h-[48px] rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white text-sm font-bold"
                >
                  Empezar
                </button>
              </div>
            ) : (
              <div className="p-6 space-y-5">
                <div className="text-center space-y-1">
                  <h3 className="text-base font-bold">Deslice y arme el puzle</h3>
                  <p className="text-xs text-[#6B7280] dark:text-slate-300">
                    Desliza la barra hasta encajar la pieza dorada sobre la silueta de Cusco.
                  </p>
                </div>

                {/* Escena visual del puzle */}
                <div className="relative h-40 rounded-2xl overflow-hidden border border-black/10 bg-[#04334B]">
                  <img
                    src={welcomeEarthImg}
                    alt="Puzle de seguridad"
                    className="w-full h-full object-cover opacity-75"
                  />
                  {/* Silueta destino */}
                  <div
                    style={{ left: `${puzzleTarget}%` }}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-12 h-12 rounded-xl border-2 border-dashed border-white bg-black/45 shadow-inner"
                  />
                  {/* Pieza móvil */}
                  <div
                    style={{ left: `${puzzleSlider}%` }}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-12 h-12 rounded-xl border-2 border-[#F5C400] bg-[#07C160]/85 shadow-lg flex items-center justify-center text-white font-bold"
                  >
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                </div>

                <div className="space-y-2">
                  <input
                    type="range"
                    min={10}
                    max={90}
                    value={puzzleSlider}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPuzzleSlider(val);
                      setPuzzleError(null);
                    }}
                    onMouseUp={(e) => handlePuzzleRelease(Number((e.target as HTMLInputElement).value))}
                    onTouchEnd={(e) => handlePuzzleRelease(Number((e.target as HTMLInputElement).value))}
                    aria-label="Deslizar pieza del puzle"
                    className="w-full accent-[#07C160] h-3 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[11px] text-[#6B7280] dark:text-slate-300">
                    <span>Arrastra el control y suelta al alinear</span>
                    <button
                      type="button"
                      onClick={() => handlePuzzleRelease(puzzleSlider)}
                      className="text-[#07C160] font-bold"
                    >
                      Confirmar posición
                    </button>
                  </div>
                </div>

                {puzzleError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-medium text-center">
                    {puzzleError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
