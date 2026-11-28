import { GoogleGenAI, Type } from '@google/genai';
import type { DatabaseSync } from 'node:sqlite';
import { HttpError, RUBROS, type AiBusinessPanelSchema, type Rubro } from './types.ts';

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export function calculateTaxiFareServer(
  tarifaBaseCentavos: number,
  tarifaKmCentavos: number,
  distanciaKm: number
): number {
  const effectiveKm = Math.max(1.2, distanciaKm);
  const raw = tarifaBaseCentavos + Math.round(effectiveKm * tarifaKmCentavos);
  // Redondeo elegante a múltiplos de S/ 1.00 (100 centavos)
  return Math.max(1200, Math.round(raw / 100) * 100);
}

function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const STOP_SEARCH_WORDS = new Set([
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
  'unos',
  'unas',
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

const SERVER_CUSCO_DESTINATIONS: Array<{ label: string; lat: number; lng: number; aliases: string[] }> = [
  { label: 'Aeropuerto Velasco Astete', lat: -13.5357, lng: -71.9388, aliases: ['aeropuerto', 'velasco astete'] },
  { label: 'Terminal Terrestre Cusco', lat: -13.5322, lng: -71.9642, aliases: ['terminal terrestre', 'terminal'] },
  { label: 'Plaza de Armas Cusco', lat: -13.5167, lng: -71.9788, aliases: ['plaza de armas', 'plaza mayor'] },
  { label: 'Real Plaza Cusco', lat: -13.5249, lng: -71.9508, aliases: ['real plaza'] },
  { label: 'Plaza Túpac Amaru', lat: -13.5218, lng: -71.9629, aliases: ['tupac amaru'] },
  { label: 'Hospital Regional Cusco', lat: -13.5236, lng: -71.9577, aliases: ['hospital regional', 'hospital'] },
  { label: 'San Blas, Cusco', lat: -13.5142, lng: -71.9746, aliases: ['san blas'] },
  { label: 'Wanchaq, Cusco', lat: -13.5245, lng: -71.9632, aliases: ['wanchaq', 'la cultura'] },
  { label: 'Óvalo Pachacútec', lat: -13.5266, lng: -71.9675, aliases: ['ovalo pachacutec', 'pachacutec'] },
  { label: 'Estación de Poroy', lat: -13.4958, lng: -72.0447, aliases: ['poroy'] },
  { label: 'Ollantaytambo, Valle Sagrado', lat: -13.2584, lng: -72.2633, aliases: ['ollantaytambo', 'ollantay'] },
  { label: 'Urubamba, Valle Sagrado', lat: -13.3046, lng: -72.1167, aliases: ['urubamba', 'valle sagrado'] },
];

function extractServerDestination(query: string, explicitDestino?: string): {
  label: string;
  lat: number | null;
  lng: number | null;
} {
  const source = (explicitDestino || query || '').trim();
  const norm = normalizeText(
    source.replace(/desde\s+mi\s+ubicaci[oó]n(?:\s+actual)?/gi, ' ')
  );
  for (const lm of SERVER_CUSCO_DESTINATIONS) {
    if (lm.aliases.some((alias) => norm.includes(alias))) {
      return { label: lm.label, lat: lm.lat, lng: lm.lng };
    }
  }
  if (explicitDestino?.trim()) {
    return { label: explicitDestino.trim(), lat: null, lng: null };
  }
  const match = source
    .replace(/desde\s+mi\s+ubicaci[oó]n(?:\s+actual)?/gi, ' ')
    .match(/(?:rumbo\s+a|hacia|hasta|para|al|a\s+la|a\s+el|a)\s+([a-zA-Z0-9áéíóúñÁÉÍÓÚÑ°.\s-]{3,55})$/i);
  if (match && match[1]) {
    const clean = match[1].replace(/^(la|el|los|las)\s+/i, '').trim();
    if (clean.length >= 3 && !['mi ubicacion', 'ubicacion', 'cusco'].includes(normalizeText(clean))) {
      return { label: clean.charAt(0).toUpperCase() + clean.slice(1), lat: null, lng: null };
    }
  }
  return { label: '', lat: null, lng: null };
}

function getLimaMinutesNow(): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
    const [h, m] = fmt.split(':').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) return h * 60 + m;
  } catch {
    // fallback UTC-5
  }
  const now = new Date();
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utcMin - 5 * 60 + 24 * 60) % (24 * 60);
}

function parseHHMM(val: string | undefined, fallbackMin: number): number {
  if (!val || !/^\d{1,2}:\d{2}$/.test(val.trim())) return fallbackMin;
  const [h, m] = val.trim().split(':').map(Number);
  return h * 60 + m;
}

