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
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel.tsx';
import { BusinessPanel } from './components/BusinessPanel.tsx';
import { ClientPortal } from './components/ClientPortal.tsx';
import { EmergencyDispatchCenter } from './components/DispatchAndRouteModules.tsx';
import { GlowingNotificationCardHost } from './components/GlowingNotificationCard.tsx';
import { IdentityGateOverlay } from './components/IdentityGateOverlay.tsx';
import { OrderTracking } from './components/OrderTracking.tsx';
import { isFirebaseRtdbMode, subscribeFirebaseRtdbMode } from './lib/firebaseRtdb.ts';
import type { PedidoPublico, SharedCustomerDoc } from './types.ts';

type ViewMode = 'CONCIERGE' | 'SEGUIMIENTO' | 'NEGOCIO' | 'CENTRAL_SOS' | 'ADMIN';

export default function App() {
  const [view, setView] = useState<ViewMode>('CONCIERGE');
  const [darkMode, setDarkMode] = useState(true);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [customerDoc, setCustomerDoc] = useState<SharedCustomerDoc | null>(null);
  const [identityGateOpen, setIdentityGateOpen] = useState(false);
  const [lastOrderCodigo, setLastOrderCodigo] = useState<string | null>(null);
  const [lastOrderPin, setLastOrderPin] = useState<string | null>(null);
  const [assistantSignal, setAssistantSignal] = useState(0);
  const [sosSignal, setSosSignal] = useState(0);
  const [rtdbMode, setRtdbMode] = useState(() => isFirebaseRtdbMode());

  useEffect(() => subscribeFirebaseRtdbMode(setRtdbMode), []);

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
    <div className="min-h-screen flex flex-col bg-[#F4F7FC] text-[#0F172A] dark:bg-[#070D1F] dark:text-[#F8FAFC] transition-colors">
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

      {/* Top Bar Contract: exactamente 3 zonas separadas */}
      <header className="sticky top-0 z-30 h-14 md:h-16 border-b border-[#2563EB]/15 dark:border-[#3D7EFF]/20 bg-[#F4F7FC]/92 dark:bg-[#070D1F]/92 backdrop-blur-md">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zona 1: Wordmark único */}
          <a
            href="#concierge"
            onClick={(e) => {
              e.preventDefault();
              setView('CONCIERGE');
            }}
            className="font-display text-2xl sm:text-3xl font-semibold tracking-tight whitespace-nowrap shrink-0 bg-gradient-to-r from-[#1E40AF] via-[#2563EB] to-[#06B6D4] dark:from-white dark:via-[#3D7EFF] dark:to-[#06B6D4] bg-clip-text text-transparent"
          >
            La Chuspa
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
                  className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    active
                      ? 'border-[#2563EB] dark:border-[#06B6D4] text-[#1E40AF] dark:text-white font-semibold'
                      : 'border-transparent text-[#475569] dark:text-[#94A3B8] hover:text-[#1E40AF] dark:hover:text-[#F8FAFC]'
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
              className="min-h-[40px] px-3 rounded-xl bg-[#E11D74] hover:bg-rose-600 text-white text-xs font-black tracking-wide whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-sm chuspa-google-btn"
            >
              <Siren className="w-3.5 h-3.5" />
              <span>SOS</span>
            </button>
            <button
              type="button"
              onClick={triggerAssistantSphere}
              className="min-h-[40px] px-4 rounded-xl bg-gradient-to-r from-[#1E40AF] to-[#2563EB] text-white text-xs font-semibold whitespace-nowrap shrink-0 hover:opacity-90 transition-opacity chuspa-google-btn"
            >
              Agente
            </button>
          </div>
        </div>
      </header>

      {/* Barra superior con Titular Verificado + WhatsApp + GPS + Selector de tema */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#475569] dark:text-[#94A3B8]">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <span>Cusco · Red Multinegocio Verificada</span>
          {customerDoc?.verificado ? (
            <button
              type="button"
              onClick={() => setIdentityGateOpen(true)}
              title="Cambiar documento o WhatsApp del titular"
              className="min-h-[34px] px-3 rounded-xl border border-[#2563EB]/35 bg-[#2563EB]/10 text-[#1E40AF] dark:text-[#93C5FD] font-semibold flex items-center gap-1.5 max-w-full"
            >
              <BadgeCheck className="w-3.5 h-3.5 text-[#06B6D4] shrink-0" />
              <span className="truncate max-w-[260px] sm:max-w-md">
                Titular: {customerDoc.nombre} · {customerDoc.tipo} {customerDoc.numero}
                {customerDoc.whatsapp ? ` · ${customerDoc.whatsapp}` : ''}
              </span>
              {customerDoc.gpsVerificado && (
                <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              )}
              <span className="underline text-[11px] shrink-0">Cambiar</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIdentityGateOpen(true)}
              className="min-h-[34px] px-3 rounded-xl border border-[#F59E0B]/45 bg-[#F59E0B]/10 text-amber-800 dark:text-[#FBBF24] font-semibold flex items-center gap-1.5"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Identificar Titular</span>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDarkMode((v) => !v)}
          className="min-h-[40px] px-3 rounded-xl border border-[#2563EB]/20 flex items-center gap-1.5 hover:border-[#2563EB]/50 transition-colors"
        >
          {darkMode ? <Sun className="w-3.5 h-3.5 text-[#F59E0B]" /> : <Moon className="w-3.5 h-3.5 text-[#2563EB]" />}
          <span>{darkMode ? 'Modo Claro' : 'Modo Oscuro'}</span>
        </button>
      </div>

      {rtdbMode && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-2">
          <div className="rounded-xl border border-[#06B6D4]/30 bg-[#06B6D4]/10 px-3.5 py-2 text-[11px] text-[#0E7490] dark:text-[#67E8F9]">
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
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#F4F7FC]/95 dark:bg-[#070D1F]/95 backdrop-blur-md border-t border-[#2563EB]/20 grid grid-cols-6 items-center"
      >
        {navItems.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                active ? 'text-[#2563EB] dark:text-[#06B6D4] font-bold' : 'text-[#475569] dark:text-[#94A3B8]'
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
