import type {
  ConciergeOpcion,
  MetodoPago,
  PedidoPublico,
  Rubro,
} from '../types.ts';

let staticModeActive = false;
const listeners = new Set<(active: boolean) => void>();

export function isStaticHostMode(): boolean {
  return staticModeActive;
}

export function setStaticHostMode(active: boolean): void {
  if (staticModeActive !== active) {
    staticModeActive = active;
    listeners.forEach((cb) => cb(active));
  }
}

export function subscribeStaticMode(cb: (active: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

interface StaticState {
  negocios: Array<{
    id: number;
    codigo: string;
    rubro: Rubro;
    nombre: string;
    telefono: string;
    descripcion: string;
    lat: number;
    lng: number;
    zona: string;
    en_linea: number;
    activo: number;
    saldo: number;
    saldo_retenido: number;
    calificacion: number;
    demoPin: string;
  }>;
  unidades: Array<{
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
    estado: 'DISPONIBLE' | 'EN_RUTA';
    certificada: number;
  }>;
  servicios: Array<{
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
    disponible: number;
  }>;
  divisas: Array<{
    id: number;
    negocio_id: number;
    negocio_nombre: string;
    zona: string;
    moneda_origen: string;
    moneda_destino: string;
    tasa_compra: number;
    tasa_venta: number;
  }>;
  butacas: Array<{
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
  }>;
  pedidos: Array<PedidoPublico & { cliente_pin: string; negocio_id: number }>;
  reglas: Array<{
    rubro: Rubro;
    porcentaje_plataforma: number;
    porcentaje_referido: number;
  }>;
  emergencias: Array<{
    codigo: string;
    cliente_nombre: string;
    cliente_telefono: string;
    ubicacion_texto: string;
    mensaje: string;
    estado: 'ACTIVA' | 'ATENDIDA';
    created_at: string;
  }>;
}

const STORAGE_KEY = 'lachuspa_static_state_v1';

function createInitialState(): StaticState {
  return {
    negocios: [
      {
        id: 1,
        codigo: 'NEG-TX-01',
        rubro: 'TRANSPORTE',
        nombre: 'Inka Executive Mobility',
        telefono: '+51984110201',
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
        telefono: '+51984110202',
        descripcion: 'Sedanes ejecutivos y SUVs híbridas de recojo inmediato en Cusco.',
        lat: -13.5204,
        lng: -71.9752,
        zona: 'Av. El Sol, Cusco',
        en_linea: 1,
        activo: 1,
        saldo: 12000,
        saldo_retenido: 0,
        calificacion: 4.82,
        demoPin: '1357',
      },
      {
        id: 3,
        codigo: 'NEG-TU-01',
        rubro: 'TURISMO',
        nombre: 'Apu Salkantay Atelier',
        telefono: '+51984220301',
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
        telefono: '+51984220302',
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
        telefono: '+51984330401',
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
        telefono: '+51984330402',
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
        telefono: '+51984440501',
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
        telefono: '+51984440502',
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
        telefono: '+51984550601',
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
        telefono: '+51984660701',
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
    ],
    unidades: [
      {
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
      {
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
      {
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
    ],
    servicios: [
      {
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
      {
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
      {
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
      {
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
      {
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
      {
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
      {
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
      {
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
      {
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
      {
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
      {
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
    ],
    divisas: [
      {
        id: 1,
        negocio_id: 10,
        negocio_nombre: 'Casa de Cambio Inti Gold',
        zona: 'Av. El Sol 380, Cusco',
        moneda_origen: 'USD',
        moneda_destino: 'PEN',
        tasa_compra: 3.745,
        tasa_venta: 3.775,
      },
      {
        id: 2,
        negocio_id: 10,
        negocio_nombre: 'Casa de Cambio Inti Gold',
        zona: 'Av. El Sol 380, Cusco',
        moneda_origen: 'EUR',
        moneda_destino: 'PEN',
        tasa_compra: 4.02,
        tasa_venta: 4.09,
      },
    ],
    butacas: [
      {
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
      {
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
    ],
    pedidos: [],
    reglas: [
      { rubro: 'TRANSPORTE', porcentaje_plataforma: 3, porcentaje_referido: 0 },
      { rubro: 'TURISMO', porcentaje_plataforma: 3, porcentaje_referido: 0 },
      { rubro: 'HOTEL', porcentaje_plataforma: 3, porcentaje_referido: 0 },
      { rubro: 'RESTAURANTE', porcentaje_plataforma: 3, porcentaje_referido: 0 },
      { rubro: 'FARMACIA', porcentaje_plataforma: 3, porcentaje_referido: 0 },
      { rubro: 'CASA_CAMBIO', porcentaje_plataforma: 3, porcentaje_referido: 0 },
    ],
    emergencias: [],
  };
}

function loadState(): StaticState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createInitialState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw) as StaticState;
  } catch {
    return createInitialState();
  }
}

function saveState(state: StaticState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota issues
  }
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

function inferCategoryFromQuery(q: string, forced?: Rubro): Rubro {
  if (forced) return forced;
  const low = q.toLowerCase();
  if (/soroche|oxigen|oxígen|pastilla|botica|farmacia|ibuprof|medic/.test(low)) return 'FARMACIA';
  if (/ceviche|lomo|trucha|comer|cena|almuerzo|restaur|brasa|pisco|comida/.test(low)) return 'RESTAURANTE';
  if (/tour|machu|valle|guia|guía|maras|moray|sacsay|excursi/.test(low)) return 'TURISMO';
  if (/hotel|suite|habitaci|spa|alojam|noche/.test(low)) return 'HOTEL';
  if (/dolar|dólar|euro|cambio|divisa|soles/.test(low)) return 'CASA_CAMBIO';
  return 'TRANSPORTE';
}

function buildOptions(
  state: StaticState,
  cat: Rubro,
  lat: number,
  lng: number,
  destino?: string
): ConciergeOpcion[] {
  if (cat === 'TRANSPORTE') {
    const destLower = (destino || '').toLowerCase();
    const tripKm = destLower.includes('ollantay')
      ? 62
      : destLower.includes('urubamba')
        ? 52
        : destLower.includes('aeropuerto') || destLower.includes('velasco')
          ? 5.2
          : 4.5;

    const taxiOpts = state.unidades.map((u) => {
      const distKm = Number(haversineKm(lat, lng, u.lat, u.lng).toFixed(2));
      const eta = Math.max(3, Math.round(distKm * 3.5 + 2));
      const precio = Math.round(u.tarifa_base_centavos + u.tarifa_km_centavos * tripKm);
      return {
        tipo: 'TAXI' as const,
        unidad_id: u.id,
        negocio_id: u.negocio_id,
        negocio_nombre: u.negocio_nombre,
        categoria: 'TRANSPORTE' as const,
        titulo: `${u.modelo} · ${u.conductor_nombre}`,
        descripcion: `Placa ${u.placa} (${u.color}) · ${tripKm.toFixed(1)} km de ruta estimada`,
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
      };
    });
    const minTaxi = Math.min(...taxiOpts.map((o) => o.precio_centavos));
    return taxiOpts.map((o) => ({ ...o, mejor_precio: o.precio_centavos === minTaxi }));
  }

  const catOpts = state.servicios
    .filter((s) => s.categoria === cat)
    .map((s) => ({
      tipo: 'CATALOGO' as const,
      servicio_id: s.id,
      negocio_id: s.negocio_id,
      negocio_nombre: s.negocio_nombre,
      categoria: s.categoria,
      titulo: s.nombre,
      descripcion: `${s.negocio_nombre} (${s.zona}) · ${s.descripcion}`,
      zona: s.zona,
      precio_centavos: s.precio_centavos,
      calificacion: s.calificacion,
      eta_min: s.duracion_min,
      stock: s.stock,
      mejor_precio: false,
      disponible: true,
    }));
  const minCat = catOpts.length > 0 ? Math.min(...catOpts.map((o) => o.precio_centavos)) : 0;
  return catOpts.map((o) => ({ ...o, mejor_precio: o.precio_centavos === minCat }));
}

export function handleStaticFallback<T>(
  path: string,
  method: string,
  body?: unknown,
  token?: string | null
): T {
  setStaticHostMode(true);
  const state = loadState();
  const cleanPath = path.split('?')[0];
  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, any>;

  if (cleanPath === '/api/public/asistente' && method === 'POST') {
    const q = String(payload.query || '');
    const cat = inferCategoryFromQuery(q, payload.categoria as Rubro | undefined);
    const lat = Number(payload.lat) || -13.5167;
    const lng = Number(payload.lng) || -71.9788;
    const destino = payload.destino ? String(payload.destino) : q.toLowerCase().includes('aeropuerto') ? 'Aeropuerto Velasco Astete' : undefined;
    const opciones = buildOptions(state, cat, lat, lng, destino);
    const top = opciones[0];

    let respuestaVoz = `Encontré ${opciones.length} opciones verificadas en Cusco.`;
    if (cat === 'TRANSPORTE' && top) {
      respuestaVoz = `Unidad VIP disponible: ${top.titulo}, a ${top.eta_min ?? 4} minutos, tarifa estimada ${(top.precio_centavos / 100).toFixed(2)} soles.`;
    } else if (top) {
      respuestaVoz = `Listo. En ${top.negocio_nombre} te recomiendo ${top.titulo} por ${(top.precio_centavos / 100).toFixed(2)} soles.`;
    }

    return {
      categoria: cat,
      respuesta_voz: respuestaVoz,
      destino_sugerido: destino,
      ai_error: null,
      opciones,
    } as T;
  }

  if (cleanPath === '/api/public/directorio') {
    return {
      negocios: state.negocios,
      servicios: state.servicios,
      unidades: state.unidades,
    } as T;
  }

  if (cleanPath === '/api/public/divisas') {
    return { tasas: state.divisas } as T;
  }

  if (cleanPath === '/api/public/divisas/reservar' && method === 'POST') {
    const moneda = String(payload.moneda || 'USD');
    const rate = state.divisas.find((d) => d.moneda_origen === moneda) || state.divisas[0];
    const monto = Number(payload.monto_origen) || 100;
    const tasa = payload.operacion === 'VENTA' ? rate.tasa_venta : rate.tasa_compra;
    return {
      codigo_retiro: `FX-${Math.floor(1000 + Math.random() * 9000)}`,
      monto_destino_pen: Number((monto * tasa).toFixed(2)),
      moneda,
    } as T;
  }

  if (cleanPath === '/api/public/butacas') {
    return { rutas: state.butacas } as T;
  }

  if (cleanPath === '/api/public/butacas/reservar' && method === 'POST') {
    const route = state.butacas.find((b) => b.id === Number(payload.asiento_servicio_id));
    const seatNum = Number(payload.asiento_numero);
    if (!route || !seatNum) throw new Error('Selecciona una ruta y butaca válida.');
    if (route.asientos_ocupados.includes(seatNum)) {
      throw new Error('Ese asiento ya está reservado.');
    }
    route.asientos_ocupados.push(seatNum);
    saveState(state);
    return {
      codigo_ruta: route.codigo_ruta,
      asiento_numero: seatNum,
      cliente_pin: String(Math.floor(1000 + Math.random() * 9000)),
    } as T;
  }

  if (cleanPath === '/api/public/emergencias' && method === 'POST') {
    const codigo = `SOS-${Math.floor(1000 + Math.random() * 9000)}`;
    state.emergencias.unshift({
      codigo,
      cliente_nombre: String(payload.cliente_nombre || 'Huésped La Chuspa'),
      cliente_telefono: String(payload.cliente_telefono || '+51984000000'),
      ubicacion_texto: String(payload.ubicacion_texto || 'Centro Histórico, Cusco'),
      mensaje: String(payload.mensaje || 'Asistencia prioritaria'),
      estado: 'ACTIVA',
      created_at: new Date().toISOString(),
    });
    saveState(state);
    return { codigo } as T;
  }

  if (cleanPath === '/api/public/taxi/pedir' && method === 'POST') {
    const unit = state.unidades.find((u) => u.id === Number(payload.unidad_id)) || state.unidades[0];
    const codigo = `CH-${Math.floor(1000 + Math.random() * 9000)}`;
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const tel = String(payload.cliente_telefono || '+51984000000');
    const pedido: PedidoPublico & { cliente_pin: string; negocio_id: number } = {
      id: state.pedidos.length + 1,
      codigo,
      negocio_id: unit.negocio_id,
      referido_negocio_id: null,
      negocio_nombre: unit.negocio_nombre,
      categoria: 'TRANSPORTE',
      item_nombre: `${unit.modelo} · ${unit.conductor_nombre}`,
      transcripcion: `Taxi VIP ${unit.modelo} (${unit.placa}) · ${payload.destino_texto || 'Centro Cusco'}`,
      monto_centavos: unit.tarifa_base_centavos + unit.tarifa_km_centavos * 5,
      metodo_pago: (payload.metodo_pago as MetodoPago) || 'Yape',
      estado: 'PENDIENTE_CONFIRMACION',
      created_at: new Date().toISOString(),
      cliente_nombre: String(payload.cliente_nombre || 'Huésped'),
      cliente_telefono_masked: tel.length > 4 ? `***${tel.slice(-4)}` : tel,
      origen_texto: String(payload.origen_texto || 'Plaza de Armas, Cusco'),
      destino_texto: String(payload.destino_texto || 'Aeropuerto Velasco Astete'),
      conductor_nombre: unit.conductor_nombre,
      placa: unit.placa,
      modelo: unit.modelo,
      cliente_pin: pin,
    };
    state.pedidos.unshift(pedido);
    saveState(state);
    return { pedido, cliente_pin: pin } as T;
  }

  if (cleanPath === '/api/public/pedidos' && method === 'POST') {
    const srv = state.servicios.find((s) => s.id === Number(payload.servicio_id)) || state.servicios[0];
    const codigo = `CH-${Math.floor(1000 + Math.random() * 9000)}`;
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const tel = String(payload.cliente_telefono || '+51984000000');
    const pedido: PedidoPublico & { cliente_pin: string; negocio_id: number } = {
      id: state.pedidos.length + 1,
      codigo,
      negocio_id: srv.negocio_id,
      referido_negocio_id: null,
      negocio_nombre: srv.negocio_nombre,
      negocio_zona: srv.zona,
      categoria: srv.categoria,
      item_nombre: srv.nombre,
      transcripcion: String(payload.transcripcion || srv.nombre),
      monto_centavos: srv.precio_centavos,
      metodo_pago: (payload.metodo_pago as MetodoPago) || 'Yape',
      estado: 'PENDIENTE_CONFIRMACION',
      created_at: new Date().toISOString(),
      cliente_nombre: String(payload.cliente_nombre || 'Huésped'),
      cliente_telefono_masked: tel.length > 4 ? `***${tel.slice(-4)}` : tel,
      cliente_pin: pin,
    };
    state.pedidos.unshift(pedido);
    saveState(state);
    return { pedido, cliente_pin: pin } as T;
  }

  const orderMatch = cleanPath.match(/^\/api\/public\/pedidos\/([^/]+)(\/cancelar|\/resena)?$/);
  if (orderMatch) {
    const codigo = decodeURIComponent(orderMatch[1]);
    const action = orderMatch[2] || '';
    const pedido = state.pedidos.find((p) => p.codigo === codigo);
    if (!pedido) throw new Error('Pedido no encontrado en esta sesión local.');
    if (action === '/cancelar' && method === 'POST') {
      pedido.estado = 'CANCELADO';
      saveState(state);
      return { ok: true, pedido } as T;
    }
    if (action === '/resena' && method === 'POST') {
      return { ok: true } as T;
    }
    return {
      pedido,
      notificaciones: [
        {
          id: 1,
          canal: 'WhatsApp',
          plantilla: 'PEDIDO_CONFIRMADO',
          mensaje: `Tu solicitud ${pedido.codigo} fue registrada. PIN de entrega: ${pedido.cliente_pin}.`,
          estado: 'ENVIADO',
          created_at: pedido.created_at,
        },
      ],
    } as T;
  }

  if (cleanPath === '/api/negocio/login' && method === 'POST') {
    const biz = state.negocios.find((n) => n.codigo === payload.codigo);
    if (!biz || biz.demoPin !== String(payload.pin || '').trim()) {
      throw new Error('Código o PIN inválido.');
    }
    return { token: `static-biz:${biz.id}`, negocio: biz } as T;
  }

  if (cleanPath === '/api/negocio/panel') {
    const id = Number((token || '').replace('static-biz:', '')) || 1;
    const biz = state.negocios.find((n) => n.id === id) || state.negocios[0];
    return {
      negocio: biz,
      pedidos: state.pedidos.filter((p) => p.negocio_id === biz.id),
      servicios: state.servicios.filter((s) => s.negocio_id === biz.id),
      unidades: state.unidades.filter((u) => u.negocio_id === biz.id),
      recargas: [],
      resenas: [],
      referidos_emitidos: [],
      aliados_turismo: state.negocios.filter((n) => n.rubro === 'TURISMO' && n.id !== biz.id),
      servicios_aliados: state.servicios.filter((s) => s.categoria === 'TURISMO' && s.negocio_id !== biz.id),
    } as T;
  }

  throw new Error(
    'Esta acción administrativa requiere el servidor Node.js conectado (configura VITE_API_BASE_URL o abre el enlace compartido).'
  );
}