export function isBusinessOpenNow(params: {
  en_linea?: number;
  abierto_24h?: number;
  horario_apertura?: string;
  horario_cierre?: string;
}): boolean {
  if (params.en_linea === 0) return false;
  if (params.abierto_24h === 1) return true;
  const nowMin = getLimaMinutesNow();
  const openMin = parseHHMM(params.horario_apertura, 7 * 60);
  const closeMin = parseHHMM(params.horario_cierre, 22 * 60 + 30);
  if (closeMin >= openMin) {
    return nowMin >= openMin && nowMin <= closeMin;
  }
  // Horario nocturno que cruza medianoche
  return nowMin >= openMin || nowMin <= closeMin;
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

const SECTOR_LABELS: Record<SectorKey, string> = {
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

interface ServerSectorIntent {
  sectorKey: SectorKey;
  sectorLabel: string;
  rubroBase: Rubro;
  explicit: boolean;
  isHospitalityHousekeeping: boolean;
  roleSynonyms: string[];
  crossSectorRelatedTerms: string[];
}

function resolveRequestedSector(query: string, forcedCategory?: Rubro): ServerSectorIntent {
  const q = normalizeText(query);

  if (forcedCategory === 'TRANSPORTE') {
    return {
      sectorKey: 'TRANSPORTE',
      sectorLabel: SECTOR_LABELS.TRANSPORTE,
      rubroBase: 'TRANSPORTE',
      explicit: true,
      isHospitalityHousekeeping: false,
      roleSynonyms: [],
      crossSectorRelatedTerms: [],
    };
  }
  if (forcedCategory === 'CASA_CAMBIO') {
    return {
      sectorKey: 'CASA_CAMBIO',
      sectorLabel: SECTOR_LABELS.CASA_CAMBIO,
      rubroBase: 'CASA_CAMBIO',
      explicit: true,
      isHospitalityHousekeeping: false,
      roleSynonyms: [],
      crossSectorRelatedTerms: [],
    };
  }

  // 1. Transporte explícito
  if (/(taxi|taxis|uber|indriver|indrive|movilidad|chofer|conductor|carrera|traslado|llevame|llevarme)/.test(q)) {
    return {
      sectorKey: 'TRANSPORTE',
      sectorLabel: SECTOR_LABELS.TRANSPORTE,
      rubroBase: 'TRANSPORTE',
      explicit: true,
      isHospitalityHousekeeping: false,
      roleSynonyms: [],
      crossSectorRelatedTerms: [],
    };
  }

  // 2. Farmacia / Veterinaria
  if (/\b(veterinaria|veterinario|mascota|mascotas|perro|gato|petshop)\b/.test(q)) {
    return {
      sectorKey: 'VETERINARIA',
      sectorLabel: SECTOR_LABELS.VETERINARIA,
      rubroBase: 'FARMACIA',
      explicit: true,
      isHospitalityHousekeeping: false,
      roleSynonyms: [],
      crossSectorRelatedTerms: [],
    };
  }
  if (
    /(farmacia|farmacias|botica|boticas|drogueria|soroche|oxigeno|pastilla|pastillas|medicina|medicinas|medicamento|medicamentos|jarabe|ibuprofeno|paracetamol|analgesico|botiquin)/.test(
      q
    ) ||
    forcedCategory === 'FARMACIA'
  ) {
    return {
      sectorKey: 'FARMACIA',
      sectorLabel: SECTOR_LABELS.FARMACIA,
      rubroBase: 'FARMACIA',
      explicit: true,
      isHospitalityHousekeeping: false,
      roleSynonyms: [],
      crossSectorRelatedTerms: [],
    };
  }

  // 3. Casa de cambio
  if (/(cambio|dolar|dolares|euro|euros|divisa|divisas|usd|eur|cambista)/.test(q)) {
    return {
      sectorKey: 'CASA_CAMBIO',
      sectorLabel: SECTOR_LABELS.CASA_CAMBIO,
      rubroBase: 'CASA_CAMBIO',
      explicit: true,
      isHospitalityHousekeeping: false,
      roleSynonyms: [],
      crossSectorRelatedTerms: [],
    };
  }

  // 4. Hotelería / Hospedaje / Housekeeping (regla estricta 1 y 2)
  const isHousekeeping = HOUSEKEEPING_HOTEL_RX.test(q);
  if (isHousekeeping || HOTEL_CORE_RX.test(q) || forcedCategory === 'HOTEL') {
    return {
      sectorKey: 'HOTELERIA',
      sectorLabel: SECTOR_LABELS.HOTELERIA,
      rubroBase: 'HOTEL',
      explicit: true,
      isHospitalityHousekeeping: isHousekeeping,
      roleSynonyms: isHousekeeping
        ? [
            'housekeeping',
            'housekeeper',
            'ama de llaves',
            'camareria',
            'camarera',
            'camarero de piso',
            'cuartelero',
            'mucama',
            'lenceria hotelera',
            'limpieza de habitaciones',
            'acondicionamiento de habitaciones',
          ]
        : [],
      crossSectorRelatedTerms: isHousekeeping
        ? ['limpieza', 'aseo', 'limpieza de cocina', 'salon', 'comedor', 'azafata', 'mozo', 'camarer']
        : [],
    };
  }

  // 5. Ferretería / Piñatería / Minimarket
  if (
    /\b(ferreteria|ferreterias|clavo|clavos|tornillo|tornillos|cemento|tubo|tubos|taladro|pintura|herramienta|herramientas|gasfiteria|construccion)\b/.test(
      q
    )
  ) {
    return {
      sectorKey: 'FERRETERIA',
      sectorLabel: SECTOR_LABELS.FERRETERIA,
      rubroBase: 'RESTAURANTE',
      explicit: true,
      isHospitalityHousekeeping: false,
      roleSynonyms: [],
      crossSectorRelatedTerms: [],
    };
  }

  if (/\b(pinateria|pinata|cotillon|globos|cumpleanos|fiesta|decoracion)\b/.test(q)) {
    return {
      sectorKey: 'PINATERIA',
      sectorLabel: SECTOR_LABELS.PINATERIA,
      rubroBase: 'RESTAURANTE',
      explicit: true,
      isHospitalityHousekeeping: false,
      roleSynonyms: [],
      crossSectorRelatedTerms: [],
    };
  }

  if (
    /\b(market|markets|minimarket|minimarkets|bodega|bodegas|supermercado|abarrotes|viveres|leche|atun|arroz|aceite|pan|agua|azucar|huevos|fideos)\b/.test(
      q
    )
  ) {
    return {
      sectorKey: 'MINIMARKET',
      sectorLabel: SECTOR_LABELS.MINIMARKET,
      rubroBase: 'RESTAURANTE',
      explicit: true,
      isHospitalityHousekeeping: false,
      roleSynonyms: [],
      crossSectorRelatedTerms: [],
    };
  }

  // 6. Restaurante / Gastronomía (incluye roles de restaurante: cocina, salón, comedor, azafata, mozo)
  if (RESTAURANT_CORE_RX.test(q) || forcedCategory === 'RESTAURANTE') {
    return {
      sectorKey: 'RESTAURANTE',
      sectorLabel: SECTOR_LABELS.RESTAURANTE,
      rubroBase: 'RESTAURANTE',
      explicit: true,
      isHospitalityHousekeeping: false,
      roleSynonyms: [],
      crossSectorRelatedTerms: [],
    };
  }

  // 7. Empleos / RRHH
  if (/\b(empleo|empleos|trabajo|vacante|vacantes|rrhh|talento|reclutamiento|postulacion)\b/.test(q)) {
    return {
      sectorKey: 'EMPLEOS',
      sectorLabel: SECTOR_LABELS.EMPLEOS,
      rubroBase: 'TURISMO',
      explicit: true,
      isHospitalityHousekeeping: false,
      roleSynonyms: [],
      crossSectorRelatedTerms: [],
    };
  }

  // 8. Turismo & Guías
  if (
    /(tour|tours|turismo|guia|machu|picchu|valle sagrado|maras|moray|excursion|sacsayhuaman|vinicunca)/.test(
      q
    ) ||
    forcedCategory === 'TURISMO'
  ) {
    return {
      sectorKey: 'TURISMO',
      sectorLabel: SECTOR_LABELS.TURISMO,
      rubroBase: 'TURISMO',
      explicit: true,
      isHospitalityHousekeeping: false,
      roleSynonyms: [],
      crossSectorRelatedTerms: [],
    };
  }

  // 9. Transporte por destino
  if (/(auto|carro|aeropuerto|terminal|estacion|poroy|viaje|ir al|ir a la|ir hasta)/.test(q)) {
    return {
      sectorKey: 'TRANSPORTE',
      sectorLabel: SECTOR_LABELS.TRANSPORTE,
      rubroBase: 'TRANSPORTE',
      explicit: false,
      isHospitalityHousekeeping: false,
      roleSynonyms: [],
      crossSectorRelatedTerms: [],
    };
  }

  return {
    sectorKey: 'RESTAURANTE',
    sectorLabel: SECTOR_LABELS.RESTAURANTE,
    rubroBase: 'RESTAURANTE',
    explicit: false,
    isHospitalityHousekeeping: false,
    roleSynonyms: [],
    crossSectorRelatedTerms: [],
  };
}

function parseJsonSafe(raw: string | null | undefined): Record<string, any> | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : null;
  } catch {
    return null;
  }
}

interface RecordSectorClassification {
  specified: boolean;
  sectorKey: SectorKey | null;
  sectorLabel: string;
}

