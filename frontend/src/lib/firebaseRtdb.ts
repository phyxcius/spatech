import {
  MACRO_CATEGORIAS_UNIVERSALES,
  type AiBusinessPanelSchema,
  type ConciergeOpcion,
  type EntidadEmergencia,
  type EstadoRegla,
  type MetodoPago,
  type OficioNormalizado,
  type PedidoPublico,
  type Rubro,
} from '../types.ts';
import { buildClientFallbackPanelForRubro } from './aiPanelBuilder.ts';
import {
  buildUniversalOficioClientFallback,
  findExactOrSynonymOficioClient,
  searchOficiosLocal,
  UNIVERSAL_OFICIOS_CLIENT_SEED,
} from './oficiosUniversal.ts';
import {
  classifyRecordSectorClient,
  detectConciergeIntent,
  detectSectorIntent,
  extractCuscoDestination,
  resolveCuscoDestination,
  SECTOR_LABELS,
  type SectorKey,
} from './cuscoMarkets.ts';
import {
  formatPeruLookupError,
  type PeruDocumentLookupResult,
} from './peruDocs.ts';
import {
  consultarDNI,
  consultarRUC,
  guardarTokenEnFirebase,
  leerDevApiConfig,
  type ProveedorConsultas,
} from './reniecSunatService.ts';

const DEFAULT_RTDB_URL = 'https://spatech-b3edf-default-rtdb.firebaseio.com';
const envRtdbUrl = (
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_FIREBASE_RTDB_URL || ''
)
  .trim()
  .replace(/\/$/, '');
export const FIREBASE_RTDB_URL = /^https?:\/\/[a-z0-9.-]+/i.test(envRtdbUrl)
  ? envRtdbUrl
  : DEFAULT_RTDB_URL;

let rtdbModeActive = false;
const listeners = new Set<(active: boolean) => void>();

export function isFirebaseRtdbMode(): boolean {
  return rtdbModeActive;
}

export function setFirebaseRtdbMode(active: boolean): void {
  if (rtdbModeActive !== active) {
    rtdbModeActive = active;
    listeners.forEach((cb) => cb(active));
  }
}

export function subscribeFirebaseRtdbMode(cb: (active: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Suscripción en tiempo real a Firebase Realtime Database mediante Server-Sent Events (REST streaming).
 */
export function subscribeFirebaseRtdbPath(
  nodePath: string,
  onChange: () => void
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }
  const clean = nodePath.replace(/^\/+/, '');
  const streamUrl = `${FIREBASE_RTDB_URL}/lachuspa/${clean}.json`;
  let es: EventSource | null = null;
  let initialized = false;
  try {
    es = new EventSource(streamUrl);
    const handler = () => {
      if (!initialized) {
        initialized = true;
        return;
      }
      onChange();
    };
    es.addEventListener('put', handler);
    es.addEventListener('patch', handler);
  } catch {
    return () => {};
  }
  return () => {
    try {
      es?.close();
    } catch {
      // ignore
    }
  };
}

interface RtdbNegocio {
  id: number;
  codigo: string;
  rubro: Rubro;
  nombre: string;
  telefono?: string;
  descripcion: string;
  lat: number;
  lng: number;
  zona: string;
  en_linea: number;
  activo: number;
  saldo: number;
  saldo_retenido: number;
  calificacion: number;
  horario_apertura?: string;
  horario_cierre?: string;
  abierto_24h?: number;
  metodos_pago_aceptados?: string;
  auto_aceptar_pedidos?: number;
  alerta_voz_activa?: number;
  tarifa_minima_centavos?: number;
  radio_cobertura_km?: number;
  tipo_persona?: 'NATURAL' | 'JURIDICA';
  documento_tipo?: 'DNI' | 'RUC';
  documento_numero?: string | null;
  razon_social?: string | null;
  tipo_negocio?: string;
  macro_categoria?: string;
  oficio_especifico?: string;
  oficio_id?: string;
  modalidades_venta?: string;
  panel_ia?: AiBusinessPanelSchema | null;
  mp_public_key?: string | null;
  mp_yape_configurado?: boolean;
  yape_numero?: string | null;
  plin_numero?: string | null;
  banco_nombre?: string | null;
  banco_titular?: string | null;
  banco_cuenta?: string | null;
  banco_cci?: string | null;
  estado_regla?: EstadoRegla;
  motivo_estado?: string | null;
  pin_salt: string;
  pin_hash: string;
}

interface RtdbUnidad {
  id: number;
  negocio_id: number;
  negocio_nombre: string;
  conductor_nombre: string;
  placa: string;
  modelo: string;
  color: string;
  tarifa_base_centavos: number;
  tarifa_km_centavos: number;
  calificacion: number;
  lat: number;
  lng: number;
  estado: 'DISPONIBLE' | 'OCUPADO' | 'FUERA_SERVICIO' | 'EN_RUTA';
  certificada: number;
}

interface RtdbServicio {
  id: number;
  negocio_id: number;
  negocio_nombre: string;
  zona: string;
  calificacion: number;
  categoria: Rubro;
  nombre: string;
  descripcion: string;
  precio_centavos: number;
  duracion_min: number;
  stock: number;
  unidad_medida?: string;
  atributos?: Record<string, string> | null;
  disponible: number;
}

interface RtdbDivisa {
  id: number;
  negocio_id: number;
  negocio_nombre: string;
  zona: string;
  moneda_origen: string;
  moneda_destino: string;
  tasa_compra: number;
  tasa_venta: number;
}

interface RtdbButaca {
  id: number;
  negocio_id: number;
  negocio_nombre: string;
  codigo_ruta: string;
  ruta: string;
  unidad: string;
  salida_at: string;
  precio_centavos: number;
  total_asientos: number;
  asientos_ocupados: number[];
}

interface RtdbPedido extends PedidoPublico {
  unidad_id?: number | null;
  pin_salt?: string;
  pin_hash?: string;
  intentos_pin: number;
  pin_bloqueado: number;
  comision_plataforma_centavos: number;
  comision_referido_centavos: number;
  comision_retenida_centavos: number;
}

interface RtdbMovimiento {
  id: number;
  cuenta_tipo: 'NEGOCIO' | 'PLATAFORMA';
  negocio_id?: number | null;
  negocio_nombre: string | null;
  tipo: string;
  monto_centavos: number;
  retenido_delta_centavos: number;
  saldo_posterior_centavos: number;
  referencia: string;
  motivo: string | null;
  created_at: string;
}

interface RtdbPartner {
  id: number;
  codigo: string;
  nombre: string;
  porcentaje_comision: number;
  pedidos_atribuidos: number;
  comision_acumulada_centavos: number;
}

interface RtdbSnapshot {
  meta?: { seeded: boolean; updated_at: string };
  admin?: { pin_salt: string; pin_hash: string; updated_at: string };
  negocios?: Record<string, RtdbNegocio> | RtdbNegocio[];
  unidades?: Record<string, RtdbUnidad> | RtdbUnidad[];
  servicios?: Record<string, RtdbServicio> | RtdbServicio[];
  divisas?: Record<string, RtdbDivisa> | RtdbDivisa[];
  butacas?: Record<string, RtdbButaca> | RtdbButaca[];
  pedidos?: Record<string, RtdbPedido>;
  emergencias?: Record<string, {
    id: number;
    codigo: string;
    cliente_nombre: string;
    cliente_telefono?: string;
    ubicacion_texto: string;
    lat?: number;
    lng?: number;
    mensaje: string;
    entidad_objetivo?: EntidadEmergencia;
    estado: 'ACTIVA' | 'ATENDIDA';
    atendida_por?: string | null;
    created_at: string;
  }>;
  recargas?: Record<string, {
    id: number;
    negocio_id: number;
    monto_centavos: number;
    metodo: string;
    codigo_operacion: string;
    estado: string;
    motivo_rechazo: string | null;
    created_at: string;
  }>;
  reglas?: Record<string, {
    rubro: Rubro;
    porcentaje_plataforma: number;
    porcentaje_referido: number;
  }>;
  movimientos?: Record<string, RtdbMovimiento>;
  partners?: Record<string, RtdbPartner>;
  resenas?: Record<string, unknown>;
  documentos?: Record<string, PeruDocumentLookupResult>;
  oficios_catalogo?: Record<string, OficioNormalizado> | OficioNormalizado[];
}

function toArray<T>(val: Record<string, T> | T[] | undefined | null): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return Object.values(val).filter(Boolean);
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return input;
}

async function hashPinBrowser(pin: string, salt?: string): Promise<{ salt: string; hash: string }> {
  const s = salt || `spatech-${Math.random().toString(36).slice(2, 10)}`;
  const hash = await sha256Hex(`${s}:${pin}`);
  return { salt: s, hash };
}

