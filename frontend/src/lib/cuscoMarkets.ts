export interface RequestedMarketItem {
  sku: string;
  label: string;
  cantidad: number;
}

export interface MarketProductItem {
  sku: string;
  nombre: string;
  marca: string;
  presentacion: string;
  precioCentavos: number;
  stock: number;
}

export interface CuscoMarketLocation {
  id: string;
  nombre: string;
  zona: string;
  direccion: string;
  lat: number;
  lng: number;
  horario: string;
  abiertoAhora: boolean;
  calificacion: number;
  catalogo: Record<string, MarketProductItem>;
}

export interface MarketComparisonItem {
  sku: string;
  requestedLabel: string;
  cantidad: number;
  matched: MarketProductItem | null;
  subtotalCentavos: number;
}

export interface MarketComparisonResult {
  market: CuscoMarketLocation;
  distanciaKm: number;
  etaMin: number;
  items: MarketComparisonItem[];
  matchedCount: number;
  totalCentavos: number;
  ahorroVsCaroCentavos: number;
  priceTier: 'cheapest' | 'mid' | 'high';
}

export const QUICK_MARKET_CATALOG_ITEMS: Array<{
  sku: string;
  label: string;
  keywords: string[];
}> = [
  { sku: 'leche', label: 'Leche Evaporada Gloria 400g', keywords: ['leche', 'gloria', 'lacteo'] },
  { sku: 'atun', label: 'Filete de Atún Florida 170g', keywords: ['atun', 'atún', 'pescado', 'conserva'] },
  { sku: 'arroz', label: 'Arroz Extra Costeño 750g', keywords: ['arroz', 'grano'] },
  { sku: 'aceite', label: 'Aceite Vegetal Primor 900ml', keywords: ['aceite', 'primor'] },
  { sku: 'pan', label: 'Pan de Molde Blanco Bimbo', keywords: ['pan', 'molde', 'bimbo'] },
  { sku: 'agua', label: 'Agua Mineral San Mateo 2.5L', keywords: ['agua', 'san mateo', 'botella'] },
  { sku: 'azucar', label: 'Azúcar Rubia Cartavio 1kg', keywords: ['azucar', 'azúcar'] },
  { sku: 'huevos', label: 'Huevos Pardos La Calera x15', keywords: ['huevo', 'huevos'] },
  { sku: 'cafe', label: 'Café Altomayo Clásico 50g', keywords: ['cafe', 'café', 'altomayo'] },
  { sku: 'fideos', label: 'Tallarín Don Vittorio 500g', keywords: ['fideo', 'fideos', 'tallarin', 'pasta'] },
];