function classifyRecordSector(params: {
  negocioRubro?: string | null;
  tipoNegocio?: string | null;
  negocioNombre?: string | null;
  negocioDescripcion?: string | null;
  panelIaJson?: string | null;
  itemAtributosJson?: string | null;
  itemNombre?: string | null;
  itemDescripcion?: string | null;
}): RecordSectorClassification {
  const panel = parseJsonSafe(params.panelIaJson);
  const attrs = parseJsonSafe(params.itemAtributosJson);
  const attrRubro = normalizeText(
    String(attrs?.rubro || attrs?.sector || attrs?.categoria_rubro || '')
  );
  const tipo = normalizeText(String(params.tipoNegocio || ''));
  const panelTitulo = normalizeText(
    String(panel?.rubro_titulo || panel?.rubro_usuario || '')
  );

  // Regla 4: detectar si el registro NO indica con claridad su rubro
  const explicitUnspecified =
    /(no especificado|sin especificar|rubro no especificado|indefinido|por definir|sin rubro)/.test(
      `${tipo} ${attrRubro}`
    ) || !params.negocioRubro;

  if (explicitUnspecified) {
    return { specified: false, sectorKey: null, sectorLabel: 'Rubro no especificado' };
  }

  const declaredMeta = `${attrRubro} ${tipo} ${panelTitulo}`.trim();
  const isGenericTipo =
    !declaredMeta ||
    /^(comercio multirubro|tienda multirubro|general|varios|multirubro|servicios varios)$/.test(
      declaredMeta
    );

  const bizText = normalizeText(`${params.negocioNombre || ''} ${params.negocioDescripcion || ''}`);
  const itemText = normalizeText(`${params.itemNombre || ''} ${params.itemDescripcion || ''}`);
  const probe = isGenericTipo ? `${bizText} ${itemText}` : `${declaredMeta} ${bizText}`;

  if (
    /(hotel|hostal|hospedaje|alojamiento|suite|suites|posada|lodge|housekeeping|ama de llaves|habitacion)/.test(
      probe
    )
  ) {
    return { specified: true, sectorKey: 'HOTELERIA', sectorLabel: SECTOR_LABELS.HOTELERIA };
  }
  if (/(ferreteria|clavos|tornillos|construccion|herramienta)/.test(probe)) {
    return { specified: true, sectorKey: 'FERRETERIA', sectorLabel: SECTOR_LABELS.FERRETERIA };
  }
  if (/(pinateria|cotillon|pinata|globos)/.test(probe)) {
    return { specified: true, sectorKey: 'PINATERIA', sectorLabel: SECTOR_LABELS.PINATERIA };
  }
  if (/(empleo|rrhh|talento|reclutamiento|vacante)/.test(probe)) {
    return { specified: true, sectorKey: 'EMPLEOS', sectorLabel: SECTOR_LABELS.EMPLEOS };
  }
  if (/(veterinaria|mascota|petshop)/.test(probe)) {
    return { specified: true, sectorKey: 'VETERINARIA', sectorLabel: SECTOR_LABELS.VETERINARIA };
  }
  if (/(minimarket|bodega|abarrotes|viveres)/.test(probe)) {
    return { specified: true, sectorKey: 'MINIMARKET', sectorLabel: SECTOR_LABELS.MINIMARKET };
  }
  if (
    /(restaurante|gastronomia|cocina|platos|gourmet|ceviche|trucha|lomo|brasa|comedor|azafata|mozo|mesero)/.test(
      probe
    )
  ) {
    return { specified: true, sectorKey: 'RESTAURANTE', sectorLabel: SECTOR_LABELS.RESTAURANTE };
  }
  if (/(farmacia|botica|farmaceutic|soroche|apotecaria)/.test(probe)) {
    return { specified: true, sectorKey: 'FARMACIA', sectorLabel: SECTOR_LABELS.FARMACIA };
  }
  if (/(taxi|movilidad|flota|sedanes|transporte)/.test(probe)) {
    return { specified: true, sectorKey: 'TRANSPORTE', sectorLabel: SECTOR_LABELS.TRANSPORTE };
  }
  if (/(casa de cambio|divisa|dolares|euros)/.test(probe)) {
    return { specified: true, sectorKey: 'CASA_CAMBIO', sectorLabel: SECTOR_LABELS.CASA_CAMBIO };
  }
  if (/(turismo|guia|machu|excursion)/.test(probe)) {
    return { specified: true, sectorKey: 'TURISMO', sectorLabel: SECTOR_LABELS.TURISMO };
  }

  // Si tipo_negocio era genérico ("Comercio Multirubro") y ni el nombre ni la descripción aclaran el sector
  if (isGenericTipo) {
    return { specified: false, sectorKey: null, sectorLabel: 'Rubro no especificado' };
  }

  const base = params.negocioRubro as Rubro;
  if (base === 'HOTEL') return { specified: true, sectorKey: 'HOTELERIA', sectorLabel: SECTOR_LABELS.HOTELERIA };
  if (base === 'FARMACIA') return { specified: true, sectorKey: 'FARMACIA', sectorLabel: SECTOR_LABELS.FARMACIA };
  if (base === 'TRANSPORTE') return { specified: true, sectorKey: 'TRANSPORTE', sectorLabel: SECTOR_LABELS.TRANSPORTE };
  if (base === 'CASA_CAMBIO') return { specified: true, sectorKey: 'CASA_CAMBIO', sectorLabel: SECTOR_LABELS.CASA_CAMBIO };
  if (base === 'TURISMO') return { specified: true, sectorKey: 'TURISMO', sectorLabel: SECTOR_LABELS.TURISMO };
  return { specified: true, sectorKey: 'RESTAURANTE', sectorLabel: SECTOR_LABELS.RESTAURANTE };
}

const RESTAURANT_ROLE_CONFLICT_RX =
  /\b(limpieza de cocina|cocina|salon|comedor|azafata|mozo|mesero|mesera|cocinero|chef|salonero|lavaplatos)\b/;

export function inferCategoryFromText(query: string): Rubro {
  return resolveRequestedSector(query).rubroBase;
}

const MAX_CUSCO_DESTINATION_KM = 150;

