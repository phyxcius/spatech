import React, { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Briefcase,
  Compass,
  MapPin,
  MapPinned,
  Moon,
  Shield,
  Siren,
  Sun,
  UserCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel.tsx';
import { BusinessPanel } from './components/BusinessPanel.tsx';
import { ClientPortal } from './components/ClientPortal.tsx';
import { EmergencyDispatchCenter } from './components/DispatchAndRouteModules.tsx';
import { GlowingNotificationCardHost } from './components/GlowingNotificationCard.tsx';
import { IdentityGateOverlay } from './components/IdentityGateOverlay.tsx';
import { OrderTracking } from './components/OrderTracking.tsx';
import { isFirebaseRtdbMode, subscribeFirebaseRtdbMode } from './lib/firebaseRtdb.ts';
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  subscribeNotificationSoundToggle,
  unlockNotificationAudio,
} from './lib/notificationSounds.ts';
import type { PedidoPublico, SharedCustomerDoc } from './types.ts';

type ViewMode = 'CONCIERGE' | 'SEGUIMIENTO' | 'NEGOCIO' | 'CENTRAL_SOS' | 'ADMIN';

export default function App() {
  const [view, setView] = useState<ViewMode>('CONCIERGE');
  const [darkMode, setDarkMode] = useState(false);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [customerDoc, setCustomerDoc] = useState<SharedCustomerDoc | null>(null);
  const [identityGateOpen, setIdentityGateOpen] = useState(false);
  const [lastOrderCodigo, setLastOrderCodigo] = useState<string | null>(null);
  const [lastOrderPin, setLastOrderPin] = useState<string | null>(null);
  const [assistantSignal, setAssistantSignal] = useState(0);
  const [sosSignal, setSosSignal] = useState(0);
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
    setIdentityGateOpen(false);
  }

  function handleOrderCreated(pedido: PedidoPublico, pin: string) {
    setLastOrderCodigo(pedido.codigo);
    setLastOrderPin(pin);
    setView('SEGUIMIENTO');
  }

  function triggerAssistantSphere() {
    setView('CONCIERGE');
    setAssistantSignal((n) => n + 1);
  }

  function triggerSosModal() {
    setView('CONCIERGE');
    setSosSignal((n) => n + 1);
  }

  const navItems: Array<{ id: ViewMode; label: string; icon: React.ReactNode }> = [
    { id: 'CONCIERGE', label: 'Concierge', icon: <Compass className="w-5 h-5" /> },
    { id: 'SEGUIMIENTO', label: 'Seguimiento', icon: <MapPinned className="w-5 h-5" /> },
    { id: 'NEGOCIO', label: 'Panel Negocio', icon: <Briefcase className="w-5 h-5" /> },
    { id: 'CENTRAL_SOS', label: 'Central Emergencias', icon: <Siren className="w-5 h-5" /> },
    { id: 'ADMIN', label: 'Administración', icon: <Shield className="w-5 h-5" /> },
  ];

  const showIdentityGate =
    (view === 'CONCIERGE' || view === 'SEGUIMIENTO') &&
    (!customerDoc?.verificado || identityGateOpen);

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
      {/* Overlay obligatorio al ingresar al sistema para validar DNI, RUC o Extranjero + WhatsApp + GPS */}
      <IdentityGateOverlay
        isOpen={showIdentityGate}
        initialDoc={customerDoc}
        canClose={Boolean(customerDoc?.verificado)}
        onClose={() => setIdentityGateOpen(false)}
        onVerified={handleCustomerDocVerified}
        onSwitchView={(nextView) => {
          setIdentityGateOpen(false);
          setView(nextView);
        }}
      />

      {/* Top Bar estilo Azul Marino Profundo + Dorado + Cobalto */}
      <header className="sticky top-0 z-30 h-16 border-b border-[#064666] bg-[#04334B] text-white shadow-sm">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zona 1: Wordmark único */}
          <a
            href="#concierge"
            onClick={(e) => {
              e.preventDefault();
              setView('CONCIERGE');
            }}
            className="font-display text-2xl sm:text-3xl font-bold tracking-tight whitespace-nowrap shrink-0 flex items-center gap-1"
          >
            <span className="text-[#F5C400]">La</span>
            <span className="text-white">Chuspa</span>
          </a>

          {/* Zona 2: Enlaces de navegación de una sola línea */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            {navItems.map((item) => {
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={`py-1.5 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    active
                      ? 'border-[#F5C400] text-[#F5C400] font-semibold'
                      : 'border-transparent text-slate-200 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zona 3: Acciones rápidas SOS + Asistente compacto */}
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
            <button
              type="button"
              onClick={triggerAssistantSphere}
              className="min-h-[38px] px-4 rounded-xl bg-[#F5C400] hover:bg-[#E2B400] text-[#04334B] text-xs font-extrabold whitespace-nowrap shrink-0 transition-colors shadow-sm"
            >
              Agente
            </button>
          </div>
        </div>
      </header>

      {/* Barra superior con Titular Verificado + WhatsApp + GPS + Selector de tema */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#516478] dark:text-[#94A3B8]">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <span className="font-medium">Cusco · Red Multinegocio Verificada</span>
          {customerDoc?.verificado ? (
            <button
              type="button"
              onClick={() => setIdentityGateOpen(true)}
              title="Cambiar documento o WhatsApp del titular"
              className="min-h-[34px] px-3 rounded-xl border border-[#1565F5]/25 bg-white dark:bg-[#072638] text-[#0B2538] dark:text-[#E2E8F0] font-semibold flex items-center gap-1.5 max-w-full shadow-xs"
            >
              <BadgeCheck className="w-3.5 h-3.5 text-[#1565F5] shrink-0" />
              <span className="truncate max-w-[260px] sm:max-w-md">
                Titular: {customerDoc.nombre} · {customerDoc.tipo} {customerDoc.numero}
                {customerDoc.whatsapp ? ` · ${customerDoc.whatsapp}` : ''}
              </span>
              {customerDoc.gpsVerificado && (
                <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              )}
              <span className="text-[#1565F5] dark:text-[#60A5FA] font-bold text-[11px] shrink-0">Cambiar</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIdentityGateOpen(true)}
              className="min-h-[34px] px-3 rounded-xl border border-[#F5C400] bg-[#F5C400]/20 text-[#04334B] dark:text-[#F5C400] font-bold flex items-center gap-1.5"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Identificar Titular</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setNotificationSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Silenciar sonidos de notificación' : 'Activar sonidos de notificación'}
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
            {darkMode ? <Sun className="w-3.5 h-3.5 text-[#F5C400]" /> : <Moon className="w-3.5 h-3.5 text-[#1565F5]" />}
            <span>{darkMode ? 'Modo Claro' : 'Modo Oscuro'}</span>
          </button>
        </div>
      </div>

      {rtdbMode && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-2">
          <div className="rounded-xl border border-[#1565F5]/25 bg-[#1565F5]/8 px-3.5 py-2 text-[11px] text-[#1565F5] dark:text-[#93C5FD] font-medium">
            Conectado en tiempo real a Firebase Realtime Database (spatech-b3edf).
          </div>
        </div>
      )}

      {/* Tarjeta Central Resplandeciente de Notificaciones en Tiempo Real */}
      <GlowingNotificationCardHost />

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4">
        {view === 'CONCIERGE' && (
          <ClientPortal
            customerDoc={customerDoc}
            onCustomerDocVerified={handleCustomerDocVerified}
            onRequestIdentityGate={() => setIdentityGateOpen(true)}
            onOrderCreated={handleOrderCreated}
            openAssistantSignal={assistantSignal}
            openSosSignal={sosSignal}
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
        )}
        {view === 'SEGUIMIENTO' && (
          <OrderTracking initialCodigo={lastOrderCodigo} clientPin={lastOrderPin} />
        )}
        {view === 'NEGOCIO' && <BusinessPanel />}
        {view === 'CENTRAL_SOS' && (
          <div className="pb-24 space-y-4">
            <EmergencyDispatchCenter />
          </div>
        )}
        {view === 'ADMIN' && <AdminPanel />}
      </main>

      {/* Navegación Inferior Móvil (Zona de pulgar con icono SOS directo) */}
      <nav
        aria-label="Navegación principal móvil"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 dark:bg-[#04334B]/95 backdrop-blur-md border-t border-[#D8E2EC] dark:border-[#064666] grid grid-cols-6 items-center shadow-lg"
      >
        {navItems.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                active ? 'text-[#1565F5] dark:text-[#F5C400] font-bold' : 'text-[#516478] dark:text-slate-300'
              }`}
            >
              {item.icon}
              <span className="truncate max-w-[58px]">
                {item.id === 'NEGOCIO'
                  ? 'Negocio'
                  : item.id === 'CENTRAL_SOS'
                  ? 'Central'
                  : item.id === 'ADMIN'
                  ? 'Admin'
                  : item.id === 'SEGUIMIENTO'
                  ? 'Ruta'
                  : item.label}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={triggerSosModal}
          aria-label="Solicitar emergencia SOS"
          className="h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-extrabold text-[#E11D74]"
        >
          <Siren className="w-5 h-5" />
          <span>SOS</span>
        </button>
      </nav>
    </div>
  );
}
