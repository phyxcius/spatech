import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  Bookmark,
  Camera,
  Check,
  ChevronRight,
  Compass,
  CreditCard,
  FileText,
  FolderOpen,
  Globe2,
  HelpCircle,
  Image as ImageIcon,
  Info,
  KeyRound,
  Keyboard,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  Mic,
  Moon,
  Music,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  ScanLine,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smile,
  Sparkles,
  Sun,
  Tag,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch, speakSpanish } from '../lib/api.ts';
import { playWhatsAppNotificationSound } from '../lib/notificationSounds.ts';
import {
  formatSoles,
  RUBRO_LABELS,
  type ConciergeOpcion,
  type DirectorioNegocio,
  type Rubro,
  type UserAccount,
  type WeChatMessage,
} from '../types.ts';

export type WeChatWorkspaceTab = 'CHATS' | 'CONTACTOS' | 'DESCUBRIR' | 'YO';

interface WeChatWorkspaceProps {
  activeTab: WeChatWorkspaceTab;
  userToken: string;
  usuario: UserAccount;
  onUsuarioUpdated: (u: UserAccount) => void;
  onLogout: () => void;
  onSwitchAccount: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenConciergeQuery: (query: string, categoria?: Rubro) => void;
  onNavigateOperationalView: (
    view: 'CONCIERGE' | 'SEGUIMIENTO' | 'NEGOCIO' | 'CENTRAL_SOS' | 'ADMIN'
  ) => void;
}

interface ConversationSummary {
  id: string;
  title: string;
  subtitle: string;
  badgeText: string;
  isAgent?: boolean;
  isSystem?: boolean;
  negocio?: DirectorioNegocio;
}

const STICKER_PACK = [
  '👋 ¡Hola Cusco!',
  '🚕 Taxi por favor',
  '💊 Farmacia cercana',
  '🍽️ Almuerzo típico',
  '🛠️ Necesito técnico',
  '📍 Estoy en Plaza de Armas',
  '🙏 ¡Gracias!',
  '⛰️ Rumbo a Machu Picchu',
];

const LANGUAGES_LIST = ['Español', 'English', 'Português', 'Français', 'Italiano', 'Deutsch', '简体中文', '日本語'];

function isSafeImageUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) || /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(trimmed);
}