export async function runConciergeSearch(
  db: DatabaseSync,
  params: {
    query: string;
    categoria?: Rubro;
    lat?: number;
    lng?: number;
    destino?: string;
  }
) {
  const userLat = typeof params.lat === 'number' && !Number.isNaN(params.lat) ? params.lat : -13.5167;
  const userLng = typeof params.lng === 'number' && !Number.isNaN(params.lng) ? params.lng : -71.9788;

  const sectorIntent = resolveRequestedSector(params.query, params.categoria);
  let detectedCategory: Rubro = params.categoria || sectorIntent.rubroBase;
  if (sectorIntent.isHospitalityHousekeeping) {
    detectedCategory = 'HOTEL';
  }
  const normQuery = normalizeText(params.query);
  const openOnly = /\b(abierta|abierto|abiertas|abiertos|de turno|turno|24h|24 horas|ahora)\b/.test(
    normQuery
  );
  const normWords = normQuery.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  let searchKeywords = normWords.filter((w) => w.length >= 3 && !STOP_SEARCH_WORDS.has(w));
  const rawHadProductKeywords = searchKeywords.length > 0;
  const extractedDest = extractServerDestination(params.query, params.destino);
  let destinoExtraido = extractedDest.label;
  let aiUsed = false;
  let aiError: string | null = null;

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && params.query.trim().length > 0 && !params.categoria) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Consulta del usuario en Cusco, Perú: "${params.query}"`,
        config: {
          systemInstruction: [
            'Eres el agente de búsqueda de la plataforma multinegocios La Chuspa en Cusco, Perú.',
            'Tu tarea es buscar ofertas, productos o servicios respetando estrictamente la categoría o rubro del negocio para evitar confusiones entre sectores parecidos.',
            'Reglas estrictas de precisión por rubro:',
            '1) Prioriza siempre el rubro exacto solicitado (por ejemplo: si el usuario busca "housekeeping", "ama de llaves" o "camarería", usa HOTEL / Hotelería / Hospedaje / Alojamiento).',
            '2) Evita mezclar rubros distintos cuando el término pertenece a un sector específico: "Housekeeping" pertenece a Hotelería/Hospedaje (limpieza y acondicionamiento de habitaciones, camarería, ama de llaves). NO lo confundas con puestos de Restaurante (limpieza de cocina, salón, comedor, azafata o mozo).',
            '3) Clasifica la intención en exactamente una categoría (TRANSPORTE, TURISMO, HOTEL, RESTAURANTE, FARMACIA, CASA_CAMBIO).',
            '4) Si el usuario solo pide un tipo de negocio (ej. "farmacias", "quiero una farmacia abierta", "restaurantes", "hoteles") sin nombrar un producto/rol concreto, devuelve "palabras_clave": [].',
            '5) NO inventes ni menciones nombres de marcas o negocios externos; solo extrae palabras clave del rol/producto/servicio y el destino si pide traslado.',
          ].join(' '),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              categoria: { type: Type.STRING },
              palabras_clave: { type: Type.ARRAY, items: { type: Type.STRING } },
              destino: { type: Type.STRING },
              respuesta_breve: { type: Type.STRING },
            },
            required: ['categoria', 'palabras_clave', 'respuesta_breve'],
          },
        },
      });
      const parsed = JSON.parse((response.text || '{}').trim()) as {
        categoria?: string;
        palabras_clave?: string[];
        destino?: string;
        respuesta_breve?: string;
      };
      if (parsed.categoria && RUBROS.includes(parsed.categoria as Rubro)) {
        // Guardrail: respetar sector/categoría explícita de la orden del usuario
        detectedCategory = sectorIntent.explicit ? sectorIntent.rubroBase : (parsed.categoria as Rubro);
      }
      if (rawHadProductKeywords && Array.isArray(parsed.palabras_clave) && parsed.palabras_clave.length > 0) {
        const aiKeys = parsed.palabras_clave
          .map(normalizeText)
          .filter((w) => w.length >= 2 && !STOP_SEARCH_WORDS.has(w));
        if (aiKeys.length > 0) {
          searchKeywords = Array.from(new Set([...searchKeywords, ...aiKeys]));
        }
      }
      if (parsed.destino && !destinoExtraido) {
        destinoExtraido = parsed.destino;
      }
      aiUsed = true;
    } catch (err) {
      aiError = err instanceof Error ? err.message : 'Error consultando el asistente';
    }
  }

  // Si es TRANSPORTE: buscar SOLO unidades de conductores activas y certificadas con distancia Haversine
  if (detectedCategory === 'TRANSPORTE') {
    const destResolved = extractServerDestination(params.query, destinoExtraido);
    const tripKmEstimate =
      destResolved.lat !== null && destResolved.lng !== null
        ? Math.min(
            MAX_CUSCO_DESTINATION_KM,
            Math.max(1.5, haversineKm(userLat, userLng, destResolved.lat, destResolved.lng))
          )
        : destinoExtraido
          ? Math.max(2.4, Math.min(18, 2.5 + (destinoExtraido.length % 7) * 0.9))
          : 3.2;

    const units = db
      .prepare(`
        SELECT u.*, n.nombre AS negocio_nombre, n.zona, n.saldo, n.saldo_retenido, n.activo, n.en_linea
        FROM unidades_conductores u
        JOIN negocios n ON n.id = u.negocio_id
        WHERE n.rubro = 'TRANSPORTE' AND n.activo = 1 AND n.en_linea = 1 AND u.estado = 'DISPONIBLE'
      `)
      .all() as Array<{
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
      certificada: number;
      zona: string;
    }>;

    const opciones = units
      .map((u) => {
        const distConductorKm = haversineKm(userLat, userLng, u.lat, u.lng);
        const etaMin = Math.max(2, Math.round(distConductorKm * 3.8 + 2));
        const precioCentavos = calculateTaxiFareServer(
          u.tarifa_base_centavos,
          u.tarifa_km_centavos,
          tripKmEstimate
        );
        return {
          tipo: 'TAXI' as const,
          unidad_id: u.id,
          negocio_id: u.negocio_id,
          negocio_nombre: u.negocio_nombre,
          categoria: 'TRANSPORTE' as const,
          titulo: `${u.modelo} · ${u.conductor_nombre}`,
          descripcion: `Placa ${u.placa} · ${u.color} · ${u.certificada ? 'Unidad certificada' : 'En revisión'}`,
          zona: u.zona,
          lat: u.lat,
          lng: u.lng,
          abierto_ahora: true,
          horario: 'Disponible ahora',
          placa: u.placa,
          modelo: u.modelo,
          conductor_nombre: u.conductor_nombre,
          calificacion: u.calificacion,
          certificada: u.certificada === 1,
          distancia_km: distConductorKm,
          eta_min: etaMin,
          precio_centavos: precioCentavos,
          disponible: true,
          rubro_estado: 'EXACTO' as const,
          rubro_etiqueta: SECTOR_LABELS.TRANSPORTE,
          sector_clave: 'TRANSPORTE',
        };
      })
      .sort((a, b) => a.distancia_km - b.distancia_km || a.precio_centavos - b.precio_centavos);

    const minPrice = opciones.length > 0 ? Math.min(...opciones.map((o) => o.precio_centavos)) : 0;
    const enriched = opciones.map((o) => ({
      ...o,
      mejor_precio: o.precio_centavos === minPrice,
    }));

    return {
      categoria: 'TRANSPORTE' as const,
      rubro_solicitado: SECTOR_LABELS.TRANSPORTE,
      sector_clave: 'TRANSPORTE' as const,
      sin_resultados_exactos: enriched.length === 0,
      destino_sugerido: destinoExtraido || undefined,
      distancia_estimada_km: Number(tripKmEstimate.toFixed(2)),
      respuesta_voz:
        enriched.length > 0
          ? `Encontramos ${enriched.length} unidades de taxi disponibles cerca de tu ubicación${
              destinoExtraido ? ` rumbo a ${destinoExtraido}` : ''
            } desde S/ ${(minPrice / 100).toFixed(2)}.`
          : `No hay unidades de taxi disponibles en este momento.`,
      ai_used: aiUsed,
      ai_error: aiError,
      opciones: enriched,
      registros_rubro_no_especificado: [],
      alternativas_otros_rubros: [],
    };
  }

  // Si es CASA_CAMBIO: mostrar SOLO tasas de cambio activas
  if (detectedCategory === 'CASA_CAMBIO') {
    const rates = db
      .prepare(`
        SELECT a.*, n.nombre AS negocio_nombre, n.zona, n.calificacion, n.lat, n.lng,
               n.horario_apertura, n.horario_cierre, n.abierto_24h, n.en_linea
        FROM agentes_cambio a
        JOIN negocios n ON n.id = a.negocio_id
        WHERE n.rubro = 'CASA_CAMBIO' AND n.activo = 1 AND n.en_linea = 1 AND a.disponible = 1
        ORDER BY a.tasa_compra DESC
      `)
      .all() as Array<{
      id: number;
      negocio_id: number;
      negocio_nombre: string;
      moneda_origen: string;
      moneda_destino: string;
      tasa_compra: number;
      tasa_venta: number;
      zona: string;
      calificacion: number;
      lat: number;
      lng: number;
      horario_apertura?: string;
      horario_cierre?: string;
      abierto_24h?: number;
      en_linea?: number;
    }>;

    const filteredRates = openOnly ? rates.filter((r) => isBusinessOpenNow(r)) : rates;

    return {
      categoria: 'CASA_CAMBIO' as const,
      rubro_solicitado: SECTOR_LABELS.CASA_CAMBIO,
      sector_clave: 'CASA_CAMBIO' as const,
      sin_resultados_exactos: filteredRates.length === 0,
      respuesta_voz:
        filteredRates.length > 0
          ? `Tenemos ${filteredRates.length} cotizaciones verificadas en casas de cambio autorizadas de Cusco.`
          : `No hay casas de cambio disponibles en este horario.`,
      ai_used: aiUsed,
      ai_error: aiError,
      opciones: filteredRates.map((r, idx) => ({
        tipo: 'DIVISA' as const,
        negocio_id: r.negocio_id,
        negocio_nombre: r.negocio_nombre,
        categoria: 'CASA_CAMBIO' as const,
        titulo: `${r.moneda_origen} / ${r.moneda_destino} · Compra ${r.tasa_compra.toFixed(3)} · Venta ${r.tasa_venta.toFixed(3)}`,
        descripcion: `${r.zona} · Reserva de tasa con código de retiro`,
        zona: r.zona,
        lat: r.lat,
        lng: r.lng,
        abierto_ahora: isBusinessOpenNow(r),
        horario: r.abierto_24h ? '24 horas' : `${r.horario_apertura || '07:00'} - ${r.horario_cierre || '22:30'}`,
        calificacion: r.calificacion,
        eta_min: 10,
        precio_centavos: Math.round(r.tasa_compra * 100),
        tasa_compra: r.tasa_compra,
        tasa_venta: r.tasa_venta,
        moneda_origen: r.moneda_origen,
        mejor_precio: idx === 0,
        disponible: true,
        rubro_estado: 'EXACTO' as const,
        rubro_etiqueta: SECTOR_LABELS.CASA_CAMBIO,
        sector_clave: 'CASA_CAMBIO',
      })),
      registros_rubro_no_especificado: [],
      alternativas_otros_rubros: [],
    };
  }

  const targetSectorKey: SectorKey =
    params.categoria && !sectorIntent.explicit
      ? params.categoria === 'HOTEL'
        ? 'HOTELERIA'
        : params.categoria === 'FARMACIA'
        ? 'FARMACIA'
        : params.categoria === 'TURISMO'
        ? 'TURISMO'
        : 'RESTAURANTE'
      : sectorIntent.sectorKey;
  const targetSectorLabel = SECTOR_LABELS[targetSectorKey];

  // Resto de categorías:
  // Regla: si el usuario pidió solo el negocio/categoría ("farmacias", "quiero una farmacia abierta", "restaurantes", "hoteles")
  // SIN pedir un producto/rol concreto -> devolver SOLO los negocios registrados del rubro exacto.
  if (searchKeywords.length === 0) {
    const bizRows = db
      .prepare(`
        SELECT n.*,
          (SELECT COUNT(*) FROM servicios_catalogo s
           WHERE s.negocio_id = n.id AND s.disponible = 1 AND s.stock > 0) AS total_productos
        FROM negocios n
        WHERE n.activo = 1 AND n.en_linea = 1
        ORDER BY n.calificacion DESC
      `)
      .all() as Array<{
      id: number;
      rubro: Rubro;
      nombre: string;
      descripcion: string;
      zona: string;
      lat: number;
      lng: number;
      calificacion: number;
      horario_apertura?: string;
      horario_cierre?: string;
      abierto_24h?: number;
      en_linea?: number;
      tipo_negocio?: string;
      panel_ia_json?: string | null;
      total_productos?: number;
    }>;

    const classifiedBiz = bizRows.map((n) => {
      const cls = classifyRecordSector({
        negocioRubro: n.rubro,
        tipoNegocio: n.tipo_negocio,
        negocioNombre: n.nombre,
        negocioDescripcion: n.descripcion,
        panelIaJson: n.panel_ia_json,
      });
      return {
        ...n,
        cls,
        abiertoAhora: isBusinessOpenNow(n),
        distanciaKm: haversineKm(userLat, userLng, n.lat, n.lng),
      };
    });

    const exactBiz = classifiedBiz
      .filter((n) => n.cls.specified && n.rubro === detectedCategory && n.cls.sectorKey === targetSectorKey)
      .filter((n) => !openOnly || n.abiertoAhora)
      .sort((a, b) => {
        if (a.abiertoAhora !== b.abiertoAhora) return a.abiertoAhora ? -1 : 1;
        return a.distanciaKm - b.distanciaKm || b.calificacion - a.calificacion;
      });

    const unspecifiedBiz = classifiedBiz
      .filter((n) => !n.cls.specified)
      .filter((n) => !openOnly || n.abiertoAhora);

    const categoryNoun =
      targetSectorKey === 'FARMACIA'
        ? 'farmacias'
        : targetSectorKey === 'RESTAURANTE'
        ? 'restaurantes'
        : targetSectorKey === 'HOTELERIA'
        ? 'hoteles / hospedajes'
        : targetSectorKey === 'TURISMO'
        ? 'agencias de turismo'
        : targetSectorKey === 'FERRETERIA'
        ? 'ferreterías'
        : targetSectorKey === 'EMPLEOS'
        ? 'agencias de empleo'
        : 'negocios';

    const namesPreview = exactBiz
      .slice(0, 3)
      .map((b) => b.nombre)
      .join(', ');

    return {
      categoria: detectedCategory,
      rubro_solicitado: targetSectorLabel,
      sector_clave: targetSectorKey,
      sin_resultados_exactos: exactBiz.length === 0,
      modo_resultado: 'NEGOCIOS' as const,
      respuesta_voz:
        exactBiz.length > 0
          ? `Encontramos ${exactBiz.length} ${categoryNoun} ${
              openOnly ? 'abiertas ahora ' : 'disponibles '
            }en Cusco (${targetSectorLabel}): ${namesPreview}. Selecciona una para ver sus productos.`
          : `No encontramos ${categoryNoun} exactos ${openOnly ? 'abiertas en este horario' : 'disponibles'} en el rubro ${targetSectorLabel}.`,
      ai_used: aiUsed,
      ai_error: aiError,
      opciones: exactBiz.map((n, idx) => ({
        tipo: 'CATALOGO' as const,
        es_negocio: true,
        total_productos: Number(n.total_productos || 0),
        negocio_id: n.id,
        negocio_nombre: n.nombre,
        categoria: n.rubro,
        titulo: n.nombre,
        descripcion: n.descripcion,
        zona: n.zona,
        lat: n.lat,
        lng: n.lng,
        abierto_ahora: n.abiertoAhora,
        horario: n.abierto_24h
          ? '24 horas'
          : `${n.horario_apertura || '07:00'} - ${n.horario_cierre || '22:30'}`,
        calificacion: n.calificacion,
        distancia_km: n.distanciaKm,
        eta_min: 15,
        precio_centavos: 0,
        mejor_precio: idx === 0,
        disponible: true,
        rubro_estado: 'EXACTO' as const,
        rubro_etiqueta: n.cls.sectorLabel,
        sector_clave: n.cls.sectorKey || targetSectorKey,
      })),
      registros_rubro_no_especificado: unspecifiedBiz.map((n) => ({
        tipo: 'CATALOGO' as const,
        es_negocio: true,
        total_productos: Number(n.total_productos || 0),
        negocio_id: n.id,
        negocio_nombre: n.nombre,
        categoria: n.rubro,
        titulo: n.nombre,
        descripcion: n.descripcion,
        zona: n.zona,
        lat: n.lat,
        lng: n.lng,
        abierto_ahora: n.abiertoAhora,
        horario: n.abierto_24h
          ? '24 horas'
          : `${n.horario_apertura || '07:00'} - ${n.horario_cierre || '22:30'}`,
        calificacion: n.calificacion,
        distancia_km: n.distanciaKm,
        eta_min: 15,
        precio_centavos: 0,
        mejor_precio: false,
        disponible: true,
        rubro_estado: 'NO_ESPECIFICADO' as const,
        rubro_etiqueta: 'Rubro no especificado',
        nota_rubro: 'Registro sin rubro claramente especificado; no se presenta como coincidencia exacta.',
      })),
      alternativas_otros_rubros: [],
    };
  }

  // Búsqueda estricta por rol, término o atributo:
  // Regla 3: Filtrar PRIMERO por el rubro correspondiente, LUEGO por el rol, término o atributo.
  const allRows = db
    .prepare(`
      SELECT s.*, n.rubro AS negocio_rubro, n.nombre AS negocio_nombre, n.descripcion AS negocio_descripcion,
             n.zona, n.calificacion, n.lat, n.lng, n.horario_apertura, n.horario_cierre, n.abierto_24h,
             n.en_linea, n.tipo_negocio, n.panel_ia_json
      FROM servicios_catalogo s
      JOIN negocios n ON n.id = s.negocio_id
      WHERE n.activo = 1 AND n.en_linea = 1 AND s.disponible = 1 AND s.stock > 0
      ORDER BY s.precio_centavos ASC
    `)
    .all() as Array<{
    id: number;
    negocio_id: number;
    categoria: Rubro;
    negocio_rubro: Rubro;
    nombre: string;
    descripcion: string;
    atributos_json?: string | null;
    unidad_medida?: string;
    precio_centavos: number;
    duracion_min: number;
    stock: number;
    negocio_nombre: string;
    negocio_descripcion: string;
    zona: string;
    calificacion: number;
    lat: number;
    lng: number;
    horario_apertura?: string;
    horario_cierre?: string;
    abierto_24h?: number;
    en_linea?: number;
    tipo_negocio?: string;
    panel_ia_json?: string | null;
  }>;

  const classifiedRows = allRows.map((r) => {
    const cls = classifyRecordSector({
      negocioRubro: r.negocio_rubro,
      tipoNegocio: r.tipo_negocio,
      negocioNombre: r.negocio_nombre,
      negocioDescripcion: r.negocio_descripcion,
      panelIaJson: r.panel_ia_json,
      itemAtributosJson: r.atributos_json,
      itemNombre: r.nombre,
      itemDescripcion: r.descripcion,
    });
    const hay = normalizeText(
      `${r.nombre} ${r.descripcion} ${r.atributos_json || ''} ${r.negocio_nombre} ${r.tipo_negocio || ''}`
    );
    return {
      ...r,
      cls,
      hay,
      abiertoAhora: isBusinessOpenNow(r),
      distanciaKm: haversineKm(userLat, userLng, r.lat, r.lng),
    };
  });

  const openScopedAll = openOnly ? classifiedRows.filter((r) => r.abiertoAhora) : classifiedRows;

  // Paso 1: Separar estrictamente por rubro exacto vs rubro no especificado vs otros rubros
  const exactSectorBucket = openScopedAll.filter((r) => {
    if (!r.cls.specified) return false;
    if (r.cls.sectorKey !== targetSectorKey) return false;
    // Regla 2: si busca housekeeping en Hotelería, excluir cualquier rol exclusivo de restaurante (cocina/salón/comedor/azafata/mozo)
    if (
      sectorIntent.isHospitalityHousekeeping &&
      RESTAURANT_ROLE_CONFLICT_RX.test(r.hay) &&
      !HOUSEKEEPING_HOTEL_RX.test(r.hay)
    ) {
      return false;
    }
    return true;
  });

  const termPool = Array.from(new Set([...searchKeywords, ...sectorIntent.roleSynonyms]));

  // Paso 2: Dentro del rubro exacto, filtrar por rol / término / atributo (SIN rellenar con ítems no coincidentes)
  const exactMatched = exactSectorBucket
    .filter((r) => termPool.some((kw) => r.hay.includes(kw)))
    .sort((a, b) => {
      if (a.abiertoAhora !== b.abiertoAhora) return a.abiertoAhora ? -1 : 1;
      return a.precio_centavos - b.precio_centavos;
    });

  // Regla 4: Registros con rubro no especificado que coinciden con la búsqueda (NUNCA van en opciones exactas)
  const unspecifiedMatched = openScopedAll
    .filter((r) => !r.cls.specified)
    .filter((r) => termPool.some((kw) => r.hay.includes(kw)))
    .sort((a, b) => a.precio_centavos - b.precio_centavos);

  // Regla 5: Si NO hay resultados exactos en el rubro pedido, ofrecer aparte resultados de otros rubros
  let otherRubroAlternatives: typeof openScopedAll = [];
  if (exactMatched.length === 0) {
    const otherBucket = openScopedAll.filter(
      (r) => r.cls.specified && r.cls.sectorKey !== targetSectorKey
    );
    const directOther = otherBucket.filter((r) => searchKeywords.some((kw) => r.hay.includes(kw)));
    if (directOther.length > 0) {
      otherRubroAlternatives = directOther;
    } else if (sectorIntent.crossSectorRelatedTerms.length > 0) {
      otherRubroAlternatives = otherBucket.filter((r) =>
        sectorIntent.crossSectorRelatedTerms.some((kw) => r.hay.includes(kw))
      );
    }
    otherRubroAlternatives.sort((a, b) => {
      if (a.abiertoAhora !== b.abiertoAhora) return a.abiertoAhora ? -1 : 1;
      return a.precio_centavos - b.precio_centavos;
    });
  }

  const minExactPrice =
    exactMatched.length > 0 ? Math.min(...exactMatched.map((r) => r.precio_centavos)) : 0;

  const mapItemToOption = (
    r: (typeof openScopedAll)[number],
    rubroEstado: 'EXACTO' | 'NO_ESPECIFICADO' | 'OTRO_RUBRO',
    isBestExact: boolean
  ) => ({
    tipo: 'CATALOGO' as const,
    es_negocio: false,
    servicio_id: r.id,
    negocio_id: r.negocio_id,
    negocio_nombre: r.negocio_nombre,
    categoria: r.categoria,
    titulo: r.nombre,
    descripcion: r.descripcion,
    zona: r.zona,
    lat: r.lat,
    lng: r.lng,
    abierto_ahora: r.abiertoAhora,
    horario: r.abierto_24h ? '24 horas' : `${r.horario_apertura || '07:00'} - ${r.horario_cierre || '22:30'}`,
    calificacion: r.calificacion,
    distancia_km: r.distanciaKm,
    eta_min: r.duracion_min,
    stock: r.stock,
    unidad_medida: r.unidad_medida,
    precio_centavos: r.precio_centavos,
    mejor_precio: isBestExact,
    disponible: true,
    rubro_estado: rubroEstado,
    rubro_etiqueta:
      rubroEstado === 'NO_ESPECIFICADO' ? 'Rubro no especificado' : r.cls.sectorLabel,
    sector_clave: r.cls.sectorKey || undefined,
    nota_rubro:
      rubroEstado === 'NO_ESPECIFICADO'
        ? 'Registro con rubro no especificado; no se presenta como coincidencia exacta.'
        : rubroEstado === 'OTRO_RUBRO'
        ? `Alternativa aparte en ${r.cls.sectorLabel} (no pertenece a ${targetSectorLabel}).`
        : undefined,
  });

  const otherRubroNames = Array.from(
    new Set(otherRubroAlternatives.map((r) => r.cls.sectorLabel))
  ).join(', ');

  let respuestaVoz = '';
  if (exactMatched.length > 0) {
    respuestaVoz = `Encontramos ${exactMatched.length} coincidencia(s) exacta(s) en ${targetSectorLabel}${
      openOnly ? ' (abiertas ahora)' : ''
    }: ${exactMatched[0].negocio_nombre} desde S/ ${(minExactPrice / 100).toFixed(2)}.`;
  } else {
    const parts: string[] = [
      `No encontramos resultados exactos para "${params.query.trim()}" en el rubro ${targetSectorLabel}${
        openOnly ? ' abierto en este horario' : ''
      }.`,
    ];
    if (unspecifiedMatched.length > 0) {
      parts.push(
        `Hay ${unspecifiedMatched.length} registro(s) con rubro no especificado (no presentados como coincidencia exacta).`
      );
    }
    if (otherRubroAlternatives.length > 0) {
      parts.push(
        `Por separado, mostramos ${otherRubroAlternatives.length} alternativa(s) en otros rubros (${otherRubroNames}), nunca mezcladas con ${targetSectorLabel}.`
      );
    }
    respuestaVoz = parts.join(' ');
  }

  return {
    categoria: detectedCategory,
    rubro_solicitado: targetSectorLabel,
    sector_clave: targetSectorKey,
    sin_resultados_exactos: exactMatched.length === 0,
    modo_resultado: 'PRODUCTOS' as const,
    respuesta_voz: respuestaVoz,
    ai_used: aiUsed,
    ai_error: aiError,
    opciones: exactMatched.map((r) =>
      mapItemToOption(r, 'EXACTO', r.precio_centavos === minExactPrice)
    ),
    registros_rubro_no_especificado: unspecifiedMatched.map((r) =>
      mapItemToOption(r, 'NO_ESPECIFICADO', false)
    ),
    alternativas_otros_rubros: otherRubroAlternatives.map((r) =>
      mapItemToOption(r, 'OTRO_RUBRO', false)
    ),
  };
}

export async function generateAiBusinessPanelConfig(params: {
  rubro_usuario: string;
  nombre?: string;
  descripcion?: string;
  zona?: string;
}): Promise<AiBusinessPanelSchema> {
  const rubroUsuario = params.rubro_usuario.trim().slice(0, 120);
  if (rubroUsuario.length < 2) {
    throw new HttpError(400, 'Describe el rubro o tipo de negocio (mínimo 2 caracteres).');
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new HttpError(
      503,
      'El servicio Gemini AI no está configurado en el servidor (GEMINI_API_KEY requerida).'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const promptContext = [
    `Rubro / industria solicitada por el dueño: "${rubroUsuario}"`,
    params.nombre ? `Nombre comercial: "${params.nombre.trim()}"` : '',
    params.descripcion ? `Detalle adicional: "${params.descripcion.trim()}"` : '',
    params.zona ? `Ciudad / Zona: "${params.zona.trim()}"` : 'Ciudad: Cusco, Perú',
  ]
    .filter(Boolean)
    .join('\n');

  let rawText = '';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: promptContext,
      config: {
        systemInstruction: [
          'Eres el Arquitecto Multi-Rubro de La Chuspa.',
          'Diseña la configuración completa y realista de un Panel de Control Empresarial en español para CUALQUIER rubro o negocio del mundo (ferretería, hotel, bolsa de empleos, restaurante, piñatería, veterinaria, taller mecánico, librería, spa, farmacia, minimarket, etc.).',
          'Reglas obligatorias:',
          '1) "rubro_base" debe ser EXACTAMENTE uno de: TRANSPORTE, TURISMO, HOTEL, RESTAURANTE, FARMACIA, CASA_CAMBIO (usa TRANSPORTE solo si es movilidad/taxis; HOTEL para hospedajes; FARMACIA para boticas/clínicas; TURISMO para viajes/eventos; CASA_CAMBIO para finanzas; RESTAURANTE para comercios generales, tiendas, ferreterías, empleos, piñaterías, etc.).',
          '2) "unidades_medida": incluye entre 8 y 16 unidades REALES y específicas del rubro. Por ejemplo, si es Ferretería DEBES incluir unidades como: Unidad, Kilo (kg), Gramo (g), Litro (L), Metro (m), Pulgada (in), Pie (ft), Grosor (mm), Metro cúbico (m³), Cubo, Amperio (A), Grano, Caja, Rollo, Saco. Si es Hotel: Noche, Hora, Persona, Suite, Día, Paquete. Si es Empleos: Vacante, Hora, Jornada, Mes, Proyecto. Si es Piñatería: Unidad, Docena, Paquete, Metro, Combo, Ciento.',
          '3) "campos_especificos": entre 4 y 6 campos técnicos del producto/servicio que aparecerán en el formulario de catálogo del dueño (key en snake_case, label en español, tipo "text"|"number"|"select", placeholder, unidad opcional, opciones si tipo==="select").',
          '4) "modulos_panel": entre 2 y 4 módulos operativos. "tipo_herramienta" debe ser uno de: CALCULADORA_MEDIDAS, COTIZADOR_VOLUMEN, CHECKIN_CUPO, POSTULACIONES, COMANDA_COCINA, RECETARIO_STOCK, INFO.',
          '5) "catalogo_inicial": entre 4 y 6 productos/servicios reales del rubro con precio_centavos (entero en céntimos de Sol, ej. 1550 = S/ 15.50), unidad_medida elegida de tu lista, stock (entero >= 1), y atributos como lista de pares { clave, valor }.',
          '6) "tema_color": colores hex elegantes con buen contraste para primaryHex y accentHex.',
        ].join('\n'),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rubro_base: { type: Type.STRING },
            rubro_titulo: { type: Type.STRING },
            subtitulo_panel: { type: Type.STRING },
            badge_panel: { type: Type.STRING },
            tema_color: {
              type: Type.OBJECT,
              properties: {
                primaryHex: { type: Type.STRING },
                accentHex: { type: Type.STRING },
              },
              required: ['primaryHex', 'accentHex'],
            },
            terminologia: {
              type: Type.OBJECT,
              properties: {
                clienteLabel: { type: Type.STRING },
                pedidoLabel: { type: Type.STRING },
                catalogoLabel: { type: Type.STRING },
                nuevoItemBtn: { type: Type.STRING },
              },
              required: ['clienteLabel', 'pedidoLabel', 'catalogoLabel', 'nuevoItemBtn'],
            },
            unidades_medida: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            campos_especificos: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  key: { type: Type.STRING },
                  label: { type: Type.STRING },
                  tipo: { type: Type.STRING },
                  placeholder: { type: Type.STRING },
                  unidad: { type: Type.STRING },
                  opciones: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['key', 'label', 'tipo', 'placeholder'],
              },
            },
            modulos_panel: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  titulo: { type: Type.STRING },
                  descripcion: { type: Type.STRING },
                  tipo_herramienta: { type: Type.STRING },
                },
                required: ['id', 'titulo', 'descripcion', 'tipo_herramienta'],
              },
            },
            catalogo_inicial: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  nombre: { type: Type.STRING },
                  descripcion: { type: Type.STRING },
                  precio_centavos: { type: Type.INTEGER },
                  unidad_medida: { type: Type.STRING },
                  stock: { type: Type.INTEGER },
                  duracion_min: { type: Type.INTEGER },
                  atributos: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        clave: { type: Type.STRING },
                        valor: { type: Type.STRING },
                      },
                      required: ['clave', 'valor'],
                    },
                  },
                },
                required: ['nombre', 'descripcion', 'precio_centavos', 'unidad_medida', 'stock'],
              },
            },
          },
          required: [
            'rubro_base',
            'rubro_titulo',
            'subtitulo_panel',
            'badge_panel',
            'tema_color',
            'terminologia',
            'unidades_medida',
            'campos_especificos',
            'modulos_panel',
            'catalogo_inicial',
          ],
        },
      },
    });
    rawText = (response.text || '').trim();
  } catch (err) {
    throw new HttpError(
      502,
      `No se pudo generar el panel con Gemini AI: ${err instanceof Error ? err.message : 'error de red'}`
    );
  }

  let parsed: Record<string, any> = {};
  try {
    parsed = JSON.parse(rawText || '{}') as Record<string, any>;
  } catch {
    throw new HttpError(502, 'La respuesta de Gemini AI no tuvo formato JSON válido.');
  }

  const validBase: Rubro = RUBROS.includes(parsed.rubro_base as Rubro)
    ? (parsed.rubro_base as Rubro)
    : inferCategoryFromText(rubroUsuario);

  const allowedTools = new Set([
    'CALCULADORA_MEDIDAS',
    'COTIZADOR_VOLUMEN',
    'CHECKIN_CUPO',
    'POSTULACIONES',
    'COMANDA_COCINA',
    'RECETARIO_STOCK',
    'INFO',
  ]);

  const unidades = Array.isArray(parsed.unidades_medida)
    ? parsed.unidades_medida
        .map((u) => String(u || '').trim())
        .filter(Boolean)
        .slice(0, 20)
    : ['Unidad', 'Servicio'];

  const campos = Array.isArray(parsed.campos_especificos)
    ? parsed.campos_especificos.slice(0, 8).map((c: any, idx: number) => ({
        key:
          String(c?.key || `campo_${idx + 1}`)
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .slice(0, 40) || `campo_${idx + 1}`,
        label: String(c?.label || `Especificación ${idx + 1}`).slice(0, 60),
        tipo: (c?.tipo === 'number' || c?.tipo === 'select' ? c.tipo : 'text') as
          | 'text'
          | 'number'
          | 'select',
        placeholder: String(c?.placeholder || '').slice(0, 80),
        ...(c?.unidad ? { unidad: String(c.unidad).slice(0, 24) } : {}),
        ...(Array.isArray(c?.opciones) && c.opciones.length > 0
          ? { opciones: c.opciones.map((o: unknown) => String(o)).slice(0, 12) }
          : {}),
      }))
    : [];

  const modulos = Array.isArray(parsed.modulos_panel)
    ? parsed.modulos_panel.slice(0, 6).map((m: any, idx: number) => ({
        id: String(m?.id || `mod_${idx + 1}`).slice(0, 40),
        titulo: String(m?.titulo || 'Módulo Operativo').slice(0, 70),
        descripcion: String(m?.descripcion || '').slice(0, 180),
        tipo_herramienta: (allowedTools.has(String(m?.tipo_herramienta))
          ? String(m.tipo_herramienta)
          : 'INFO') as AiBusinessPanelSchema['modulos_panel'][number]['tipo_herramienta'],
      }))
    : [];

  const catalogo = Array.isArray(parsed.catalogo_inicial)
    ? parsed.catalogo_inicial.slice(0, 10).map((item: any) => {
        const attrObj: Record<string, string> = {};
        if (Array.isArray(item?.atributos)) {
          for (const pair of item.atributos) {
            const k = String(pair?.clave || '').trim();
            const v = String(pair?.valor || '').trim();
            if (k && v) attrObj[k.slice(0, 40)] = v.slice(0, 80);
          }
        }
        return {
          nombre: String(item?.nombre || 'Producto').slice(0, 100),
          descripcion: String(item?.descripcion || '').slice(0, 220),
          precio_centavos: Math.max(100, Math.round(Number(item?.precio_centavos) || 1500)),
          unidad_medida: String(item?.unidad_medida || unidades[0] || 'Unidad').slice(0, 48),
          stock: Math.max(1, Math.round(Number(item?.stock) || 20)),
          duracion_min: Math.max(5, Math.round(Number(item?.duracion_min) || 30)),
          ...(Object.keys(attrObj).length > 0 ? { atributos: attrObj } : {}),
        };
      })
    : [];

  const hexRegex = /^#[0-9A-Fa-f]{6}$/;
  const primaryHex = hexRegex.test(String(parsed.tema_color?.primaryHex || ''))
    ? String(parsed.tema_color.primaryHex)
    : '#2563EB';
  const accentHex = hexRegex.test(String(parsed.tema_color?.accentHex || ''))
    ? String(parsed.tema_color.accentHex)
    : '#D4AF37';

  return {
    rubro_base: validBase,
    rubro_usuario: rubroUsuario,
    rubro_titulo: String(parsed.rubro_titulo || rubroUsuario).slice(0, 90),
    subtitulo_panel: String(
      parsed.subtitulo_panel || `Gestión especializada para ${rubroUsuario}`
    ).slice(0, 180),
    badge_panel: String(parsed.badge_panel || `Panel IA · ${rubroUsuario}`).slice(0, 70),
    tema_color: { primaryHex, accentHex },
    terminologia: {
      clienteLabel: String(parsed.terminologia?.clienteLabel || 'Cliente').slice(0, 40),
      pedidoLabel: String(parsed.terminologia?.pedidoLabel || 'Pedido').slice(0, 40),
      catalogoLabel: String(parsed.terminologia?.catalogoLabel || 'Catálogo').slice(0, 40),
      nuevoItemBtn: String(parsed.terminologia?.nuevoItemBtn || 'Agregar Ítem').slice(0, 50),
    },
    unidades_medida: unidades.length > 0 ? unidades : ['Unidad', 'Servicio'],
    campos_especificos: campos,
    modulos_panel: modulos,
    catalogo_inicial: catalogo,
    generado_por: 'gemini',
    updated_at: new Date().toISOString(),
  };
}