const CUSCO_MARKETS: CuscoMarketLocation[] = [
  {
    id: 'mkt-wanchaq',
    nombre: 'Bodega & Minimarket El Sol Express',
    zona: 'Wanchaq · Av. La Cultura',
    direccion: 'Av. La Cultura 742, Wanchaq',
    lat: -13.5228,
    lng: -71.9648,
    horario: '06:30 - 23:30',
    abiertoAhora: true,
    calificacion: 4.92,
    catalogo: {
      leche: { sku: 'leche', nombre: 'Leche Evaporada Gloria Azul', marca: 'Gloria', presentacion: 'Lata 400g', precioCentavos: 410, stock: 34 },
      atun: { sku: 'atun', nombre: 'Filete de Atún en Aceite', marca: 'Florida', presentacion: 'Lata 170g', precioCentavos: 580, stock: 22 },
      arroz: { sku: 'arroz', nombre: 'Arroz Extra Añejo', marca: 'Costeño', presentacion: 'Bolsa 750g', precioCentavos: 390, stock: 40 },
      aceite: { sku: 'aceite', nombre: 'Aceite Vegetal Premium', marca: 'Primor', presentacion: 'Botella 900ml', precioCentavos: 840, stock: 18 },
      pan: { sku: 'pan', nombre: 'Pan de Molde Blanco', marca: 'Bimbo', presentacion: 'Bolsa 480g', precioCentavos: 650, stock: 14 },
      agua: { sku: 'agua', nombre: 'Agua Sin Gas', marca: 'San Mateo', presentacion: 'Botella 2.5L', precioCentavos: 320, stock: 50 },
      azucar: { sku: 'azucar', nombre: 'Azúcar Rubia Doméstica', marca: 'Cartavio', presentacion: 'Bolsa 1kg', precioCentavos: 430, stock: 28 },
      huevos: { sku: 'huevos', nombre: 'Huevos Pardos Frescos', marca: 'La Calera', presentacion: 'Jaba x15', precioCentavos: 990, stock: 16 },
      cafe: { sku: 'cafe', nombre: 'Café Instantáneo Clásico', marca: 'Altomayo', presentacion: 'Frasco 50g', precioCentavos: 780, stock: 12 },
      fideos: { sku: 'fideos', nombre: 'Spaghetti Clásico', marca: 'Don Vittorio', presentacion: 'Paquete 500g', precioCentavos: 340, stock: 30 },
    },
  },
  {
    id: 'mkt-centro',
    nombre: 'Market Plaza Regocijo 24h',
    zona: 'Centro Histórico',
    direccion: 'Calle Garcilaso 215, Cusco',
    lat: -13.5169,
    lng: -71.9799,
    horario: '24 horas',
    abiertoAhora: true,
    calificacion: 4.86,
    catalogo: {
      leche: { sku: 'leche', nombre: 'Leche Evaporada Gloria Azul', marca: 'Gloria', presentacion: 'Lata 400g', precioCentavos: 450, stock: 28 },
      atun: { sku: 'atun', nombre: 'Filete de Atún en Aceite', marca: 'Florida', presentacion: 'Lata 170g', precioCentavos: 620, stock: 19 },
      arroz: { sku: 'arroz', nombre: 'Arroz Extra Añejo', marca: 'Costeño', presentacion: 'Bolsa 750g', precioCentavos: 430, stock: 25 },
      aceite: { sku: 'aceite', nombre: 'Aceite Vegetal Premium', marca: 'Primor', presentacion: 'Botella 900ml', precioCentavos: 890, stock: 15 },
      pan: { sku: 'pan', nombre: 'Pan de Molde Blanco', marca: 'Bimbo', presentacion: 'Bolsa 480g', precioCentavos: 680, stock: 11 },
      agua: { sku: 'agua', nombre: 'Agua Sin Gas', marca: 'San Mateo', presentacion: 'Botella 2.5L', precioCentavos: 350, stock: 60 },
      azucar: { sku: 'azucar', nombre: 'Azúcar Rubia Doméstica', marca: 'Cartavio', presentacion: 'Bolsa 1kg', precioCentavos: 460, stock: 20 },
      huevos: { sku: 'huevos', nombre: 'Huevos Pardos Frescos', marca: 'La Calera', presentacion: 'Jaba x15', precioCentavos: 1050, stock: 10 },
      cafe: { sku: 'cafe', nombre: 'Café Instantáneo Clásico', marca: 'Altomayo', presentacion: 'Frasco 50g', precioCentavos: 820, stock: 14 },
      fideos: { sku: 'fideos', nombre: 'Spaghetti Clásico', marca: 'Don Vittorio', presentacion: 'Paquete 500g', precioCentavos: 360, stock: 22 },
    },
  },
  {
    id: 'mkt-magisterio',
    nombre: 'Market Tambo Magisterio',
    zona: 'Magisterio · Av. Collasuyo',
    direccion: 'Urb. Magisterio I Etapa Mz B-4',
    lat: -13.5245,
    lng: -71.9512,
    horario: '07:00 - 23:00',
    abiertoAhora: true,
    calificacion: 4.89,
    catalogo: {
      leche: { sku: 'leche', nombre: 'Leche Evaporada Gloria Azul', marca: 'Gloria', presentacion: 'Lata 400g', precioCentavos: 430, stock: 20 },
      atun: { sku: 'atun', nombre: 'Filete de Atún Campomar', marca: 'Campomar', presentacion: 'Lata 170g', precioCentavos: 590, stock: 18 },
      arroz: { sku: 'arroz', nombre: 'Arroz Superior Paisana', marca: 'Paisana', presentacion: 'Bolsa 750g', precioCentavos: 410, stock: 30 },
      aceite: { sku: 'aceite', nombre: 'Aceite Vegetal Cil', marca: 'Cil', presentacion: 'Botella 900ml', precioCentavos: 810, stock: 12 },
      pan: { sku: 'pan', nombre: 'Pan de Molde Blanco', marca: 'Bimbo', presentacion: 'Bolsa 480g', precioCentavos: 660, stock: 9 },
      agua: { sku: 'agua', nombre: 'Agua Sin Gas', marca: 'San Mateo', presentacion: 'Botella 2.5L', precioCentavos: 340, stock: 35 },
      azucar: { sku: 'azucar', nombre: 'Azúcar Rubia Doméstica', marca: 'Cartavio', presentacion: 'Bolsa 1kg', precioCentavos: 450, stock: 19 },
      huevos: { sku: 'huevos', nombre: 'Huevos Pardos Frescos', marca: 'La Calera', presentacion: 'Jaba x15', precioCentavos: 1020, stock: 12 },
      cafe: { sku: 'cafe', nombre: 'Café Instantáneo Clásico', marca: 'Altomayo', presentacion: 'Frasco 50g', precioCentavos: 790, stock: 10 },
      fideos: { sku: 'fideos', nombre: 'Spaghetti Clásico', marca: 'Don Vittorio', presentacion: 'Paquete 500g', precioCentavos: 350, stock: 24 },
    },
  },
  {
    id: 'mkt-sanblas',
    nombre: 'Bodega & Market San Blas',
    zona: 'San Blas · Centro',
    direccion: 'Cuesta San Blas 518, Cusco',
    lat: -13.5142,
    lng: -71.9746,
    horario: '07:00 - 22:00',
    abiertoAhora: true,
    calificacion: 4.81,
    catalogo: {
      leche: { sku: 'leche', nombre: 'Leche Evaporada Gloria Azul', marca: 'Gloria', presentacion: 'Lata 400g', precioCentavos: 480, stock: 18 },
      atun: { sku: 'atun', nombre: 'Filete de Atún en Aceite', marca: 'Florida', presentacion: 'Lata 170g', precioCentavos: 650, stock: 15 },
      arroz: { sku: 'arroz', nombre: 'Arroz Extra Añejo', marca: 'Costeño', presentacion: 'Bolsa 750g', precioCentavos: 460, stock: 22 },
      aceite: { sku: 'aceite', nombre: 'Aceite Vegetal Premium', marca: 'Primor', presentacion: 'Botella 900ml', precioCentavos: 920, stock: 11 },
      agua: { sku: 'agua', nombre: 'Agua Sin Gas', marca: 'San Mateo', presentacion: 'Botella 2.5L', precioCentavos: 380, stock: 30 },
      cafe: { sku: 'cafe', nombre: 'Café Instantáneo Clásico', marca: 'Altomayo', presentacion: 'Frasco 50g', precioCentavos: 850, stock: 8 },
    },
  },
  {
    id: 'mkt-santiago',
    nombre: 'Supermarket Santiago Sur',
    zona: 'Santiago · Puente Almudena',
    direccion: 'Av. Antonio Lorena 310, Santiago',
    lat: -13.5248,
    lng: -71.9862,
    horario: '08:00 - 20:30',
    abiertoAhora: false,
    calificacion: 4.76,
    catalogo: {
      leche: { sku: 'leche', nombre: 'Leche Evaporada Gloria Azul', marca: 'Gloria', presentacion: 'Lata 400g', precioCentavos: 400, stock: 40 },
      atun: { sku: 'atun', nombre: 'Filete de Atún en Aceite', marca: 'Florida', presentacion: 'Lata 170g', precioCentavos: 570, stock: 24 },
      arroz: { sku: 'arroz', nombre: 'Arroz Extra Añejo', marca: 'Costeño', presentacion: 'Bolsa 750g', precioCentavos: 380, stock: 35 },
    },
  },
];

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export interface CuscoLandmark {
  label: string;
  lat: number;
  lng: number;
  aliases: string[];
}

