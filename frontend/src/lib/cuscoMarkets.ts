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
    .replace(/[\u0300-\u036f]/g, '');
}

export function detectIntentFromQuery(query: string): 'TAXI' | 'MARKET' | 'DIVISAS' | 'OTHER' {
  const q = normalizeText(query);
  if (
    /\b(taxi|movilidad|auto|carro|uber|indriver|indrive|viaje|aeropuerto|traslado|terminal)\b/.test(q)
  ) {
    return 'TAXI';
  }
  if (
    /\b(cambio|dolar|dolares|usd|eur|euro|euros|divisa|divisas|soles)\b/.test(q)
  ) {
    return 'DIVISAS';
  }
  if (
    /\b(market|minimarket|bodega|tienda|supermercado|comprar|leche|atun|arroz|aceite|pan|agua|azucar|huevos|fideos|cafe)\b/.test(
      q
    )
  ) {
    return 'MARKET';
  }
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
