import React, { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Briefcase,
  Compass,
  Grid,
  MapPin,
  MapPinned,
  MessageCircle,
  Moon,
  Shield,
  Siren,
  Sun,
  User,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel.tsx';
import { BusinessPanel } from './components/BusinessPanel.tsx';
import { ClientPortal } from './components/ClientPortal.tsx';
import { EmergencyDispatchCenter } from './components/DispatchAndRouteModules.tsx';
import { GlowingNotificationCardHost } from './components/GlowingNotificationCard.tsx';
import { OrderTracking } from './components/OrderTracking.tsx';
import { WeChatAuthFlow } from './components/WeChatAuthFlow.tsx';
import { WeChatWorkspace } from './components/WeChatWorkspace.tsx';
import { isFirebaseRtdbMode, subscribeFirebaseRtdbMode } from './lib/firebaseRtdb.ts';
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  subscribeNotificationSoundToggle,
  unlockNotificationAudio,
} from './lib/notificationSounds.ts';
import type {
  MainWeChatTab,
  PedidoPublico,
  Rubro,
  SharedCustomerDoc,
  UserAccount,
} from './types.ts';

type ViewMode = 'CONCIERGE' | 'SEGUIMIENTO' | 'NEGOCIO' | 'CENTRAL_SOS' | 'ADMIN';