export const CUSCO_LANDMARKS: CuscoLandmark[] = [
  {
    label: 'Aeropuerto Velasco Astete',
    lat: -13.5357,
    lng: -71.9388,
    aliases: ['aeropuerto', 'velasco astete', 'airport'],
  },
  {
    label: 'Terminal Terrestre Cusco',
    lat: -13.5322,
    lng: -71.9642,
    aliases: ['terminal terrestre', 'terminal de buses', 'terminal cusco', 'terminal'],
  },
  {
    label: 'Plaza de Armas Cusco',
    lat: -13.5167,
    lng: -71.9788,
    aliases: ['plaza de armas', 'plaza mayor', 'centro historico'],
  },
  {
    label: 'Real Plaza Cusco',
    lat: -13.5249,
    lng: -71.9508,
    aliases: ['real plaza', 'mall cusco'],
  },
  {
    label: 'Plaza Túpac Amaru',
    lat: -13.5218,
    lng: -71.9629,
    aliases: ['tupac amaru', 'plaza tupac'],
  },
  {
    label: 'Hospital Regional Cusco',
    lat: -13.5236,
    lng: -71.9577,
    aliases: ['hospital regional', 'hospital'],
  },
  {
    label: 'Hospital EsSalud Adolfo Guevara',
    lat: -13.5241,
    lng: -71.9598,
    aliases: ['essalud', 'adolfo guevara', 'seguro social'],
  },
  {
    label: 'San Blas, Cusco',
    lat: -13.5142,
    lng: -71.9746,
    aliases: ['san blas', 'cuesta san blas'],
  },
  {
    label: 'Wanchaq, Cusco',
    lat: -13.5245,
    lng: -71.9632,
    aliases: ['wanchaq', 'estacion wanchaq', 'av la cultura', 'la cultura'],
  },
  {
    label: 'Óvalo Pachacútec',
    lat: -13.5266,
    lng: -71.9675,
    aliases: ['ovalo pachacutec', 'pachacutec', 'monumento pachacutec'],
  },
  {
    label: 'Estadio Inca Garcilaso',
    lat: -13.5256,
    lng: -71.9667,
    aliases: ['estadio garcilaso', 'estadio'],
  },
  {
    label: 'Qorikancha · Av. El Sol',
    lat: -13.5204,
    lng: -71.9752,
    aliases: ['qorikancha', 'koricancha', 'av el sol', 'avenida el sol'],
  },
  {
    label: 'Sacsayhuamán',
    lat: -13.5096,
    lng: -71.9817,
    aliases: ['sacsayhuaman', 'saqsaywaman'],
  },
  {
    label: 'San Sebastián, Cusco',
    lat: -13.5298,
    lng: -71.9362,
    aliases: ['san sebastian'],
  },
  {
    label: 'Santiago, Cusco',
    lat: -13.5248,
    lng: -71.9862,
    aliases: ['santiago', 'puente almudena'],
  },
  {
    label: 'Larapa, San Jerónimo',
    lat: -13.5364,
    lng: -71.9114,
    aliases: ['larapa', 'san jeronimo'],
  },
  {
    label: 'Estación de Poroy',
    lat: -13.4958,
    lng: -72.0447,
    aliases: ['poroy', 'estacion poroy'],
  },
  {
    label: 'Ollantaytambo, Valle Sagrado',
    lat: -13.2584,
    lng: -72.2633,
    aliases: ['ollantaytambo', 'ollantay'],
  },
  {
    label: 'Urubamba, Valle Sagrado',
    lat: -13.3046,
    lng: -72.1167,
    aliases: ['urubamba', 'valle sagrado'],
  },
];

