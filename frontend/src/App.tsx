import React, { useEffect, useState } from 'react';
import { Briefcase, Compass, MapPinned, Moon, Shield, Sparkles, Sun } from 'lucide-react';
import { AdminPanel } from './components/AdminPanel.tsx';
import { BusinessPanel } from './components/BusinessPanel.tsx';
import { ClientPortal } from './components/ClientPortal.tsx';
import { OrderTracking } from './components/OrderTracking.tsx';
import { isFirebaseRtdbMode, subscribeFirebaseRtdbMode } from './lib/firebaseRtdb.ts';
import type { PedidoPublico } from './types.ts';

type ViewMode = 'CONCIERGE' | 'SEGUIMIENTO' | 'NEGOCIO' | 'ADMIN';

export default function App() {
  const [view, setView] = useState<ViewMode>('CONCIERGE');
  const [darkMode, setDarkMode] = useState(true);
  const [lastOrderCodigo, setLastOrderCodigo] = useState<string | null>(null);
  const [lastOrderPin, setLastOrderPin] = useState<string | null>(null);
  const [assistantSignal, setAssistantSignal] = useState(0);
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

  function handleOrderCreated(pedido: PedidoPublico, pin: string) {
    setLastOrderCodigo(pedido.codigo);
    setLastOrderPin(pin);
    setView('SEGUIMIENTO');
  }

  function triggerAssistantSphere() {
    setView('CONCIERGE');
    setAssistantSignal((n) => n + 1);
  }

  const navItems: Array<{ id: ViewMode; label: string; icon: React.ReactNode }> = [
    { id: 'CONCIERGE', label: 'Concierge', icon: <Compass className="w-5 h-5" /> },
    { id: 'SEGUIMIENTO', label: 'Seguimiento', icon: <MapPinned className="w-5 h-5" /> },
    { id: 'NEGOCIO', label: 'Panel Negocio', icon: <Briefcase className="w-5 h-5" /> },
    { id: 'ADMIN', label: 'Administración', icon: <Shield className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7F4] text-[#14171F] dark:bg-[#0B0E14] dark:text-[#F4F1EA] transition-colors">
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

          {/* Zona 3: 1 acción primaria */}
          <button
            type="button"
            onClick={triggerAssistantSphere}
            className="min-h-[40px] px-4 rounded-xl bg-[#14213D] dark:bg-[#D4AF37] text-white dark:text-[#0B0E14] text-xs font-semibold whitespace-nowrap shrink-0 hover:opacity-90 transition-opacity"
          >
            Asistente
          </button>
        </div>
      </header>

      {/* Barra discreta de tema debajo del Top Bar */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4 flex items-center justify-between text-xs text-[#6A717E] dark:text-[#98A0AD]">
        <span>Cusco · Red Multinegocio Verificada</span>
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

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4">
        {view === 'CONCIERGE' && (
          <ClientPortal
            onOrderCreated={handleOrderCreated}
            openAssistantSignal={assistantSignal}
          />
        )}
        {view === 'SEGUIMIENTO' && (
          <OrderTracking initialCodigo={lastOrderCodigo} clientPin={lastOrderPin} />
        )}
        {view === 'NEGOCIO' && <BusinessPanel />}
        {view === 'ADMIN' && <AdminPanel />}
      </main>

      {/* Esfera Flotante del Asistente */}
      {view !== 'NEGOCIO' && view !== 'ADMIN' && (
        <button
          type="button"
          onClick={triggerAssistantSphere}
          aria-label="Abrir esfera del asistente La Chuspa"
          title="Abrir asistente La Chuspa"
          className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-[#14213D] via-[#1C2A4D] to-[#C81E5B] dark:from-[#D4AF37] dark:via-[#B8860B] dark:to-[#14213D] text-white shadow-xl border border-white/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      )}

      {/* Navegación Inferior Móvil (Zona de pulgar) */}
      <nav
        aria-label="Navegación principal móvil"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#F8F7F4]/95 dark:bg-[#0B0E14]/95 backdrop-blur-md border-t border-black/10 dark:border-white/10 grid grid-cols-4 items-center"
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
              <span className="truncate max-w-[72px]">
                {item.id === 'NEGOCIO' ? 'Negocio' : item.id === 'ADMIN' ? 'Admin' : item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