export default function App() {
  const [view, setView] = useState<ViewMode>('CONCIERGE');
  const [wechatTab, setWechatTab] = useState<MainWeChatTab>('CENTER_HUB');
  const [centerMenuOpen, setCenterMenuOpen] = useState(false);

  // Sesión de usuario en memoria (nunca localStorage por seguridad)
  const [userSession, setUserSession] = useState<{
    token: string;
    usuario: UserAccount;
  } | null>(null);
  const [authLanguage, setAuthLanguage] = useState('Español');

  const [darkMode, setDarkMode] = useState(false);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [customerDoc, setCustomerDoc] = useState<SharedCustomerDoc | null>(null);
  const [lastOrderCodigo, setLastOrderCodigo] = useState<string | null>(null);
  const [lastOrderPin, setLastOrderPin] = useState<string | null>(null);
  const [assistantSignal, setAssistantSignal] = useState(0);
  const [sosSignal, setSosSignal] = useState(0);
  const [externalPromptSignal, setExternalPromptSignal] = useState<{
    seq: number;
    query: string;
    categoria?: Rubro;
  } | null>(null);

  const [rtdbMode, setRtdbMode] = useState(() => isFirebaseRtdbMode());
  const [soundEnabled, setSoundEnabled] = useState(() => isNotificationSoundEnabled());

  useEffect(() => subscribeFirebaseRtdbMode(setRtdbMode), []);
  useEffect(() => subscribeNotificationSoundToggle(setSoundEnabled), []);

  useEffect(() => {
    const onUnlock = () => unlockNotificationAudio();
    window.addEventListener('pointerdown', onUnlock, { once: true });
    window.addEventListener('keydown', onUnlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onUnlock);
      window.removeEventListener('keydown', onUnlock);
    };
  }, []);

  useEffect(() => {
    const onQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  function syncCustomerDocFromUser(u: UserAccount) {
    setCustomerDoc((prev) => ({
      tipo: u.documento_tipo,
      numero: u.documento_numero,
      nombre: u.nombre,
      direccionFiscal: u.direccion_fiscal || prev?.direccionFiscal || '',
      whatsapp: u.whatsapp,
      paisCodigo: u.pais_codigo,
      paisNombre: u.pais_nombre,
      lat: prev?.lat,
      lng: prev?.lng,
      gpsVerificado: prev?.gpsVerificado,
      verificado: true,
      fuente:
        u.documento_tipo === 'RUC'
          ? 'SUNAT'
          : u.documento_tipo === 'EXTRANJERO'
          ? 'MIGRACIONES_EXTRANJERO'
          : 'RENIEC',
    }));
  }

  function handleUserAuthenticated(payload: { token: string; usuario: UserAccount }) {
    setUserSession(payload);
    syncCustomerDocFromUser(payload.usuario);
    setView('CONCIERGE');
    setWechatTab('CENTER_HUB');
    setCenterMenuOpen(false);
  }

  function handleUsuarioUpdated(updated: UserAccount) {
    setUserSession((prev) => (prev ? { ...prev, usuario: updated } : prev));
    syncCustomerDocFromUser(updated);
  }

  function handleLogout() {
    setUserSession(null);
    setCustomerDoc(null);
    setWechatTab('CENTER_HUB');
    setView('CONCIERGE');
    setCenterMenuOpen(false);
  }

  function handleCustomerDocVerified(doc: SharedCustomerDoc) {
    setCustomerDoc((prev) => ({
      ...prev,
      ...doc,
      whatsapp: doc.whatsapp || prev?.whatsapp,
      paisCodigo: doc.paisCodigo || prev?.paisCodigo,
      paisNombre: doc.paisNombre || prev?.paisNombre,
      lat: typeof doc.lat === 'number' ? doc.lat : prev?.lat,
      lng: typeof doc.lng === 'number' ? doc.lng : prev?.lng,
      gpsVerificado: doc.gpsVerificado ?? prev?.gpsVerificado,
    }));
  }

  function handleOrderCreated(pedido: PedidoPublico, pin: string) {
    setLastOrderCodigo(pedido.codigo);
    setLastOrderPin(pin);
    setWechatTab('CENTER_HUB');
    setView('SEGUIMIENTO');
  }

  function triggerAssistantSphere() {
    setWechatTab('CENTER_HUB');
    setView('CONCIERGE');
    setCenterMenuOpen(false);
    setAssistantSignal((n) => n + 1);
  }

  function triggerSosModal() {
    setWechatTab('CENTER_HUB');
    setView('CONCIERGE');
    setCenterMenuOpen(false);
    setSosSignal((n) => n + 1);
  }

  function handleOpenConciergeQuery(query: string, categoria?: Rubro) {
    setWechatTab('CENTER_HUB');
    setView('CONCIERGE');
    setCenterMenuOpen(false);
    setExternalPromptSignal((prev) => ({
      seq: (prev?.seq || 0) + 1,
      query,
      categoria,
    }));
  }

  function handleCenterButtonClick() {
    if (view === 'CONCIERGE' && wechatTab === 'CENTER_HUB') {
      setCenterMenuOpen((v) => !v);
    } else {
      setWechatTab('CENTER_HUB');
      setView('CONCIERGE');
      setCenterMenuOpen(false);
    }
  }

  // Si aún no ha iniciado sesión como cliente y está en vistas del cliente, mostrar pantalla WeChat (Welcome / Registro / OTP / Login)
  const isClientGateActive =
    !userSession && (view === 'CONCIERGE' || view === 'SEGUIMIENTO');

  if (isClientGateActive) {
    return (
      <>
        <GlowingNotificationCardHost />
        <WeChatAuthFlow
          initialLanguage={authLanguage}
          onLanguageChange={setAuthLanguage}
          onAuthenticated={handleUserAuthenticated}
          onSwitchOperationalView={(opView) => {
            setView(opView);
          }}
        />
      </>
    );
  }

  const centerHubModules: Array<{
    id: ViewMode | 'CHAT_AGENTE';
    label: string;
    desc: string;
    icon: React.ReactNode;
    accent: string;
    onClick: () => void;
  }> = [
    {
      id: 'CONCIERGE',
      label: 'Inicio · Disco Solar',
      desc: 'Taxis, boticas, tours, gastronomía, oficios y divisas',
      icon: <Compass className="w-5 h-5 text-[#04334B]" />,
      accent: 'bg-[#F5C400]',
      onClick: triggerAssistantSphere,
    },
    {
      id: 'CHAT_AGENTE',
      label: 'Chat Agente WeChat',
      desc: 'Conversación directa por voz, GPS o texto con La Chuspa',
      icon: <MessageCircle className="w-5 h-5 text-white" />,
      accent: 'bg-[#07C160]',
      onClick: () => {
        setCenterMenuOpen(false);
        setView('CONCIERGE');
        setWechatTab('CHATS');
      },
    },
    {
      id: 'SEGUIMIENTO',
      label: 'Seguimiento & Pagos',
      desc: 'Rutas en vivo, códigos PIN y comprobantes SUNAT',
      icon: <MapPinned className="w-5 h-5 text-white" />,
      accent: 'bg-[#1565F5]',
      onClick: () => {
        setCenterMenuOpen(false);
        setWechatTab('CENTER_HUB');
        setView('SEGUIMIENTO');
      },
    },
    {
      id: 'NEGOCIO',
      label: 'Panel Negocio / Taxis',
      desc: 'Gestión de pedidos, catálogo IA, Yape y conductores',
      icon: <Briefcase className="w-5 h-5 text-white" />,
      accent: 'bg-[#04334B]',
      onClick: () => {
        setCenterMenuOpen(false);
        setWechatTab('CENTER_HUB');
        setView('NEGOCIO');
      },
    },
    {
      id: 'CENTRAL_SOS',
      label: 'Central Emergencias SOS',
      desc: 'Despacho SAMU, Serenazgo, PNP 105 y Bomberos',
      icon: <Siren className="w-5 h-5 text-white" />,
      accent: 'bg-[#E11D48]',
      onClick: () => {
        setCenterMenuOpen(false);
        setWechatTab('CENTER_HUB');
        setView('CENTRAL_SOS');
      },
    },
    {
      id: 'ADMIN',
      label: 'Administración',
      desc: 'Control de comercios, reglas y auditoría Cusco',
      icon: <Shield className="w-5 h-5 text-white" />,
      accent: 'bg-slate-700',
      onClick: () => {
        setCenterMenuOpen(false);
        setWechatTab('CENTER_HUB');
        setView('ADMIN');
      },
    },
  ];

  const showWeChatSubtab =
    Boolean(userSession) &&
    view === 'CONCIERGE' &&
    (wechatTab === 'CHATS' ||
      wechatTab === 'CONTACTOS' ||
      wechatTab === 'DESCUBRIR' ||
      wechatTab === 'YO');

  return (
    <div className="min-h-screen flex flex-col bg-[#F7FAFC] text-[#0B2538] dark:bg-[#041824] dark:text-[#F1F5F9] transition-colors">
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Header Superior Limpio */}
      <header className="sticky top-0 z-30 h-16 border-b border-[#064666] bg-[#04334B] text-white shadow-sm">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <a
            href="#inicio"
            onClick={(e) => {
              e.preventDefault();
              setWechatTab('CENTER_HUB');
              setView('CONCIERGE');
            }}
            className="font-display text-2xl sm:text-3xl font-bold tracking-tight whitespace-nowrap shrink-0 flex items-center gap-1"
          >
            <span className="text-[#F5C400]">La</span>
            <span className="text-white">Chuspa</span>
          </a>

          {/* Enlaces rápidos Desktop */}
          {userSession ? (
            <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
              <button
                type="button"
                onClick={() => {
                  setView('CONCIERGE');
                  setWechatTab('CENTER_HUB');
                }}
                className={`py-1.5 border-b-2 transition-colors ${
                  view === 'CONCIERGE' && wechatTab === 'CENTER_HUB'
                    ? 'border-[#F5C400] text-[#F5C400] font-semibold'
                    : 'border-transparent text-slate-200 hover:text-white'
                }`}
              >
                Inicio
              </button>
              <button
                type="button"
                onClick={() => {
                  setView('CONCIERGE');
                  setWechatTab('CHATS');
                }}
                className={`py-1.5 border-b-2 transition-colors ${
                  view === 'CONCIERGE' && wechatTab === 'CHATS'
                    ? 'border-[#F5C400] text-[#F5C400] font-semibold'
                    : 'border-transparent text-slate-200 hover:text-white'
                }`}
              >
                Chats
              </button>
              <button
                type="button"
                onClick={() => {
                  setWechatTab('CENTER_HUB');
                  setView('SEGUIMIENTO');
                }}
                className={`py-1.5 border-b-2 transition-colors ${
                  view === 'SEGUIMIENTO'
                    ? 'border-[#F5C400] text-[#F5C400] font-semibold'
                    : 'border-transparent text-slate-200 hover:text-white'
                }`}
              >
                Seguimiento
              </button>
              <button
                type="button"
                onClick={() => {
                  setWechatTab('CENTER_HUB');
                  setView('NEGOCIO');
                }}
                className={`py-1.5 border-b-2 transition-colors ${
                  view === 'NEGOCIO'
                    ? 'border-[#F5C400] text-[#F5C400] font-semibold'
                    : 'border-transparent text-slate-200 hover:text-white'
                }`}
              >
                Negocio / Taxis
              </button>
              <button
                type="button"
                onClick={() => {
                  setWechatTab('CENTER_HUB');
                  setView('CENTRAL_SOS');
                }}
                className={`py-1.5 border-b-2 transition-colors ${
                  view === 'CENTRAL_SOS'
                    ? 'border-[#F5C400] text-[#F5C400] font-semibold'
                    : 'border-transparent text-slate-200 hover:text-white'
                }`}
              >
                Central Emergencias
              </button>
              <button
                type="button"
                onClick={() => {
                  setWechatTab('CENTER_HUB');
                  setView('ADMIN');
                }}
                className={`py-1.5 border-b-2 transition-colors ${
                  view === 'ADMIN'
                    ? 'border-[#F5C400] text-[#F5C400] font-semibold'
                    : 'border-transparent text-slate-200 hover:text-white'
                }`}
              >
                Admin
              </button>
            </nav>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView('CONCIERGE')}
                className="min-h-[38px] px-3.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white text-xs font-bold"
              >
                Volver a Iniciar / Registro
              </button>
            </div>
          )}

          {/* Acciones rápidas SOS + Menú Central */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={triggerSosModal}
              aria-label="Solicitar emergencia SOS"
              className="min-h-[38px] px-3 rounded-xl bg-[#E11D48] hover:bg-rose-600 text-white text-xs font-extrabold tracking-wide whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Siren className="w-3.5 h-3.5" />
              <span>SOS</span>
            </button>
            {userSession && (
              <button
                type="button"
                onClick={() => setCenterMenuOpen((v) => !v)}
                className="min-h-[38px] px-3.5 rounded-xl bg-[#F5C400] hover:bg-[#E2B400] text-[#04334B] text-xs font-extrabold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Centro</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Sub-barra Titular + Sonido + Tema */}
      {userSession && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#516478] dark:text-[#94A3B8]">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                setView('CONCIERGE');
                setWechatTab('YO');
              }}
              className="min-h-[34px] px-3 rounded-xl border border-[#1565F5]/25 bg-white dark:bg-[#072638] text-[#0B2538] dark:text-[#E2E8F0] font-semibold flex items-center gap-1.5 max-w-full shadow-xs"
            >
              <BadgeCheck className="w-3.5 h-3.5 text-[#07C160] shrink-0" />
              <span className="truncate max-w-[260px] sm:max-w-md">
                {userSession.usuario.nombre} · {userSession.usuario.documento_tipo}{' '}
                {userSession.usuario.documento_numero} · {userSession.usuario.whatsapp}
              </span>
              {customerDoc?.gpsVerificado && (
                <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              )}
            </button>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setNotificationSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Silenciar sonidos' : 'Activar sonidos'}
              className="min-h-[36px] px-2.5 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-white dark:bg-[#072638] text-[#0B2538] dark:text-slate-200 flex items-center gap-1.5 hover:border-[#1565F5] transition-colors"
            >
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="hidden sm:inline">{soundEnabled ? 'Sonido' : 'Silencio'}</span>
            </button>
            <button
              type="button"
              onClick={() => setDarkMode((v) => !v)}
              className="min-h-[36px] px-3 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-white dark:bg-[#072638] text-[#0B2538] dark:text-slate-200 flex items-center gap-1.5 hover:border-[#1565F5] transition-colors"
            >
              {darkMode ? (
                <Sun className="w-3.5 h-3.5 text-[#F5C400]" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-[#1565F5]" />
              )}
              <span>{darkMode ? 'Modo Claro' : 'Modo Oscuro'}</span>
            </button>
          </div>
        </div>
      )}

      {rtdbMode && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-2">
          <div className="rounded-xl border border-[#1565F5]/25 bg-[#1565F5]/8 px-3.5 py-2 text-[11px] text-[#1565F5] dark:text-[#93C5FD] font-medium">
            Conectado en tiempo real a Firebase Realtime Database (spatech-b3edf).
          </div>
        </div>
      )}

      <GlowingNotificationCardHost />

      {/* Contenido Principal */}
      <main className={`flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4 ${userSession ? 'pb-24' : 'pb-10'}`}>
        {showWeChatSubtab && userSession ? (
          <WeChatWorkspace
            activeTab={wechatTab as 'CHATS' | 'CONTACTOS' | 'DESCUBRIR' | 'YO'}
            userToken={userSession.token}
            usuario={userSession.usuario}
            onUsuarioUpdated={handleUsuarioUpdated}
            onLogout={handleLogout}
            onSwitchAccount={handleLogout}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((v) => !v)}
            soundEnabled={soundEnabled}
            onToggleSound={() => setNotificationSoundEnabled(!soundEnabled)}
            onOpenConciergeQuery={handleOpenConciergeQuery}
            onNavigateOperationalView={(nextView) => {
              setWechatTab('CENTER_HUB');
              setView(nextView);
            }}
          />
        ) : view === 'CONCIERGE' ? (
          <ClientPortal
            customerDoc={customerDoc}
            onCustomerDocVerified={handleCustomerDocVerified}
            onRequestIdentityGate={() => setWechatTab('YO')}
            onOrderCreated={handleOrderCreated}
            openAssistantSignal={assistantSignal}
            openSosSignal={sosSignal}
            externalPromptSignal={externalPromptSignal}
            initialCoords={
              typeof customerDoc?.lat === 'number' && typeof customerDoc?.lng === 'number'
                ? {
                    lat: customerDoc.lat,
                    lng: customerDoc.lng,
                    gpsVerificado: Boolean(customerDoc.gpsVerificado),
                  }
                : null
            }
          />
        ) : view === 'SEGUIMIENTO' ? (
          <OrderTracking initialCodigo={lastOrderCodigo} clientPin={lastOrderPin} />
        ) : view === 'NEGOCIO' ? (
          <BusinessPanel />
        ) : view === 'CENTRAL_SOS' ? (
          <div className="pb-24 space-y-4">
            <EmergencyDispatchCenter />
          </div>
        ) : (
          <AdminPanel />
        )}
      </main>

      {/* Popover / Sheet del Menú Center Button (Disco Solar Inca) */}
      {centerMenuOpen && userSession && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menú Central La Chuspa"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-6"
        >
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#052030] text-[#0B2538] dark:text-white border border-[#F5C400]/40 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#04334B] text-white flex items-center justify-between border-b border-[#F5C400]/30">
              <div>
                <h2 className="font-display text-lg font-bold text-[#F5C400]">
                  Centro de Operaciones La Chuspa
                </h2>
                <p className="text-xs text-slate-200">
                  Accede a todas las herramientas del ecosistema Cusco
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCenterMenuOpen(false)}
                aria-label="Cerrar menú central"
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {centerHubModules.map((mod) => (
                <button
                  key={mod.id}
                  type="button"
                  onClick={mod.onClick}
                  className="p-3.5 rounded-2xl border border-[#E5E7EB] dark:border-[#064666] hover:border-[#F5C400] bg-[#F9FAFB] dark:bg-[#031B29] text-left flex items-start gap-3 transition-colors"
                >
                  <span
                    className={`w-10 h-10 rounded-xl ${mod.accent} flex items-center justify-center shrink-0 shadow-xs`}
                  >
                    {mod.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#0B2538] dark:text-white truncate">
                      {mod.label}
                    </p>
                    <p className="text-[11px] text-[#516478] dark:text-slate-300 leading-snug mt-0.5">
                      {mod.desc}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Menú Inferior Estático WeChat + Center Button (Disco Solar Inca) */}
      {userSession && (
        <nav
          aria-label="Menú inferior estático La Chuspa"
          className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-[#04334B]/95 backdrop-blur-md border-t border-[#D8E2EC] dark:border-[#064666] shadow-[0_-6px_24px_rgba(4,51,75,0.12)]"
        >
          <div className="max-w-3xl mx-auto h-full grid grid-cols-5 items-center px-1">
            {/* 1. Chats */}
            <button
              type="button"
              onClick={() => {
                setView('CONCIERGE');
                setWechatTab('CHATS');
                setCenterMenuOpen(false);
              }}
              className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                view === 'CONCIERGE' && wechatTab === 'CHATS'
                  ? 'text-[#07C160] font-bold'
                  : 'text-[#516478] dark:text-slate-300'
              }`}
            >
              <MessageCircle className="w-5 h-5" />
              <span>Chats</span>
            </button>

            {/* 2. Contactos */}
            <button
              type="button"
              onClick={() => {
                setView('CONCIERGE');
                setWechatTab('CONTACTOS');
                setCenterMenuOpen(false);
              }}
              className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                view === 'CONCIERGE' && wechatTab === 'CONTACTOS'
                  ? 'text-[#07C160] font-bold'
                  : 'text-[#516478] dark:text-slate-300'
              }`}
            >
              <Users className="w-5 h-5" />
              <span>Contactos</span>
            </button>

            {/* 3. CENTER BUTTON: Disco Solar Inca / Menú Central La Chuspa */}
            <div className="h-full flex flex-col items-center justify-center relative">
              <button
                type="button"
                onClick={handleCenterButtonClick}
                aria-label="Centro La Chuspa - Inicio y módulos"
                title={
                  view === 'CONCIERGE' && wechatTab === 'CENTER_HUB'
                    ? 'Abrir menú central de módulos'
                    : 'Ir a Inicio Disco Solar'
                }
                className="w-13 h-13 -mt-4 rounded-full bg-gradient-to-br from-[#F5C400] via-[#FFD83B] to-[#D9A700] border-4 border-white dark:border-[#04334B] shadow-lg flex items-center justify-center text-[#04334B] hover:brightness-105 active:scale-95 transition-all"
              >
                <svg viewBox="0 0 32 32" className="w-7 h-7" aria-hidden="true">
                  <circle cx="16" cy="16" r="8" fill="none" stroke="#04334B" strokeWidth="2" />
                  <circle cx="16" cy="16" r="4" fill="#04334B" />
                  <path
                    d="M16 2v4M16 26v4M2 16h4M27 16h3M6.1 6.1l2.8 2.8M23.1 23.1l2.8 2.8M25.9 6.1l-2.8 2.8M8.9 23.1l-2.8 2.8"
                    stroke="#04334B"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <span
                className={`text-[10px] font-bold leading-none mt-0.5 ${
                  wechatTab === 'CENTER_HUB'
                    ? 'text-[#04334B] dark:text-[#F5C400]'
                    : 'text-[#516478] dark:text-slate-300'
                }`}
              >
                Centro
              </span>
            </div>

            {/* 4. Descubrir */}
            <button
              type="button"
              onClick={() => {
                setView('CONCIERGE');
                setWechatTab('DESCUBRIR');
                setCenterMenuOpen(false);
              }}
              className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                view === 'CONCIERGE' && wechatTab === 'DESCUBRIR'
                  ? 'text-[#07C160] font-bold'
                  : 'text-[#516478] dark:text-slate-300'
              }`}
            >
              <Compass className="w-5 h-5" />
              <span>Descubrir</span>
            </button>

            {/* 5. Yo */}
            <button
              type="button"
              onClick={() => {
                setView('CONCIERGE');
                setWechatTab('YO');
                setCenterMenuOpen(false);
              }}
              className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                view === 'CONCIERGE' && wechatTab === 'YO'
                  ? 'text-[#07C160] font-bold'
                  : 'text-[#516478] dark:text-slate-300'
              }`}
            >
              <User className="w-5 h-5" />
              <span>Yo</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