export function resolveCuscoDestination(
  rawText: string,
  originLat = -13.5167,
  originLng = -71.9788
): { label: string; lat: number; lng: number; matchedKnown: boolean } {
  const clean = rawText.trim();
  const norm = normalizeText(clean);
  if (!norm) {
    return {
      label: 'Plaza de Armas Cusco',
      lat: -13.5167,
      lng: -71.9788,
      matchedKnown: true,
    };
  }

  for (const lm of CUSCO_LANDMARKS) {
    if (lm.aliases.some((alias) => norm.includes(alias)) || normalizeText(lm.label) === norm) {
      return { label: lm.label, lat: lm.lat, lng: lm.lng, matchedKnown: true };
    }
  }

  // Coordenada determinística cercana dentro de Cusco para direcciones personalizadas
  let hash = 0;
  for (let i = 0; i < norm.length; i += 1) {
    hash = (hash * 31 + norm.charCodeAt(i)) % 997;
  }
  const dLat = (((hash % 23) - 11) * 0.0014) || 0.008;
  const dLng = ((((hash >> 3) % 23) - 11) * 0.0016) || -0.009;
  const formatted = clean
    .replace(/\s+/g, ' ')
    .replace(/^(a|al|para|hasta|hacia|la|el)\s+/i, '')
    .trim();
  return {
    label: formatted || clean,
    lat: Number((originLat + dLat).toFixed(5)),
    lng: Number((originLng + dLng).toFixed(5)),
    matchedKnown: false,
  };
}