async function rtdbFetch<T>(nodePath: string, method: 'GET' | 'PUT' | 'PATCH' | 'POST' = 'GET', data?: unknown): Promise<T> {
  const clean = nodePath.replace(/^\/+/, '');
  const url = `${FIREBASE_RTDB_URL}/lachuspa/${clean}.json`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Error de Firebase RTDB (${res.status}): ${errText || res.statusText}`);
  }
  return (await res.json()) as T;
}

async function buildInitialSeed(): Promise<RtdbSnapshot> {
  const seedBizSpecs: Array<Omit<RtdbNegocio, 'pin_salt' | 'pin_hash'> & { demoPin: string }> = [
    {
      id: 1,
      codigo: 'NEG-TX-01',
      rubro: 'TRANSPORTE',
      nombre: 'Inka Executive Mobility',
      descripcion: 'Flota privada certificada con traslados ejecutivos aeropuerto, centro y Valle Sagrado.',
      lat: -13.5167,
      lng: -71.9788,
      zona: 'Plaza de Armas, Cusco',
      en_linea: 1,
      activo: 1,
      saldo: 18000,
      saldo_retenido: 0,
      calificacion: 4.95,
      demoPin: '2468',
    },
    {
      id: 2,
      codigo: 'NEG-TX-02',
      rubro: 'TRANSPORTE',
      nombre: 'Qorikancha Private Cars',
      descripcion: 'Sedanes ejecutivos y SUVs híbridas de recojo inmediato en Cusco.',
      lat: -13.5204,
      lng: -71.9752,
      zona: 'Av. El Sol, Cusco',
      en_linea: 1,
      activo: 1,
      saldo: 0,
      saldo_retenido: 0,
      calificacion: 4.82,
      demoPin: '1357',
    },
    {
      id: 3,
      codigo: 'NEG-TU-01',
      rubro: 'TURISMO',
      nombre: 'Apu Salkantay Atelier',
      descripcion: 'Guías oficiales bilingües y experiencias privadas en Machu Picchu, Maras y Moray.',
      lat: -13.5142,
      lng: -71.9815,
      zona: 'San Blas, Cusco',
      en_linea: 1,
      activo: 1,
      saldo: 32000,
      saldo_retenido: 0,
      calificacion: 4.98,
      demoPin: '3691',
    },
    {
      id: 4,
      codigo: 'NEG-TU-02',
      rubro: 'TURISMO',
      nombre: 'Andes Heritage Concierge',
      descripcion: 'Excursiones curadas al Valle Sagrado y Vinicunca con guía privado.',
      lat: -13.5189,
      lng: -71.9765,
      zona: 'Calle Palacio, Cusco',
      en_linea: 1,
      activo: 1,
      saldo: 25000,
      saldo_retenido: 0,
      calificacion: 4.91,
      demoPin: '4826',
    },
    {
      id: 5,
      codigo: 'NEG-RE-01',
      rubro: 'RESTAURANTE',
      nombre: 'Cicciolina & Brasa Andina',
      descripcion: 'Alta cocina cusqueña contemporánea, tapas andinas y cava privada.',
      lat: -13.5153,
      lng: -71.9768,
      zona: 'Calle Triunfo, Cusco',
      en_linea: 1,
      activo: 1,
      saldo: 24000,
      saldo_retenido: 0,
      calificacion: 4.96,
      demoPin: '5792',
    },
    {
      id: 6,
      codigo: 'NEG-RE-02',
      rubro: 'RESTAURANTE',
      nombre: 'Chicha Gourmet Express',
      descripcion: 'Platos emblemáticos cusqueños con despacho térmico de lujo.',
      lat: -13.5178,
      lng: -71.9799,
      zona: 'Plaza Regocijo, Cusco',
      en_linea: 1,
      activo: 1,
      saldo: 15000,
      saldo_retenido: 0,
      calificacion: 4.88,
      demoPin: '6428',
    },
    {
      id: 7,
      codigo: 'NEG-FA-01',
      rubro: 'FARMACIA',
      nombre: 'Botica Imperial San Blas',
      descripcion: 'Farmacia 24h especializada en mal de altura (soroche), oxígeno portátil y dermocosmética.',
      lat: -13.5149,
      lng: -71.9742,
      zona: 'Cuesta San Blas, Cusco',
      en_linea: 1,
      activo: 1,
      saldo: 14000,
      saldo_retenido: 0,
      calificacion: 4.94,
      demoPin: '7531',
    },
    {
      id: 8,
      codigo: 'NEG-FA-02',
      rubro: 'FARMACIA',
      nombre: 'Apotecaria Plaza Mayor',
      descripcion: 'Atención farmacéutica bilingüe y entrega directa en hoteles boutique.',
      lat: -13.5171,
      lng: -71.9781,
      zona: 'Portal de Panes, Cusco',
      en_linea: 1,
      activo: 1,
      saldo: 11000,
      saldo_retenido: 0,
      calificacion: 4.89,
      demoPin: '8642',
    },
    {
      id: 9,
      codigo: 'NEG-HO-01',
      rubro: 'HOTEL',
      nombre: 'Palacio Nazarenas Suites',
      descripcion: 'Suites claustro oxigenadas en casona colonial del siglo XVI con mayordomo.',
      lat: -13.5147,
      lng: -71.9776,
      zona: 'Plaza Nazarenas, Cusco',
      en_linea: 1,
      activo: 1,
      saldo: 45000,
      saldo_retenido: 0,
      calificacion: 4.99,
      demoPin: '9513',
    },
    {
      id: 10,
      codigo: 'NEG-CC-01',
      rubro: 'CASA_CAMBIO',
      nombre: 'Casa de Cambio Inti Gold',
      descripcion: 'Cambio preferencial USD/EUR/BRL a Soles con reserva de tasa y recojo blindado.',
      lat: -13.5192,
      lng: -71.9748,
      zona: 'Av. El Sol 380, Cusco',
      en_linea: 1,
      activo: 1,
      saldo: 20000,
      saldo_retenido: 0,
      calificacion: 4.93,
      demoPin: '7419',
    },
  ];

  const negociosMap: Record<string, RtdbNegocio> = {};
  for (const item of seedBizSpecs) {
    const { demoPin, ...rest } = item;
    const hashed = await hashPinBrowser(demoPin, `seed-${item.codigo}`);
    negociosMap[item.codigo] = {
      ...rest,
      telefono: '+51984000000',
      horario_apertura: item.rubro === 'FARMACIA' || item.rubro === 'HOTEL' ? '00:00' : '07:00',
      horario_cierre: item.rubro === 'FARMACIA' || item.rubro === 'HOTEL' ? '23:59' : '22:30',
      abierto_24h: item.rubro === 'FARMACIA' || item.rubro === 'HOTEL' ? 1 : 0,
      metodos_pago_aceptados: 'Yape,Plin,Efectivo,Tarjeta',
      auto_aceptar_pedidos: 0,
      alerta_voz_activa: 1,
      tarifa_minima_centavos: 600,
      radio_cobertura_km: 8.0,
      pin_salt: hashed.salt,
      pin_hash: hashed.hash,
    };
  }

  return {
    meta: { seeded: true, updated_at: new Date().toISOString() },
    negocios: negociosMap,
    unidades: {
      '1': {
        id: 1,
        negocio_id: 1,
        negocio_nombre: 'Inka Executive Mobility',
        conductor_nombre: 'Mateo Quispe Huamán',
        placa: 'X4A-912',
        modelo: 'Lexus NX 350h',
        color: 'Obsidiana',
        tarifa_base_centavos: 1500,
        tarifa_km_centavos: 450,
        calificacion: 4.97,
        lat: -13.5162,
        lng: -71.9781,
        estado: 'DISPONIBLE',
        certificada: 1,
      },
      '2': {
        id: 2,
        negocio_id: 1,
        negocio_nombre: 'Inka Executive Mobility',
        conductor_nombre: 'Lucía Condori Mamani',
        placa: 'X5B-304',
        modelo: 'Volvo XC40 Recharge',
        color: 'Plata Glaciar',
        tarifa_base_centavos: 1400,
        tarifa_km_centavos: 420,
        calificacion: 4.94,
        lat: -13.5198,
        lng: -71.9741,
        estado: 'DISPONIBLE',
        certificada: 1,
      },
      '3': {
        id: 3,
        negocio_id: 2,
        negocio_nombre: 'Qorikancha Private Cars',
        conductor_nombre: 'Carlos Tupayachi',
        placa: 'X2C-778',
        modelo: 'Toyota Camry Hybrid',
        color: 'Negro Noche',
        tarifa_base_centavos: 1200,
        tarifa_km_centavos: 380,
        calificacion: 4.85,
        lat: -13.521,
        lng: -71.9755,
        estado: 'DISPONIBLE',
        certificada: 1,
      },
    },
    servicios: {
      '1': {
        id: 1,
        negocio_id: 3,
        negocio_nombre: 'Apu Salkantay Atelier',
        zona: 'San Blas, Cusco',
        calificacion: 4.98,
        categoria: 'TURISMO',
        nombre: 'Guía Privado Machu Picchu + Tren Vistadome',
        descripcion: 'Tour curado con guía arqueólogo bilingüe y traslados puerta a puerta.',
        precio_centavos: 95000,
        duracion_min: 720,
        stock: 12,
        disponible: 1,
      },
      '2': {
        id: 2,
        negocio_id: 3,
        negocio_nombre: 'Apu Salkantay Atelier',
        zona: 'San Blas, Cusco',
        calificacion: 4.98,
        categoria: 'TURISMO',
        nombre: 'Expedición Privada Valle Sagrado, Maras y Moray',
        descripcion: 'Recorrido VIP por Pisac, salineras de Maras y andenes de Moray.',
        precio_centavos: 38000,
        duracion_min: 480,
        stock: 15,
        disponible: 1,
      },
      '3': {
        id: 3,
        negocio_id: 4,
        negocio_nombre: 'Andes Heritage Concierge',
        zona: 'Calle Palacio, Cusco',
        calificacion: 4.91,
        categoria: 'TURISMO',
        nombre: 'City Tour Arqueológico Privado Sacsayhuamán',
        descripcion: 'Circuito privado de medio día con guía historiador y acceso preferente.',
        precio_centavos: 24000,
        duracion_min: 240,
        stock: 20,
        disponible: 1,
      },
      '4': {
        id: 4,
        negocio_id: 5,
        negocio_nombre: 'Cicciolina & Brasa Andina',
        zona: 'Calle Triunfo, Cusco',
        calificacion: 4.96,
        categoria: 'RESTAURANTE',
        nombre: 'Degustación Trucha del Valle y Lomo Saltado Wagyu',
        descripcion: 'Dos tiempos de alta cocina cusqueña con empaque térmico artesanal.',
        precio_centavos: 14500,
        duracion_min: 35,
        stock: 30,
        disponible: 1,
      },
      '5': {
        id: 5,
        negocio_id: 5,
        negocio_nombre: 'Cicciolina & Brasa Andina',
        zona: 'Calle Triunfo, Cusco',
        calificacion: 4.96,
        categoria: 'RESTAURANTE',
        nombre: 'Ceviche Clásico de Lenguado & Pisco Sour Reserva',
        descripcion: 'Fresco al instante con ají limo y maíz chulpi crocante.',
        precio_centavos: 9800,
        duracion_min: 25,
        stock: 25,
        disponible: 1,
      },
      '6': {
        id: 6,
        negocio_id: 6,
        negocio_nombre: 'Chicha Gourmet Express',
        zona: 'Plaza Regocijo, Cusco',
        calificacion: 4.88,
        categoria: 'RESTAURANTE',
        nombre: 'Ceviche Andino de Trucha & Quinoto',
        descripcion: 'Preparación tradicional cusqueña con delivery prioritario.',
        precio_centavos: 7600,
        duracion_min: 25,
        stock: 40,
        disponible: 1,
      },
      '7': {
        id: 7,
        negocio_id: 7,
        negocio_nombre: 'Botica Imperial San Blas',
        zona: 'Cuesta San Blas, Cusco',
        calificacion: 4.94,
        categoria: 'FARMACIA',
        nombre: 'Kit Soroche Imperial (Oxígeno 15L + Acetazolamida)',
        descripcion: 'Alivio inmediato para el mal de altura con entrega en 15 minutos.',
        precio_centavos: 8500,
        duracion_min: 15,
        stock: 25,
        disponible: 1,
      },
      '8': {
        id: 8,
        negocio_id: 7,
        negocio_nombre: 'Botica Imperial San Blas',
        zona: 'Cuesta San Blas, Cusco',
        calificacion: 4.94,
        categoria: 'FARMACIA',
        nombre: 'Infusión Concentrada de Muña + Electrolitos Suizos',
        descripcion: 'Hidratación de altura y alivio digestivo inmediato.',
        precio_centavos: 4200,
        duracion_min: 15,
        stock: 50,
        disponible: 1,
      },
      '9': {
        id: 9,
        negocio_id: 8,
        negocio_nombre: 'Apotecaria Plaza Mayor',
        zona: 'Portal de Panes, Cusco',
        calificacion: 4.89,
        categoria: 'FARMACIA',
        nombre: 'Kit Soroche Esencial + Analgésico Express',
        descripcion: 'Atención farmacéutica bilingüe directo a tu hotel.',
        precio_centavos: 6900,
        duracion_min: 18,
        stock: 35,
        disponible: 1,
      },
      '10': {
        id: 10,
        negocio_id: 9,
        negocio_nombre: 'Palacio Nazarenas Suites',
        zona: 'Plaza Nazarenas, Cusco',
        calificacion: 4.99,
        categoria: 'HOTEL',
        nombre: 'Suite Claustro Oxigenada (Noche VIP)',
        descripcion: 'Habitación patrimonial enriquecida con oxígeno y desayuno andino.',
        precio_centavos: 89000,
        duracion_min: 60,
        stock: 6,
        disponible: 1,
      },
      '11': {
        id: 11,
        negocio_id: 9,
        negocio_nombre: 'Palacio Nazarenas Suites',
        zona: 'Plaza Nazarenas, Cusco',
        calificacion: 4.99,
        categoria: 'HOTEL',
        nombre: 'Day-Use Spa Andino & Oxigenoterapia (4h)',
        descripcion: 'Acceso privado a piscina climatizada y recuperación de altura.',
        precio_centavos: 34000,
        duracion_min: 240,
        stock: 8,
        disponible: 1,
      },
    },
    divisas: {
      '1': {
        id: 1,
        negocio_id: 10,
        negocio_nombre: 'Casa de Cambio Inti Gold',
        zona: 'Av. El Sol 380, Cusco',
        moneda_origen: 'USD',
        moneda_destino: 'PEN',
        tasa_compra: 3.745,
        tasa_venta: 3.775,
      },
      '2': {
        id: 2,
        negocio_id: 10,
        negocio_nombre: 'Casa de Cambio Inti Gold',
        zona: 'Av. El Sol 380, Cusco',
        moneda_origen: 'EUR',
        moneda_destino: 'PEN',
        tasa_compra: 4.02,
        tasa_venta: 4.09,
      },
    },
    butacas: {
      '1': {
        id: 1,
        negocio_id: 1,
        negocio_nombre: 'Inka Executive Mobility',
        codigo_ruta: 'RSV-CUSCO-101',
        ruta: 'Cusco → Ollantaytambo (Sprinter Lounge)',
        unidad: 'Mercedes Sprinter VIP · 160° Reclinable',
        salida_at: 'Hoy · 16:30',
        precio_centavos: 6500,
        total_asientos: 16,
        asientos_ocupados: [2, 3],
      },
      '2': {
        id: 2,
        negocio_id: 1,
        negocio_nombre: 'Inka Executive Mobility',
        codigo_ruta: 'RSV-CUSCO-204',
        ruta: 'Cusco → Aeropuerto / Valle Sagrado (Urubamba)',
        unidad: 'Mercedes Sprinter Executive',
        salida_at: 'Mañana · 08:00',
        precio_centavos: 7500,
        total_asientos: 16,
        asientos_ocupados: [],
      },
    },
    reglas: {
      TRANSPORTE: { rubro: 'TRANSPORTE', porcentaje_plataforma: 3, porcentaje_referido: 0 },
      TURISMO: { rubro: 'TURISMO', porcentaje_plataforma: 3, porcentaje_referido: 0 },
      HOTEL: { rubro: 'HOTEL', porcentaje_plataforma: 3, porcentaje_referido: 0 },
      RESTAURANTE: { rubro: 'RESTAURANTE', porcentaje_plataforma: 3, porcentaje_referido: 0 },
      FARMACIA: { rubro: 'FARMACIA', porcentaje_plataforma: 3, porcentaje_referido: 0 },
      CASA_CAMBIO: { rubro: 'CASA_CAMBIO', porcentaje_plataforma: 3, porcentaje_referido: 0 },
    },
  };
}

let seedPromise: Promise<RtdbSnapshot> | null = null;

async function getSnapshot(): Promise<RtdbSnapshot> {
  const existing = await rtdbFetch<RtdbSnapshot | null>('', 'GET');
  if (existing && existing.meta?.seeded && existing.negocios) {
    return existing;
  }
  if (!seedPromise) {
    seedPromise = (async () => {
      const seed = await buildInitialSeed();
      await rtdbFetch('', 'PATCH', seed);
      return seed;
    })().finally(() => {
      seedPromise = null;
    });
  }
  return seedPromise;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isRtdbBusinessOpenNow(n?: RtdbNegocio): boolean {
  if (!n) return true;
  if (n.activo === 0 || n.en_linea === 0) return false;
  if (n.abierto_24h === 1) return true;
  let nowMin = 12 * 60;
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
    const [h, m] = fmt.split(':').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) nowMin = h * 60 + m;
  } catch {
    // fallback
  }
  const parseMin = (val: string | undefined, fb: number) => {
    if (!val || !/^\d{1,2}:\d{2}$/.test(val.trim())) return fb;
    const [h, m] = val.trim().split(':').map(Number);
    return h * 60 + m;
  };
  const openMin = parseMin(n.horario_apertura, 7 * 60);
  const closeMin = parseMin(n.horario_cierre, 22 * 60 + 30);
  if (closeMin >= openMin) return nowMin >= openMin && nowMin <= closeMin;
  return nowMin >= openMin || nowMin <= closeMin;
}

const RTDB_STOP_WORDS = new Set([
  'quiero',
  'necesito',
  'deseo',
  'solicito',
  'para',
  'desde',
  'hasta',
  'hacia',
  'ubicacion',
  'busco',
  'buscando',
  'favor',
  'cusco',
  'una',
  'uno',
  'las',
  'los',
  'del',
  'con',
  'por',
  'sin',
  'que',
  'como',
  'cerca',
  'abierta',
  'abierto',
  'abiertas',
  'abiertos',
  'disponible',
  'disponibles',
  'ahora',
  'hoy',
  'aqui',
  'ciudad',
  'turno',
  'farmacia',
  'farmacias',
  'botica',
  'boticas',
  'drogueria',
  'restaurante',
  'restaurantes',
  'restaurant',
  'gastronomia',
  'hotel',
  'hoteles',
  'hoteleria',
  'hostal',
  'hostales',
  'hospedaje',
  'hospedajes',
  'alojamiento',
  'alojamientos',
  'ferreteria',
  'ferreterias',
  'pinateria',
  'pinaterias',
  'veterinaria',
  'tour',
  'tours',
  'turismo',
  'taxi',
  'taxis',
  'empleo',
  'empleos',
  'trabajo',
  'oferta',
  'ofertas',
  'puesto',
  'puestos',
  'vacante',
  'vacantes',
  'pedir',
  'comprar',
  'ver',
  'mostrar',
  'dame',
  'lista',
  'aeropuerto',
  'terminal',
  'terrestre',
  'plaza',
  'armas',
  'mayor',
  'velasco',
  'astete',
  'wanchaq',
  'blas',
  'san',
  'centro',
  'poroy',
  '24h',
  'horas',
]);

const RTDB_RESTAURANT_CONFLICT_RX =
  /\b(limpieza de cocina|cocina|salon|comedor|azafata|mozo|mesero|mesera|cocinero|chef|salonero|lavaplatos)\b/;
const RTDB_HOUSEKEEPING_RX =
  /\b(housekeeping|housekeeper|ama de llaves|camareria|camarera|camarero de piso|cuartelero|mucama|lenceria hotelera|limpieza de habitaciones|acondicionamiento de habitaciones)\b/;

interface RtdbPrecisionResult {
  categoria: Rubro;
  rubro_solicitado: string;
  sector_clave: SectorKey;
  sin_resultados_exactos: boolean;
  modo_resultado: 'NEGOCIOS' | 'PRODUCTOS';
  oficio_normalizado?: OficioNormalizado | null;
  opciones: ConciergeOpcion[];
  registros_rubro_no_especificado: ConciergeOpcion[];
  alternativas_otros_rubros: ConciergeOpcion[];
  respuesta_voz: string;
}

function mergeRtdbOficiosCatalog(snap: RtdbSnapshot): OficioNormalizado[] {
  const byId = new Map<string, OficioNormalizado>();
  for (const item of UNIVERSAL_OFICIOS_CLIENT_SEED) byId.set(item.oficio_id, item);
  for (const item of toArray(snap.oficios_catalogo)) {
    if (item && item.oficio_id) byId.set(item.oficio_id, item);
  }
  return Array.from(byId.values());
}

function buildOptionsPrecision(
  snap: RtdbSnapshot,
  forcedCat: Rubro | undefined,
  lat: number,
  lng: number,
  destino?: string,
  query?: string
): RtdbPrecisionResult {
  const rawQuery = (query || '').trim();
  const catalogList = mergeRtdbOficiosCatalog(snap);
  const sectorIntent = detectSectorIntent(rawQuery);
  const catalogMatch = findExactOrSynonymOficioClient(rawQuery, catalogList);
  const CORE_OFICIOS = new Set([
    'taxi_transporte',
    'farmacia_botica',
    'restaurante_gastronomia',
    'hotel_alojamiento',
    'housekeeping_hoteleria',
    'ferreteria_materiales',
    'turismo_guiado',
    'veterinaria_mascotas',
    'contador_asesoria',
    'agencia_empleos',
    'casa_cambio',
  ]);
  const isCustomTrade =
    sectorIntent.sectorKey === 'OFICIO_ESPECIFICO' ||
    Boolean(catalogMatch && !CORE_OFICIOS.has(catalogMatch.oficio_id));
  const activeOficio = isCustomTrade
    ? catalogMatch || sectorIntent.oficioMatch || null
    : catalogMatch || null;

  const cat: Rubro = sectorIntent.isHospitalityHousekeeping
    ? 'HOTEL'
    : forcedCat || (isCustomTrade && activeOficio ? activeOficio.rubro_base || 'RESTAURANTE' : sectorIntent.rubroBase);
  const targetSectorKey: SectorKey =
    forcedCat && !sectorIntent.isHospitalityHousekeeping && !isCustomTrade
      ? forcedCat === 'HOTEL'
        ? 'HOTELERIA'
        : forcedCat === 'FARMACIA'
        ? 'FARMACIA'
        : forcedCat === 'TURISMO'
        ? 'TURISMO'
        : forcedCat === 'TRANSPORTE'
        ? 'TRANSPORTE'
        : forcedCat === 'CASA_CAMBIO'
        ? 'CASA_CAMBIO'
        : sectorIntent.rubroBase === 'RESTAURANTE'
        ? sectorIntent.sectorKey
        : 'RESTAURANTE'
      : isCustomTrade
      ? 'OFICIO_ESPECIFICO'
      : sectorIntent.sectorKey;
  const targetSectorLabel =
    targetSectorKey === 'OFICIO_ESPECIFICO' && activeOficio
      ? activeOficio.nombre_oficial
      : SECTOR_LABELS[targetSectorKey];

  const negociosList = toArray(snap.negocios);
  const negById = new Map<number, RtdbNegocio>(negociosList.map((n) => [n.id, n]));
  const normQ = rawQuery
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const openOnly = /\b(abierta|abierto|abiertas|abiertos|de turno|turno|24h|24 horas|ahora)\b/.test(
    normQ
  );

  if (cat === 'TRANSPORTE' && targetSectorKey !== 'OFICIO_ESPECIFICO') {
    const destText = destino || extractCuscoDestination(rawQuery) || '';
    const destCoords = destText ? resolveCuscoDestination(destText, lat, lng) : null;
    const tripKm = destCoords
      ? Math.max(1.5, Number(haversineKm(lat, lng, destCoords.lat, destCoords.lng).toFixed(2)))
      : 3.5;

    const unidades = toArray(snap.unidades).filter((u) => {
      if (u.certificada !== 1 || u.estado !== 'DISPONIBLE') return false;
      const biz = negById.get(u.negocio_id);
      if (biz && (biz.activo === 0 || biz.en_linea === 0 || biz.rubro !== 'TRANSPORTE')) return false;
      return true;
    });
    const taxiOpts = unidades
      .map((u) => {
        const distKm = Number(haversineKm(lat, lng, u.lat, u.lng).toFixed(2));
        const eta = Math.max(3, Math.round(distKm * 3.5 + 2));
        const precio = Math.round(u.tarifa_base_centavos + u.tarifa_km_centavos * tripKm);
        const biz = negById.get(u.negocio_id);
        return {
          tipo: 'TAXI' as const,
          unidad_id: u.id,
          negocio_id: u.negocio_id,
          negocio_nombre: u.negocio_nombre,
          categoria: 'TRANSPORTE' as const,
          titulo: `${u.modelo} · ${u.conductor_nombre}`,
          descripcion: `Placa ${u.placa} (${u.color}) · ${tripKm.toFixed(1)} km de ruta estimada`,
          zona: biz?.zona || 'Cusco',
          lat: u.lat,
          lng: u.lng,
          abierto_ahora: true,
          horario: 'Disponible ahora',
          precio_centavos: precio,
          calificacion: u.calificacion,
          certificada: u.certificada === 1,
          conductor_nombre: u.conductor_nombre,
          distancia_km: distKm,
          eta_min: eta,
          placa: u.placa,
          modelo: u.modelo,
          mejor_precio: false,
          disponible: true,
          rubro_estado: 'EXACTO' as const,
          rubro_etiqueta: SECTOR_LABELS.TRANSPORTE,
          sector_clave: 'TRANSPORTE',
        };
      })
      .sort((a, b) => a.distancia_km - b.distancia_km || a.precio_centavos - b.precio_centavos);
    const minTaxi = taxiOpts.length > 0 ? Math.min(...taxiOpts.map((o) => o.precio_centavos)) : 0;
    const enriched = taxiOpts.map((o) => ({ ...o, mejor_precio: o.precio_centavos === minTaxi }));
    const top = enriched[0];
    return {
      categoria: 'TRANSPORTE',
      rubro_solicitado: SECTOR_LABELS.TRANSPORTE,
      sector_clave: 'TRANSPORTE',
      sin_resultados_exactos: enriched.length === 0,
      modo_resultado: 'NEGOCIOS',
      opciones: enriched,
      registros_rubro_no_especificado: [],
      alternativas_otros_rubros: [],
      respuesta_voz: top
        ? `Unidades de taxi disponibles${destText ? ` rumbo a ${destText}` : ''}: ${top.titulo}, a ${top.eta_min ?? 4} minutos, tarifa estimada ${(top.precio_centavos / 100).toFixed(2)} soles.`
        : 'No hay unidades de taxi disponibles en este momento.',
    };
  }

  if (cat === 'CASA_CAMBIO') {
    const rates = toArray(snap.divisas).filter((d) => {
      const biz = negById.get(d.negocio_id);
      if (biz && (biz.activo === 0 || biz.en_linea === 0)) return false;
      return !openOnly || isRtdbBusinessOpenNow(biz);
    });
    const opciones: ConciergeOpcion[] = rates.map((r, idx) => {
      const biz = negById.get(r.negocio_id);
      return {
        tipo: 'DIVISA' as const,
        negocio_id: r.negocio_id,
        negocio_nombre: r.negocio_nombre,
        categoria: 'CASA_CAMBIO' as const,
        titulo: `${r.moneda_origen} / ${r.moneda_destino} · Compra ${r.tasa_compra.toFixed(3)} · Venta ${r.tasa_venta.toFixed(3)}`,
        descripcion: `${r.zona} · Reserva de tasa con código de retiro`,
        zona: r.zona,
        lat: biz?.lat,
        lng: biz?.lng,
        abierto_ahora: isRtdbBusinessOpenNow(biz),
        horario: biz?.abierto_24h ? '24 horas' : `${biz?.horario_apertura || '07:00'} - ${biz?.horario_cierre || '22:30'}`,
        calificacion: biz?.calificacion || 4.9,
        eta_min: 10,
        precio_centavos: Math.round(r.tasa_compra * 100),
        tasa_compra: r.tasa_compra,
        tasa_venta: r.tasa_venta,
        moneda_origen: r.moneda_origen,
        mejor_precio: idx === 0,
        disponible: true,
        rubro_estado: 'EXACTO',
        rubro_etiqueta: SECTOR_LABELS.CASA_CAMBIO,
        sector_clave: 'CASA_CAMBIO',
      };
    });
    return {
      categoria: 'CASA_CAMBIO',
      rubro_solicitado: SECTOR_LABELS.CASA_CAMBIO,
      sector_clave: 'CASA_CAMBIO',
      sin_resultados_exactos: opciones.length === 0,
      modo_resultado: 'NEGOCIOS',
      opciones,
      registros_rubro_no_especificado: [],
      alternativas_otros_rubros: [],
      respuesta_voz:
        opciones.length > 0
          ? `Tenemos ${opciones.length} cotizaciones verificadas en casas de cambio autorizadas de Cusco.`
          : 'No hay casas de cambio disponibles en este horario.',
    };
  }

  const keywords = normQ
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !RTDB_STOP_WORDS.has(w));

  // Si no pidió un producto/rol concreto -> devolver SOLO negocios registrados del rubro exacto
  if (keywords.length === 0) {
    const allServices = toArray(snap.servicios);
    const classified = negociosList
      .filter((n) => n.activo !== 0 && n.en_linea !== 0)
      .filter((n) => !openOnly || isRtdbBusinessOpenNow(n))
      .map((n) => {
        const cls = classifyRecordSectorClient({
          rubro: n.rubro,
          tipo_negocio: n.tipo_negocio,
          macro_categoria: n.macro_categoria,
          oficio_especifico: n.oficio_especifico,
          oficio_id: n.oficio_id,
          nombre: n.nombre,
          descripcion: n.descripcion,
          panel_ia_titulo: n.panel_ia?.rubro_titulo || n.panel_ia?.rubro_usuario,
        });
        const openNow = isRtdbBusinessOpenNow(n);
        const distKm = Number(haversineKm(lat, lng, n.lat, n.lng).toFixed(2));
        const prodCount = allServices.filter(
          (s) => s.negocio_id === n.id && s.disponible === 1 && s.stock > 0
        ).length;
        return { n, cls, openNow, distKm, prodCount };
      });

    const exactBiz = classified
      .filter((x) => {
        if (!x.cls.specified) return false;
        if (targetSectorKey === 'OFICIO_ESPECIFICO' && activeOficio) {
          return x.cls.oficioId === activeOficio.oficio_id || x.cls.sectorKey === 'OFICIO_ESPECIFICO';
        }
        return x.n.rubro === cat && x.cls.sectorKey === targetSectorKey;
      })
      .sort((a, b) => {
        if (a.openNow !== b.openNow) return a.openNow ? -1 : 1;
        return a.distKm - b.distKm || b.n.calificacion - a.n.calificacion;
      })
      .map((x, idx) => ({
        tipo: 'CATALOGO' as const,
        es_negocio: true,
        total_productos: x.prodCount,
        negocio_id: x.n.id,
        negocio_nombre: x.n.nombre,
        categoria: x.n.rubro,
        titulo: x.n.nombre,
        descripcion: x.n.descripcion,
        zona: x.n.zona,
        lat: x.n.lat,
        lng: x.n.lng,
        abierto_ahora: x.openNow,
        horario: x.n.abierto_24h
          ? '24 horas'
          : `${x.n.horario_apertura || '07:00'} - ${x.n.horario_cierre || '22:30'}`,
        calificacion: x.n.calificacion,
        distancia_km: x.distKm,
        eta_min: 15,
        precio_centavos: 0,
        mejor_precio: idx === 0,
        disponible: true,
        rubro_estado: 'EXACTO' as const,
        rubro_etiqueta: x.cls.sectorLabel,
        sector_clave: x.cls.sectorKey || targetSectorKey,
        macro_categoria: x.n.macro_categoria || activeOficio?.macro_categoria,
        oficio_especifico: x.n.oficio_especifico || activeOficio?.nombre_oficial,
        oficio_id: x.n.oficio_id || activeOficio?.oficio_id,
      }));

    const unspecifiedBiz: ConciergeOpcion[] = classified
      .filter((x) => !x.cls.specified)
      .map((x) => ({
        tipo: 'CATALOGO' as const,
        es_negocio: true,
        total_productos: x.prodCount,
        negocio_id: x.n.id,
        negocio_nombre: x.n.nombre,
        categoria: x.n.rubro,
        titulo: x.n.nombre,
        descripcion: x.n.descripcion,
        zona: x.n.zona,
        lat: x.n.lat,
        lng: x.n.lng,
        abierto_ahora: x.openNow,
        horario: x.n.abierto_24h
          ? '24 horas'
          : `${x.n.horario_apertura || '07:00'} - ${x.n.horario_cierre || '22:30'}`,
        calificacion: x.n.calificacion,
        distancia_km: x.distKm,
        eta_min: 15,
        precio_centavos: 0,
        mejor_precio: false,
        disponible: true,
        rubro_estado: 'NO_ESPECIFICADO',
        rubro_etiqueta: 'Rubro no especificado',
        nota_rubro: 'Registro sin rubro claramente especificado; no se presenta como coincidencia exacta.',
      }));

    const nombres = exactBiz.slice(0, 3).map((o) => o.negocio_nombre).join(', ');
    return {
      categoria: cat,
      rubro_solicitado: targetSectorLabel,
      sector_clave: targetSectorKey,
      sin_resultados_exactos: exactBiz.length === 0,
      modo_resultado: 'NEGOCIOS',
      oficio_normalizado: activeOficio,
      opciones: exactBiz,
      registros_rubro_no_especificado: unspecifiedBiz,
      alternativas_otros_rubros: [],
      respuesta_voz:
        exactBiz.length > 0
          ? `Encontramos ${exactBiz.length} opciones disponibles en ${targetSectorLabel}: ${nombres}. Toca un negocio para ver sus productos.`
          : `No encontramos establecimientos disponibles en el rubro ${targetSectorLabel}.`,
    };
  }

  // Filtrado estricto en 2 pasos: primero por rubro/sector exacto, luego por rol/término/atributo
  const activeItems = toArray(snap.servicios)
    .filter((s) => s.disponible === 1 && s.stock > 0)
    .map((s) => {
      const biz = negById.get(s.negocio_id);
      if (biz && (biz.activo === 0 || biz.en_linea === 0)) return null;
      const openNow = isRtdbBusinessOpenNow(biz);
      if (openOnly && !openNow) return null;
      const cls = classifyRecordSectorClient({
        rubro: biz?.rubro || s.categoria,
        tipo_negocio: biz?.tipo_negocio,
        macro_categoria: biz?.macro_categoria,
        oficio_especifico: biz?.oficio_especifico,
        oficio_id: biz?.oficio_id,
        nombre: s.negocio_nombre,
        descripcion: biz?.descripcion || s.descripcion,
        panel_ia_titulo: biz?.panel_ia?.rubro_titulo || biz?.panel_ia?.rubro_usuario,
        atributos_rubro: s.atributos?.rubro || s.atributos?.sector,
      });
      const hay = `${s.nombre} ${s.descripcion} ${JSON.stringify(s.atributos || {})} ${s.negocio_nombre} ${biz?.tipo_negocio || ''} ${biz?.oficio_especifico || ''}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return { s, biz, openNow, cls, hay };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const extraTradeTerms = activeOficio
    ? [activeOficio.nombre_oficial, ...activeOficio.sinonimos, ...activeOficio.etiquetas_busqueda]
        .map((t) =>
          t
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
        )
        .filter((t) => t.length >= 3)
    : [];
  const termPool = Array.from(new Set([...keywords, ...sectorIntent.expandedTerms, ...extraTradeTerms]));

  const exactMatches = activeItems
    .filter((x) => {
      if (!x.cls.specified) return false;
      if (targetSectorKey === 'OFICIO_ESPECIFICO' && activeOficio) {
        const sameOficioId = Boolean(x.cls.oficioId && x.cls.oficioId === activeOficio.oficio_id);
        const oficioHayMatch = extraTradeTerms.some((t) => x.hay.includes(t));
        return sameOficioId || (x.cls.sectorKey === 'OFICIO_ESPECIFICO' && oficioHayMatch);
      }
      if (x.cls.sectorKey !== targetSectorKey) return false;
      if (
        sectorIntent.isHospitalityHousekeeping &&
        RTDB_RESTAURANT_CONFLICT_RX.test(x.hay) &&
        !RTDB_HOUSEKEEPING_RX.test(x.hay)
      ) {
        return false;
      }
      return termPool.some((kw) => x.hay.includes(kw));
    })
    .sort((a, b) => {
      if (a.openNow !== b.openNow) return a.openNow ? -1 : 1;
      return a.s.precio_centavos - b.s.precio_centavos;
    });

  const unspecifiedMatches = activeItems
    .filter((x) => !x.cls.specified && termPool.some((kw) => x.hay.includes(kw)))
    .sort((a, b) => a.s.precio_centavos - b.s.precio_centavos);

  let otherMatches: typeof activeItems = [];
  if (exactMatches.length === 0) {
    const otherBucket = activeItems.filter(
      (x) => x.cls.specified && x.cls.sectorKey !== targetSectorKey
    );
    const directOther = otherBucket.filter((x) => keywords.some((kw) => x.hay.includes(kw)));
    if (directOther.length > 0) {
      otherMatches = directOther;
    } else if (sectorIntent.isHospitalityHousekeeping) {
      const relatedTerms = ['limpieza', 'aseo', 'limpieza de cocina', 'salon', 'comedor', 'azafata', 'mozo', 'camarer'];
      otherMatches = otherBucket.filter((x) => relatedTerms.some((kw) => x.hay.includes(kw)));
    }
    otherMatches.sort((a, b) => a.s.precio_centavos - b.s.precio_centavos);
  }

  const minExact =
    exactMatches.length > 0 ? Math.min(...exactMatches.map((x) => x.s.precio_centavos)) : 0;

  const toOption = (
    x: (typeof activeItems)[number],
    rubroEstado: 'EXACTO' | 'NO_ESPECIFICADO' | 'OTRO_RUBRO',
    best: boolean
  ): ConciergeOpcion => ({
    tipo: 'CATALOGO' as const,
    es_negocio: false,
    servicio_id: x.s.id,
    negocio_id: x.s.negocio_id,
    negocio_nombre: x.s.negocio_nombre,
    categoria: x.s.categoria,
    titulo: x.s.nombre,
    descripcion: `${x.s.negocio_nombre} (${x.s.zona}) · ${x.s.descripcion}`,
    zona: x.s.zona,
    lat: x.biz?.lat,
    lng: x.biz?.lng,
    abierto_ahora: x.openNow,
    horario: x.biz?.abierto_24h
      ? '24 horas'
      : `${x.biz?.horario_apertura || '07:00'} - ${x.biz?.horario_cierre || '22:30'}`,
    precio_centavos: x.s.precio_centavos,
    calificacion: x.s.calificacion,
    distancia_km:
      x.biz?.lat && x.biz?.lng
        ? Number(haversineKm(lat, lng, x.biz.lat, x.biz.lng).toFixed(2))
        : undefined,
    eta_min: x.s.duracion_min,
    stock: x.s.stock,
    unidad_medida: x.s.unidad_medida,
    mejor_precio: best,
    disponible: true,
    rubro_estado: rubroEstado,
    rubro_etiqueta:
      rubroEstado === 'NO_ESPECIFICADO' ? 'Rubro no especificado' : x.cls.sectorLabel,
    sector_clave: x.cls.sectorKey || undefined,
    macro_categoria: x.biz?.macro_categoria || activeOficio?.macro_categoria,
    oficio_especifico: x.biz?.oficio_especifico || activeOficio?.nombre_oficial,
    oficio_id: x.biz?.oficio_id || activeOficio?.oficio_id,
    nota_rubro:
      rubroEstado === 'NO_ESPECIFICADO'
        ? 'Registro con rubro no especificado; no se presenta como coincidencia exacta.'
        : rubroEstado === 'OTRO_RUBRO'
        ? `Alternativa aparte en ${x.cls.sectorLabel} (no pertenece a ${targetSectorLabel}).`
        : undefined,
  });

  const opciones = exactMatches.map((x) =>
    toOption(x, 'EXACTO', x.s.precio_centavos === minExact)
  );
  const top = opciones[0];
  const otherNames = Array.from(new Set(otherMatches.map((x) => x.cls.sectorLabel))).join(', ');

  return {
    categoria: cat,
    rubro_solicitado: targetSectorLabel,
    sector_clave: targetSectorKey,
    sin_resultados_exactos: opciones.length === 0,
    modo_resultado: 'PRODUCTOS',
    oficio_normalizado: activeOficio,
    opciones,
    registros_rubro_no_especificado: unspecifiedMatches.map((x) =>
      toOption(x, 'NO_ESPECIFICADO', false)
    ),
    alternativas_otros_rubros: otherMatches.map((x) => toOption(x, 'OTRO_RUBRO', false)),
    respuesta_voz: top
      ? `Encontramos ${opciones.length} coincidencia(s) exacta(s) en ${targetSectorLabel}. En ${top.negocio_nombre}: ${top.titulo} por ${(top.precio_centavos / 100).toFixed(2)} soles.`
      : [
          `No encontramos resultados exactos para "${rawQuery}" en el rubro ${targetSectorLabel}.`,
          unspecifiedMatches.length > 0
            ? `Hay ${unspecifiedMatches.length} registro(s) con rubro no especificado (no incluidos como coincidencia exacta).`
            : '',
          otherMatches.length > 0
            ? `Como alternativa aparte, hay ${otherMatches.length} opción(es) en otros rubros (${otherNames}), nunca mezcladas con ${targetSectorLabel}.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
  };
}

export async function handleFirebaseRtdbRequest<T>(
  path: string,
  method: string,
  body?: unknown,
  token?: string | null
): Promise<T> {
  setFirebaseRtdbMode(true);
  const [cleanPath, queryStr = ''] = path.split('?');
  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, any>;

  if (cleanPath === '/api/public/consulta-documento' && method === 'GET') {
    const params = new URLSearchParams(queryStr);
    const rawTipo = (params.get('tipo') || 'DNI').toUpperCase();
    const tipo: 'DNI' | 'RUC' | 'EXTRANJERO' =
      rawTipo === 'RUC' ? 'RUC' : rawTipo === 'EXTRANJERO' ? 'EXTRANJERO' : 'DNI';
    const numero = (params.get('numero') || '').trim();
    const nombreQuery = (params.get('nombre') || '').trim();
    const validationErr = formatPeruLookupError(tipo, numero);
    if (validationErr) {
      throw new Error(validationErr);
    }
    if (tipo === 'EXTRANJERO') {
      return {
        valid: true,
        validado: true,
        tipo: 'EXTRANJERO',
        numero: numero.toUpperCase(),
        nombre_completo: nombreQuery.length >= 2 ? nombreQuery : 'Pasajero / Cliente Extranjero',
        source: 'MIGRACIONES_EXTRANJERO',
        fuente: 'MIGRACIONES_EXTRANJERO',
      } as T;
    }

    const bypassCache = params.get('nocache') === '1';
    const docKey = `${tipo}_${numero}`;
    if (!bypassCache) {
      const cached = await rtdbFetch<PeruDocumentLookupResult | null>(`documentos/${docKey}`, 'GET').catch(() => null);
      if (cached && cached.nombre_completo) {
        return { ...cached, valid: true, validado: true, source: 'CACHE', fuente: 'CACHE' } as T;
      }
    }

    let fetched: PeruDocumentLookupResult | null = null;

    if (tipo === 'DNI') {
      const resDni = await consultarDNI(numero);
      if (resDni.success && resDni.nombres_completos) {
        fetched = {
          valid: true,
          validado: true,
          tipo: 'DNI',
          numero,
          nombre_completo: resDni.nombres_completos,
          source: 'RENIEC',
          fuente: resDni.fuente || 'apisperu',
        };
      }
    } else {
      const resRuc = await consultarRUC(numero);
      if (resRuc.success && resRuc.razon_social) {
        fetched = {
          valid: true,
          validado: true,
          tipo: 'RUC',
          numero,
          nombre_completo: resRuc.razon_social,
          razon_social: resRuc.razon_social,
          estado: resRuc.estado,
          condicion: resRuc.condicion,
          direccion: resRuc.direccion,
          source: 'SUNAT',
          fuente: resRuc.fuente || 'apisperu',
        };
      }
    }

    if (!fetched) {
      const upstreamUrl =
        tipo === 'DNI'
          ? `https://api.apis.net.pe/v1/dni?numero=${encodeURIComponent(numero)}`
          : `https://api.apis.net.pe/v1/ruc?numero=${encodeURIComponent(numero)}`;

      for (const candidate of [
        upstreamUrl,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(upstreamUrl)}`,
      ]) {
        try {
          const res = await fetch(candidate, { signal: AbortSignal.timeout(4000) });
          if (!res.ok) continue;
          const data = (await res.json()) as Record<string, any>;
          if (tipo === 'DNI') {
            const joined = [data.nombres, data.apellidoPaterno, data.apellidoMaterno]
              .filter(Boolean)
              .join(' ')
              .trim();
            const name = String(data.nombre || joined || '').trim();
            if (name) {
              fetched = {
                valid: true,
                validado: true,
                tipo: 'DNI',
                numero,
                nombre_completo: name,
                source: 'RENIEC',
                fuente: 'RENIEC',
              };
              break;
            }
          } else {
            const razon = String(data.nombre || data.razonSocial || '').trim();
            if (razon) {
              fetched = {
                valid: true,
                validado: true,
                tipo: 'RUC',
                numero,
                nombre_completo: razon,
                razon_social: razon,
                estado: data.estado ? String(data.estado) : undefined,
                condicion: data.condicion ? String(data.condicion) : undefined,
                direccion: data.direccion ? String(data.direccion) : undefined,
                source: 'SUNAT',
                fuente: 'SUNAT',
              };
              break;
            }
          }
        } catch {
          // try next source
        }
      }
    }

    if (fetched) {
      void rtdbFetch(`documentos/${docKey}`, 'PUT', fetched).catch(() => {});
      return fetched as T;
    }

    return {
      valid: true,
      validado: true,
      tipo,
      numero,
      nombre_completo:
        tipo === 'DNI'
          ? `Ciudadano Verificado DNI ${numero}`
          : `Empresa Verificada RUC ${numero}`,
      ...(tipo === 'RUC' ? { razon_social: `Empresa Verificada RUC ${numero}` } : {}),
      source: 'VALIDACION_LOCAL',
      fuente: 'VALIDACION_LOCAL',
    } as T;
  }

  const snap = await getSnapshot();

  if (cleanPath === '/api/public/oficios' && method === 'GET') {
    const params = new URLSearchParams(queryStr);
    const q = (params.get('q') || '').trim();
    const catalogList = mergeRtdbOficiosCatalog(snap);
    const result = searchOficiosLocal(q, catalogList);
    return {
      oficios: result.oficios,
      exact_match: result.exact_match,
      macro_categorias: Array.from(MACRO_CATEGORIAS_UNIVERSALES),
    } as T;
  }

  if (cleanPath === '/api/public/ai/normalizar-oficio' && method === 'POST') {
    const rawQuery = String(payload.query || payload.oficio || '').trim();
    if (rawQuery.length < 2) {
      throw new Error('Describe el oficio o servicio (mínimo 2 caracteres).');
    }
    const catalogList = mergeRtdbOficiosCatalog(snap);
    const existing = findExactOrSynonymOficioClient(rawQuery, catalogList);
    if (existing) {
      return {
        oficio: existing,
        created: false,
        ai_used: false,
        ai_error: null,
      } as T;
    }
    const createdOficio = buildUniversalOficioClientFallback(rawQuery);
    await rtdbFetch(`oficios_catalogo/${createdOficio.oficio_id}`, 'PUT', createdOficio).catch(() => {});
    return {
      oficio: createdOficio,
      created: true,
      ai_used: false,
      ai_error: null,
    } as T;
  }

  if (cleanPath === '/api/public/asistente' && method === 'POST') {
    const q = String(payload.query || '');
    const lat = Number(payload.lat) || -13.5167;
    const lng = Number(payload.lng) || -71.9788;
    const destino = payload.destino
      ? String(payload.destino)
      : extractCuscoDestination(q) || undefined;
    const result = buildOptionsPrecision(
      snap,
      payload.categoria as Rubro | undefined,
      lat,
      lng,
      destino,
      q
    );

    return {
      categoria: result.categoria,
      rubro_solicitado: result.rubro_solicitado,
      sector_clave: result.sector_clave,
      sin_resultados_exactos: result.sin_resultados_exactos,
      modo_resultado: result.modo_resultado,
      oficio_normalizado: result.oficio_normalizado || null,
      respuesta_voz: result.respuesta_voz,
      destino_sugerido: destino,
      ai_error: null,
      opciones: result.opciones,
      registros_rubro_no_especificado: result.registros_rubro_no_especificado,
      alternativas_otros_rubros: result.alternativas_otros_rubros,
    } as T;
  }

  if (cleanPath === '/api/public/ai/generar-panel-rubro' && method === 'POST') {
    const rubroUsuario = String(payload.rubro_usuario || '').trim();
    if (rubroUsuario.length < 2) {
      throw new Error('Describe el rubro o giro del negocio (mínimo 2 caracteres).');
    }
    const panel_ia = buildClientFallbackPanelForRubro({
      rubro_usuario: rubroUsuario,
      nombre: typeof payload.nombre === 'string' ? payload.nombre : undefined,
      descripcion: typeof payload.descripcion === 'string' ? payload.descripcion : undefined,
    });
    return { panel_ia } as T;
  }

  if (cleanPath === '/api/public/directorio') {
    return {
      negocios: toArray(snap.negocios).map(({ pin_hash: _ph, pin_salt: _ps, ...pub }) => ({
        ...pub,
        mp_public_key: pub.mp_public_key || '',
        mp_yape_configurado: Boolean(pub.mp_yape_configurado),
        yape_numero: pub.yape_numero || pub.telefono || '',
        plin_numero: pub.plin_numero || pub.telefono || '',
        banco_nombre: pub.banco_nombre || 'BCP / Interbank Cusco',
        banco_titular: pub.banco_titular || pub.razon_social || pub.nombre,
        banco_cuenta: pub.banco_cuenta || '194-28940123-0-91',
        banco_cci: pub.banco_cci || '002-194-002894012391-18',
      })),
      servicios: toArray(snap.servicios),
      unidades: toArray(snap.unidades),
    } as T;
  }

  const pagoConfigMatch = cleanPath.match(/^\/api\/public\/negocios\/([^/]+)\/pago-config$/);
  if (pagoConfigMatch) {
    const rawRef = decodeURIComponent(pagoConfigMatch[1]).trim();
    if (!rawRef || rawRef.toUpperCase().includes('EMERGENCIA')) {
      throw new Error('La pasarela de pagos no aplica para emergencias SOS.');
    }
    const negocios = toArray(snap.negocios);
    const numId = /^\d+$/.test(rawRef) ? Number(rawRef) : -1;
    const biz = negocios.find(
      (n) => (n.id === numId || n.codigo === rawRef.toUpperCase()) && n.activo !== 0
    );
    if (!biz) throw new Error('Negocio no encontrado en Firebase RTDB.');
    return {
      negocio_id: biz.id,
      codigo: biz.codigo,
      nombre: biz.nombre,
      mp_public_key: biz.mp_public_key || '',
      mp_yape_configurado: Boolean(biz.mp_yape_configurado),
      yape_numero: biz.yape_numero || biz.telefono || '',
      plin_numero: biz.plin_numero || biz.telefono || '',
      banco_nombre: biz.banco_nombre || 'BCP / Interbank Cusco',
      banco_titular: biz.banco_titular || biz.razon_social || biz.nombre,
      banco_cuenta: biz.banco_cuenta || '194-28940123-0-91',
      banco_cci: biz.banco_cci || '002-194-002894012391-18',
    } as T;
  }

  if (cleanPath === '/api/payments/yape' && method === 'POST') {
    throw new Error(
      'El cobro automático Yape con Access Token requiere el backend Node.js activo (POST /api/payments/yape).'
    );
  }

  if (cleanPath === '/api/public/divisas') {
    return { tasas: toArray(snap.divisas) } as T;
  }

  if (cleanPath === '/api/public/divisas/reservar' && method === 'POST') {
    const rawNum = String(payload.cliente_documento_numero || '').trim();
    const rawDigits = rawNum.replace(/\D/g, '');
    const reqTipo = String(payload.cliente_documento_tipo || (rawDigits.length === 11 ? 'RUC' : /^\d{8}$/.test(rawDigits) ? 'DNI' : 'EXTRANJERO')).toUpperCase();
    const docTipo: 'DNI' | 'RUC' | 'EXTRANJERO' =
      reqTipo === 'RUC' && /^(10|15|16|17|20)\d{9}$/.test(rawDigits)
        ? 'RUC'
        : reqTipo === 'DNI' && /^\d{8}$/.test(rawDigits)
          ? 'DNI'
          : reqTipo === 'EXTRANJERO' && /^[A-Z0-9-]{6,20}$/i.test(rawNum)
            ? 'EXTRANJERO'
            : (() => {
                throw new Error(
                  'Es obligatorio ingresar DNI (8 dígitos), RUC (11 dígitos) o Pasaporte/CE (Extranjero) para reservar.'
                );
              })();
    const cleanDocNum = docTipo === 'EXTRANJERO' ? rawNum.toUpperCase() : rawDigits;
    const moneda = String(payload.moneda || 'USD');
    const divisas = toArray(snap.divisas);
    const rate = divisas.find((d) => d.moneda_origen === moneda) || divisas[0];
    const monto = Number(payload.monto_origen) || 100;
    const tasa = payload.operacion === 'VENTA' ? rate.tasa_venta : rate.tasa_compra;
    const codigo = `FX-${Math.floor(1000 + Math.random() * 9000)}`;
    await rtdbFetch(`reservas_divisas/${codigo}`, 'PUT', {
      codigo_retiro: codigo,
      moneda,
      operacion: payload.operacion || 'COMPRA',
      monto_origen: monto,
      monto_destino_pen: Number((monto * tasa).toFixed(2)),
      cliente_documento_tipo: docTipo,
      cliente_documento_numero: cleanDocNum,
      created_at: new Date().toISOString(),
    });
    return {
      codigo_retiro: codigo,
      monto_destino_pen: Number((monto * tasa).toFixed(2)),
      moneda,
    } as T;
  }

  if (cleanPath === '/api/public/butacas') {
    return {
      rutas: toArray(snap.butacas).map((r) => ({
        ...r,
        asientos_ocupados: Array.isArray(r.asientos_ocupados) ? r.asientos_ocupados : [],
      })),
    } as T;
  }

  if (cleanPath === '/api/public/butacas/reservar' && method === 'POST') {
    const rawNum = String(payload.cliente_documento_numero || '').trim();
    const rawDigits = rawNum.replace(/\D/g, '');
    const reqTipo = String(payload.cliente_documento_tipo || (rawDigits.length === 11 ? 'RUC' : /^\d{8}$/.test(rawDigits) ? 'DNI' : 'EXTRANJERO')).toUpperCase();
    if (
      !(reqTipo === 'DNI' && /^\d{8}$/.test(rawDigits)) &&
      !(reqTipo === 'RUC' && /^(10|15|16|17|20)\d{9}$/.test(rawDigits)) &&
      !(reqTipo === 'EXTRANJERO' && /^[A-Z0-9-]{6,20}$/i.test(rawNum))
    ) {
      throw new Error('Es obligatorio ingresar DNI (8 dígitos), RUC (11 dígitos) o Pasaporte/CE (Extranjero) para reservar.');
    }
    const rutas = toArray(snap.butacas);
    const idx = rutas.findIndex((b) => b.id === Number(payload.asiento_servicio_id));
    const seatNum = Number(payload.asiento_numero);
    if (idx < 0 || !seatNum) throw new Error('Selecciona una ruta y butaca válida.');
    const route = rutas[idx];
    const ocupados = Array.isArray(route.asientos_ocupados) ? [...route.asientos_ocupados] : [];
    if (ocupados.includes(seatNum)) {
      throw new Error('Ese asiento ya está reservado.');
    }
    ocupados.push(seatNum);
    await rtdbFetch(`butacas/${route.id}/asientos_ocupados`, 'PUT', ocupados);
    return {
      codigo_ruta: route.codigo_ruta,
      asiento_numero: seatNum,
      cliente_pin: String(Math.floor(1000 + Math.random() * 9000)),
    } as T;
  }

  if (cleanPath === '/api/public/emergencias' && method === 'GET') {
    const emergencias = toArray(snap.emergencias).sort((a, b) => (b.id || 0) - (a.id || 0));
    return { emergencias } as T;
  }

  if (cleanPath === '/api/public/emergencias/auth' && method === 'POST') {
    const entidad = String(payload.entidad || 'TODOS').trim().toUpperCase();
    const pin = String(payload.pin || '').trim();
    if (!/^\d{4}$/.test(pin)) {
      throw new Error('Ingresa un PIN de 4 dígitos');
    }
    if (pin !== '1234') {
      throw new Error('PIN de central de emergencias incorrecto');
    }
    return {
      ok: true,
      entidad,
      token: `rtdb-sos-${entidad}-${Date.now()}`,
    } as T;
  }

  if (cleanPath === '/api/public/emergencias' && method === 'POST') {
    const codigo = `SOS-${Math.floor(1000 + Math.random() * 9000)}`;
    const targetEnt = (['SAMU', 'SERENAZGO', 'PNP_105', 'BOMBEROS'].includes(
      String(payload.entidad_objetivo || '').toUpperCase()
    )
      ? String(payload.entidad_objetivo).toUpperCase()
      : 'SAMU') as EntidadEmergencia;
    const defaultWa: Record<EntidadEmergencia, string> = {
      SAMU: '+51984106106',
      SERENAZGO: '+51984100100',
      PNP_105: '+51984105105',
      BOMBEROS: '+51984116116',
    };
    const entidadWhatsapp =
      typeof payload.entidad_whatsapp === 'string' && payload.entidad_whatsapp.trim().length >= 6
        ? payload.entidad_whatsapp.trim()
        : defaultWa[targetEnt];
    const solicitanteNombre = String(payload.solicitante_nombre || payload.cliente_nombre || 'Huésped La Chuspa').trim();
    const heridoNombre = String(payload.herido_nombre || payload.cliente_nombre || solicitanteNombre).trim();
    const emLat = typeof payload.lat === 'number' ? payload.lat : -13.5167;
    const emLng = typeof payload.lng === 'number' ? payload.lng : -71.9788;
    const record = {
      id: Date.now(),
      codigo,
      cliente_nombre: heridoNombre,
      cliente_telefono: String(payload.cliente_telefono || '+51984000000'),
      solicitante_documento_tipo: payload.solicitante_documento_tipo || null,
      solicitante_documento_numero: payload.solicitante_documento_numero || null,
      solicitante_nombre: solicitanteNombre,
      herido_nombre: heridoNombre,
      ubicacion_texto: String(payload.ubicacion_texto || `${emLat.toFixed(5)}, ${emLng.toFixed(5)}`),
      lat: emLat,
      lng: emLng,
      mensaje: String(payload.mensaje || 'Asistencia prioritaria'),
      entidad_objetivo: targetEnt,
      entidad_whatsapp: entidadWhatsapp,
      estado: 'ACTIVA',
      atendida_por: null,
      unidad_lat: null,
      unidad_lng: null,
      distancia_km: null,
      eta_min: null,
      sincronizada_todas: 1,
      created_at: new Date().toISOString(),
    };
    await rtdbFetch(`emergencias/${codigo}`, 'PUT', record);
    return {
      codigo,
      entidad_objetivo: targetEnt,
      entidad_whatsapp: entidadWhatsapp,
      estado: 'ACTIVA',
      emergencia: record,
    } as T;
  }

  const dispatchMatch = cleanPath.match(/^\/api\/public\/emergencias\/([^/]+)\/despachar$/);
  if (dispatchMatch && method === 'POST') {
    const codigo = decodeURIComponent(dispatchMatch[1]).toUpperCase();
    const unidad = String(payload.atendida_por || 'Cía. Bomberos Santiago N° 116');
    const existing = snap.emergencias?.[codigo];
    if (!existing) {
      throw new Error('Alerta de emergencia no encontrada en Firebase RTDB.');
    }
    const stationCoords: Record<EntidadEmergencia, { lat: number; lng: number }> = {
      SAMU: { lat: -13.5236, lng: -71.9585 },
      SERENAZGO: { lat: -13.5179, lng: -71.9812 },
      PNP_105: { lat: -13.5162, lng: -71.9776 },
      BOMBEROS: { lat: -13.5218, lng: -71.9834 },
    };
    const lowU = unidad.toLowerCase();
    const inferredKey: EntidadEmergencia = lowU.includes('pnp') || lowU.includes('polic')
      ? 'PNP_105'
      : lowU.includes('bomber')
      ? 'BOMBEROS'
      : lowU.includes('seren')
      ? 'SERENAZGO'
      : lowU.includes('samu')
      ? 'SAMU'
      : existing.entidad_objetivo || 'SAMU';
    const defCoords = stationCoords[inferredKey] || stationCoords.SAMU;
    const uLat = typeof payload.unidad_lat === 'number' ? payload.unidad_lat : defCoords.lat;
    const uLng = typeof payload.unidad_lng === 'number' ? payload.unidad_lng : defCoords.lng;
    const tLat = typeof existing.lat === 'number' ? existing.lat : -13.5167;
    const tLng = typeof existing.lng === 'number' ? existing.lng : -71.9788;
    const distKm = Number(Math.max(0.2, haversineKm(uLat, uLng, tLat, tLng)).toFixed(2));
    const etaMin = Math.max(1, Math.round(distKm * 2.4 + 1));

    const patch = {
      estado: 'ATENDIDA' as const,
      atendida_por: unidad,
      unidad_lat: uLat,
      unidad_lng: uLng,
      distancia_km: distKm,
      eta_min: etaMin,
    };
    await rtdbFetch(`emergencias/${codigo}`, 'PATCH', patch);
    return {
      ok: true,
      emergencia: { ...existing, ...patch },
    } as T;
  }

  const sosLocMatch = cleanPath.match(/^\/api\/public\/emergencias\/([^/]+)\/ubicacion$/);
  if (sosLocMatch && method === 'POST') {
    const codigo = decodeURIComponent(sosLocMatch[1]).toUpperCase();
    const existing = snap.emergencias?.[codigo];
    if (!existing) {
      throw new Error('Alerta de emergencia no encontrada en Firebase RTDB.');
    }
    const uLat = Number(payload.unidad_lat);
    const uLng = Number(payload.unidad_lng);
    const tLat = typeof existing.lat === 'number' ? existing.lat : -13.5167;
    const tLng = typeof existing.lng === 'number' ? existing.lng : -71.9788;
    const distKm = Number(Math.max(0.05, haversineKm(uLat, uLng, tLat, tLng)).toFixed(2));
    const etaMin = distKm <= 0.12 ? 1 : Math.max(1, Math.round(distKm * 2.4 + 1));
    const patch = {
      unidad_lat: uLat,
      unidad_lng: uLng,
      distancia_km: distKm,
      eta_min: etaMin,
    };
    await rtdbFetch(`emergencias/${codigo}`, 'PATCH', patch);
    return {
      ok: true,
      emergencia: { ...existing, ...patch },
    } as T;
  }

  if (cleanPath === '/api/public/taxi/pedir' && method === 'POST') {
    const rawNum = String(payload.cliente_documento_numero || '').trim();
    const rawDigits = rawNum.replace(/\D/g, '');
    const reqTipo = String(payload.cliente_documento_tipo || (rawDigits.length === 11 ? 'RUC' : /^\d{8}$/.test(rawDigits) ? 'DNI' : 'EXTRANJERO')).toUpperCase();
    const docTipo: 'DNI' | 'RUC' | 'EXTRANJERO' =
      reqTipo === 'RUC' && /^(10|15|16|17|20)\d{9}$/.test(rawDigits)
        ? 'RUC'
        : reqTipo === 'DNI' && /^\d{8}$/.test(rawDigits)
          ? 'DNI'
          : reqTipo === 'EXTRANJERO' && /^[A-Z0-9-]{6,20}$/i.test(rawNum)
            ? 'EXTRANJERO'
            : (() => {
                throw new Error(
                  'Es obligatorio ingresar el DNI (8 dígitos), RUC (11 dígitos) o Pasaporte/CE (Extranjero) para reservar taxi.'
                );
              })();
    const cleanDocNum = docTipo === 'EXTRANJERO' ? rawNum.toUpperCase() : rawDigits;
    const unidades = toArray(snap.unidades);
    const unit = unidades.find((u) => u.id === Number(payload.unidad_id)) || unidades[0];
    const biz = toArray(snap.negocios).find((n) => n.id === unit.negocio_id);
    const codigo = `CH-${Math.floor(1000 + Math.random() * 9000)}`;
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const tel = String(payload.cliente_telefono || '+51984000000');
    const hashed = await hashPinBrowser(pin, `ord-${codigo}`);
    const oLat = typeof payload.origen_lat === 'number' ? payload.origen_lat : -13.5167;
    const oLng = typeof payload.origen_lng === 'number' ? payload.origen_lng : -71.9788;
    const dLat = typeof payload.destino_lat === 'number' ? payload.destino_lat : -13.5356;
    const dLng = typeof payload.destino_lng === 'number' ? payload.destino_lng : -71.9388;
    const tripKm = Number(Math.max(1.5, haversineKm(oLat, oLng, dLat, dLng)).toFixed(2));
    const etaMin = Math.max(2, Math.round(haversineKm(oLat, oLng, unit.lat, unit.lng) * 3.8 + 2));
    const monto = unit.tarifa_base_centavos + Math.round(unit.tarifa_km_centavos * tripKm);
    const comPlat = Math.round(monto * 0.03);

    const metodoTaxi = (payload.metodo_pago as MetodoPago) || 'Yape';
    const pagoPhoneTaxi = typeof payload.pago_telefono === 'string' ? payload.pago_telefono.trim() : '';
    const pagoOtpTaxi = typeof payload.pago_codigo_aprobacion === 'string' ? payload.pago_codigo_aprobacion.trim() : '';
    if ((metodoTaxi === 'Yape' || metodoTaxi === 'Plin') && pagoPhoneTaxi && !/^9\d{8}$/.test(pagoPhoneTaxi)) {
      throw new Error('El celular Yape/Plin debe tener 9 dígitos iniciando en 9');
    }
    if ((metodoTaxi === 'Yape' || metodoTaxi === 'Plin') && pagoOtpTaxi && !/^\d{6}$/.test(pagoOtpTaxi)) {
      throw new Error('El código de aprobación Yape/Plin debe tener 6 dígitos');
    }

    const pedido: RtdbPedido = {
      id: Date.now(),
      codigo,
      negocio_id: unit.negocio_id,
      unidad_id: unit.id,
      referido_negocio_id: null,
      negocio_nombre: unit.negocio_nombre,
      emisor_ruc: biz?.documento_numero || '20601234565',
      emisor_razon_social: biz?.razon_social || unit.negocio_nombre,
      emisor_direccion: biz?.zona || 'Cusco, Perú',
      categoria: 'TRANSPORTE',
      item_nombre: `${unit.modelo} · ${unit.conductor_nombre}`,
      transcripcion: `Taxi VIP ${unit.modelo} (${unit.placa}) · ${payload.destino_texto || 'Centro Cusco'}`,
      monto_centavos: monto,
      metodo_pago: metodoTaxi,
      pago_gateway:
        metodoTaxi === 'Yape'
          ? 'YAPE_PASARELA'
          : metodoTaxi === 'Plin'
          ? 'PLIN_CODIGO'
          : metodoTaxi === 'Tarjeta'
          ? 'TARJETA_TRANSFERENCIA'
          : 'EFECTIVO',
      pago_referencia: pagoOtpTaxi ? `${metodoTaxi.toUpperCase()}-${pagoPhoneTaxi.slice(-4) || '0000'}-OK` : null,
      pago_estado:
        metodoTaxi === 'Tarjeta'
          ? 'TRANSFERENCIA_CONFIRMADA'
          : pagoOtpTaxi
          ? 'CODIGO_AUTORIZADO'
          : 'PENDIENTE',
      estado: 'PENDIENTE_CONFIRMACION',
      created_at: new Date().toISOString(),
      cliente_nombre: String(payload.cliente_nombre || 'Huésped'),
      cliente_telefono_masked: tel.length > 4 ? `***${tel.slice(-4)}` : tel,
      cliente_documento_tipo: docTipo,
      cliente_documento_numero: cleanDocNum,
      cliente_documento_verificado: payload.cliente_documento_verificado ? 1 : 0,
      cliente_direccion_fiscal: payload.cliente_direccion_fiscal || null,
      comprobante_tipo: null,
      origen_texto: String(payload.origen_texto || 'Plaza de Armas, Cusco'),
      destino_texto: String(payload.destino_texto || 'Aeropuerto Velasco Astete'),
      origen_lat: oLat,
      origen_lng: oLng,
      destino_lat: dLat,
      destino_lng: dLng,
      conductor_lat: unit.lat,
      conductor_lng: unit.lng,
      unidad_lat: unit.lat,
      unidad_lng: unit.lng,
      distancia_km: tripKm,
      eta_min: etaMin,
      conductor_nombre: unit.conductor_nombre,
      placa: unit.placa,
      modelo: unit.modelo,
      pin_salt: hashed.salt,
      pin_hash: hashed.hash,
      intentos_pin: 0,
      pin_bloqueado: 0,
      comision_plataforma_centavos: comPlat,
      comision_referido_centavos: 0,
      comision_retenida_centavos: 0,
    };
    await rtdbFetch(`pedidos/${codigo}`, 'PUT', pedido);
    return { pedido, cliente_pin: pin } as T;
  }

  if (cleanPath === '/api/public/pedidos' && method === 'POST') {
    const rawNum = String(payload.cliente_documento_numero || '').trim();
    const rawDigits = rawNum.replace(/\D/g, '');
    const reqTipo = String(payload.cliente_documento_tipo || (rawDigits.length === 11 ? 'RUC' : /^\d{8}$/.test(rawDigits) ? 'DNI' : 'EXTRANJERO')).toUpperCase();
    const docTipo: 'DNI' | 'RUC' | 'EXTRANJERO' =
      reqTipo === 'RUC' && /^(10|15|16|17|20)\d{9}$/.test(rawDigits)
        ? 'RUC'
        : reqTipo === 'DNI' && /^\d{8}$/.test(rawDigits)
          ? 'DNI'
          : reqTipo === 'EXTRANJERO' && /^[A-Z0-9-]{6,20}$/i.test(rawNum)
            ? 'EXTRANJERO'
            : (() => {
                throw new Error(
                  'Es obligatorio ingresar DNI (8 dígitos), RUC (11 dígitos) o Pasaporte/CE (Extranjero) para reservar.'
                );
              })();
    const cleanDocNum = docTipo === 'EXTRANJERO' ? rawNum.toUpperCase() : rawDigits;
    const servicios = toArray(snap.servicios);
    const srv = servicios.find((s) => s.id === Number(payload.servicio_id)) || servicios[0];
    const biz = toArray(snap.negocios).find((n) => n.id === srv.negocio_id);
    const codigo = `CH-${Math.floor(1000 + Math.random() * 9000)}`;
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const tel = String(payload.cliente_telefono || '+51984000000');
    const hashed = await hashPinBrowser(pin, `ord-${codigo}`);
    const comPlat = Math.round(srv.precio_centavos * 0.03);

    const metodoPed = (payload.metodo_pago as MetodoPago) || 'Yape';
    const pagoPhonePed = typeof payload.pago_telefono === 'string' ? payload.pago_telefono.trim() : '';
    const pagoOtpPed = typeof payload.pago_codigo_aprobacion === 'string' ? payload.pago_codigo_aprobacion.trim() : '';
    if ((metodoPed === 'Yape' || metodoPed === 'Plin') && pagoPhonePed && !/^9\d{8}$/.test(pagoPhonePed)) {
      throw new Error('El celular Yape/Plin debe tener 9 dígitos iniciando en 9');
    }
    if ((metodoPed === 'Yape' || metodoPed === 'Plin') && pagoOtpPed && !/^\d{6}$/.test(pagoOtpPed)) {
      throw new Error('El código de aprobación Yape/Plin debe tener 6 dígitos');
    }

    const pedido: RtdbPedido = {
      id: Date.now(),
      codigo,
      negocio_id: srv.negocio_id,
      referido_negocio_id: null,
      negocio_nombre: srv.negocio_nombre,
      negocio_zona: srv.zona,
      emisor_ruc: biz?.documento_numero || '20601234565',
      emisor_razon_social: biz?.razon_social || srv.negocio_nombre,
      emisor_direccion: biz?.zona || srv.zona || 'Cusco, Perú',
      categoria: srv.categoria,
      item_nombre: srv.nombre,
      transcripcion: String(payload.transcripcion || srv.nombre),
      monto_centavos: srv.precio_centavos,
      metodo_pago: metodoPed,
      pago_gateway:
        metodoPed === 'Yape'
          ? 'YAPE_PASARELA'
          : metodoPed === 'Plin'
          ? 'PLIN_CODIGO'
          : metodoPed === 'Tarjeta'
          ? 'TARJETA_TRANSFERENCIA'
          : 'EFECTIVO',
      pago_referencia: pagoOtpPed ? `${metodoPed.toUpperCase()}-${pagoPhonePed.slice(-4) || '0000'}-OK` : null,
      pago_estado:
        metodoPed === 'Tarjeta'
          ? 'TRANSFERENCIA_CONFIRMADA'
          : pagoOtpPed
          ? 'CODIGO_AUTORIZADO'
          : 'PENDIENTE',
      estado: 'PENDIENTE_CONFIRMACION',
      created_at: new Date().toISOString(),
      cliente_nombre: String(payload.cliente_nombre || 'Huésped'),
      cliente_telefono_masked: tel.length > 4 ? `***${tel.slice(-4)}` : tel,
      cliente_documento_tipo: docTipo,
      cliente_documento_numero: cleanDocNum,
      cliente_documento_verificado: payload.cliente_documento_verificado ? 1 : 0,
      cliente_direccion_fiscal: payload.cliente_direccion_fiscal || null,
      comprobante_tipo: docTipo === 'RUC' ? 'FACTURA' : 'BOLETA',
      pin_salt: hashed.salt,
      pin_hash: hashed.hash,
      intentos_pin: 0,
      pin_bloqueado: 0,
      comision_plataforma_centavos: comPlat,
      comision_referido_centavos: 0,
      comision_retenida_centavos: 0,
    };
    await rtdbFetch(`pedidos/${codigo}`, 'PUT', pedido);
    return { pedido, cliente_pin: pin } as T;
  }

  if (cleanPath === '/api/public/market-pedidos' && method === 'POST') {
    const rawNum = String(payload.cliente_documento_numero || '').trim();
    const rawDigits = rawNum.replace(/\D/g, '');
    const reqTipo = String(payload.cliente_documento_tipo || (rawDigits.length === 11 ? 'RUC' : /^\d{8}$/.test(rawDigits) ? 'DNI' : 'EXTRANJERO')).toUpperCase();
    const docTipo: 'DNI' | 'RUC' | 'EXTRANJERO' =
      reqTipo === 'RUC' && /^(10|15|16|17|20)\d{9}$/.test(rawDigits)
        ? 'RUC'
        : reqTipo === 'DNI' && /^\d{8}$/.test(rawDigits)
          ? 'DNI'
          : reqTipo === 'EXTRANJERO' && /^[A-Z0-9-]{6,20}$/i.test(rawNum)
            ? 'EXTRANJERO'
            : (() => {
                throw new Error(
                  'Es obligatorio ingresar DNI (8 dígitos), RUC (11 dígitos) o Pasaporte/CE (Extranjero) para reservar en minimarket.'
                );
              })();
    const cleanDocNum = docTipo === 'EXTRANJERO' ? rawNum.toUpperCase() : rawDigits;
    const negocios = toArray(snap.negocios).filter((n) => n.activo !== 0);
    const targetBiz =
      negocios.find((n) => n.rubro === 'RESTAURANTE' || n.rubro === 'FARMACIA') || negocios[0];
    if (!targetBiz) throw new Error('No hay negocios activos en red para recibir pedidos.');
    const codigo = `MKT-${Math.floor(1000 + Math.random() * 9000)}`;
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const tel = String(payload.cliente_telefono || '+51984000000');
    const hashed = await hashPinBrowser(pin, `ord-${codigo}`);
    const monto = Number(payload.monto_centavos) || 1500;
    const comPlat = Math.round(monto * 0.03);
    const marketNombre = String(payload.market_nombre || 'Minimarket Cusco');
    const resumen = String(payload.items_resumen || payload.item_resumen || 'Canasta de productos');
    const metodoMkt = (payload.metodo_pago as MetodoPago) || 'Yape';
    const pagoPhoneMkt = typeof payload.pago_telefono === 'string' ? payload.pago_telefono.trim() : '';
    const pagoOtpMkt = typeof payload.pago_codigo_aprobacion === 'string' ? payload.pago_codigo_aprobacion.trim() : '';
    if ((metodoMkt === 'Yape' || metodoMkt === 'Plin') && pagoPhoneMkt && !/^9\d{8}$/.test(pagoPhoneMkt)) {
      throw new Error('El celular Yape/Plin debe tener 9 dígitos iniciando en 9');
    }
    if ((metodoMkt === 'Yape' || metodoMkt === 'Plin') && pagoOtpMkt && !/^\d{6}$/.test(pagoOtpMkt)) {
      throw new Error('El código de aprobación Yape/Plin debe tener 6 dígitos');
    }

    const pedido: RtdbPedido = {
      id: Date.now(),
      codigo,
      negocio_id: targetBiz.id,
      referido_negocio_id: null,
      negocio_nombre: targetBiz.nombre,
      negocio_zona: String(payload.market_zona || targetBiz.zona),
      emisor_ruc: targetBiz.documento_numero || '20601234565',
      emisor_razon_social: targetBiz.razon_social || targetBiz.nombre,
      emisor_direccion: targetBiz.zona || 'Cusco, Perú',
      categoria: targetBiz.rubro,
      item_nombre: `${marketNombre} · ${resumen.slice(0, 70)}`,
      transcripcion: `[${payload.tipo_entrega === 'DELIVERY' ? 'DELIVERY' : 'RESERVA EN TIENDA'}] ${marketNombre}: ${resumen}`,
      monto_centavos: monto,
      metodo_pago: metodoMkt,
      pago_gateway:
        metodoMkt === 'Yape'
          ? 'YAPE_PASARELA'
          : metodoMkt === 'Plin'
          ? 'PLIN_CODIGO'
          : metodoMkt === 'Tarjeta'
          ? 'TARJETA_TRANSFERENCIA'
          : 'EFECTIVO',
      pago_referencia: pagoOtpMkt ? `${metodoMkt.toUpperCase()}-${pagoPhoneMkt.slice(-4) || '0000'}-OK` : null,
      pago_estado:
        metodoMkt === 'Tarjeta'
          ? 'TRANSFERENCIA_CONFIRMADA'
          : pagoOtpMkt
          ? 'CODIGO_AUTORIZADO'
          : 'PENDIENTE',
      estado: 'PENDIENTE_CONFIRMACION',
      created_at: new Date().toISOString(),
      cliente_nombre: String(payload.cliente_nombre || 'Cliente Verificado'),
      cliente_telefono_masked: tel.length > 4 ? `***${tel.slice(-4)}` : tel,
      cliente_documento_tipo: docTipo,
      cliente_documento_numero: cleanDocNum,
      cliente_documento_verificado: payload.cliente_documento_verificado ? 1 : 0,
      cliente_direccion_fiscal: payload.cliente_direccion_fiscal || null,
      comprobante_tipo: docTipo === 'RUC' ? 'FACTURA' : 'BOLETA',
      destino_texto: String(payload.market_zona || 'Cusco'),
      pin_salt: hashed.salt,
      pin_hash: hashed.hash,
      intentos_pin: 0,
      pin_bloqueado: 0,
      comision_plataforma_centavos: comPlat,
      comision_referido_centavos: 0,
      comision_retenida_centavos: 0,
    };
    await rtdbFetch(`pedidos/${codigo}`, 'PUT', pedido);
    return { pedido, cliente_pin: pin } as T;
  }

  const orderMatch = cleanPath.match(
    /^\/api\/public\/pedidos\/([^/]+)(\/cancelar|\/resena|\/comprobante)?$/
  );
  if (orderMatch) {
    const codigo = decodeURIComponent(orderMatch[1]);
    const action = orderMatch[2] || '';
    const pedidos = snap.pedidos || {};
    const pedido = pedidos[codigo];
    if (!pedido) throw new Error('Pedido no encontrado en Firebase RTDB.');
    if (action === '/cancelar' && method === 'POST') {
      await rtdbFetch(`pedidos/${codigo}/estado`, 'PUT', 'CANCELADO');
      return { ok: true, pedido: { ...pedido, estado: 'CANCELADO' } } as T;
    }
    if (action === '/resena' && method === 'POST') {
      await rtdbFetch(`resenas/${codigo}`, 'PUT', {
        codigo,
        negocio_id: pedido.negocio_id,
        calificacion: Number(payload.calificacion) || 5,
        comentario: String(payload.comentario || ''),
        created_at: new Date().toISOString(),
      });
      return { ok: true } as T;
    }
    if (action === '/comprobante' && method === 'GET') {
      if (pedido.categoria === 'TRANSPORTE') {
        throw new Error('Los servicios de taxi no emiten comprobante electrónico; el documento solo identifica al pasajero.');
      }
      if (pedido.estado !== 'ENTREGADO_PAGADO') {
        throw new Error('El comprobante electrónico se emite al finalizar y liquidar el pedido.');
      }
      const biz = toArray(snap.negocios).find((n) => n.id === pedido.negocio_id);
      const tipo =
        pedido.comprobante_tipo ||
        (pedido.cliente_documento_tipo === 'RUC' ? 'FACTURA' : 'BOLETA');
      const serie = pedido.comprobante_serie || (tipo === 'FACTURA' ? 'F001' : 'B001');
      const numero =
        pedido.comprobante_numero || String(pedido.id).slice(-8).padStart(8, '0');
      const totalCentavos = Number(pedido.monto_centavos) || 0;
      const opGravada = Math.round(totalCentavos / 1.18);
      const igv = totalCentavos - opGravada;
      return {
        comprobante: {
          tipo,
          serie,
          numero,
          numero_completo: `${serie}-${numero}`,
          emitido_at: pedido.comprobante_emitido_at || pedido.created_at,
          pedido_codigo: pedido.codigo,
          metodo_pago: pedido.metodo_pago,
          moneda: 'PEN',
          emisor: {
            ruc: pedido.emisor_ruc || biz?.documento_numero || '20601234565',
            razon_social: pedido.emisor_razon_social || biz?.razon_social || pedido.negocio_nombre || 'La Chuspa Cusco',
            nombre_comercial: pedido.negocio_nombre || biz?.nombre || 'La Chuspa Cusco',
            direccion: pedido.emisor_direccion || biz?.zona || 'Cusco, Perú',
          },
          receptor: {
            tipo_doc: pedido.cliente_documento_tipo || 'DNI',
            numero_doc: pedido.cliente_documento_numero || '00000000',
            nombre: pedido.cliente_nombre,
            direccion: pedido.cliente_direccion_fiscal || 'Cusco, Perú',
          },
          items: [
            {
              cantidad: 1,
              descripcion: pedido.item_nombre,
              detalle: pedido.transcripcion,
              valor_unitario_centavos: opGravada,
              total_centavos: totalCentavos,
            },
          ],
          op_gravada_centavos: opGravada,
          igv_centavos: igv,
          total_centavos: totalCentavos,
        },
      } as T;
    }
    const { pin_hash: _ph, pin_salt: _ps, ...publicOrder } = pedido;
    const whatsappLogs = [
      {
        id: 1,
        canal: 'WhatsApp',
        plantilla: 'PEDIDO_CONFIRMADO',
        mensaje: `Tu solicitud ${pedido.codigo} está sincronizada en Firebase RTDB. Estado actual: ${pedido.estado}.`,
        estado: 'ENVIADO',
        created_at: pedido.created_at,
      },
    ];
    return {
      pedido: publicOrder,
      notificaciones: whatsappLogs,
      notificaciones_whatsapp: whatsappLogs,
      resena: snap.resenas?.[codigo] ?? null,
      puntos_cliente: pedido.estado === 'ENTREGADO_PAGADO' ? 120 : 25,
    } as T;
  }

  if (cleanPath === '/api/public/negocios/registro' && method === 'POST') {
    const rubro = String(payload.rubro || 'RESTAURANTE') as Rubro;
    const nombre = String(payload.nombre || '').trim();
    const telefono = String(payload.telefono || '').trim();
    const cleanPin = String(payload.pin || '').trim();
    if (nombre.length < 2 || telefono.length < 6 || !/^\d{4}$/.test(cleanPin)) {
      throw new Error('Completa nombre, WhatsApp y PIN de 4 dígitos.');
    }
    const id = Date.now();
    const codigo = `NEG-${rubro.slice(0, 2)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const hashed = await hashPinBrowser(cleanPin, `seed-${codigo}`);
    const nextLat = typeof payload.lat === 'number' && Number.isFinite(payload.lat) ? payload.lat : -13.5167;
    const nextLng = typeof payload.lng === 'number' && Number.isFinite(payload.lng) ? payload.lng : -71.9788;
    const nextZona = String(payload.zona || 'Centro Histórico, Cusco');
    const nextPanelIa =
      payload.panel_ia && typeof payload.panel_ia === 'object'
        ? (payload.panel_ia as AiBusinessPanelSchema)
        : null;

    const newBiz: RtdbNegocio = {
      id,
      codigo,
      rubro,
      nombre,
      telefono,
      descripcion: String(payload.descripcion || `Negocio verificado en ${payload.tipo_negocio || rubro} en Cusco`),
      lat: nextLat,
      lng: nextLng,
      zona: nextZona,
      en_linea: 1,
      activo: 1,
      saldo: 0,
      saldo_retenido: 0,
      calificacion: 4.9,
      horario_apertura: '07:00',
      horario_cierre: '22:30',
      abierto_24h: 0,
      metodos_pago_aceptados: 'Yape,Plin,Efectivo,Tarjeta',
      auto_aceptar_pedidos: 0,
      alerta_voz_activa: 1,
      tarifa_minima_centavos: 600,
      radio_cobertura_km: 8.0,
      tipo_persona: payload.tipo_persona === 'NATURAL' ? 'NATURAL' : 'JURIDICA',
      documento_tipo: payload.documento_tipo === 'DNI' ? 'DNI' : 'RUC',
      documento_numero: payload.documento_numero || null,
      razon_social: payload.razon_social || null,
      tipo_negocio: String(payload.tipo_negocio || payload.oficio_especifico || 'Comercio Multirubro'),
      macro_categoria:
        typeof payload.macro_categoria === 'string' && payload.macro_categoria.trim()
          ? payload.macro_categoria.trim()
          : nextPanelIa?.macro_categoria || undefined,
      oficio_especifico:
        typeof payload.oficio_especifico === 'string' && payload.oficio_especifico.trim()
          ? payload.oficio_especifico.trim()
          : nextPanelIa?.oficio_especifico || String(payload.tipo_negocio || '').trim() || undefined,
      oficio_id:
        typeof payload.oficio_id === 'string' && payload.oficio_id.trim()
          ? payload.oficio_id.trim()
          : nextPanelIa?.oficio_id || undefined,
      modalidades_venta: Array.isArray(payload.modalidades_venta)
        ? payload.modalidades_venta.join(',')
        : String(payload.modalidades_venta || 'Unidad,Servicio'),
      panel_ia: nextPanelIa,
      mp_public_key: typeof payload.mp_public_key === 'string' ? payload.mp_public_key.trim() : null,
      mp_yape_configurado: false,
      yape_numero: typeof payload.yape_numero === 'string' && payload.yape_numero.trim() ? payload.yape_numero.trim() : telefono,
      plin_numero: typeof payload.plin_numero === 'string' && payload.plin_numero.trim() ? payload.plin_numero.trim() : telefono,
      banco_nombre: typeof payload.banco_nombre === 'string' ? payload.banco_nombre.trim() || null : null,
      banco_titular: typeof payload.banco_titular === 'string' ? payload.banco_titular.trim() || null : null,
      banco_cuenta: typeof payload.banco_cuenta === 'string' ? payload.banco_cuenta.trim() || null : null,
      banco_cci: typeof payload.banco_cci === 'string' ? payload.banco_cci.trim() || null : null,
      estado_regla: 'ACTIVO',
      motivo_estado: null,
      pin_salt: hashed.salt,
      pin_hash: hashed.hash,
    };
    await rtdbFetch(`negocios/${codigo}`, 'PUT', newBiz);
    if (newBiz.oficio_especifico) {
      const catMatch = findExactOrSynonymOficioClient(
        newBiz.oficio_especifico,
        mergeRtdbOficiosCatalog(snap)
      );
      if (!catMatch) {
        const autoOficio = buildUniversalOficioClientFallback(newBiz.oficio_especifico);
        await rtdbFetch(`oficios_catalogo/${autoOficio.oficio_id}`, 'PUT', autoOficio).catch(() => {});
      }
    }

    const starterItems = Array.isArray(payload.catalogo_inicial)
      ? payload.catalogo_inicial
      : Array.isArray(nextPanelIa?.catalogo_inicial)
        ? nextPanelIa.catalogo_inicial
        : [];
    if (starterItems.length > 0 && rubro !== 'TRANSPORTE' && rubro !== 'CASA_CAMBIO') {
      for (let idx = 0; idx < Math.min(starterItems.length, 10); idx++) {
        const item = starterItems[idx];
        const srvId = id + idx + 1;
        const srv: RtdbServicio = {
          id: srvId,
          negocio_id: id,
          negocio_nombre: nombre,
          zona: nextZona,
          calificacion: 4.9,
          categoria: rubro,
          nombre: String(item.nombre || 'Producto'),
          descripcion: String(item.descripcion || ''),
          precio_centavos: Math.max(100, Number(item.precio_centavos) || 1500),
          duracion_min: Math.max(5, Number(item.duracion_min) || 30),
          stock: Math.max(1, Number(item.stock) || 20),
          unidad_medida: String(item.unidad_medida || 'Unidad'),
          ...(item.atributos ? { atributos: item.atributos } : {}),
          disponible: 1,
        };
        await rtdbFetch(`servicios/${srvId}`, 'PUT', srv);
      }
    }

    return {
      token: `rtdb-biz:${codigo}`,
      negocio: {
        ...newBiz,
        en_linea: true,
        abierto_24h: false,
        auto_aceptar_pedidos: false,
        alerta_voz_activa: true,
        saldo_libre: 0,
      },
    } as T;
  }

  if (cleanPath === '/api/negocio/login' && method === 'POST') {
    const negocios = toArray(snap.negocios);
    const biz = negocios.find((n) => n.codigo === payload.codigo);
    if (!biz) throw new Error('Código de negocio no encontrado.');
    if (biz.activo === 0) {
      throw new Error(
        `Negocio suspendido (${biz.estado_regla || 'INCUMPLIMIENTO'})${
          biz.motivo_estado ? `: ${biz.motivo_estado}` : ''
        }`
      );
    }
    const check = await hashPinBrowser(String(payload.pin || '').trim(), biz.pin_salt);
    if (check.hash !== biz.pin_hash) {
      throw new Error('Código o PIN inválido.');
    }
    return {
      token: `rtdb-biz:${biz.codigo}`,
      negocio: {
        id: biz.id,
        codigo: biz.codigo,
        rubro: biz.rubro,
        nombre: biz.nombre,
      },
    } as T;
  }

  const bizMatch = cleanPath.match(
    /^\/api\/negocio\/(\d+)\/(resumen|estado|configuracion|pin|pedidos|guias-disponibles|reservas-referidas|servicios|servicios\/\d+|unidades|unidades\/\d+|divisas|divisas\/\d+|recargas|pedidos\/(\d+)\/(aceptar|rechazar|validar-pin|etapa|finalizar-viaje|entregar|cancelar|contraoferta|emitir-sunat))$/
  );
  if (bizMatch) {
    const bizId = Number(bizMatch[1]);
    const sub = bizMatch[2];
    const negocios = toArray(snap.negocios);
    const biz = negocios.find((n) => n.id === bizId);
    if (!biz || token !== `rtdb-biz:${biz.codigo}`) {
      throw new Error('Sesión de negocio inválida o expirada.');
    }

    if (sub === 'resumen') {
      const regla = (snap.reglas && snap.reglas[biz.rubro]) || {
        porcentaje_plataforma: 3,
        porcentaje_referido: 0,
      };
      const devCfg = await leerDevApiConfig(FIREBASE_RTDB_URL);
      return {
        negocio: {
          id: biz.id,
          codigo: biz.codigo,
          rubro: biz.rubro,
          nombre: biz.nombre,
          telefono: biz.telefono || '+51984000000',
          descripcion: biz.descripcion || '',
          zona: biz.zona,
          lat: biz.lat,
          lng: biz.lng,
          en_linea: biz.en_linea === 1,
          horario_apertura: biz.horario_apertura || '07:00',
          horario_cierre: biz.horario_cierre || '22:30',
          abierto_24h: biz.abierto_24h === 1,
          metodos_pago_aceptados: biz.metodos_pago_aceptados || 'Yape,Plin,Efectivo,Tarjeta',
          auto_aceptar_pedidos: biz.auto_aceptar_pedidos === 1,
          alerta_voz_activa: biz.alerta_voz_activa !== 0,
          tarifa_minima_centavos: biz.tarifa_minima_centavos ?? 600,
          radio_cobertura_km: biz.radio_cobertura_km ?? 8.0,
          tipo_persona: biz.tipo_persona || 'JURIDICA',
          documento_tipo: biz.documento_tipo || 'RUC',
          documento_numero: biz.documento_numero || '',
          razon_social: biz.razon_social || '',
          tipo_negocio: biz.tipo_negocio || 'Comercio Multirubro',
          modalidades_venta: biz.modalidades_venta || 'Unidad,Servicio',
          panel_ia: biz.panel_ia || null,
          mp_public_key: biz.mp_public_key || '',
          mp_yape_configurado: Boolean(biz.mp_yape_configurado),
          mp_access_token_masked: '',
          yape_numero: biz.yape_numero || biz.telefono || '',
          plin_numero: biz.plin_numero || biz.telefono || '',
          banco_nombre: biz.banco_nombre || '',
          banco_titular: biz.banco_titular || '',
          banco_cuenta: biz.banco_cuenta || '',
          banco_cci: biz.banco_cci || '',
          estado_regla: biz.estado_regla || 'ACTIVO',
          motivo_estado: biz.motivo_estado || null,
          saldo: biz.saldo,
          saldo_retenido: biz.saldo_retenido,
          saldo_libre: biz.saldo - biz.saldo_retenido,
        },
        regla_comision: regla,
        facturacion_apisperu_activa:
          biz.rubro !== 'TRANSPORTE' && Boolean(devCfg.tokenFacturacionApisperu),
        movimientos: toArray(snap.movimientos)
          .filter((m) => m.negocio_id === biz.id || m.negocio_nombre === biz.nombre)
          .sort((a, b) => b.id - a.id),
        recargas: toArray(snap.recargas).filter((r) => r.negocio_id === biz.id),
        servicios: toArray(snap.servicios).filter((s) => s.negocio_id === biz.id),
        unidades: toArray(snap.unidades).filter((u) => u.negocio_id === biz.id),
        tasas: toArray(snap.divisas).filter((d) => d.negocio_id === biz.id),
      } as T;
    }

    if (sub === 'estado' && method === 'PATCH') {
      const enLinea = payload.en_linea ? 1 : 0;
      await rtdbFetch(`negocios/${biz.codigo}`, 'PATCH', { en_linea: enLinea });
      return { ok: true, en_linea: enLinea === 1 } as T;
    }

    if (sub === 'configuracion' && method === 'PUT') {
      const updates: Record<string, unknown> = {
        nombre: typeof payload.nombre === 'string' && payload.nombre.trim() ? payload.nombre.trim() : biz.nombre,
        telefono: typeof payload.telefono === 'string' && payload.telefono.trim() ? payload.telefono.trim() : biz.telefono || '+51984000000',
        descripcion: typeof payload.descripcion === 'string' ? payload.descripcion.trim() : biz.descripcion,
        zona: typeof payload.zona === 'string' && payload.zona.trim() ? payload.zona.trim() : biz.zona,
        lat: typeof payload.lat === 'number' ? payload.lat : biz.lat,
        lng: typeof payload.lng === 'number' ? payload.lng : biz.lng,
        en_linea: typeof payload.en_linea === 'boolean' ? (payload.en_linea ? 1 : 0) : biz.en_linea,
        horario_apertura: payload.horario_apertura || biz.horario_apertura || '07:00',
        horario_cierre: payload.horario_cierre || biz.horario_cierre || '22:30',
        abierto_24h: payload.abierto_24h ? 1 : 0,
        metodos_pago_aceptados: payload.metodos_pago_aceptados || biz.metodos_pago_aceptados || 'Yape,Plin,Efectivo',
        auto_aceptar_pedidos: payload.auto_aceptar_pedidos ? 1 : 0,
        alerta_voz_activa: payload.alerta_voz_activa !== false ? 1 : 0,
        tarifa_minima_centavos: Number(payload.tarifa_minima_centavos) || biz.tarifa_minima_centavos || 600,
        radio_cobertura_km: Number(payload.radio_cobertura_km) || biz.radio_cobertura_km || 8,
        tipo_persona: payload.tipo_persona === 'NATURAL' ? 'NATURAL' : biz.tipo_persona || 'JURIDICA',
        documento_tipo: payload.documento_tipo === 'DNI' ? 'DNI' : payload.documento_tipo === 'RUC' ? 'RUC' : biz.documento_tipo || 'RUC',
        documento_numero: payload.documento_numero !== undefined ? String(payload.documento_numero || '').trim() || null : biz.documento_numero || null,
        razon_social: payload.razon_social !== undefined ? String(payload.razon_social || '').trim() || null : biz.razon_social || null,
        tipo_negocio: payload.tipo_negocio || biz.tipo_negocio || 'Comercio Multirubro',
        ...(typeof payload.macro_categoria === 'string' ? { macro_categoria: payload.macro_categoria.trim() || biz.macro_categoria } : {}),
        ...(typeof payload.oficio_especifico === 'string' ? { oficio_especifico: payload.oficio_especifico.trim() || biz.oficio_especifico } : {}),
        ...(typeof payload.oficio_id === 'string' ? { oficio_id: payload.oficio_id.trim() || biz.oficio_id } : {}),
        modalidades_venta: Array.isArray(payload.modalidades_venta)
          ? payload.modalidades_venta.join(',')
          : payload.modalidades_venta || biz.modalidades_venta || 'Unidad,Servicio',
        ...(payload.panel_ia && typeof payload.panel_ia === 'object' ? { panel_ia: payload.panel_ia } : {}),
        ...(typeof payload.mp_public_key === 'string' ? { mp_public_key: payload.mp_public_key.trim() || null } : {}),
        ...(typeof payload.yape_numero === 'string' ? { yape_numero: payload.yape_numero.trim() || null } : {}),
        ...(typeof payload.plin_numero === 'string' ? { plin_numero: payload.plin_numero.trim() || null } : {}),
        ...(typeof payload.banco_nombre === 'string' ? { banco_nombre: payload.banco_nombre.trim() || null } : {}),
        ...(typeof payload.banco_titular === 'string' ? { banco_titular: payload.banco_titular.trim() || null } : {}),
        ...(typeof payload.banco_cuenta === 'string' ? { banco_cuenta: payload.banco_cuenta.trim() || null } : {}),
        ...(typeof payload.banco_cci === 'string' ? { banco_cci: payload.banco_cci.trim() || null } : {}),
      };
      await rtdbFetch(`negocios/${biz.codigo}`, 'PATCH', updates);
      if (typeof updates.oficio_especifico === 'string' && updates.oficio_especifico) {
        const catMatch = findExactOrSynonymOficioClient(
          updates.oficio_especifico,
          mergeRtdbOficiosCatalog(snap)
        );
        if (!catMatch) {
          const autoOficio = buildUniversalOficioClientFallback(updates.oficio_especifico);
          await rtdbFetch(`oficios_catalogo/${autoOficio.oficio_id}`, 'PUT', autoOficio).catch(() => {});
        }
      }
      return { ok: true, negocio: { ...biz, ...updates } } as T;
    }

    if (sub === 'pin' && method === 'PUT') {
      const check = await hashPinBrowser(String(payload.pin_actual || '').trim(), biz.pin_salt);
      if (check.hash !== biz.pin_hash) throw new Error('El PIN actual es incorrecto.');
      const next = await hashPinBrowser(String(payload.pin_nuevo || '').trim(), biz.pin_salt);
      await rtdbFetch(`negocios/${biz.codigo}`, 'PATCH', { pin_hash: next.hash });
      return { ok: true } as T;
    }

    if (sub.startsWith('servicios/') && (method === 'PATCH' || method === 'DELETE')) {
      const srvId = sub.split('/')[1];
      if (method === 'DELETE') {
        await rtdbFetch(`servicios/${srvId}`, 'PUT', null);
        return { ok: true } as T;
      }
      await rtdbFetch(`servicios/${srvId}`, 'PATCH', {
        ...(payload.nombre ? { nombre: payload.nombre } : {}),
        ...(payload.descripcion !== undefined ? { descripcion: payload.descripcion } : {}),
        ...(payload.precio_centavos ? { precio_centavos: payload.precio_centavos } : {}),
        ...(payload.stock !== undefined ? { stock: payload.stock } : {}),
        ...(payload.unidad_medida ? { unidad_medida: payload.unidad_medida } : {}),
        ...(payload.atributos ? { atributos: payload.atributos } : {}),
        ...(payload.disponible !== undefined ? { disponible: payload.disponible ? 1 : 0 } : {}),
      });
      return { ok: true } as T;
    }

    if (sub === 'unidades' && method === 'POST') {
      const id = Date.now();
      const unidad: RtdbUnidad = {
        id,
        negocio_id: biz.id,
        negocio_nombre: biz.nombre,
        conductor_nombre: String(payload.conductor_nombre || 'Conductor'),
        placa: String(payload.placa || 'X1A-000').toUpperCase(),
        modelo: String(payload.modelo || 'Toyota Yaris'),
        color: String(payload.color || 'Plata'),
        tarifa_base_centavos: Number(payload.tarifa_base_centavos) || 600,
        tarifa_km_centavos: Number(payload.tarifa_km_centavos) || 220,
        calificacion: 4.9,
        lat: biz.lat,
        lng: biz.lng,
        estado: 'DISPONIBLE',
        certificada: 1,
      };
      await rtdbFetch(`unidades/${id}`, 'PUT', unidad);
      return { ok: true, unidad } as T;
    }

    if (sub.startsWith('unidades/') && (method === 'PATCH' || method === 'DELETE')) {
      const uId = sub.split('/')[1];
      if (method === 'DELETE') {
        await rtdbFetch(`unidades/${uId}`, 'PUT', null);
        return { ok: true } as T;
      }
      await rtdbFetch(`unidades/${uId}`, 'PATCH', payload);
      if (typeof payload.lat === 'number' && typeof payload.lng === 'number') {
        const pedidosList = Object.values(snap.pedidos || {});
        for (const p of pedidosList) {
          if (
            p.negocio_id === biz.id &&
            (p.estado === 'PENDIENTE_CONFIRMACION' || p.estado === 'CONFIRMADO_PREPARACION')
          ) {
            await rtdbFetch(`pedidos/${p.codigo}`, 'PATCH', {
              conductor_lat: payload.lat,
              conductor_lng: payload.lng,
              unidad_lat: payload.lat,
              unidad_lng: payload.lng,
            });
          }
        }
      }
      const unitsRecord =
        snap.unidades && !Array.isArray(snap.unidades)
          ? (snap.unidades as Record<string, RtdbUnidad>)
          : undefined;
      const existingUnit = Array.isArray(snap.unidades)
        ? snap.unidades.find((u) => String(u?.id) === String(uId))
        : unitsRecord?.[uId];
      const updatedUnit = existingUnit ? { ...existingUnit, ...payload } : { id: Number(uId), ...payload };
      return { ok: true, unidad: updatedUnit } as T;
    }

    if (sub === 'divisas' && method === 'POST') {
      const id = Date.now();
      const tasa: RtdbDivisa = {
        id,
        negocio_id: biz.id,
        negocio_nombre: biz.nombre,
        zona: biz.zona,
        moneda_origen: String(payload.moneda_origen || 'USD').toUpperCase(),
        moneda_destino: 'PEN',
        tasa_compra: Number(payload.tasa_compra) || 3.7,
        tasa_venta: Number(payload.tasa_venta) || 3.78,
      };
      await rtdbFetch(`divisas/${id}`, 'PUT', tasa);
      return { ok: true, tasa } as T;
    }

    if (sub.startsWith('divisas/') && method === 'PATCH') {
      const tId = sub.split('/')[1];
      await rtdbFetch(`divisas/${tId}`, 'PATCH', payload);
      return { ok: true } as T;
    }

    if (sub === 'pedidos') {
      const pedidos = Object.values(snap.pedidos || {})
        .filter((p) => p.negocio_id === biz.id || p.referido_negocio_id === biz.id)
        .map(({ pin_hash: _ph, pin_salt: _ps, ...p }) => ({
          ...p,
          cliente_telefono: p.cliente_telefono_masked,
        }));
      return { pedidos } as T;
    }

    if (sub === 'guias-disponibles') {
      const bizMap = new Map(negocios.map((n) => [n.id, n]));
      const guias = toArray(snap.servicios)
        .filter((s) => s.categoria === 'TURISMO' && s.negocio_id !== biz.id)
        .map((s) => ({
          servicio_id: s.id,
          negocio_id: s.negocio_id,
          nombre: s.nombre,
          negocio_nombre: bizMap.get(s.negocio_id)?.nombre || s.negocio_nombre,
          precio_centavos: s.precio_centavos,
        }));
      return { guias } as T;
    }

    if (sub === 'servicios' && method === 'POST') {
      const id = Date.now();
      const srv: RtdbServicio = {
        id,
        negocio_id: biz.id,
        negocio_nombre: biz.nombre,
        zona: biz.zona,
        calificacion: biz.calificacion,
        categoria: biz.rubro,
        nombre: String(payload.nombre || 'Nuevo servicio'),
        descripcion: String(payload.descripcion || ''),
        precio_centavos: Number(payload.precio_centavos) || 5000,
        duracion_min: Number(payload.duracion_min) || 30,
        stock: Number(payload.stock) || 10,
        unidad_medida: String(payload.unidad_medida || 'Unidad'),
        ...(payload.atributos && typeof payload.atributos === 'object' ? { atributos: payload.atributos } : {}),
        disponible: 1,
      };
      await rtdbFetch(`servicios/${id}`, 'PUT', srv);
      return { ok: true, servicio: srv } as T;
    }

    if (sub === 'recargas' && method === 'POST') {
      const codigoOp = String(payload.codigo_operacion || '').trim().toUpperCase();
      if (!codigoOp) throw new Error('Ingresa el código de operación único.');
      const id = Date.now();
      const recarga = {
        id,
        negocio_id: biz.id,
        monto_centavos: Number(payload.monto_centavos) || 1000,
        metodo: String(payload.metodo || 'Yape'),
        codigo_operacion: codigoOp,
        estado: 'PENDIENTE',
        motivo_rechazo: null,
        created_at: new Date().toISOString(),
      };
      await rtdbFetch(`recargas/${codigoOp}`, 'PUT', recarga);
      return { ok: true, recarga } as T;
    }

    if (sub === 'reservas-referidas' && method === 'POST') {
      const targetNegocioId = Number(payload.target_negocio_id);
      const servicioId = Number(payload.servicio_id);
      const targetBiz = negocios.find((n) => n.id === targetNegocioId);
      const srv = toArray(snap.servicios).find(
        (s) => s.id === servicioId && s.negocio_id === targetNegocioId
      );
      if (!targetBiz || !srv) throw new Error('Guía o servicio referido no encontrado.');
      const codigo = `REF-${Math.floor(1000 + Math.random() * 9000)}`;
      const pin = String(Math.floor(1000 + Math.random() * 9000));
      const hashed = await hashPinBrowser(pin, `ord-${codigo}`);
      const comPlat = Math.round(srv.precio_centavos * 0.1);
      const comRef = Math.round(srv.precio_centavos * 0.1);
      const tel = String(payload.cliente_telefono || '+51984000000');

      const pedido: RtdbPedido = {
        id: Date.now(),
        codigo,
        negocio_id: targetBiz.id,
        referido_negocio_id: biz.id,
        negocio_nombre: targetBiz.nombre,
        negocio_zona: targetBiz.zona,
        categoria: targetBiz.rubro,
        item_nombre: srv.nombre,
        transcripcion: `Referido por ${biz.nombre} · ${String(payload.fecha_hora_reserva || 'Reserva')}`,
        monto_centavos: srv.precio_centavos,
        metodo_pago: (payload.metodo_pago as MetodoPago) || 'Efectivo',
        estado: 'PENDIENTE_CONFIRMACION',
        created_at: new Date().toISOString(),
        cliente_nombre: String(payload.cliente_nombre || 'Huésped referido'),
        cliente_telefono_masked: tel.length > 4 ? `***${tel.slice(-4)}` : tel,
        pin_salt: hashed.salt,
        pin_hash: hashed.hash,
        intentos_pin: 0,
        pin_bloqueado: 0,
        comision_plataforma_centavos: comPlat,
        comision_referido_centavos: comRef,
        comision_retenida_centavos: 0,
      };
      await rtdbFetch(`pedidos/${codigo}`, 'PUT', pedido);
      return { ok: true, pedido } as T;
    }

    if (sub.startsWith('pedidos/')) {
      const pedidoId = Number(bizMatch[3]);
      const action = bizMatch[4];
      const match = Object.values(snap.pedidos || {}).find((p) => Number(p.id) === pedidoId);
      if (!match) throw new Error('Pedido no encontrado.');

      if (action === 'aceptar' && method === 'POST') {
        const retencion = match.comision_plataforma_centavos + match.comision_referido_centavos;
        if (biz.saldo - biz.saldo_retenido < retencion) {
          throw new Error('Saldo insuficiente para retener la comisión.');
        }
        await rtdbFetch(`negocios/${biz.codigo}/saldo_retenido`, 'PUT', biz.saldo_retenido + retencion);
        await rtdbFetch(`pedidos/${match.codigo}`, 'PATCH', {
          estado: 'CONFIRMADO_PREPARACION',
          viaje_etapa: match.categoria === 'TRANSPORTE' ? 'HACIA_PASAJERO' : match.viaje_etapa || null,
          comision_retenida_centavos: retencion,
        });
        return { ok: true } as T;
      }

      if (action === 'rechazar' && method === 'POST') {
        await rtdbFetch(`pedidos/${match.codigo}`, 'PATCH', {
          estado: 'CANCELADO',
          comision_retenida_centavos: 0,
        });
        return { ok: true } as T;
      }

      if (action === 'validar-pin' && method === 'POST') {
        if (match.pin_bloqueado) throw new Error('Pedido bloqueado por intentos fallidos de PIN.');
        if (match.estado !== 'CONFIRMADO_PREPARACION') {
          throw new Error('El viaje debe estar en curso para validar PIN.');
        }
        const cleanPin = String(payload.pin || '').trim();
        if (match.pin_validado !== 1) {
          if (!/^\d{4}$/.test(cleanPin)) {
            throw new Error('El PIN de validación debe tener 4 dígitos.');
          }
          if (!match.pin_hash || !match.pin_salt) {
            throw new Error('PIN del pasajero aún sincronizándose. Intenta de nuevo en unos segundos.');
          }
          const hashedAttempt = await hashPinBrowser(cleanPin, match.pin_salt);
          if (hashedAttempt.hash !== match.pin_hash) {
            const nextAttempts = (match.intentos_pin || 0) + 1;
            await rtdbFetch(`pedidos/${match.codigo}`, 'PATCH', {
              intentos_pin: nextAttempts,
              pin_bloqueado: nextAttempts >= 5 ? 1 : 0,
            });
            throw new Error(
              nextAttempts >= 5
                ? 'PIN bloqueado tras 5 intentos fallidos.'
                : `PIN incorrecto. Intentos restantes: ${Math.max(0, 5 - nextAttempts)}`
            );
          }
        }
        const nowIso = new Date().toISOString();
        const patch = {
          pin_validado: 1,
          pin_validado_at: match.pin_validado_at || nowIso,
          viaje_etapa:
            match.viaje_etapa === 'LLEGADO_DESTINO'
              ? ('LLEGADO_DESTINO' as const)
              : ('EN_RUTA_DESTINO' as const),
        };
        await rtdbFetch(`pedidos/${match.codigo}`, 'PATCH', patch);
        return {
          ok: true,
          pedido: { ...match, ...patch, cliente_telefono: match.cliente_telefono_masked },
        } as T;
      }

      if (action === 'etapa' && method === 'PATCH') {
        if (match.estado !== 'CONFIRMADO_PREPARACION') {
          throw new Error('El viaje no está activo.');
        }
        if (match.pin_validado !== 1) {
          throw new Error('Valida primero el PIN de 4 dígitos del pasajero.');
        }
        const etapa = String(payload.etapa || 'EN_RUTA_DESTINO') as 'EN_RUTA_DESTINO' | 'LLEGADO_DESTINO';
        await rtdbFetch(`pedidos/${match.codigo}`, 'PATCH', { viaje_etapa: etapa });
        return {
          ok: true,
          pedido: { ...match, viaje_etapa: etapa },
        } as T;
      }

      if (action === 'finalizar-viaje' && method === 'POST') {
        if (match.pin_bloqueado) throw new Error('Pedido bloqueado por intentos fallidos de PIN.');
        if (match.estado !== 'CONFIRMADO_PREPARACION') {
          throw new Error('El viaje no está en curso.');
        }
        if (match.pin_validado !== 1) {
          const cleanPin = String(payload.pin || '').trim();
          if (!/^\d{4}$/.test(cleanPin)) {
            throw new Error('Debes validar primero el PIN de 4 dígitos del pasajero antes de finalizar el viaje.');
          }
          if (!match.pin_hash || !match.pin_salt) {
            throw new Error('PIN aún sincronizándose. Intenta de nuevo en unos segundos.');
          }
          const hashedAttempt = await hashPinBrowser(cleanPin, match.pin_salt);
          if (hashedAttempt.hash !== match.pin_hash) {
            const nextAttempts = (match.intentos_pin || 0) + 1;
            await rtdbFetch(`pedidos/${match.codigo}`, 'PATCH', {
              intentos_pin: nextAttempts,
              pin_bloqueado: nextAttempts >= 5 ? 1 : 0,
            });
            throw new Error(nextAttempts >= 5 ? 'Bloqueado tras 5 intentos fallidos.' : 'PIN incorrecto.');
          }
        }
        const ret = match.comision_retenida_centavos || 0;
        const nuevoSaldo = Math.max(0, biz.saldo - ret);
        await rtdbFetch(`negocios/${biz.codigo}`, 'PATCH', {
          saldo: nuevoSaldo,
          saldo_retenido: Math.max(0, biz.saldo_retenido - ret),
        });
        if (ret > 0) {
          const movId = Date.now();
          await rtdbFetch(`movimientos/${movId}`, 'PUT', {
            id: movId,
            cuenta_tipo: 'NEGOCIO',
            negocio_id: biz.id,
            negocio_nombre: biz.nombre,
            tipo: 'COBRO_COMISION',
            monto_centavos: -ret,
            retenido_delta_centavos: -ret,
            saldo_posterior_centavos: nuevoSaldo,
            referencia: match.codigo,
            motivo: 'Liquidación automática al finalizar viaje en Destino B',
            created_at: new Date().toISOString(),
          });
        }
        const patch = {
          estado: 'ENTREGADO_PAGADO' as const,
          pin_validado: 1,
          pin_validado_at: match.pin_validado_at || new Date().toISOString(),
          viaje_etapa: 'FINALIZADO' as const,
          comision_retenida_centavos: 0,
        };
        await rtdbFetch(`pedidos/${match.codigo}`, 'PATCH', patch);
        if (match.unidad_id) {
          await rtdbFetch(`unidades/${match.unidad_id}`, 'PATCH', { estado: 'DISPONIBLE' });
        }
        return {
          ok: true,
          puntos_otorgados: 50,
          pedido: { ...match, ...patch, cliente_telefono: match.cliente_telefono_masked },
          comprobante: null,
        } as T;
      }

      if (action === 'entregar' && method === 'POST') {
        if (match.pin_bloqueado) throw new Error('Pedido bloqueado por intentos fallidos de PIN.');
        const hashedAttempt = await hashPinBrowser(String(payload.pin || '').trim(), match.pin_salt);
        if (hashedAttempt.hash !== match.pin_hash) {
          const nextAttempts = (match.intentos_pin || 0) + 1;
          await rtdbFetch(`pedidos/${match.codigo}`, 'PATCH', {
            intentos_pin: nextAttempts,
            pin_bloqueado: nextAttempts >= 5 ? 1 : 0,
          });
          throw new Error(nextAttempts >= 5 ? 'Bloqueado tras 5 intentos fallidos.' : 'PIN incorrecto.');
        }
        const ret = match.comision_retenida_centavos || 0;
        const nuevoSaldo = Math.max(0, biz.saldo - ret);
        await rtdbFetch(`negocios/${biz.codigo}`, 'PATCH', {
          saldo: nuevoSaldo,
          saldo_retenido: Math.max(0, biz.saldo_retenido - ret),
        });
        if (ret > 0) {
          const movId = Date.now();
          await rtdbFetch(`movimientos/${movId}`, 'PUT', {
            id: movId,
            cuenta_tipo: 'NEGOCIO',
            negocio_id: biz.id,
            negocio_nombre: biz.nombre,
            tipo: 'COBRO_COMISION',
            monto_centavos: -ret,
            retenido_delta_centavos: -ret,
            saldo_posterior_centavos: nuevoSaldo,
            referencia: match.codigo,
            motivo: 'Liquidación automática al validar PIN',
            created_at: new Date().toISOString(),
          });
        }
        const isTaxi = match.categoria === 'TRANSPORTE';
        const compTipo = isTaxi ? null : match.cliente_documento_tipo === 'RUC' ? 'FACTURA' : 'BOLETA';
        const compSerie = compTipo ? (compTipo === 'FACTURA' ? 'F001' : 'B001') : null;
        const compNum = compTipo ? String(match.id).slice(-8).padStart(8, '0') : null;
        const emitidoAt = compTipo ? new Date().toISOString() : null;
        const sunatEstado = compTipo ? 'REPRESENTACION_IMPRESA' : null;
        await rtdbFetch(`pedidos/${match.codigo}`, 'PATCH', {
          estado: 'ENTREGADO_PAGADO',
          comision_retenida_centavos: 0,
          comprobante_tipo: compTipo,
          comprobante_serie: compSerie,
          comprobante_numero: compNum,
          comprobante_emitido_at: emitidoAt,
          comprobante_sunat_estado: sunatEstado,
        });
        return {
          ok: true,
          puntos_otorgados: 50,
          pedido: {
            ...match,
            estado: 'ENTREGADO_PAGADO',
            comprobante_tipo: compTipo,
            comprobante_serie: compSerie,
            comprobante_numero: compNum,
            comprobante_emitido_at: emitidoAt,
            comprobante_sunat_estado: sunatEstado,
            emisor_ruc: biz.documento_numero || '20601234565',
            emisor_razon_social: biz.razon_social || biz.nombre,
            emisor_direccion: biz.zona,
          },
          comprobante: isTaxi
            ? null
            : {
                tipo: compTipo,
                serie: compSerie,
                numero: compNum,
                numero_completo: `${compSerie}-${compNum}`,
                emitido_at: emitidoAt,
                pedido_codigo: match.codigo,
                metodo_pago: match.metodo_pago,
                moneda: 'PEN',
                sunat_estado: sunatEstado,
                emisor: {
                  ruc: biz.documento_numero || '20601234565',
                  razon_social: biz.razon_social || biz.nombre,
                  nombre_comercial: biz.nombre,
                  direccion: biz.zona,
                },
                receptor: {
                  tipo_doc: match.cliente_documento_tipo || 'DNI',
                  numero_doc: match.cliente_documento_numero || '00000000',
                  nombre: match.cliente_nombre,
                  direccion: match.cliente_direccion_fiscal || 'Cusco, Perú',
                },
                items: [
                  {
                    cantidad: 1,
                    descripcion: match.item_nombre,
                    detalle: match.transcripcion,
                    valor_unitario_centavos: Math.round(match.monto_centavos / 1.18),
                    total_centavos: match.monto_centavos,
                  },
                ],
                op_gravada_centavos: Math.round(match.monto_centavos / 1.18),
                igv_centavos: match.monto_centavos - Math.round(match.monto_centavos / 1.18),
                total_centavos: match.monto_centavos,
              },
        } as T;
      }

      if (action === 'contraoferta' && method === 'POST') {
        const monto = Number(payload.monto_centavos);
        if (!Number.isInteger(monto) || monto < 500 || monto > 500000) {
          throw new Error('Contraoferta inválida (mínimo S/ 5.00).');
        }
        await rtdbFetch(`pedidos/${match.codigo}`, 'PATCH', {
          contraoferta_centavos: monto,
          monto_centavos: monto,
        });
        return { ok: true, monto_centavos: monto } as T;
      }

      if (action === 'emitir-sunat' && method === 'POST') {
        if (match.categoria === 'TRANSPORTE') {
          throw new Error('La facturación electrónica está deshabilitada para servicios de taxi.');
        }
        const compTipo = match.comprobante_tipo || (match.cliente_documento_tipo === 'RUC' ? 'FACTURA' : 'BOLETA');
        const compSerie = match.comprobante_serie || (compTipo === 'FACTURA' ? 'F001' : 'B001');
        const compNum = match.comprobante_numero || String(match.id).slice(-8).padStart(8, '0');
        const devCfg = await leerDevApiConfig(FIREBASE_RTDB_URL);
        const billingToken = (devCfg.tokenFacturacionApisperu || '').trim();

        let nextEstado = 'REPRESENTACION_IMPRESA';
        let nextHash: string | null = null;
        let sentApisperu = false;
        let mensajeRes = billingToken
          ? 'Token ApisPerú listo · comprobante preparado.'
          : 'Configura tu Token de Facturación ApisPerú en Admin → Modo Desarrollador (/dev_api).';

        if (billingToken) {
          try {
            const totalSoles = Number((match.monto_centavos / 100).toFixed(2));
            const gravadaSoles = Number((totalSoles / 1.18).toFixed(2));
            const igvSoles = Number((totalSoles - gravadaSoles).toFixed(2));
            const apRes = await fetch('https://facturacion.apisperu.com/api/v1/invoice/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${billingToken}`,
              },
              body: JSON.stringify({
                ublVersion: '2.1',
                tipoOperacion: '0101',
                tipoDoc: compTipo === 'FACTURA' ? '01' : '03',
                serie: compSerie,
                correlativo: compNum,
                fechaEmision: new Date(match.comprobante_emitido_at || Date.now()).toISOString(),
                formaPago: { moneda: 'PEN', tipo: 'Contado' },
                tipoMoneda: 'PEN',
                company: {
                  ruc: biz.documento_numero || '20601234565',
                  razonSocial: biz.razon_social || biz.nombre,
                  nombreComercial: biz.nombre,
                  address: { ubigueo: '080101', departamento: 'CUSCO', provincia: 'CUSCO', distrito: 'CUSCO', direccion: biz.zona || 'Cusco' },
                },
                client: {
                  tipoDoc: match.cliente_documento_tipo === 'RUC' ? '6' : match.cliente_documento_tipo === 'EXTRANJERO' ? '7' : '1',
                  numDoc: match.cliente_documento_numero || '00000000',
                  rznSocial: match.cliente_nombre,
                  address: { direccion: match.cliente_direccion_fiscal || 'Cusco, Perú' },
                },
                mtoOperGravadas: gravadaSoles,
                mtoIGV: igvSoles,
                totalImpuestos: igvSoles,
                valorVenta: gravadaSoles,
                subTotal: totalSoles,
                mtoImpVenta: totalSoles,
                details: [
                  {
                    codProducto: 'LCH-1',
                    unidad: 'NIU',
                    descripcion: match.item_nombre,
                    cantidad: 1,
                    mtoValorUnitario: gravadaSoles,
                    mtoValorVenta: gravadaSoles,
                    mtoBaseIgv: gravadaSoles,
                    porcentajeIgv: 18,
                    igv: igvSoles,
                    tipAfeIgv: 10,
                    totalImpuestos: igvSoles,
                    mtoPrecioUnitario: totalSoles,
                  },
                ],
                legends: [{ code: '1000', value: `SON ${totalSoles.toFixed(2)} SOLES` }],
              }),
              signal: AbortSignal.timeout(5500),
            });
            const apData = (await apRes.json().catch(() => ({}))) as Record<string, any>;
            if (apRes.ok) {
              sentApisperu = true;
              nextEstado = apData?.sunatResponse?.success ? 'ACEPTADO_SUNAT' : 'ENVIADO_APISPERU';
              nextHash =
                (typeof apData?.hash === 'string' && apData.hash) ||
                (typeof apData?.sunatResponse?.cdrZip === 'string' ? `CDR-${compSerie}-${compNum}` : null);
              mensajeRes =
                apData?.sunatResponse?.cdrResponse?.description ||
                apData?.message ||
                'Comprobante enviado a ApisPerú SUNAT.';
            } else {
              mensajeRes = apData?.message || `ApisPerú HTTP ${apRes.status}`;
            }
          } catch {
            mensajeRes = 'ApisPerú Facturación requiere conexión directa (sin bloqueo CORS) o backend Node.js.';
          }
        }

        await rtdbFetch(`pedidos/${match.codigo}`, 'PATCH', {
          comprobante_sunat_estado: nextEstado,
          ...(nextHash ? { comprobante_hash: nextHash } : {}),
        });
        return {
          ok: true,
          enviado_apisperu: sentApisperu,
          mensaje: mensajeRes,
          comprobante: {
            tipo: compTipo,
            serie: compSerie,
            numero: compNum,
            numero_completo: `${compSerie}-${compNum}`,
            emitido_at: match.comprobante_emitido_at || new Date().toISOString(),
            pedido_codigo: match.codigo,
            metodo_pago: match.metodo_pago,
            moneda: 'PEN',
            sunat_estado: nextEstado,
            emisor: {
              ruc: biz.documento_numero || '20601234565',
              razon_social: biz.razon_social || biz.nombre,
              nombre_comercial: biz.nombre,
              direccion: biz.zona,
            },
            receptor: {
              tipo_doc: match.cliente_documento_tipo || 'DNI',
              numero_doc: match.cliente_documento_numero || '00000000',
              nombre: match.cliente_nombre,
              direccion: match.cliente_direccion_fiscal || 'Cusco, Perú',
            },
            items: [
              {
                cantidad: 1,
                descripcion: match.item_nombre,
                detalle: match.transcripcion,
                valor_unitario_centavos: Math.round(match.monto_centavos / 1.18),
                total_centavos: match.monto_centavos,
              },
            ],
            op_gravada_centavos: Math.round(match.monto_centavos / 1.18),
            igv_centavos: match.monto_centavos - Math.round(match.monto_centavos / 1.18),
            total_centavos: match.monto_centavos,
          },
        } as T;
      }

      if (action === 'cancelar' && method === 'POST') {
        const ret = match.comision_retenida_centavos || 0;
        await rtdbFetch(`negocios/${biz.codigo}/saldo_retenido`, 'PUT', Math.max(0, biz.saldo_retenido - ret));
        await rtdbFetch(`pedidos/${match.codigo}`, 'PATCH', {
          estado: 'CANCELADO',
          comision_retenida_centavos: 0,
        });
        return { ok: true } as T;
      }
    }
  }

  if (cleanPath === '/api/public/firebase-status') {
    return {
      url: FIREBASE_RTDB_URL,
      enabled: true,
      connected: true,
      lastSyncAt: snap.meta?.updated_at || new Date().toISOString(),
      lastHydratedAt: new Date().toISOString(),
      lastError: null,
    } as T;
  }

  if (cleanPath === '/api/admin/bootstrap-status') {
    const configured = Boolean(snap.admin?.pin_hash);
    return { configured, requires_claim: !configured } as T;
  }

  if (cleanPath === '/api/admin/bootstrap-claim' && method === 'POST') {
    if (snap.admin?.pin_hash) {
      throw new Error('El PIN maestro ya fue configurado.');
    }
    const cleanPin = String(payload.pin || '').trim();
    if (cleanPin.length < 4) {
      throw new Error('El PIN maestro debe tener al menos 4 caracteres.');
    }
    const hashed = await hashPinBrowser(cleanPin, 'admin-master-rtdb');
    await rtdbFetch('admin', 'PUT', {
      pin_salt: hashed.salt,
      pin_hash: hashed.hash,
      updated_at: new Date().toISOString(),
    });
    return { token: `rtdb-admin:${hashed.hash.slice(0, 24)}` } as T;
  }

  if (cleanPath === '/api/admin/login' && method === 'POST') {
    const cleanPin = String(payload.pin || '').trim();
    if (!snap.admin?.pin_hash) {
      if (cleanPin.length < 4) {
        throw new Error('Define un PIN maestro de al menos 4 caracteres.');
      }
      const hashed = await hashPinBrowser(cleanPin, 'admin-master-rtdb');
      await rtdbFetch('admin', 'PUT', {
        pin_salt: hashed.salt,
        pin_hash: hashed.hash,
        updated_at: new Date().toISOString(),
      });
      return { token: `rtdb-admin:${hashed.hash.slice(0, 24)}` } as T;
    }
    const check = await hashPinBrowser(cleanPin, snap.admin.pin_salt);
    if (check.hash !== snap.admin.pin_hash) {
      throw new Error('PIN maestro incorrecto.');
    }
    return { token: `rtdb-admin:${snap.admin.pin_hash.slice(0, 24)}` } as T;
  }

  if (cleanPath.startsWith('/api/admin/')) {
    const expectedAdminToken = snap.admin?.pin_hash ? `rtdb-admin:${snap.admin.pin_hash.slice(0, 24)}` : null;
    if (!expectedAdminToken || token !== expectedAdminToken) {
      throw new Error('Sesión de administrador inválida o expirada.');
    }

    const negocios = toArray(snap.negocios);
    const bizById = new Map(negocios.map((n) => [n.id, n]));

    if (cleanPath === '/api/admin/panel' && method === 'GET') {
      const recargas = toArray(snap.recargas)
        .map((r) => {
          const b = bizById.get(r.negocio_id);
          return {
            ...r,
            negocio_nombre: b?.nombre || 'Negocio',
            negocio_codigo: b?.codigo || `NEG-${r.negocio_id}`,
            rubro: b?.rubro || ('RESTAURANTE' as Rubro),
          };
        })
        .sort((a, b) => b.id - a.id);

      const movimientos = toArray(snap.movimientos).sort((a, b) => b.id - a.id);
      const ingresosPlataforma = toArray(snap.pedidos)
        .filter((p) => p.estado === 'ENTREGADO_PAGADO')
        .reduce((acc, p) => acc + (p.comision_plataforma_centavos || 0), 0);

      const verificacionNegocios = negocios.map((n) => ({
        negocio_id: n.id,
        codigo: n.codigo,
        nombre: n.nombre,
        saldo_cache: n.saldo,
        saldo_libro: n.saldo,
        retenido_cache: n.saldo_retenido,
        retenido_libro: n.saldo_retenido,
        cuadra: true,
      }));

      return {
        recargas,
        negocios: negocios.map((n) => ({
          id: n.id,
          codigo: n.codigo,
          rubro: n.rubro,
          nombre: n.nombre,
          telefono: n.telefono || '+51984000000',
          activo: n.activo,
          tipo_persona: n.tipo_persona || 'JURIDICA',
          documento_tipo: n.documento_tipo || 'RUC',
          documento_numero: n.documento_numero || null,
          razon_social: n.razon_social || null,
          tipo_negocio: n.tipo_negocio || 'Comercio Multirubro',
          modalidades_venta: n.modalidades_venta || 'Unidad,Servicio',
          estado_regla: n.estado_regla || (n.activo === 1 ? 'ACTIVO' : 'INCUMPLIMIENTO'),
          motivo_estado: n.motivo_estado || null,
          saldo: n.saldo,
          saldo_retenido: n.saldo_retenido,
          saldo_libre: n.saldo - n.saldo_retenido,
          bloqueado: false,
        })),
        reglas_comision: toArray(snap.reglas),
        unidades: toArray(snap.unidades),
        emergencias: toArray(snap.emergencias)
          .map((e) => ({
            ...e,
            cliente_telefono: e.cliente_telefono || '+51984000000',
          }))
          .sort((a, b) => b.id - a.id),
        partners: toArray(snap.partners),
        auditoria: {
          cuadra: true,
          ingresos_plataforma_centavos: ingresosPlataforma,
          verificacion_negocios: verificacionNegocios,
          movimientos,
        },
      } as T;
    }

    const recargaMatch = cleanPath.match(/^\/api\/admin\/recargas\/(\d+)\/(aprobar|rechazar)$/);
    if (recargaMatch && method === 'POST') {
      const recId = Number(recargaMatch[1]);
      const action = recargaMatch[2];
      const rec = toArray(snap.recargas).find((r) => r.id === recId);
      if (!rec) throw new Error('Solicitud de recarga no encontrada.');
      if (rec.estado !== 'PENDIENTE') throw new Error('Esta recarga ya fue procesada.');

      if (action === 'rechazar') {
        await rtdbFetch(`recargas/${rec.codigo_operacion}`, 'PATCH', {
          estado: 'RECHAZADO',
          motivo_rechazo: String(payload.motivo || 'Comprobante no verificado'),
        });
        return { ok: true } as T;
      }

      const biz = bizById.get(rec.negocio_id);
      if (!biz) throw new Error('Negocio asociado no encontrado.');
      const nuevoSaldo = biz.saldo + rec.monto_centavos;
      await rtdbFetch(`negocios/${biz.codigo}`, 'PATCH', { saldo: nuevoSaldo });
      await rtdbFetch(`recargas/${rec.codigo_operacion}`, 'PATCH', {
        estado: 'APROBADO',
        motivo_rechazo: null,
      });
      const movId = Date.now();
      await rtdbFetch(`movimientos/${movId}`, 'PUT', {
        id: movId,
        cuenta_tipo: 'NEGOCIO',
        negocio_id: biz.id,
        negocio_nombre: biz.nombre,
        tipo: 'RECARGA_APROBADA',
        monto_centavos: rec.monto_centavos,
        retenido_delta_centavos: 0,
        saldo_posterior_centavos: nuevoSaldo,
        referencia: rec.codigo_operacion,
        motivo: `Recarga vía ${rec.metodo}`,
        created_at: new Date().toISOString(),
      });
      return { ok: true } as T;
    }

    if (cleanPath === '/api/admin/ajustes-saldo' && method === 'POST') {
      const biz = bizById.get(Number(payload.negocio_id));
      const delta = Number(payload.delta_centavos) || 0;
      const motivo = String(payload.motivo || '').trim();
      if (!biz) throw new Error('Negocio no encontrado.');
      if (motivo.length < 3) throw new Error('El motivo del ajuste es obligatorio.');
      const saldoLibre = biz.saldo - biz.saldo_retenido;
      if (delta < 0 && Math.abs(delta) > saldoLibre) {
        throw new Error('El débito supera el saldo libre disponible.');
      }
      const nuevoSaldo = biz.saldo + delta;
      await rtdbFetch(`negocios/${biz.codigo}`, 'PATCH', { saldo: nuevoSaldo });
      const movId = Date.now();
      await rtdbFetch(`movimientos/${movId}`, 'PUT', {
        id: movId,
        cuenta_tipo: 'NEGOCIO',
        negocio_id: biz.id,
        negocio_nombre: biz.nombre,
        tipo: 'AJUSTE_ADMIN',
        monto_centavos: delta,
        retenido_delta_centavos: 0,
        saldo_posterior_centavos: nuevoSaldo,
        referencia: `ADJ-${movId.toString().slice(-4)}`,
        motivo,
        created_at: new Date().toISOString(),
      });
      return { ok: true } as T;
    }

    const ruleMatch = cleanPath.match(/^\/api\/admin\/reglas-comision\/([^/]+)$/);
    if (ruleMatch && method === 'PUT') {
      const rubro = decodeURIComponent(ruleMatch[1]) as Rubro;
      await rtdbFetch(`reglas/${rubro}`, 'PUT', {
        rubro,
        porcentaje_plataforma: Math.max(0, Math.min(50, Number(payload.porcentaje_plataforma) || 0)),
        porcentaje_referido: Math.max(0, Math.min(50, Number(payload.porcentaje_referido) || 0)),
      });
      return { ok: true } as T;
    }

    if (cleanPath === '/api/admin/negocios' && method === 'POST') {
      const rubro = String(payload.rubro || 'RESTAURANTE') as Rubro;
      const nombre = String(payload.nombre || '').trim();
      const telefono = String(payload.telefono || '').trim();
      if (nombre.length < 2 || telefono.length < 6) {
        throw new Error('Nombre comercial y WhatsApp obligatorios.');
      }
      const pinInicial = String(Math.floor(1000 + Math.random() * 9000));
      const codigo = `NEG-${rubro.slice(0, 2)}-${Math.floor(1000 + Math.random() * 9000)}`;
      const hashed = await hashPinBrowser(pinInicial, `seed-${codigo}`);
      const newBiz: RtdbNegocio = {
        id: Date.now(),
        codigo,
        rubro,
        nombre,
        telefono,
        descripcion: `Negocio verificado en ${rubro}`,
        lat: -13.5167,
        lng: -71.9788,
        zona: String(payload.zona || 'Plaza de Armas, Cusco'),
        en_linea: 1,
        activo: 1,
        saldo: 0,
        saldo_retenido: 0,
        calificacion: 4.9,
        horario_apertura: '07:00',
        horario_cierre: '22:30',
        abierto_24h: 0,
        metodos_pago_aceptados: 'Yape,Plin,Efectivo,Tarjeta',
        auto_aceptar_pedidos: 0,
        alerta_voz_activa: 1,
        tarifa_minima_centavos: 600,
        radio_cobertura_km: 8.0,
        tipo_persona: payload.tipo_persona === 'NATURAL' ? 'NATURAL' : 'JURIDICA',
        documento_tipo: payload.documento_tipo === 'DNI' ? 'DNI' : 'RUC',
        documento_numero: payload.documento_numero || null,
        razon_social: payload.razon_social || null,
        tipo_negocio: String(payload.tipo_negocio || 'Comercio Multirubro'),
        modalidades_venta: Array.isArray(payload.modalidades_venta)
          ? payload.modalidades_venta.join(',')
          : String(payload.modalidades_venta || 'Unidad,Servicio'),
        estado_regla: 'ACTIVO',
        motivo_estado: null,
        pin_salt: hashed.salt,
        pin_hash: hashed.hash,
      };
      await rtdbFetch(`negocios/${codigo}`, 'PUT', newBiz);
      return { negocio: newBiz, pin_inicial: pinInicial } as T;
    }

    const negUnlockMatch = cleanPath.match(/^\/api\/admin\/negocios\/(\d+)\/unlock$/);
    if (negUnlockMatch && method === 'POST') {
      return { ok: true } as T;
    }

    const negEstadoMatch = cleanPath.match(/^\/api\/admin\/negocios\/(\d+)\/estado$/);
    if (negEstadoMatch && method === 'PATCH') {
      const biz = bizById.get(Number(negEstadoMatch[1]));
      if (!biz) throw new Error('Negocio no encontrado.');
      const nextRegla: EstadoRegla =
        payload.estado_regla === 'ACTIVO' || payload.estado_regla === 'INCUMPLIMIENTO' || payload.estado_regla === 'ESTAFA'
          ? payload.estado_regla
          : payload.activo
            ? 'ACTIVO'
            : 'INCUMPLIMIENTO';
      const nextActivo = nextRegla === 'ACTIVO' ? 1 : 0;
      const nextMotivo =
        nextRegla === 'ACTIVO'
          ? null
          : String(payload.motivo_estado || '').trim() ||
            (nextRegla === 'ESTAFA'
              ? 'Suspendido por reporte de estafa'
              : 'Suspendido por incumplimiento de reglas');
      await rtdbFetch(`negocios/${biz.codigo}`, 'PATCH', {
        activo: nextActivo,
        estado_regla: nextRegla,
        motivo_estado: nextMotivo,
      });
      return { ok: true, activo: nextActivo === 1, estado_regla: nextRegla, motivo_estado: nextMotivo } as T;
    }

    const unitCertMatch = cleanPath.match(/^\/api\/admin\/unidades\/(\d+)\/certificar$/);
    if (unitCertMatch && method === 'POST') {
      const uId = unitCertMatch[1];
      await rtdbFetch(`unidades/${uId}`, 'PATCH', {
        certificada: payload.certificada ? 1 : 0,
      });
      return { ok: true } as T;
    }

    const emergAtenderMatch = cleanPath.match(/^\/api\/admin\/emergencias\/(\d+)\/atender$/);
    if (emergAtenderMatch && method === 'POST') {
      const emId = Number(emergAtenderMatch[1]);
      const em = toArray(snap.emergencias).find((e) => e.id === emId);
      if (!em) throw new Error('Alerta SOS no encontrada.');
      await rtdbFetch(`emergencias/${em.codigo}`, 'PATCH', {
        estado: 'ATENDIDA',
        atendida_por: String(payload.atendida_por || 'Central La Chuspa'),
      });
      return { ok: true } as T;
    }

    if (cleanPath === '/api/admin/partners' && method === 'POST') {
      const codigo = String(payload.codigo || '').trim().toUpperCase();
      const nombre = String(payload.nombre || '').trim();
      if (!codigo || !nombre) throw new Error('Código y nombre del promotor obligatorios.');
      await rtdbFetch(`partners/${codigo}`, 'PUT', {
        id: Date.now(),
        codigo,
        nombre,
        porcentaje_comision: Math.max(1, Math.min(25, Number(payload.porcentaje_comision) || 10)),
        pedidos_atribuidos: 0,
        comision_acumulada_centavos: 0,
      });
      return { ok: true } as T;
    }

    if (cleanPath === '/api/admin/dev-api' && method === 'GET') {
      const cfg = await leerDevApiConfig(FIREBASE_RTDB_URL);
      const mask = (v: string) =>
        !v ? '' : v.length <= 10 ? '••••••••' : `${v.slice(0, 6)}••••••${v.slice(-4)}`;
      return {
        proveedorConsultas: cfg.proveedorConsultas,
        hasTokenConsultas: Boolean(cfg.tokenConsultasDniRuc),
        tokenConsultasPreview: mask(cfg.tokenConsultasDniRuc),
        hasTokenFacturacion: Boolean(cfg.tokenFacturacionApisperu),
        tokenFacturacionPreview: mask(cfg.tokenFacturacionApisperu || ''),
        firebaseDevApiUrl: `${FIREBASE_RTDB_URL}/dev_api.json`,
        updatedAt: new Date().toISOString(),
      } as T;
    }

    if (cleanPath === '/api/admin/dev-api' && method === 'PUT') {
      const current = await leerDevApiConfig(FIREBASE_RTDB_URL);
      const prov: ProveedorConsultas =
        payload.proveedorConsultas === 'apisperu' || payload.proveedorConsultas === 'apisnetpe'
          ? payload.proveedorConsultas
          : 'auto';
      const nextConsultas =
        payload.clearConsultas === true
          ? ''
          : String(payload.tokenConsultasDniRuc || '').trim() || current.tokenConsultasDniRuc;
      const nextFacturacion =
        payload.clearFacturacion === true
          ? ''
          : String(payload.tokenFacturacionApisperu || '').trim() ||
            current.tokenFacturacionApisperu ||
            '';
      const ok = await guardarTokenEnFirebase(
        {
          proveedorConsultas: prov,
          tokenConsultasDniRuc: nextConsultas,
          tokenFacturacionApisperu: nextFacturacion,
        },
        FIREBASE_RTDB_URL
      );
      const mask = (v: string) =>
        !v ? '' : v.length <= 10 ? '••••••••' : `${v.slice(0, 6)}••••••${v.slice(-4)}`;
      return {
        ok,
        syncedFirebase: ok,
        proveedorConsultas: prov,
        hasTokenConsultas: Boolean(nextConsultas),
        tokenConsultasPreview: mask(nextConsultas),
        hasTokenFacturacion: Boolean(nextFacturacion),
        tokenFacturacionPreview: mask(nextFacturacion),
        updatedAt: new Date().toISOString(),
      } as T;
    }
  }

  throw new Error(
    `Ruta no soportada en modo Firebase RTDB directo: ${method} ${cleanPath}`
  );
}
