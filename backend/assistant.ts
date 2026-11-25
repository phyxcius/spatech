import { GoogleGenAI, Type } from '@google/genai';
import type { DatabaseSync } from 'node:sqlite';
import { RUBROS, type Rubro } from './types.ts';

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

export function inferCategoryFromText(query: string): Rubro {
  const q = normalizeText(query);
  if (/(taxi|uber|indrive|auto|movilidad|aeropuerto|traslado|carro|chofer|estacion|poroy)/.test(q)) {
    return 'TRANSPORTE';
  }
  if (/(tour|guia|machu|picchu|valle|sagrado|maras|moray|excursion|sacsayhuaman|vinicunca)/.test(q)) {
    return 'TURISMO';
  }
  if (/(farmacia|botica|soroche|oxigeno|pastilla|medicina|dolor|muna|salud|botiquin|jarabe)/.test(q)) {
    return 'FARMACIA';
  }
  if (/(hotel|suite|habitacion|hospedaje|spa|day-use|cama|alojamiento|nazarenas)/.test(q)) {
    return 'HOTEL';
  }
  if (/(cambio|dolar|dolares|euro|euros|divisa|usd|eur|soles|cambista)/.test(q)) {
    return 'CASA_CAMBIO';
  }
  return 'RESTAURANTE';
}

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

  let detectedCategory: Rubro = params.categoria || inferCategoryFromText(params.query);
  let searchKeywords = normalizeText(params.query)
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !['quiero', 'necesito', 'para', 'desde', 'hasta', 'ubicacion', 'busco', 'favor', 'cusco'].includes(w));
  let conciergeReply = '';
  let destinoExtraido = params.destino?.trim() || '';
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
          systemInstruction:
            'Eres el concierge de lujo de La Chuspa en Cusco, Perú. Clasifica la intención en exactamente una categoría (TRANSPORTE, TURISMO, HOTEL, RESTAURANTE, FARMACIA, CASA_CAMBIO), extrae palabras clave de búsqueda y destino si es traslado, y redacta una respuesta breve, cordial y refinada en español (máximo 22 palabras).',
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
        detectedCategory = parsed.categoria as Rubro;
      }
      if (Array.isArray(parsed.palabras_clave) && parsed.palabras_clave.length > 0) {
        searchKeywords = parsed.palabras_clave.map(normalizeText).filter((w) => w.length >= 2);
      }
      if (parsed.destino && !destinoExtraido) {
        destinoExtraido = parsed.destino;
      }
      if (parsed.respuesta_breve) {
        conciergeReply = parsed.respuesta_breve;
      }
      aiUsed = true;
    } catch (err) {
      aiError = err instanceof Error ? err.message : 'Error consultando el asistente';
    }
  }

  // Si es TRANSPORTE: buscar unidades de conductores activas y certificadas con distancia Haversine
  if (detectedCategory === 'TRANSPORTE') {
    const tripKmEstimate = destinoExtraido
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
          placa: u.placa,
          modelo: u.modelo,
          conductor_nombre: u.conductor_nombre,
          calificacion: u.calificacion,
          certificada: u.certificada === 1,
          distancia_km: distConductorKm,
          eta_min: etaMin,
          precio_centavos: precioCentavos,
          disponible: true,
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
      destino_sugerido: destinoExtraido || 'Aeropuerto / Centro Histórico',
      distancia_estimada_km: tripKmEstimate,
      respuesta_voz:
        conciergeReply ||
        `Encontramos ${enriched.length} unidades ejecutivas disponibles cerca de ti desde S/ ${(minPrice / 100).toFixed(2)}.`,
      ai_used: aiUsed,
      ai_error: aiError,
      opciones: enriched,
    };
  }

  // Si es CASA_CAMBIO: mostrar tasas de cambio activas
  if (detectedCategory === 'CASA_CAMBIO') {
    const rates = db
      .prepare(`
        SELECT a.*, n.nombre AS negocio_nombre, n.zona, n.calificacion, n.lat, n.lng
        FROM agentes_cambio a
        JOIN negocios n ON n.id = a.negocio_id
        WHERE n.rubro = 'CASA_CAMBIO' AND n.activo = 1 AND a.disponible = 1
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
    }>;

    return {
      categoria: 'CASA_CAMBIO' as const,
      respuesta_voz:
        conciergeReply ||
        `Tenemos ${rates.length} cotizaciones verificadas en casas de cambio autorizadas de Cusco.`,
      ai_used: aiUsed,
      ai_error: aiError,
      opciones: rates.map((r, idx) => ({
        tipo: 'DIVISA' as const,
        negocio_id: r.negocio_id,
        negocio_nombre: r.negocio_nombre,
        categoria: 'CASA_CAMBIO' as const,
        titulo: `${r.moneda_origen} / ${r.moneda_destino} · Compra ${r.tasa_compra.toFixed(3)} · Venta ${r.tasa_venta.toFixed(3)}`,
        descripcion: `${r.zona} · Reserva de tasa con código de retiro`,
        calificacion: r.calificacion,
        eta_min: 10,
        precio_centavos: Math.round(r.tasa_compra * 100),
        tasa_compra: r.tasa_compra,
        tasa_venta: r.tasa_venta,
        moneda_origen: r.moneda_origen,
        mejor_precio: idx === 0,
        disponible: true,
      })),
    };
  }

  // Resto de categorías: consulta ESTRICTA filtrada por categoria === n.rubro
  const rows = db
    .prepare(`
      SELECT s.*, n.nombre AS negocio_nombre, n.zona, n.calificacion, n.lat, n.lng
      FROM servicios_catalogo s
      JOIN negocios n ON n.id = s.negocio_id
      WHERE s.categoria = ? AND n.rubro = ? AND n.activo = 1 AND n.en_linea = 1 AND s.disponible = 1 AND s.stock > 0
      ORDER BY s.precio_centavos ASC
    `)
    .all(detectedCategory, detectedCategory) as Array<{
    id: number;
    negocio_id: number;
    categoria: Rubro;
    nombre: string;
    descripcion: string;
    precio_centavos: number;
    duracion_min: number;
    stock: number;
    negocio_nombre: string;
    zona: string;
    calificacion: number;
    lat: number;
    lng: number;
  }>;

  // Filtro tolerante por palabras clave dentro de la MISMA categoría
  let matched = rows;
  if (searchKeywords.length > 0) {
    const filtered = rows.filter((item) => {
      const hay = normalizeText(`${item.nombre} ${item.descripcion} ${item.negocio_nombre}`);
      return searchKeywords.some((kw) => hay.includes(kw));
    });
    if (filtered.length > 0) {
      matched = filtered;
    }
  }

  // Fallback universal: si no hubo resultados en la categoría detectada, buscar en todo el catálogo activo
  if (matched.length === 0) {
    const allRows = db
      .prepare(`
        SELECT s.*, n.nombre AS negocio_nombre, n.zona, n.calificacion, n.lat, n.lng
        FROM servicios_catalogo s
        JOIN negocios n ON n.id = s.negocio_id
        WHERE n.activo = 1 AND n.en_linea = 1 AND s.disponible = 1 AND s.stock > 0
        ORDER BY s.precio_centavos ASC
      `)
      .all() as typeof rows;

    if (searchKeywords.length > 0) {
      const crossMatched = allRows.filter((item) => {
        const hay = normalizeText(
          `${item.nombre} ${item.descripcion} ${item.negocio_nombre} ${item.categoria}`
        );
        return searchKeywords.some((kw) => hay.includes(kw));
      });
      matched = crossMatched.length > 0 ? crossMatched : allRows.slice(0, 8);
    } else {
      matched = allRows.slice(0, 8);
    }
  }

  const minPrice = matched.length > 0 ? Math.min(...matched.map((r) => r.precio_centavos)) : 0;

  return {
    categoria: matched[0]?.categoria || detectedCategory,
    respuesta_voz:
      conciergeReply ||
      (matched.length > 0
        ? `Seleccionamos ${matched.length} opciones verificadas para comparar precios desde S/ ${(minPrice / 100).toFixed(2)}.`
        : `No encontramos disponibilidad inmediata en ${detectedCategory.toLowerCase()}.`),
    ai_used: aiUsed,
    ai_error: aiError,
    opciones: matched.map((r) => ({
      tipo: 'CATALOGO' as const,
      servicio_id: r.id,
      negocio_id: r.negocio_id,
      negocio_nombre: r.negocio_nombre,
      categoria: r.categoria,
      titulo: r.nombre,
      descripcion: r.descripcion,
      zona: r.zona,
      calificacion: r.calificacion,
      distancia_km: haversineKm(userLat, userLng, r.lat, r.lng),
      eta_min: r.duracion_min,
      stock: r.stock,
      precio_centavos: r.precio_centavos,
      mejor_precio: r.precio_centavos === minPrice,
      disponible: true,
    })),
  };
}