function formatMessageTime(iso: string): string {
  try {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function getInitials(name: string): string {
  const parts = String(name || 'LC').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || 'LC';
}

export const WeChatWorkspace: React.FC<WeChatWorkspaceProps> = ({
  activeTab,
  userToken,
  usuario,
  onUsuarioUpdated,
  onLogout,
  onSwitchAccount,
  darkMode,
  onToggleDarkMode,
  soundEnabled,
  onToggleSound,
  onOpenConciergeQuery,
  onNavigateOperationalView,
}) => {
  const [messages, setMessages] = useState<WeChatMessage[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [directorio, setDirectorio] = useState<DirectorioNegocio[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>('agente_chuspa');
  const [mobileThreadOpen, setMobileThreadOpen] = useState<boolean>(false);

  // Búsqueda y menús en Chats / Contactos
  const [chatSearch, setChatSearch] = useState('');
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [stickerTrayOpen, setStickerTrayOpen] = useState(false);
  const [attachTrayOpen, setAttachTrayOpen] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Contactos filter & submodals
  const [contactSearch, setContactSearch] = useState('');
  const [contactUtilityModal, setContactUtilityModal] = useState<string | null>(null);

  // Descubrir modales
  const [discoverModal, setDiscoverModal] = useState<
    'MOMENTOS' | 'CANALES' | 'ESCANEAR' | 'ARTICULOS' | 'CERCANOS' | null
  >(null);
  const [qrScanInput, setQrScanInput] = useState('');

  // Yo & Configuración sub-views
  const [meSubview, setMeSubview] = useState<
    'ROOT' | 'SETTINGS' | 'EDIT_PROFILE' | 'SECURITY' | 'QR' | 'FAVORITES' | 'ABOUT'
  >('ROOT');
  const [settingsSearch, setSettingsSearch] = useState('');
  const [statusInput, setStatusInput] = useState(usuario.estado_texto || '');
  const [editingStatus, setEditingStatus] = useState(false);

  // Edición perfil y contraseña
  const [editNombre, setEditNombre] = useState(usuario.nombre);
  const [editEstado, setEditEstado] = useState(usuario.estado_texto || '');
  const [editAvatar, setEditAvatar] = useState(usuario.avatar_url || '');
  const [editIdioma, setEditIdioma] = useState(usuario.idioma || 'Español');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [currPass, setCurrPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passSaving, setPassSaving] = useState(false);
  const [passMsg, setPassMsg] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditNombre(usuario.nombre);
    setEditEstado(usuario.estado_texto || '');
    setEditAvatar(usuario.avatar_url || '');
    setEditIdioma(usuario.idioma || 'Español');
    setStatusInput(usuario.estado_texto || '');
  }, [usuario]);

  async function loadChats() {
    setChatsLoading(true);
    try {
      const res = await apiFetch<{ mensajes: WeChatMessage[] }>('/api/usuario/chats', {
        token: userToken,
      });
      setMessages(res.mensajes || []);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'No se pudieron cargar los chats.');
    } finally {
      setChatsLoading(false);
    }
  }

  async function loadDirectorio() {
    try {
      const res = await apiFetch<{ negocios: DirectorioNegocio[] }>('/api/public/directorio');
      setDirectorio(res.negocios || []);
    } catch {
      // keep silent if offline
    }
  }

  useEffect(() => {
    void loadChats();
    void loadDirectorio();
  }, [userToken]);

  useEffect(() => {
    if (activeTab === 'CHATS') {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, activeConvId, activeTab]);

  // Reset sub-vista si usuario cambia a otra pestaña y vuelve
  useEffect(() => {
    if (activeTab !== 'YO' && meSubview !== 'ROOT') {
      setMeSubview('ROOT');
    }
  }, [activeTab]);

  const conversations: ConversationSummary[] = useMemo(() => {
    const base: ConversationSummary[] = [
      {
        id: 'agente_chuspa',
        title: 'Agente La Chuspa',
        subtitle: 'Concierge Solar Inca · Cusco',
        badgeText: 'IA',
        isAgent: true,
      },
      {
        id: 'equipo_chuspa',
        title: 'Equipo La Chuspa',
        subtitle: 'Seguridad RENIEC / WhatsApp',
        badgeText: 'LC',
        isSystem: true,
      },
    ];
    const bizConvs: ConversationSummary[] = directorio.slice(0, 12).map((n) => ({
      id: `negocio_${n.id}`,
      title: n.nombre,
      subtitle: `${RUBRO_LABELS[n.rubro] || n.rubro} · ${n.zona}`,
      badgeText: getInitials(n.nombre),
      negocio: n,
    }));
    const all = [...base, ...bizConvs];
    const q = chatSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (c) => c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q)
    );
  }, [directorio, chatSearch]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConvId) || conversations[0],
    [conversations, activeConvId]
  );

  const threadMessages = useMemo(
    () => messages.filter((m) => m.conversacion_id === activeConvId),
    [messages, activeConvId]
  );

  function getLastPreview(convId: string, fallback: string): { text: string; time: string } {
    const list = messages.filter((m) => m.conversacion_id === convId);
    if (list.length === 0) return { text: fallback, time: '' };
    const last = list[list.length - 1];
    return { text: last.texto, time: formatMessageTime(last.created_at) };
  }

  async function sendWeChatMessage(
    texto: string,
    tipoContenido: 'TEXTO' | 'VOZ' | 'UBICACION' | 'STICKER' | 'TARJETA' = 'TEXTO',
    extra?: { lat?: number; lng?: number; meta?: Record<string, unknown> }
  ) {
    const clean = texto.trim();
    if (!clean || sendingMsg) return;
    setSendingMsg(true);
    setChatError(null);
    setStickerTrayOpen(false);
    setAttachTrayOpen(false);
    try {
      const res = await apiFetch<{
        user_message: WeChatMessage;
        agent_message: WeChatMessage | null;
      }>('/api/usuario/chats/mensaje', {
        method: 'POST',
        token: userToken,
        body: {
          conversacion_id: activeConvId,
          tipo_contenido: tipoContenido,
          texto: clean,
          lat: extra?.lat,
          lng: extra?.lng,
          meta: extra?.meta,
        },
      });
      setMessages((prev) => {
        const next = [...prev, res.user_message];
        if (res.agent_message) next.push(res.agent_message);
        return next;
      });
      setComposerText('');
      if (soundEnabled) playWhatsAppNotificationSound();
      if (res.agent_message && activeConvId === 'agente_chuspa' && soundEnabled) {
        speakSpanish(res.agent_message.texto);
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje.');
    } finally {
      setSendingMsg(false);
    }
  }

  function handleVoiceHoldOrTap() {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setVoiceMode(false);
      void sendWeChatMessage('Quiero un taxi cerca de mi ubicación en Cusco', 'VOZ', {
        meta: { duracion_seg: 3 },
      });
      return;
    }
    if (voiceRecording) return;
    setVoiceRecording(true);
    try {
      const rec = new SpeechRec();
      rec.lang = 'es-PE';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (ev: any) => {
        const transcript = ev?.results?.[0]?.[0]?.transcript || '';
        setVoiceRecording(false);
        if (transcript.trim()) {
          void sendWeChatMessage(transcript.trim(), 'VOZ', { meta: { duracion_seg: 4 } });
        }
      };
      rec.onerror = () => {
        setVoiceRecording(false);
      };
      rec.onend = () => {
        setVoiceRecording(false);
      };
      rec.start();
    } catch {
      setVoiceRecording(false);
    }
  }

  function handleSendGpsLocation() {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void sendWeChatMessage(
            `Mi ubicación actual GPS (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`,
            'UBICACION',
            { lat: pos.coords.latitude, lng: pos.coords.longitude }
          );
        },
        () => {
          void sendWeChatMessage(
            'Mi ubicación de referencia: Plaza de Armas, Cusco (-13.5167, -71.9788)',
            'UBICACION',
            { lat: -13.5167, lng: -71.9788 }
          );
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else {
      void sendWeChatMessage(
        'Mi ubicación de referencia: Plaza de Armas, Cusco (-13.5167, -71.9788)',
        'UBICACION',
        { lat: -13.5167, lng: -71.9788 }
      );
    }
  }

  async function saveProfilePatch(patch: Partial<UserAccount>) {
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await apiFetch<{ usuario: UserAccount }>('/api/usuario/perfil', {
        method: 'PUT',
        token: userToken,
        body: patch,
      });
      onUsuarioUpdated(res.usuario);
      setProfileMsg('Cambios guardados correctamente.');
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : 'No se pudo actualizar el perfil.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassMsg(null);
    if (newPass.length < 6) {
      setPassMsg('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPass !== confirmPass) {
      setPassMsg('Las contraseñas nuevas no coinciden.');
      return;
    }
    setPassSaving(true);
    try {
      await apiFetch<{ ok: boolean }>('/api/usuario/password', {
        method: 'PUT',
        token: userToken,
        body: {
          current_password: currPass,
          new_password: newPass,
        },
      });
      setCurrPass('');
      setNewPass('');
      setConfirmPass('');
      setPassMsg('Contraseña actualizada correctamente.');
    } catch (err) {
      setPassMsg(err instanceof Error ? err.message : 'No se pudo actualizar la contraseña.');
    } finally {
      setPassSaving(false);
    }
  }

  const groupedContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const list = directorio.filter(
      (n) =>
        !q ||
        n.nombre.toLowerCase().includes(q) ||
        n.zona.toLowerCase().includes(q) ||
        (n.oficio_especifico || n.tipo_negocio || n.rubro).toLowerCase().includes(q)
    );
    const map = new Map<string, DirectorioNegocio[]>();
    list.forEach((item) => {
      const letter = (item.nombre.trim()[0] || '#').toUpperCase().replace(/[^A-Z]/, '#');
      const arr = map.get(letter) || [];
      arr.push(item);
      map.set(letter, arr);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [directorio, contactSearch]);

  const settingsEntries = useMemo(() => {
    const list = [
      {
        id: 'EDIT_PROFILE',
        label: 'Datos personales y avatar',
        desc: `${usuario.nombre} · ${usuario.wechat_id}`,
        icon: <UserCheck className="w-4 h-4 text-[#1565F5]" />,
        action: () => setMeSubview('EDIT_PROFILE'),
      },
      {
        id: 'SECURITY',
        label: 'Seguridad de la cuenta y contraseña',
        desc: `${usuario.documento_tipo} ${usuario.documento_numero} · WhatsApp verificado`,
        icon: <ShieldCheck className="w-4 h-4 text-[#07C160]" />,
        action: () => setMeSubview('SECURITY'),
      },
      {
        id: 'NOTIF',
        label: 'Notificaciones y sonido',
        desc: usuario.notificaciones_activas ? 'Activadas' : 'Silenciadas',
        icon: <Bell className="w-4 h-4 text-[#F5C400]" />,
        action: () => {
          onToggleSound();
          void saveProfilePatch({ notificaciones_activas: !usuario.notificaciones_activas });
        },
      },
      {
        id: 'THEME',
        label: 'Apariencia (Modo Oscuro / Claro)',
        desc: darkMode ? 'Modo Oscuro activo' : 'Modo Claro activo',
        icon: darkMode ? <Moon className="w-4 h-4 text-[#60A5FA]" /> : <Sun className="w-4 h-4 text-[#F5C400]" />,
        action: onToggleDarkMode,
      },
      {
        id: 'LANGUAGE',
        label: 'Idioma de la plataforma',
        desc: usuario.idioma || 'Español',
        icon: <Globe2 className="w-4 h-4 text-[#07C160]" />,
        action: () => setMeSubview('EDIT_PROFILE'),
      },
      {
        id: 'CHATS',
        label: 'Historial de chats',
        desc: 'Sincronizar mensajes con Agente La Chuspa',
        icon: <MessageCircle className="w-4 h-4 text-[#1565F5]" />,
        action: () => {
          void loadChats();
          setProfileMsg('Historial de chats actualizado.');
        },
      },
      {
        id: 'ABOUT',
        label: 'Acerca de La Chuspa',
        desc: 'Cusco Concierge & Red Multinegocio v2.6',
        icon: <Info className="w-4 h-4 text-[#6B7280]" />,
        action: () => setMeSubview('ABOUT'),
      },
    ];
    const q = settingsSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (item) => item.label.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q)
    );
  }, [usuario, darkMode, settingsSearch]);

  // ============================================================================
  // 1. PESTAÑA CHATS
  // ============================================================================
  if (activeTab === 'CHATS') {
    return (
      <div className="max-w-7xl mx-auto pb-20">
        <div className="rounded-3xl border border-[#D8E2EC] dark:border-[#064666] bg-white dark:bg-[#052030] overflow-hidden shadow-sm grid grid-cols-1 md:grid-cols-12 min-h-[calc(100vh-12.5rem)]">
          {/* Lista de Chats */}
          <aside
            className={`${
              mobileThreadOpen ? 'hidden md:flex' : 'flex'
            } md:col-span-4 lg:col-span-4 flex-col border-r border-[#E5E7EB] dark:border-[#064666] bg-white dark:bg-[#052030]`}
          >
            {/* Cabecera estilo WeChat */}
            <div className="px-4 py-3 bg-[#EDEDED] dark:bg-[#04334B] border-b border-black/5 dark:border-white/10 flex items-center justify-between relative">
              <h1 className="text-base font-bold text-[#111827] dark:text-white">Chats</h1>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void loadChats()}
                  aria-label="Actualizar chats"
                  className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#111827] dark:text-slate-200 hover:bg-black/5"
                >
                  <RefreshCw className={`w-4 h-4 ${chatsLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setPlusMenuOpen((v) => !v)}
                  aria-label="Menú rápido de WeChat"
                  className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#111827] dark:text-white hover:bg-black/5"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {plusMenuOpen && (
                <div className="absolute right-3 top-13 z-30 w-52 rounded-2xl bg-[#3A3A3A] text-white shadow-xl py-1.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      setActiveConvId('agente_chuspa');
                      setMobileThreadOpen(true);
                    }}
                    className="w-full min-h-[42px] px-4 flex items-center gap-3 hover:bg-white/10 text-left"
                  >
                    <MessageCircle className="w-4 h-4 text-[#07C160]" />
                    <span>Chat con Agente Solar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      setDiscoverModal('ESCANEAR');
                    }}
                    className="w-full min-h-[42px] px-4 flex items-center gap-3 hover:bg-white/10 text-left"
                  >
                    <ScanLine className="w-4 h-4 text-[#F5C400]" />
                    <span>Escanear QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      onNavigateOperationalView('SEGUIMIENTO');
                    }}
                    className="w-full min-h-[42px] px-4 flex items-center gap-3 hover:bg-white/10 text-left"
                  >
                    <Wallet className="w-4 h-4 text-[#60A5FA]" />
                    <span>Pagos / Seguimiento</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      onNavigateOperationalView('CENTRAL_SOS');
                    }}
                    className="w-full min-h-[42px] px-4 flex items-center gap-3 hover:bg-white/10 text-left text-rose-300"
                  >
                    <ShieldCheck className="w-4 h-4 text-rose-400" />
                    <span>Central Emergencias SOS</span>
                  </button>
                </div>
              )}
            </div>

            {/* Buscador */}
            <div className="p-2.5 bg-[#EDEDED] dark:bg-[#032334] border-b border-black/5 dark:border-white/10">
              <div className="flex items-center gap-2 px-3 rounded-xl bg-white dark:bg-[#052030]">
                <Search className="w-4 h-4 text-[#9CA3AF]" />
                <input
                  type="text"
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  placeholder="Buscar chat o comercio..."
                  className="w-full min-h-[38px] bg-transparent text-xs text-[#111827] dark:text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Filas de conversaciones */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#F3F4F6] dark:divide-white/5">
              {conversations.map((conv) => {
                const active = conv.id === activeConvId;
                const preview = getLastPreview(conv.id, conv.subtitle);
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => {
                      setActiveConvId(conv.id);
                      setMobileThreadOpen(true);
                    }}
                    className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                      active
                        ? 'bg-[#E5F7ED] dark:bg-[#04334B]'
                        : 'hover:bg-[#F9FAFB] dark:hover:bg-white/5'
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-xl shrink-0 flex items-center justify-center font-bold text-sm ${
                        conv.isAgent
                          ? 'bg-gradient-to-br from-[#04334B] to-[#1565F5] text-[#F5C400] border border-[#F5C400]/50'
                          : conv.isSystem
                          ? 'bg-[#07C160] text-white'
                          : 'bg-[#E5E7EB] dark:bg-[#064666] text-[#04334B] dark:text-white'
                      }`}
                    >
                      {conv.badgeText}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#111827] dark:text-white truncate">
                          {conv.title}
                        </span>
                        {preview.time && (
                          <span className="text-[11px] text-[#9CA3AF] shrink-0">{preview.time}</span>
                        )}
                      </div>
                      <p className="text-xs text-[#6B7280] dark:text-slate-300 truncate mt-0.5">
                        {preview.text}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Hilo de Conversación estilo WeChat */}
          <section
            className={`${
              mobileThreadOpen ? 'flex' : 'hidden md:flex'
            } md:col-span-8 lg:col-span-8 flex-col bg-[#EDEDED] dark:bg-[#031824]`}
          >
            {/* Header del hilo */}
            <div className="px-4 py-3 bg-[#EDEDED] dark:bg-[#04334B] border-b border-black/10 dark:border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileThreadOpen(false)}
                  aria-label="Volver a lista de chats"
                  className="md:hidden min-h-[40px] min-w-[40px] -ml-2 rounded-xl flex items-center justify-center text-[#111827] dark:text-white"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-[#111827] dark:text-white truncate">
                    {activeConversation?.title}
                  </h2>
                  <p className="text-[11px] text-[#6B7280] dark:text-slate-300 truncate">
                    {activeConversation?.subtitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigateOperationalView('CONCIERGE')}
                className="min-h-[38px] px-3 rounded-xl bg-[#04334B] dark:bg-[#F5C400] text-[#F5C400] dark:text-[#04334B] text-xs font-bold shrink-0 flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Disco Solar</span>
              </button>
            </div>

            {/* Burbujas de mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[60vh] md:max-h-[58vh]">
              {threadMessages.length === 0 ? (
                <div className="text-center py-12 text-xs text-[#6B7280] dark:text-slate-300 space-y-2">
                  <p className="font-semibold">Inicia la conversación con {activeConversation?.title}</p>
                  <p>
                    {activeConvId === 'agente_chuspa'
                      ? 'Prueba pidiendo: "Quiero un taxi a la Plaza de Armas", "Farmacia abierta" o "Necesito gasfitero".'
                      : 'Escribe una consulta sobre productos, horarios o reservas.'}
                  </p>
                </div>
              ) : (
                threadMessages.map((msg) => {
                  const isUser = msg.remitente === 'USER';
                  const opciones = (msg.meta?.opciones || []) as ConciergeOpcion[];
                  const alternativas = (msg.meta?.alternativas_otros_rubros || []) as ConciergeOpcion[];

                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      {/* Avatar */}
                      {isUser ? (
                        isSafeImageUrl(usuario.avatar_url) ? (
                          <img
                            src={usuario.avatar_url}
                            alt={usuario.nombre}
                            className="w-10 h-10 rounded-xl object-cover shrink-0 border border-black/10"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-[#04334B] text-[#F5C400] font-bold text-xs flex items-center justify-center shrink-0">
                            {getInitials(usuario.nombre)}
                          </div>
                        )
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#04334B] to-[#1565F5] text-[#F5C400] font-bold text-xs flex items-center justify-center shrink-0">
                          {activeConversation?.badgeText || 'LC'}
                        </div>
                      )}

                      {/* Burbuja */}
                      <div className={`max-w-[82%] space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-xs ${
                            isUser
                              ? 'bg-[#95EC69] text-[#111827] rounded-tr-xs'
                              : 'bg-white dark:bg-[#052030] text-[#111827] dark:text-slate-100 rounded-tl-xs border border-black/5 dark:border-white/10'
                          }`}
                        >
                          {msg.tipo_contenido === 'VOZ' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold opacity-75 mr-1.5">
                              <Mic className="w-3 h-3" /> Voz ·
                            </span>
                          )}
                          {msg.tipo_contenido === 'UBICACION' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold opacity-75 mr-1.5">
                              <MapPin className="w-3 h-3" /> GPS ·
                            </span>
                          )}
                          <span>{msg.texto}</span>
                        </div>

                        {/* Tarjetas estructuradas del Agente Concierge dentro del chat */}
                        {opciones.length > 0 && (
                          <div className="space-y-2">
                            {msg.meta?.rubro_solicitado && (
                              <p className="text-[11px] font-bold text-[#04334B] dark:text-[#F5C400]">
                                Sector: {msg.meta.rubro_solicitado}
                              </p>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {opciones.slice(0, 4).map((op, idx) => (
                                <div
                                  key={`${op.negocio_id}-${idx}`}
                                  className="rounded-xl bg-white dark:bg-[#052030] border border-[#D8E2EC] dark:border-[#064666] p-3 text-xs space-y-1.5 shadow-xs"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="font-bold text-[#0B2538] dark:text-white truncate">
                                      {op.titulo}
                                    </p>
                                    <span className="font-mono-tabular font-extrabold text-[#07C160] shrink-0">
                                      {op.precio_centavos > 0 ? formatSoles(op.precio_centavos) : 'Abierto'}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-[#516478] dark:text-slate-300 truncate">
                                    {op.negocio_nombre} · {op.zona || 'Cusco'} · ETA {op.eta_min} min
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => onOpenConciergeQuery(msg.texto, msg.meta?.categoria)}
                                    className="w-full min-h-[34px] rounded-lg bg-[#04334B] hover:bg-[#064666] text-[#F5C400] text-[11px] font-bold"
                                  >
                                    Solicitar / Ver en Disco Solar
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Alternativas de otros rubros claramente separadas */}
                        {msg.meta?.sin_resultados_exactos && alternativas.length > 0 && (
                          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/40 p-2.5 text-[11px] text-amber-900 dark:text-amber-200 space-y-1">
                            <p className="font-bold">Alternativas en otros rubros (no mezcladas):</p>
                            {alternativas.slice(0, 2).map((alt, idx) => (
                              <div key={idx} className="flex items-center justify-between gap-2">
                                <span className="truncate">
                                  {alt.negocio_nombre} ({alt.rubro_etiqueta || alt.categoria})
                                </span>
                                <span className="font-mono-tabular font-semibold">
                                  {formatSoles(alt.precio_centavos)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={threadEndRef} />
            </div>

            {chatError && (
              <div className="mx-4 mb-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                {chatError}
              </div>
            )}

            {/* Barra de entrada estilo WeChat (Voz / Texto / Emoji / + Adjuntos) */}
            <div className="bg-[#F7F7F7] dark:bg-[#04334B] border-t border-black/10 dark:border-white/10 p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setVoiceMode((v) => !v);
                    setStickerTrayOpen(false);
                    setAttachTrayOpen(false);
                  }}
                  aria-label={voiceMode ? 'Cambiar a teclado' : 'Cambiar a voz'}
                  className="min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center text-[#111827] dark:text-white hover:bg-black/5 shrink-0"
                >
                  {voiceMode ? <Keyboard className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                {voiceMode ? (
                  <button
                    type="button"
                    onClick={handleVoiceHoldOrTap}
                    disabled={sendingMsg}
                    className={`flex-1 min-h-[44px] rounded-xl border text-sm font-bold transition-colors ${
                      voiceRecording
                        ? 'bg-[#07C160] text-white border-[#07C160]'
                        : 'bg-white dark:bg-[#052030] text-[#111827] dark:text-white border-black/10 dark:border-white/15'
                    }`}
                  >
                    {voiceRecording ? 'Escuchando en Cusco... habla ahora' : 'Pulsa y habla'}
                  </button>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void sendWeChatMessage(composerText, 'TEXTO');
                    }}
                    className="flex-1 flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={composerText}
                      onChange={(e) => setComposerText(e.target.value)}
                      placeholder={
                        activeConvId === 'agente_chuspa'
                          ? 'Escribe taxi, farmacia, restaurante u oficio...'
                          : 'Escribe un mensaje...'
                      }
                      className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-white dark:bg-[#052030] text-sm text-[#111827] dark:text-white border border-black/10 dark:border-white/10 focus:outline-none"
                    />
                    {composerText.trim() && (
                      <button
                        type="submit"
                        disabled={sendingMsg}
                        className="min-h-[42px] px-3.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white text-xs font-bold flex items-center gap-1 shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Enviar</span>
                      </button>
                    )}
                  </form>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setStickerTrayOpen((v) => !v);
                    setAttachTrayOpen(false);
                  }}
                  aria-label="Calcomanías y stickers"
                  className="min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center text-[#111827] dark:text-white hover:bg-black/5 shrink-0"
                >
                  <Smile className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAttachTrayOpen((v) => !v);
                    setStickerTrayOpen(false);
                  }}
                  aria-label="Adjuntos y herramientas"
                  className="min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center text-[#111827] dark:text-white hover:bg-black/5 shrink-0"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* Bandeja de Calcomanías / Stickers */}
              {stickerTrayOpen && (
                <div className="pt-2 border-t border-black/10 dark:border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {STICKER_PACK.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => void sendWeChatMessage(st, 'STICKER', { meta: { sticker: st } })}
                      className="min-h-[40px] px-2.5 rounded-xl bg-white dark:bg-[#052030] border border-black/5 text-xs font-medium text-[#111827] dark:text-white hover:border-[#07C160] truncate"
                    >
                      {st}
                    </button>
                  ))}
                </div>
              )}

              {/* Bandeja + estilo WeChat (Galería, Cámara, Ubicación, Favoritos, Tarjeta, Archivos, Música) */}
              {attachTrayOpen && (
                <div className="pt-3 pb-1 border-t border-black/10 dark:border-white/10 grid grid-cols-4 gap-3 text-center">
                  <button
                    type="button"
                    onClick={() =>
                      void sendWeChatMessage('📎 Foto de galería enviada desde Cusco', 'TARJETA')
                    }
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span className="w-12 h-12 rounded-2xl bg-white dark:bg-[#052030] flex items-center justify-center text-[#1565F5] shadow-xs">
                      <ImageIcon className="w-5 h-5" />
                    </span>
                    <span className="text-[11px] text-[#4B5563] dark:text-slate-300">Galería</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void sendWeChatMessage('📷 Captura enviada en tiempo real', 'TARJETA')
                    }
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span className="w-12 h-12 rounded-2xl bg-white dark:bg-[#052030] flex items-center justify-center text-[#04334B] dark:text-[#F5C400] shadow-xs">
                      <Camera className="w-5 h-5" />
                    </span>
                    <span className="text-[11px] text-[#4B5563] dark:text-slate-300">Cámara</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSendGpsLocation}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span className="w-12 h-12 rounded-2xl bg-white dark:bg-[#052030] flex items-center justify-center text-[#07C160] shadow-xs">
                      <MapPin className="w-5 h-5" />
                    </span>
                    <span className="text-[11px] text-[#4B5563] dark:text-slate-300">Ubicación</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void sendWeChatMessage(
                        `🪪 Tarjeta de contacto: ${usuario.nombre} (${usuario.documento_tipo} ${usuario.documento_numero}) · WhatsApp ${usuario.whatsapp}`,
                        'TARJETA'
                      )
                    }
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span className="w-12 h-12 rounded-2xl bg-white dark:bg-[#052030] flex items-center justify-center text-[#1565F5] shadow-xs">
                      <CreditCard className="w-5 h-5" />
                    </span>
                    <span className="text-[11px] text-[#4B5563] dark:text-slate-300">Tarjeta</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void sendWeChatMessage('⭐ Lugar favorito compartido en Cusco', 'TARJETA')
                    }
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span className="w-12 h-12 rounded-2xl bg-white dark:bg-[#052030] flex items-center justify-center text-[#F5C400] shadow-xs">
                      <Bookmark className="w-5 h-5" />
                    </span>
                    <span className="text-[11px] text-[#4B5563] dark:text-slate-300">Favoritos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void sendWeChatMessage('📁 Comprobante / archivo adjunto', 'TARJETA')
                    }
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span className="w-12 h-12 rounded-2xl bg-white dark:bg-[#052030] flex items-center justify-center text-[#6B7280] dark:text-slate-200 shadow-xs">
                      <FolderOpen className="w-5 h-5" />
                    </span>
                    <span className="text-[11px] text-[#4B5563] dark:text-slate-300">Archivos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void sendWeChatMessage('🎵 Música Andina · El Cóndor Pasa (Cusco Mix)', 'TARJETA')
                    }
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span className="w-12 h-12 rounded-2xl bg-white dark:bg-[#052030] flex items-center justify-center text-rose-500 shadow-xs">
                      <Music className="w-5 h-5" />
                    </span>
                    <span className="text-[11px] text-[#4B5563] dark:text-slate-300">Música</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateOperationalView('SEGUIMIENTO')}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span className="w-12 h-12 rounded-2xl bg-white dark:bg-[#052030] flex items-center justify-center text-[#07C160] shadow-xs">
                      <Wallet className="w-5 h-5" />
                    </span>
                    <span className="text-[11px] text-[#4B5563] dark:text-slate-300">Pagos</span>
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 2. PESTAÑA CONTACTOS
  // ============================================================================
  if (activeTab === 'CONTACTOS') {
    return (
      <div className="max-w-4xl mx-auto pb-20 space-y-4">
        <div className="rounded-3xl border border-[#D8E2EC] dark:border-[#064666] bg-white dark:bg-[#052030] overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 bg-[#EDEDED] dark:bg-[#04334B] border-b border-black/5 dark:border-white/10 flex items-center justify-between">
            <h1 className="text-base font-bold text-[#111827] dark:text-white">Contactos</h1>
            <button
              type="button"
              onClick={() => setContactUtilityModal('Agregar contacto / negocio por código o WhatsApp')}
              aria-label="Agregar contacto"
              className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#111827] dark:text-white hover:bg-black/5"
            >
              <UserPlus className="w-5 h-5" />
            </button>
          </div>

          <div className="p-3 bg-[#EDEDED] dark:bg-[#032334] border-b border-black/5 dark:border-white/10">
            <div className="flex items-center gap-2 px-3 rounded-xl bg-white dark:bg-[#052030]">
              <Search className="w-4 h-4 text-[#9CA3AF]" />
              <input
                type="text"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Buscar negocio, taxista, oficio o contacto..."
                className="w-full min-h-[40px] bg-transparent text-xs text-[#111827] dark:text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Accesos rápidos estilo WeChat */}
          <div className="divide-y divide-[#F3F4F6] dark:divide-white/5">
            {[
              {
                label: 'Nuevos amigos',
                icon: <UserPlus className="w-5 h-5 text-white" />,
                bg: 'bg-[#FA9D3B]',
                onClick: () => setContactUtilityModal('Solicitudes recientes y referidos verificados de Cusco.'),
              },
              {
                label: 'Chat de grupo',
                icon: <Users className="w-5 h-5 text-white" />,
                bg: 'bg-[#07C160]',
                onClick: () => onNavigateOperationalView('CONCIERGE'),
              },
              {
                label: 'Etiquetas de rubros',
                icon: <Tag className="w-5 h-5 text-white" />,
                bg: 'bg-[#2782D7]',
                onClick: () => setContactUtilityModal('Taxis VIP, Boticas 24h, Restaurantes, Hoteles y Oficios.'),
              },
              {
                label: 'Equipo La Chuspa',
                icon: <ShieldCheck className="w-5 h-5 text-[#04334B]" />,
                bg: 'bg-[#F5C400]',
                onClick: () => {
                  setActiveConvId('equipo_chuspa');
                  setMobileThreadOpen(true);
                  setContactUtilityModal(null);
                },
              },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="w-full min-h-[56px] px-4 flex items-center gap-3.5 text-left hover:bg-[#F9FAFB] dark:hover:bg-white/5"
              >
                <span className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
                  {item.icon}
                </span>
                <span className="text-sm font-semibold text-[#111827] dark:text-white flex-1">
                  {item.label}
                </span>
                <ChevronRight className="w-4 h-4 text-[#9CA3AF]" />
              </button>
            ))}
          </div>

          {/* Directorio alfabético */}
          {groupedContacts.map(([letter, items]) => (
            <div key={letter}>
              <div className="px-4 py-1.5 bg-[#F3F4F6] dark:bg-[#031B29] text-xs font-bold text-[#6B7280] dark:text-slate-300">
                {letter}
              </div>
              <div className="divide-y divide-[#F3F4F6] dark:divide-white/5">
                {items.map((biz) => (
                  <button
                    key={biz.id}
                    type="button"
                    onClick={() => {
                      setActiveConvId(`negocio_${biz.id}`);
                      setMobileThreadOpen(true);
                      onOpenConciergeQuery(biz.nombre, biz.rubro);
                    }}
                    className="w-full min-h-[58px] px-4 flex items-center gap-3.5 text-left hover:bg-[#F9FAFB] dark:hover:bg-white/5"
                  >
                    <span className="w-10 h-10 rounded-xl bg-[#04334B] text-[#F5C400] font-bold text-xs flex items-center justify-center shrink-0">
                      {getInitials(biz.nombre)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#111827] dark:text-white truncate">
                        {biz.nombre}
                      </p>
                      <p className="text-[11px] text-[#6B7280] dark:text-slate-300 truncate">
                        {biz.oficio_especifico || biz.tipo_negocio || RUBRO_LABELS[biz.rubro]} · {biz.zona}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {contactUtilityModal && (
          <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#052030] p-6 space-y-4 shadow-xl">
              <h3 className="text-base font-bold text-[#111827] dark:text-white">Contactos La Chuspa</h3>
              <p className="text-xs text-[#4B5563] dark:text-slate-300 leading-relaxed">
                {contactUtilityModal}
              </p>
              <button
                type="button"
                onClick={() => setContactUtilityModal(null)}
                className="w-full min-h-[44px] rounded-xl bg-[#07C160] text-white text-xs font-bold"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 3. PESTAÑA DESCUBRIR
  // ============================================================================
  if (activeTab === 'DESCUBRIR') {
    const discoverItems = [
      {
        id: 'MOMENTOS' as const,
        label: 'Momentos de Cusco',
        desc: 'Novedades en vivo de comercios, tours y ofertas del día',
        icon: <Compass className="w-5 h-5 text-[#1565F5]" />,
        onClick: () => setDiscoverModal('MOMENTOS'),
      },
      {
        id: 'CANALES' as const,
        label: 'Canales y Oficios',
        desc: 'Explora sastrerías, gasfiteros, boticas, restaurantes y taxis',
        icon: <Radio className="w-5 h-5 text-[#FA9D3B]" />,
        onClick: () => setDiscoverModal('CANALES'),
      },
      {
        id: 'ESCANEAR' as const,
        label: 'Escanear QR La Chuspa',
        desc: 'Escanea o ingresa un código de comercio, orden o taxi',
        icon: <ScanLine className="w-5 h-5 text-[#2782D7]" />,
        onClick: () => setDiscoverModal('ESCANEAR'),
      },
      {
        id: 'BUSCAR' as const,
        label: 'Buscar con Disco Solar',
        desc: 'Abre el Concierge de voz y búsqueda inteligente',
        icon: <Search className="w-5 h-5 text-[#F5C400]" />,
        onClick: () => onNavigateOperationalView('CONCIERGE'),
      },
      {
        id: 'CERCANOS' as const,
        label: 'Negocios y unidades cercanas',
        desc: `${directorio.length} comercios activos alrededor de tu zona`,
        icon: <MapPin className="w-5 h-5 text-[#07C160]" />,
        onClick: () => setDiscoverModal('CERCANOS'),
      },
    ];

    return (
      <div className="max-w-4xl mx-auto pb-20 space-y-4">
        <div className="rounded-3xl border border-[#D8E2EC] dark:border-[#064666] bg-white dark:bg-[#052030] overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 bg-[#EDEDED] dark:bg-[#04334B] border-b border-black/5 dark:border-white/10">
            <h1 className="text-base font-bold text-[#111827] dark:text-white">Descubrir</h1>
          </div>
          <div className="divide-y divide-[#F3F4F6] dark:divide-white/5">
            {discoverItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className="w-full min-h-[64px] px-5 py-3 flex items-center gap-4 text-left hover:bg-[#F9FAFB] dark:hover:bg-white/5"
              >
                <span className="w-10 h-10 rounded-xl bg-[#F3F4F6] dark:bg-[#031B29] flex items-center justify-center shrink-0">
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#111827] dark:text-white">{item.label}</p>
                  <p className="text-xs text-[#6B7280] dark:text-slate-300 truncate">{item.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#9CA3AF]" />
              </button>
            ))}
          </div>
        </div>

        {discoverModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#052030] text-[#111827] dark:text-white overflow-hidden shadow-2xl border border-black/10">
              <div className="px-5 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
                <h3 className="text-base font-bold">
                  {discoverModal === 'MOMENTOS'
                    ? 'Momentos en Cusco'
                    : discoverModal === 'CANALES'
                    ? 'Canales & Oficios Verificados'
                    : discoverModal === 'ESCANEAR'
                    ? 'Escanear QR La Chuspa'
                    : 'Negocios cercanos en Cusco'}
                </h3>
                <button
                  type="button"
                  onClick={() => setDiscoverModal(null)}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#6B7280]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 max-h-[65vh] overflow-y-auto space-y-3">
                {discoverModal === 'ESCANEAR' ? (
                  <div className="space-y-4 text-center">
                    <div className="w-36 h-36 mx-auto rounded-2xl border-2 border-dashed border-[#07C160] flex flex-col items-center justify-center gap-2 text-[#07C160] bg-[#07C160]/5">
                      <QrCode className="w-12 h-12" />
                      <span className="text-xs font-semibold">Escáner activo</span>
                    </div>
                    <input
                      type="text"
                      value={qrScanInput}
                      onChange={(e) => setQrScanInput(e.target.value)}
                      placeholder="Ingresa código de comercio o orden (ej. ORD-...)"
                      className="w-full min-h-[44px] px-4 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-transparent text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const q = qrScanInput.trim() || 'restaurante centro cusco';
                        setDiscoverModal(null);
                        onOpenConciergeQuery(q);
                      }}
                      className="w-full min-h-[46px] rounded-xl bg-[#07C160] text-white text-sm font-bold"
                    >
                      Buscar código en La Chuspa
                    </button>
                  </div>
                ) : (
                  directorio.slice(0, 8).map((n) => (
                    <div
                      key={n.id}
                      className="rounded-2xl border border-[#E5E7EB] dark:border-white/10 p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{n.nombre}</p>
                        <p className="text-xs text-[#6B7280] dark:text-slate-300 truncate">
                          {n.oficio_especifico || n.tipo_negocio || RUBRO_LABELS[n.rubro]} · {n.zona}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDiscoverModal(null);
                          onOpenConciergeQuery(n.nombre, n.rubro);
                        }}
                        className="min-h-[38px] px-3 rounded-xl bg-[#04334B] text-[#F5C400] text-xs font-bold shrink-0"
                      >
                        Abrir
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 4. PESTAÑA YO + CONFIGURACIÓN COMPLETA
  // ============================================================================
  return (
    <div className="max-w-4xl mx-auto pb-20 space-y-4">
      {meSubview === 'ROOT' && (
        <>
          {/* Cabecera Perfil estilo WeChat */}
          <div className="rounded-3xl border border-[#D8E2EC] dark:border-[#064666] bg-white dark:bg-[#052030] p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                {isSafeImageUrl(usuario.avatar_url) ? (
                  <img
                    src={usuario.avatar_url}
                    alt={usuario.nombre}
                    className="w-16 h-16 rounded-2xl object-cover shrink-0 border border-black/10"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-[#04334B] text-[#F5C400] text-xl font-bold flex items-center justify-center shrink-0">
                    {getInitials(usuario.nombre)}
                  </div>
                )}
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg sm:text-xl font-bold text-[#111827] dark:text-white truncate">
                      {usuario.nombre}
                    </h1>
                    <BadgeCheck className="w-4 h-4 text-[#07C160] shrink-0" />
                  </div>
                  <p className="text-xs text-[#6B7280] dark:text-slate-300 font-mono-tabular truncate">
                    ID La Chuspa: {usuario.wechat_id}
                  </p>
                  <p className="text-xs text-[#516478] dark:text-slate-300 truncate">
                    {usuario.documento_tipo} {usuario.documento_numero} · {usuario.whatsapp}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingStatus((v) => !v)}
                  className="min-h-[38px] px-3 rounded-full border border-[#D8E2EC] dark:border-white/15 text-xs font-semibold text-[#516478] dark:text-slate-200 flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{usuario.estado_texto ? usuario.estado_texto : 'Estado'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMeSubview('QR')}
                  aria-label="Código QR personal"
                  className="min-h-[40px] min-w-[40px] rounded-xl border border-[#D8E2EC] dark:border-white/15 flex items-center justify-center text-[#111827] dark:text-white"
                >
                  <QrCode className="w-5 h-5" />
                </button>
              </div>
            </div>

            {editingStatus && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setEditingStatus(false);
                  void saveProfilePatch({ estado_texto: statusInput });
                }}
                className="mt-4 pt-4 border-t border-black/5 dark:border-white/10 flex items-center gap-2"
              >
                <input
                  type="text"
                  maxLength={80}
                  value={statusInput}
                  onChange={(e) => setStatusInput(e.target.value)}
                  placeholder="Ej: Visitando Machu Picchu, disponible por WhatsApp"
                  className="flex-1 min-h-[40px] px-3 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-transparent text-xs"
                />
                <button
                  type="submit"
                  className="min-h-[40px] px-4 rounded-xl bg-[#07C160] text-white text-xs font-bold"
                >
                  Guardar estado
                </button>
              </form>
            )}
          </div>

          {/* Lista de opciones de Yo */}
          <div className="rounded-3xl border border-[#D8E2EC] dark:border-[#064666] bg-white dark:bg-[#052030] overflow-hidden shadow-sm divide-y divide-[#F3F4F6] dark:divide-white/5">
            <button
              type="button"
              onClick={() => onNavigateOperationalView('SEGUIMIENTO')}
              className="w-full min-h-[58px] px-5 flex items-center gap-3.5 text-left hover:bg-[#F9FAFB] dark:hover:bg-white/5"
            >
              <Wallet className="w-5 h-5 text-[#07C160] shrink-0" />
              <span className="flex-1 text-sm font-semibold text-[#111827] dark:text-white">
                Pagos, Yape y Seguimiento de Rutas
              </span>
              <ChevronRight className="w-4 h-4 text-[#9CA3AF]" />
            </button>
            <button
              type="button"
              onClick={() => setMeSubview('FAVORITES')}
              className="w-full min-h-[58px] px-5 flex items-center gap-3.5 text-left hover:bg-[#F9FAFB] dark:hover:bg-white/5"
            >
              <Bookmark className="w-5 h-5 text-[#FA9D3B] shrink-0" />
              <span className="flex-1 text-sm font-semibold text-[#111827] dark:text-white">
                Favoritos y Comprobantes
              </span>
              <ChevronRight className="w-4 h-4 text-[#9CA3AF]" />
            </button>
            <button
              type="button"
              onClick={() => setDiscoverModal('MOMENTOS')}
              className="w-full min-h-[58px] px-5 flex items-center gap-3.5 text-left hover:bg-[#F9FAFB] dark:hover:bg-white/5"
            >
              <ImageIcon className="w-5 h-5 text-[#1565F5] shrink-0" />
              <span className="flex-1 text-sm font-semibold text-[#111827] dark:text-white">
                Mis publicaciones
              </span>
              <ChevronRight className="w-4 h-4 text-[#9CA3AF]" />
            </button>
            <button
              type="button"
              onClick={() => setMeSubview('SETTINGS')}
              className="w-full min-h-[58px] px-5 flex items-center gap-3.5 text-left hover:bg-[#F9FAFB] dark:hover:bg-white/5"
            >
              <Settings className="w-5 h-5 text-[#2782D7] shrink-0" />
              <span className="flex-1 text-sm font-semibold text-[#111827] dark:text-white">
                Configuración
              </span>
              <ChevronRight className="w-4 h-4 text-[#9CA3AF]" />
            </button>
          </div>
        </>
      )}

      {/* Sub-vista CONFIGURACIÓN (idéntica a las capturas de WeChat Configuración) */}
      {meSubview === 'SETTINGS' && (
        <div className="rounded-3xl border border-[#D8E2EC] dark:border-[#064666] bg-white dark:bg-[#052030] overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-[#EDEDED] dark:bg-[#04334B] border-b border-black/5 dark:border-white/10 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMeSubview('ROOT')}
              className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#111827] dark:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold text-[#111827] dark:text-white">Configuración</h2>
          </div>

          <div className="p-3 bg-[#EDEDED] dark:bg-[#032334] border-b border-black/5 dark:border-white/10">
            <div className="flex items-center gap-2 px-3 rounded-xl bg-white dark:bg-[#052030]">
              <Search className="w-4 h-4 text-[#9CA3AF]" />
              <input
                type="text"
                value={settingsSearch}
                onChange={(e) => setSettingsSearch(e.target.value)}
                placeholder="Buscar en Configuración..."
                className="w-full min-h-[38px] bg-transparent text-xs focus:outline-none"
              />
            </div>
          </div>

          {profileMsg && (
            <div className="mx-4 mt-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200">
              {profileMsg}
            </div>
          )}

          <div className="divide-y divide-[#F3F4F6] dark:divide-white/5">
            {settingsEntries.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                className="w-full min-h-[60px] px-5 py-2.5 flex items-center gap-3.5 text-left hover:bg-[#F9FAFB] dark:hover:bg-white/5"
              >
                <span className="w-9 h-9 rounded-xl bg-[#F3F4F6] dark:bg-[#031B29] flex items-center justify-center shrink-0">
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#111827] dark:text-white">{item.label}</p>
                  <p className="text-xs text-[#6B7280] dark:text-slate-300 truncate">{item.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#9CA3AF]" />
              </button>
            ))}
          </div>

          {/* Botones finales: Cambiar de cuenta y Cerrar sesión */}
          <div className="p-4 space-y-2.5 bg-[#F9FAFB] dark:bg-[#031B29] border-t border-black/5 dark:border-white/10">
            <button
              type="button"
              onClick={onSwitchAccount}
              className="w-full min-h-[48px] rounded-xl bg-white dark:bg-[#052030] border border-[#E5E7EB] dark:border-white/10 text-sm font-semibold text-[#111827] dark:text-white hover:bg-black/5"
            >
              Cambiar de cuenta
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="w-full min-h-[48px] rounded-xl bg-white dark:bg-[#052030] border border-rose-200 dark:border-rose-700/40 text-sm font-bold text-rose-600 dark:text-rose-400 flex items-center justify-center gap-2 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      )}

      {/* Sub-vista EDITAR PERFIL */}
      {meSubview === 'EDIT_PROFILE' && (
        <div className="rounded-3xl border border-[#D8E2EC] dark:border-[#064666] bg-white dark:bg-[#052030] p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMeSubview('SETTINGS')}
              className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold">Datos personales</h2>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveProfilePatch({
                nombre: editNombre,
                estado_texto: editEstado,
                avatar_url: editAvatar,
                idioma: editIdioma,
              });
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold mb-1">Nombre completo</label>
              <input
                type="text"
                required
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Estado</label>
              <input
                type="text"
                value={editEstado}
                onChange={(e) => setEditEstado(e.target.value)}
                placeholder="Ej: De viaje por Cusco"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">URL de foto de perfil (opcional)</label>
              <input
                type="url"
                value={editAvatar}
                onChange={(e) => setEditAvatar(e.target.value)}
                placeholder="https://..."
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Idioma</label>
              <select
                value={editIdioma}
                onChange={(e) => setEditIdioma(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-white dark:bg-[#031622] text-sm"
              >
                {LANGUAGES_LIST.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {profileMsg && <p className="text-xs text-[#07C160] font-semibold">{profileMsg}</p>}
            <button
              type="submit"
              disabled={profileSaving}
              className="w-full min-h-[46px] rounded-xl bg-[#07C160] text-white text-sm font-bold disabled:opacity-60"
            >
              {profileSaving ? 'Guardando...' : 'Guardar perfil'}
            </button>
          </form>
        </div>
      )}

      {/* Sub-vista SEGURIDAD DE LA CUENTA */}
      {meSubview === 'SECURITY' && (
        <div className="rounded-3xl border border-[#D8E2EC] dark:border-[#064666] bg-white dark:bg-[#052030] p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMeSubview('SETTINGS')}
              className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold">Seguridad de la cuenta</h2>
          </div>

          <div className="rounded-2xl bg-[#F7FAFC] dark:bg-[#031B29] p-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[#6B7280] dark:text-slate-300">Documento sincronizado</span>
              <span className="font-mono-tabular font-bold">
                {usuario.documento_tipo} · {usuario.documento_numero}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280] dark:text-slate-300">WhatsApp validado</span>
              <span className="font-mono-tabular font-bold text-[#07C160]">{usuario.whatsapp}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6B7280] dark:text-slate-300">ID La Chuspa</span>
              <span className="font-mono-tabular">{usuario.wechat_id}</span>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-3.5">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-[#07C160]" />
              <span>Cambiar contraseña</span>
            </h3>
            <input
              type="password"
              required
              value={currPass}
              onChange={(e) => setCurrPass(e.target.value)}
              placeholder="Contraseña actual"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-transparent text-sm"
            />
            <input
              type="password"
              required
              minLength={6}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="Nueva contraseña (mín. 6 caracteres)"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-transparent text-sm"
            />
            <input
              type="password"
              required
              minLength={6}
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              placeholder="Confirmar nueva contraseña"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#D8E2EC] dark:border-white/15 bg-transparent text-sm"
            />
            {passMsg && <p className="text-xs font-semibold text-[#1565F5]">{passMsg}</p>}
            <button
              type="submit"
              disabled={passSaving}
              className="w-full min-h-[46px] rounded-xl bg-[#04334B] text-[#F5C400] text-sm font-bold disabled:opacity-60"
            >
              {passSaving ? 'Actualizando...' : 'Actualizar contraseña'}
            </button>
          </form>
        </div>
      )}

      {/* Sub-vista QR PERSONAL */}
      {meSubview === 'QR' && (
        <div className="rounded-3xl border border-[#D8E2EC] dark:border-[#064666] bg-white dark:bg-[#052030] p-6 text-center space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-left">
            <button
              type="button"
              onClick={() => setMeSubview('ROOT')}
              className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold">Mi código QR La Chuspa</h2>
          </div>
          <div className="w-44 h-44 mx-auto rounded-2xl border-2 border-[#04334B] dark:border-[#F5C400] p-4 flex flex-col items-center justify-center gap-2 bg-[#F7FAFC] dark:bg-[#031B29]">
            <QrCode className="w-24 h-24 text-[#04334B] dark:text-[#F5C400]" />
            <span className="text-[11px] font-mono-tabular font-bold truncate max-w-full">
              {usuario.wechat_id}
            </span>
          </div>
          <p className="text-xs text-[#6B7280] dark:text-slate-300">
            Muestra este código en comercios o taxis asociados para asociar tu identidad {usuario.documento_tipo}{' '}
            {usuario.documento_numero}.
          </p>
        </div>
      )}

      {/* Sub-vista FAVORITOS / ACERCA */}
      {(meSubview === 'FAVORITES' || meSubview === 'ABOUT') && (
        <div className="rounded-3xl border border-[#D8E2EC] dark:border-[#064666] bg-white dark:bg-[#052030] p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMeSubview(meSubview === 'ABOUT' ? 'SETTINGS' : 'ROOT')}
              className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold">
              {meSubview === 'ABOUT' ? 'Acerca de La Chuspa' : 'Favoritos y Comprobantes'}
            </h2>
          </div>
          {meSubview === 'ABOUT' ? (
            <div className="text-xs text-[#4B5563] dark:text-slate-300 space-y-2 leading-relaxed">
              <p className="font-bold text-sm text-[#04334B] dark:text-[#F5C400]">
                La Chuspa Cusco · Plataforma Multinegocio &amp; Concierge WeChat Style
              </p>
              <p>
                Integra identidad verificada RENIEC / SUNAT / Pasaporte, validación de seguridad por WhatsApp, chat en vivo con el Agente Disco Solar Inca, taxis InDrive, comparador de mercados, oficios universales y central de emergencias SOS.
              </p>
            </div>
          ) : (
            <div className="text-xs text-[#4B5563] dark:text-slate-300 space-y-3">
              <p>
                Tus pedidos recientes y comprobantes electrónicos quedan vinculados a tu documento{' '}
                <strong>
                  {usuario.documento_tipo} {usuario.documento_numero}
                </strong>
                .
              </p>
              <button
                type="button"
                onClick={() => onNavigateOperationalView('SEGUIMIENTO')}
                className="min-h-[42px] px-4 rounded-xl bg-[#04334B] text-[#F5C400] text-xs font-bold"
              >
                Ir a Seguimiento y Comprobantes
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
