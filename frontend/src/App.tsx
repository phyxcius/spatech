import React, { useEffect, useState } from 'react';
import { BadgeCheck, Briefcase, Compass, MapPinned, Moon, Shield, Siren, Sun, UserCheck } from 'lucide-react';
import { AdminPanel } from './components/AdminPanel.tsx';
import { BusinessPanel } from './components/BusinessPanel.tsx';
import { ClientPortal } from './components/ClientPortal.tsx';
import { GlowingNotificationCardHost } from './components/GlowingNotificationCard.tsx';
import { IdentityGateOverlay } from './components/IdentityGateOverlay.tsx';
import { OrderTracking } from './components/OrderTracking.tsx';
import {
  FloatingAvatarWidget,
  type AssistantDispatchEvent,
} from './components/RealisticHumanoidWidget.tsx';
import { isFirebaseRtdbMode, subscribeFirebaseRtdbMode } from './lib/firebaseRtdb.ts';
import type { PedidoPublico, Rubro, SharedCustomerDoc } from './types.ts';

type ViewMode = 'CONCIERGE' | 'SEGUIMIENTO' | 'NEGOCIO' | 'ADMIN';

export default function App() {
  const [view, setView] = useState<ViewMode>('CONCIERGE');
  const [darkMode, setDarkMode] = useState(true);
  const [customerDoc, setCustomerDoc] = useState<SharedCustomerDoc | null>(null);
  const [identityGateOpen, setIdentityGateOpen] = useState(false);
  const [lastOrderCodigo, setLastOrderCodigo] = useState<string | null>(null);
  const [lastOrderPin, setLastOrderPin] = useState<string | null>(null);
  const [assistantSignal, setAssistantSignal] = useState(0);
  const [sosSignal, setSosSignal] = useState(0);
  const [externalPrompt, setExternalPrompt] = useState<{
    seq: number;
    query: string;
    categoria?: Rubro;
  } | null>(null);
  const [rtdbMode, setRtdbMode] = useState(() => isFirebaseRtdbMode());

  useEffect(() => subscribeFirebaseRtdbMode(setRtdbMode), []);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  function handleCustomerDocVerified(doc: SharedCustomerDoc) {
    setCustomerDoc(doc);
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

  function handleFloatingAssistantDispatch(ev: AssistantDispatchEvent) {
    setView('CONCIERGE');
    setExternalPrompt((prev) => ({
      seq: (prev?.seq || 0) + 1,
      query: ev.query,
      categoria: ev.categoria,
    }));
  }

  const navItems: Array<{ id: ViewMode; label: string; icon: React.ReactNode }> = [
    { id: 'CONCIERGE', label: 'Concierge', icon: <Compass className="w-5 h-5" /> },
    { id: 'SEGUIMIENTO', label: 'Seguimiento', icon: <MapPinned className="w-5 h-5" /> },
    { id: 'NEGOCIO', label: 'Panel Negocio', icon: <Briefcase className="w-5 h-5" /> },
    { id: 'ADMIN', label: 'Administración', icon: <Shield className="w-5 h-5" /> },
  ];

  const showIdentityGate =
    (view === 'CONCIERGE' || view === 'SEGUIMIENTO') &&
    (!customerDoc?.verificado || identityGateOpen);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7F4] text-[#14171F] dark:bg-[#0B0E14] dark:text-[#F4F1EA] transition-colors">
      {/* Overlay obligatorio al ingresar al sistema para validar DNI, RUC o Extranjero */}
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
      <header className="sticky top-0 z-30 h-14 md:h-16 border-b border-black/10 dark:border-white/10 bg-[#F8F7F4]/90 dark:bg-[#0B0E14]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zona 1: Wordmark único */}
          <a
            href="#concierge"
            onClick={(e) => {
              e.preventDefault();
              setView('CONCIERGE');
            }}
            className="font-display text-2xl sm:text-3xl font-semibold tracking-tight whitespace-nowrap shrink-0 text-[#14171F] dark:text-[#F4F1EA]"
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
                  className={`py-1 whitespace-nowrap shrink-0 border-b transition-colors ${
                    active
                      ? 'border-[#D4AF37] text-[#14171F] dark:text-[#E5C158]'
                      : 'border-transparent text-[#6A717E] dark:text-[#98A0AD] hover:text-[#14171F] dark:hover:text-[#F4F1EA]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zona 3: Acciones rápidas SOS + Asistente Digital */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={triggerSosModal}
              aria-label="Solicitar emergencia SOS"
              className="min-h-[40px] px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black tracking-wide whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-sm"
            >
              <Siren className="w-3.5 h-3.5 animate-pulse" />
              <span>SOS</span>
            </button>
            <button
              type="button"
              onClick={triggerAssistantSphere}
              className="min-h-[40px] px-4 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-semibold whitespace-nowrap shrink-0 hover:opacity-90 transition-opacity"
            >
              Asistente
            </button>
          </div>
        </div>
      </header>

      {/* Barra superior con Titular Verificado + Selector de tema */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#6A717E] dark:text-[#98A0AD]">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <span>Cusco · Red Multinegocio Verificada</span>
          {customerDoc?.verificado ? (
            <button
              type="button"
              onClick={() => setIdentityGateOpen(true)}
              title="Cambiar documento del titular"
              className="min-h-[34px] px-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1.5 max-w-full"
            >
              <BadgeCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[230px] sm:max-w-xs">
                Titular: {customerDoc.nombre} · {customerDoc.tipo} {customerDoc.numero}
              </span>
              <span className="underline text-[11px] shrink-0">Cambiar</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIdentityGateOpen(true)}
              className="min-h-[34px] px-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-1.5"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Identificar Titular</span>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDarkMode((v) => !v)}
          className="min-h-[40px] px-3 rounded-xl border border-black/10 dark:border-white/10 flex items-center gap-1.5 hover:border-[#D4AF37]/50 transition-colors"
        >
          {darkMode ? <Sun className="w-3.5 h-3.5 text-[#D4AF37]" /> : <Moon className="w-3.5 h-3.5" />}
          <span>{darkMode ? 'Modo Claro' : 'Modo Oscuro'}</span>
        </button>
      </div>

      {rtdbMode && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-2">
          <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3.5 py-2 text-[11px] text-[#9A7B2C] dark:text-[#E5C158]">
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
            externalPromptSignal={externalPrompt}
          />
        )}
        {view === 'SEGUIMIENTO' && (
          <OrderTracking initialCodigo={lastOrderCodigo} clientPin={lastOrderPin} />
        )}
        {view === 'NEGOCIO' && <BusinessPanel />}
        {view === 'ADMIN' && <AdminPanel />}
      </main>

      {/* Widget Flotante Circular del Avatar Humanoide Realista (sin bordes cuadrados, minimizable y cerrable) */}
      <FloatingAvatarWidget
        hidden={view === 'NEGOCIO' || view === 'ADMIN'}
        onAssistantDispatch={handleFloatingAssistantDispatch}
      />

      {/* Navegación Inferior Móvil (Zona de pulgar con icono SOS directo) */}
      <nav
        aria-label="Navegación principal móvil"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#F8F7F4]/95 dark:bg-[#0B0E14]/95 backdrop-blur-md border-t border-black/10 dark:border-white/10 grid grid-cols-5 items-center"
      >
        {navItems.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                active ? 'text-[#9A7B2C] dark:text-[#E5C158]' : 'text-[#6A717E] dark:text-[#98A0AD]'
              }`}
            >
              {item.icon}
              <span className="truncate max-w-[68px]">
                {item.id === 'NEGOCIO' ? 'Negocio' : item.id === 'ADMIN' ? 'Admin' : item.label}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={triggerSosModal}
          aria-label="Solicitar emergencia SOS"
          className="h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-extrabold text-rose-500"
        >
          <Siren className="w-5 h-5" />
          <span>SOS</span>
        </button>
      </nav>
    </div>
  );
}