export function extractCuscoDestination(query: string): string | null {
  const cleanedRaw = query
    .replace(/desde\s+mi\s+ubicaci[oó]n(?:\s+actual)?/gi, ' ')
    .replace(/desde\s+aqu[ií]/gi, ' ')
    .replace(/por\s+favor/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const norm = normalizeText(cleanedRaw);

  // Primero buscar coincidencia exacta con lugares conocidos de Cusco
  for (const lm of CUSCO_LANDMARKS) {
    if (lm.aliases.some((alias) => norm.includes(alias))) {
      return lm.label;
    }
  }

  // Extraer frase después de "al / a la / para / hacia / hasta / rumbo a / a"
  const destMatch = cleanedRaw.match(
    /(?:rumbo\s+a|hacia|hasta|para|al|a\s+la|a\s+el|a)\s+([a-zA-Z0-9áéíóúñÁÉÍÓÚÑ°.\s-]{3,55})$/i
  );
  if (destMatch && destMatch[1]) {
    const candidate = destMatch[1]
      .replace(/^(la|el|los|las|un|una)\s+/i, '')
      .trim();
    const candNorm = normalizeText(candidate);
    if (
      candidate.length >= 3 &&
      !['mi ubicacion', 'ubicacion', 'cusco', 'taxi', 'ciudad', 'algun punto'].includes(candNorm)
    ) {
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }
  return null;
}

export type SectorKey =
  | 'TRANSPORTE'
  | 'HOTELERIA'
  | 'RESTAURANTE'
  | 'FARMACIA'
  | 'TURISMO'
  | 'CASA_CAMBIO'
  | 'FERRETERIA'
  | 'PINATERIA'
  | 'EMPLEOS'
  | 'MINIMARKET'
  | 'VETERINARIA';

export interface SectorIntentInfo {
  sectorKey: SectorKey;
  sectorLabel: string;
  rubroBase: 'TRANSPORTE' | 'TURISMO' | 'HOTEL' | 'RESTAURANTE' | 'FARMACIA' | 'CASA_CAMBIO';
  expandedTerms: string[];
  isHospitalityHousekeeping: boolean;
}

export interface ConciergeIntentResult {
  mode: 'TAXI' | 'MARKET' | 'DIVISAS' | 'CATALOG';
  rubro: 'TRANSPORTE' | 'TURISMO' | 'HOTEL' | 'RESTAURANTE' | 'FARMACIA' | 'CASA_CAMBIO';
  sectorKey: SectorKey;
  sectorLabel: string;
  openOnly: boolean;
  fromMyLocation: boolean;
  destino: string | null;
}

export const SECTOR_LABELS: Record<SectorKey, string> = {
  TRANSPORTE: 'Taxi / Movilidad / Transporte',
  HOTELERIA: 'Hotelería / Hospedaje / Alojamiento',
  RESTAURANTE: 'Restaurante / Gastronomía',
  FARMACIA: 'Botica / Farmacia',
  TURISMO: 'Turismo & Guías',
  CASA_CAMBIO: 'Casa de Cambio / Divisas',
  FERRETERIA: 'Ferretería & Materiales',
  PINATERIA: 'Piñatería & Eventos',
  EMPLEOS: 'Empleos & Talento RRHH',
  MINIMARKET: 'Minimarket / Bodega',
  VETERINARIA: 'Veterinaria / Mascotas',
};

const HOUSEKEEPING_HOTEL_RX =
  /\b(housekeeping|housekeeper|ama de llaves|camareria|camarera|camarero de piso|cuartelero|mucama|lenceria hotelera|limpieza de habitaciones|acondicionamiento de habitaciones|recepcionista de hotel|botones|bellboy)\b/;

const HOTEL_CORE_RX =
  /\b(hotel|hoteles|hoteleria|hostal|hostales|hospedaje|hospedajes|alojamiento|alojamientos|habitacion|habitaciones|suite|suites|spa|day-use|posada|lodge|airbnb)\b/;

const RESTAURANT_CORE_RX =
  /\b(restaurante|restaurantes|restaurant|gastronomia|comida|comer|almuerzo|cena|desayuno|ceviche|lomo|trucha|brasa|pollo|chifa|pizzeria|cafeteria|cocina|limpieza de cocina|limpieza de salon|salon|comedor|azafata|mozo|mesero|mesera|cocinero|chef|salonero|lavaplatos)\b/;

export function detectSectorIntent(query: string): SectorIntentInfo {
  const q = normalizeText(query);

  // 1. Transporte / Taxi
  if (
    /\b(taxi|taxis|uber|indriver|indrive|movilidad|chofer|conductor|carrera|pasaje|traslado|llevame|llevarme)\b/.test(
      q
    )
  ) {
    return {
      sectorKey: 'TRANSPORTE',
      sectorLabel: SECTOR_LABELS.TRANSPORTE,
      rubroBase: 'TRANSPORTE',
      expandedTerms: [],
      isHospitalityHousekeeping: false,
    };
  }

  // 2. Farmacia / Veterinaria
  if (/\b(veterinaria|veterinario|mascota|mascotas|perro|gato|petshop)\b/.test(q)) {
    return {
      sectorKey: 'VETERINARIA',
      sectorLabel: SECTOR_LABELS.VETERINARIA,
      rubroBase: 'FARMACIA',
      expandedTerms: [],
      isHospitalityHousekeeping: false,
    };
  }
  if (
    /\b(farmacia|farmacias|botica|boticas|drogueria|soroche|oxigeno|pastilla|pastillas|medicina|medicinas|medicamento|medicamentos|jarabe|ibuprofeno|paracetamol|analgesico|botiquin)\b/.test(
      q
    )
  ) {
    return {
      sectorKey: 'FARMACIA',
      sectorLabel: SECTOR_LABELS.FARMACIA,
      rubroBase: 'FARMACIA',
      expandedTerms: [],
      isHospitalityHousekeeping: false,
    };
  }

  // 3. Casa de cambio
  if (
    /\b(casa de cambio|casas de cambio|cambiar dolares|cambiar euros|cambio|dolar|dolares|usd|eur|euro|euros|divisa|divisas|cambista)\b/.test(
      q
    )
  ) {
    return {
      sectorKey: 'CASA_CAMBIO',
      sectorLabel: SECTOR_LABELS.CASA_CAMBIO,
      rubroBase: 'CASA_CAMBIO',
      expandedTerms: [],
      isHospitalityHousekeeping: false,
    };
  }

  // 4. Hotelería / Hospedaje / Housekeeping (prioridad estricta sobre empleo/restaurante si pide housekeeping)
  const isHousekeeping = HOUSEKEEPING_HOTEL_RX.test(q);
  if (isHousekeeping || HOTEL_CORE_RX.test(q)) {
    return {
      sectorKey: 'HOTELERIA',
      sectorLabel: SECTOR_LABELS.HOTELERIA,
      rubroBase: 'HOTEL',
      expandedTerms: isHousekeeping
        ? [
            'housekeeping',
            'housekeeper',
            'ama de llaves',
            'camareria',
            'camarera',
            'camarero de piso',
            'cuartelero',
            'mucama',
            'limpieza de habitaciones',
            'acondicionamiento de habitaciones',
          ]
        : [],
      isHospitalityHousekeeping: isHousekeeping,
    };
  }

  // 5. Sub-rubros específicos dentro de comercio / servicios
  if (
    /\b(ferreteria|ferreterias|clavo|clavos|tornillo|tornillos|cemento|tubo|tubos|taladro|pintura|herramienta|herramientas|gasfiteria|construccion)\b/.test(
      q
    )
  ) {
    return {
      sectorKey: 'FERRETERIA',
      sectorLabel: SECTOR_LABELS.FERRETERIA,
      rubroBase: 'RESTAURANTE',
      expandedTerms: [],
      isHospitalityHousekeeping: false,
    };
  }

  if (/\b(pinateria|pinata|cotillon|globos|cumpleanos|fiesta|decoracion)\b/.test(q)) {
    return {
      sectorKey: 'PINATERIA',
      sectorLabel: SECTOR_LABELS.PINATERIA,
      rubroBase: 'RESTAURANTE',
      expandedTerms: [],
      isHospitalityHousekeeping: false,
    };
  }

  // 6. Restaurante / Gastronomía (incluye roles de restaurante: cocina, salón, comedor, azafata, mozo)
  if (RESTAURANT_CORE_RX.test(q)) {
    return {
      sectorKey: 'RESTAURANTE',
      sectorLabel: SECTOR_LABELS.RESTAURANTE,
      rubroBase: 'RESTAURANTE',
      expandedTerms: [],
      isHospitalityHousekeeping: false,
    };
  }

  // 7. Minimarket / Bodega
  if (
    /\b(market|markets|minimarket|minimarkets|bodega|bodegas|supermercado|abarrotes|viveres|leche|atun|arroz|aceite|pan|agua|azucar|huevos|fideos)\b/.test(
      q
    )
  ) {
    return {
      sectorKey: 'MINIMARKET',
      sectorLabel: SECTOR_LABELS.MINIMARKET,
      rubroBase: 'RESTAURANTE',
      expandedTerms: [],
      isHospitalityHousekeeping: false,
    };
  }

  // 8. Empleos / RRHH (cuando no especificó Hotelería o Restaurante)
  if (/\b(empleo|empleos|trabajo|vacante|vacantes|rrhh|talento|reclutamiento|postulacion)\b/.test(q)) {
    return {
      sectorKey: 'EMPLEOS',
      sectorLabel: SECTOR_LABELS.EMPLEOS,
      rubroBase: 'TURISMO',
      expandedTerms: [],
      isHospitalityHousekeeping: false,
    };
  }

  // 9. Turismo & Guías
  if (
    /\b(tour|tours|turismo|guia|excursion|machu|picchu|valle sagrado|maras|moray|sacsayhuaman|vinicunca)\b/.test(
      q
    )
  ) {
    return {
      sectorKey: 'TURISMO',
      sectorLabel: SECTOR_LABELS.TURISMO,
      rubroBase: 'TURISMO',
      expandedTerms: [],
      isHospitalityHousekeeping: false,
    };
  }

  // 10. Destinos de transporte sin otra categoría explícita
  if (/\b(auto|carro|viaje|aeropuerto|terminal|estacion|poroy|ir al|ir a la|ir hasta)\b/.test(q)) {
    return {
      sectorKey: 'TRANSPORTE',
      sectorLabel: SECTOR_LABELS.TRANSPORTE,
      rubroBase: 'TRANSPORTE',
      expandedTerms: [],
      isHospitalityHousekeeping: false,
    };
  }

  return {
    sectorKey: 'RESTAURANTE',
    sectorLabel: SECTOR_LABELS.RESTAURANTE,
    rubroBase: 'RESTAURANTE',
    expandedTerms: [],
    isHospitalityHousekeeping: false,
  };
}

export function classifyRecordSectorClient(params: {
  rubro?: string | null;
  tipo_negocio?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
  panel_ia_titulo?: string | null;
  atributos_rubro?: string | null;
}): {
  specified: boolean;
  sectorKey: SectorKey | null;
  sectorLabel: string;
} {
  const tipo = normalizeText(params.tipo_negocio || '');
  const attrRubro = normalizeText(params.atributos_rubro || '');
  const panelTitulo = normalizeText(params.panel_ia_titulo || '');
  const fullDesc = normalizeText(`${params.nombre || ''} ${params.descripcion || ''}`);
  const explicitUnspecified =
    /(no especificado|sin especificar|rubro no especificado|indefinido|por definir|sin rubro)/.test(
      `${tipo} ${attrRubro}`
    ) || !params.rubro;

  if (explicitUnspecified) {
    return { specified: false, sectorKey: null, sectorLabel: 'Rubro no especificado' };
  }

  const sectorSource = `${attrRubro} ${tipo} ${panelTitulo}`.trim();
  const isGenericTipo =
    !sectorSource ||
    /^(comercio multirubro|tienda multirubro|general|varios|multirubro|servicios varios)$/.test(
      sectorSource
    );

  // Detectar sub-rubro claro por tipo_negocio / panel_ia / atributos primero
  const probeText = isGenericTipo ? fullDesc : `${sectorSource} ${fullDesc}`;

  if (/(hotel|hostal|hospedaje|alojamiento|suite|suites|posada|lodge|housekeeping|ama de llaves|habitacion)/.test(probeText)) {
    return { specified: true, sectorKey: 'HOTELERIA', sectorLabel: SECTOR_LABELS.HOTELERIA };
  }
  if (/(ferreteria|clavos|tornillos|construccion|herramienta)/.test(probeText)) {
    return { specified: true, sectorKey: 'FERRETERIA', sectorLabel: SECTOR_LABELS.FERRETERIA };
  }
  if (/(pinateria|cotillon|pinata|globos)/.test(probeText)) {
    return { specified: true, sectorKey: 'PINATERIA', sectorLabel: SECTOR_LABELS.PINATERIA };
  }
  if (/(empleo|rrhh|talento|reclutamiento|vacante)/.test(probeText)) {
    return { specified: true, sectorKey: 'EMPLEOS', sectorLabel: SECTOR_LABELS.EMPLEOS };
  }
  if (/(veterinaria|mascota|petshop)/.test(probeText)) {
    return { specified: true, sectorKey: 'VETERINARIA', sectorLabel: SECTOR_LABELS.VETERINARIA };
  }
  if (/(minimarket|bodega|abarrotes|viveres)/.test(probeText)) {
    return { specified: true, sectorKey: 'MINIMARKET', sectorLabel: SECTOR_LABELS.MINIMARKET };
  }
  if (/(restaurante|gastronomia|cocina|platos|gourmet|ceviche|brasa|comedor|azafata|mozo)/.test(probeText)) {
    return { specified: true, sectorKey: 'RESTAURANTE', sectorLabel: SECTOR_LABELS.RESTAURANTE };
  }
  if (/(farmacia|botica|farmaceutic|soroche|apotecaria)/.test(probeText)) {
    return { specified: true, sectorKey: 'FARMACIA', sectorLabel: SECTOR_LABELS.FARMACIA };
  }
  if (/(taxi|movilidad|flota|sedanes|transporte)/.test(probeText)) {
    return { specified: true, sectorKey: 'TRANSPORTE', sectorLabel: SECTOR_LABELS.TRANSPORTE };
  }
  if (/(casa de cambio|divisa|dolares|euros)/.test(probeText)) {
    return { specified: true, sectorKey: 'CASA_CAMBIO', sectorLabel: SECTOR_LABELS.CASA_CAMBIO };
  }
  if (/(turismo|guia|machu|excursion)/.test(probeText)) {
    return { specified: true, sectorKey: 'TURISMO', sectorLabel: SECTOR_LABELS.TURISMO };
  }

  if (isGenericTipo) {
    return { specified: false, sectorKey: null, sectorLabel: 'Rubro no especificado' };
  }

  const base = params.rubro as string;
  if (base === 'HOTEL') return { specified: true, sectorKey: 'HOTELERIA', sectorLabel: SECTOR_LABELS.HOTELERIA };
  if (base === 'FARMACIA') return { specified: true, sectorKey: 'FARMACIA', sectorLabel: SECTOR_LABELS.FARMACIA };
  if (base === 'TRANSPORTE') return { specified: true, sectorKey: 'TRANSPORTE', sectorLabel: SECTOR_LABELS.TRANSPORTE };
  if (base === 'CASA_CAMBIO') return { specified: true, sectorKey: 'CASA_CAMBIO', sectorLabel: SECTOR_LABELS.CASA_CAMBIO };
  if (base === 'TURISMO') return { specified: true, sectorKey: 'TURISMO', sectorLabel: SECTOR_LABELS.TURISMO };
  return { specified: true, sectorKey: 'RESTAURANTE', sectorLabel: SECTOR_LABELS.RESTAURANTE };
}

export function detectConciergeIntent(query: string): ConciergeIntentResult {
  const q = normalizeText(query);
  const openOnly = /\b(abierta|abierto|abiertas|abiertos|de turno|turno|24h|24 horas|ahora)\b/.test(q);
  const fromMyLocation = /\b(desde mi ubicacion|mi ubicacion|aqui donde estoy|desde aqui)\b/.test(q);
  const destino = extractCuscoDestination(query);
  const sector = detectSectorIntent(query);

  if (sector.sectorKey === 'TRANSPORTE') {
    return {
      mode: 'TAXI',
      rubro: 'TRANSPORTE',
      sectorKey: sector.sectorKey,
      sectorLabel: sector.sectorLabel,
      openOnly,
      fromMyLocation,
      destino,
    };
  }
  if (sector.sectorKey === 'CASA_CAMBIO') {
    return {
      mode: 'DIVISAS',
      rubro: 'CASA_CAMBIO',
      sectorKey: sector.sectorKey,
      sectorLabel: sector.sectorLabel,
      openOnly,
      fromMyLocation,
      destino,
    };
  }
  if (sector.sectorKey === 'MINIMARKET') {
    return {
      mode: 'MARKET',
      rubro: 'RESTAURANTE',
      sectorKey: sector.sectorKey,
      sectorLabel: sector.sectorLabel,
      openOnly,
      fromMyLocation,
      destino,
    };
  }

  return {
    mode: 'CATALOG',
    rubro: sector.rubroBase,
    sectorKey: sector.sectorKey,
    sectorLabel: sector.sectorLabel,
    openOnly,
    fromMyLocation,
    destino,
  };
}

export function detectIntentFromQuery(query: string): 'TAXI' | 'MARKET' | 'DIVISAS' | 'OTHER' {
  const parsed = detectConciergeIntent(query);
  if (parsed.mode === 'TAXI') return 'TAXI';
  if (parsed.mode === 'DIVISAS') return 'DIVISAS';
  if (parsed.mode === 'MARKET') return 'MARKET';
  return 'OTHER';
}


export function parseMarketQuery(query: string): RequestedMarketItem[] {
  const q = normalizeText(query);
  const found: RequestedMarketItem[] = [];

  for (const item of QUICK_MARKET_CATALOG_ITEMS) {
    if (item.keywords.some((kw) => q.includes(normalizeText(kw)))) {
      found.push({ sku: item.sku, label: item.label, cantidad: 1 });
    }
  }

  if (found.length === 0) {
    return [
      { sku: 'leche', label: 'Leche Evaporada Gloria 400g', cantidad: 1 },
      { sku: 'atun', label: 'Filete de Atún Florida 170g', cantidad: 1 },
      { sku: 'arroz', label: 'Arroz Extra Costeño 750g', cantidad: 1 },
    ];
  }

  return found;
}

export function computeMarketComparisons(
  requestedItems: RequestedMarketItem[],
  userLat: number,
  userLng: number,
  includeClosed = false
): MarketComparisonResult[] {
  const candidates = includeClosed
    ? CUSCO_MARKETS
    : CUSCO_MARKETS.filter((m) => m.abiertoAhora);

  const raw = candidates.map((market) => {
    const dist = Math.max(0.3, haversineKm(userLat, userLng, market.lat, market.lng));
    const eta = Math.max(4, Math.round(dist * 3.5 + 3));
    const items: MarketComparisonItem[] = requestedItems.map((req) => {
      const matched = market.catalogo[req.sku] || null;
      return {
        sku: req.sku,
        requestedLabel: req.label,
        cantidad: req.cantidad,
        matched,
        subtotalCentavos: matched ? matched.precioCentavos * req.cantidad : 0,
      };
    });
    const matchedCount = items.filter((i) => i.matched !== null).length;
    const totalCentavos = items.reduce((acc, i) => acc + i.subtotalCentavos, 0);
    return {
      market,
      distanciaKm: dist,
      etaMin: eta,
      items,
      matchedCount,
      totalCentavos,
    };
  });

  raw.sort((a, b) => {
    if (b.matchedCount !== a.matchedCount) return b.matchedCount - a.matchedCount;
    return a.totalCentavos - b.totalCentavos;
  });

  const validTotals = raw.filter((r) => r.totalCentavos > 0).map((r) => r.totalCentavos);
  const minTotal = validTotals.length > 0 ? Math.min(...validTotals) : 0;
  const maxTotal = validTotals.length > 0 ? Math.max(...validTotals) : 0;

  return raw.map((r, idx) => {
    let priceTier: 'cheapest' | 'mid' | 'high' = 'mid';
    if (r.totalCentavos > 0) {
      if (idx === 0 || r.totalCentavos <= minTotal) priceTier = 'cheapest';
      else if (r.totalCentavos >= maxTotal && maxTotal > minTotal) priceTier = 'high';
    }
    return {
      ...r,
      ahorroVsCaroCentavos: r.totalCentavos > 0 ? Math.max(0, maxTotal - r.totalCentavos) : 0,
      priceTier,
    };
  });
}
