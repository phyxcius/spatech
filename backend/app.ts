import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  calculateTaxiFareServer,
  generateAiBusinessPanelConfig,
  haversineKm,
  runConciergeSearch,
} from './assistant.ts';

function safeParseJson<T>(raw: unknown): T | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
import {
  enviarComprobanteApisperu,
  isApisperuBillingConfigured,
} from './apisperuBilling.ts';
import {
  aceptarPedido,
  actualizarEtapaViaje,
  ajustarSaldoAdmin,
  aprobarRecarga,
  auditarLibroContable,
  cancelarPedido,
  finalizarViajeConfirmado,
  logWhatsAppNotification,
  rechazarRecarga,
  solicitarRecarga,
  validarPinYEntregar,
  validarSoloPin,
} from './finance.ts';
import {
  getFirebaseSyncState,
  getRtdbBaseUrl,
  syncNegocioPinToFirebaseRtdb,
  syncOrderPinToFirebaseRtdb,
  syncSnapshotToFirebaseRtdb,
} from './rtdbSync.ts';
import {
  createRateLimiter,
  createSessionToken,
  encryptOrderPin,
  generateOrderPin,
  hashPin,
  requireAdminAuth,
  requireBusinessAuth,
  sanitizeOrderForBusiness,
  sanitizeOrderPublic,
  timingSafeEqualString,
  verifyPin,
  type AuthedRequest,
} from './security.ts';
import {
  ESTADOS_REGLA,
  HttpError,
  METODOS_PAGO,
  METODOS_RECARGA,
  RUBROS,
  type EstadoRegla,
  type MetodoPago,
  type MetodoRecarga,
  type NegocioRow,
  type PedidoRow,
  type Rubro,
} from './types.ts';

const ENTIDADES_EMERGENCIA = ['SAMU', 'SERENAZGO', 'PNP_105', 'BOMBEROS'] as const;
type EntidadEmergencia = (typeof ENTIDADES_EMERGENCIA)[number];
type ProveedorConsultas = 'auto' | 'apisperu' | 'apisnetpe';

function maskSecretPreview(raw: string): string {
  const clean = (raw || '').trim();
  if (!clean) return '';
  if (clean.length <= 10) return '••••••••';
  return `${clean.slice(0, 6)}••••••${clean.slice(-4)}`;
}

function isValidDni(raw: string): boolean {
  return /^\d{8}$/.test(raw.trim());
}

function isValidForeignDoc(raw: string): boolean {
  return /^[A-Z0-9-]{6,20}$/i.test(raw.trim());
}

function isValidRuc(raw: string): boolean {
  const ruc = raw.trim();
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(ruc[i]) * weights[i];
  }
  const rem = 11 - (sum % 11);
  const check = rem === 10 ? 0 : rem === 11 ? 1 : rem;
  return check === Number(ruc[10]);
}

function generateCode(prefix: string): string {
  const num = crypto.randomInt(1000, 9999);
  return `${prefix}-${num}`;
}

function parseClienteDocumentoInput(
  body: Record<string, any>,
  opts?: { allowInvoice?: boolean }
): {
  docTipo: 'DNI' | 'RUC' | 'EXTRANJERO';
  docNum: string;
  docVerif: number;
  docDireccionFiscal: string | null;
  comprobanteTipo: 'BOLETA' | 'FACTURA' | null;
} {
  const allowInvoice = opts?.allowInvoice !== false;
  const rawNum = String(body.cliente_documento_numero || '').trim();
  const rawDir =
    typeof body.cliente_direccion_fiscal === 'string' && body.cliente_direccion_fiscal.trim()
      ? body.cliente_direccion_fiscal.trim().slice(0, 220)
      : null;

  if (!rawNum) {
    throw new HttpError(
      400,
      'Es obligatorio ingresar tu DNI (8 dígitos), RUC (11 dígitos) o Pasaporte/CE (Extranjero) para reservar.'
    );
  }

  const t = String(
    body.cliente_documento_tipo || (rawNum.length === 11 && /^\d+$/.test(rawNum) ? 'RUC' : /^\d{8}$/.test(rawNum) ? 'DNI' : 'EXTRANJERO')
  ).toUpperCase();

  if (t === 'DNI' && isValidDni(rawNum)) {
    return {
      docTipo: 'DNI',
      docNum: rawNum,
      docVerif: body.cliente_documento_verificado ? 1 : 0,
      docDireccionFiscal: rawDir,
      comprobanteTipo: allowInvoice ? 'BOLETA' : null,
    };
  }
  if (t === 'RUC' && isValidRuc(rawNum)) {
    return {
      docTipo: 'RUC',
      docNum: rawNum,
      docVerif: body.cliente_documento_verificado ? 1 : 0,
      docDireccionFiscal: rawDir,
      comprobanteTipo: allowInvoice ? 'FACTURA' : null,
    };
  }
  if (t === 'EXTRANJERO' && isValidForeignDoc(rawNum)) {
    return {
      docTipo: 'EXTRANJERO',
      docNum: rawNum.toUpperCase(),
      docVerif: body.cliente_documento_verificado ? 1 : 0,
      docDireccionFiscal: rawDir,
      comprobanteTipo: allowInvoice ? 'BOLETA' : null,
    };
  }
  throw new HttpError(400, 'El DNI, RUC o documento extranjero no tiene formato válido');
}

function buildComprobantePayload(row: PedidoRow & {
  negocio_nombre?: string;
  emisor_ruc?: string | null;
  emisor_razon_social?: string | null;
  emisor_direccion?: string | null;
}) {
  const tipo = row.comprobante_tipo || (row.cliente_documento_tipo === 'RUC' ? 'FACTURA' : 'BOLETA');
  const serie = row.comprobante_serie || (tipo === 'FACTURA' ? 'F001' : 'B001');
  const numero = row.comprobante_numero || String(row.id).padStart(8, '0');
  const totalCentavos = Number(row.monto_centavos) || 0;
  const opGravadaCentavos = Math.round(totalCentavos / 1.18);
  const igvCentavos = totalCentavos - opGravadaCentavos;
  return {
    tipo,
    serie,
    numero,
    numero_completo: `${serie}-${numero}`,
    emitido_at: row.comprobante_emitido_at || row.updated_at || row.created_at,
    pedido_codigo: row.codigo,
    metodo_pago: row.metodo_pago,
    moneda: 'PEN',
    hash: row.comprobante_hash || null,
    sunat_estado: row.comprobante_sunat_estado || 'REPRESENTACION_IMPRESA',
    emisor: {
      ruc: row.emisor_ruc || '20601234565',
      razon_social: row.emisor_razon_social || row.negocio_nombre || 'La Chuspa Cusco Partner',
      nombre_comercial: row.negocio_nombre || row.emisor_razon_social || 'La Chuspa Cusco',
      direccion: row.emisor_direccion || 'Cusco, Perú',
    },
    receptor: {
      tipo_doc: row.cliente_documento_tipo || 'DNI',
      numero_doc: row.cliente_documento_numero || '00000000',
      nombre: row.cliente_nombre,
      direccion: row.cliente_direccion_fiscal || 'Cusco, Perú',
    },
    items: [
      {
        cantidad: 1,
        descripcion: row.item_nombre,
        detalle: row.transcripcion,
        valor_unitario_centavos: opGravadaCentavos,
        total_centavos: totalCentavos,
      },
    ],
    op_gravada_centavos: opGravadaCentavos,
    igv_centavos: igvCentavos,
    total_centavos: totalCentavos,
  };
}

export function createApp(options: { db: DatabaseSync; skipRateLimit?: boolean }) {
  const { db, skipRateLimit = false } = options;
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    const reqOrigin = req.headers.origin;
    const isAuthRoute = req.path.startsWith('/api/negocio') || req.path.startsWith('/api/admin');
    const defaultAllowedOrigins = [
      'https://phyxcius.github.io',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
    ];
    if (process.env.APP_URL) {
      defaultAllowedOrigins.push(process.env.APP_URL.replace(/\/$/, ''));
    }
    const configuredOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '')
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean);
    const allowedSet = new Set([...defaultAllowedOrigins, ...configuredOrigins]);

    if (reqOrigin) {
      if (allowedSet.has(reqOrigin) || !isAuthRoute) {
        res.setHeader('Access-Control-Allow-Origin', reqOrigin);
        res.setHeader('Vary', 'Origin');
      }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          void syncSnapshotToFirebaseRtdb(db);
        }
      });
    }
    next();
  });
  app.use(express.json({ limit: '512kb' }));

  const publicLimiter = skipRateLimit
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : createRateLimiter(90, 60_000);
  const authLimiter = skipRateLimit
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : createRateLimiter(20, 60_000);

  function getLocalDevApiConfig(): {
    proveedorConsultas: ProveedorConsultas;
    tokenConsultasDniRuc: string;
    tokenFacturacionApisperu: string;
    updatedAt: string | null;
  } {
    const row = db
      .prepare('SELECT * FROM dev_api_config WHERE id = 1')
      .get() as
      | {
          proveedor_consultas: string;
          token_consultas: string;
          token_facturacion: string;
          updated_at: string;
        }
      | undefined;

    const envConsultas = (process.env.PERU_DNI_RUC_TOKEN || '').trim();
    const envFacturacion = (process.env.APISPERU_FACTURACION_TOKEN || '').trim();
    const prov: ProveedorConsultas =
      row?.proveedor_consultas === 'apisperu' || row?.proveedor_consultas === 'apisnetpe'
        ? row.proveedor_consultas
        : 'auto';

    return {
      proveedorConsultas: prov,
      tokenConsultasDniRuc: (row?.token_consultas || '').trim() || envConsultas,
      tokenFacturacionApisperu: (row?.token_facturacion || '').trim() || envFacturacion,
      updatedAt: row?.updated_at || null,
    };
  }

  async function resolveDevApiConfig() {
    const local = getLocalDevApiConfig();
    if (
      (local.tokenConsultasDniRuc && local.tokenFacturacionApisperu) ||
      process.env.NODE_ENV === 'test' ||
      process.env.DISABLE_FIREBASE_SYNC === 'true'
    ) {
      return local;
    }

    const baseUrl = getRtdbBaseUrl();
    if (baseUrl) {
      try {
        const res = await fetch(`${baseUrl}/dev_api.json`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const remote = (await res.json()) as Record<string, any> | null;
          if (remote && typeof remote === 'object') {
            const prov: ProveedorConsultas =
              remote.proveedorConsultas === 'apisperu' || remote.proveedorConsultas === 'apisnetpe'
                ? remote.proveedorConsultas
                : local.proveedorConsultas;
            const tokConsultas =
              local.tokenConsultasDniRuc || String(remote.tokenConsultasDniRuc || '').trim();
            const tokFacturacion =
              local.tokenFacturacionApisperu || String(remote.tokenFacturacionApisperu || '').trim();
            return {
              proveedorConsultas: prov,
              tokenConsultasDniRuc: tokConsultas,
              tokenFacturacionApisperu: tokFacturacion,
              updatedAt: remote.updated_at ? String(remote.updated_at) : local.updatedAt,
            };
          }
        }
      } catch {
        // Keep local fallback
      }
    }
    return local;
  }

  // =========================================================================
  // 1. RUTAS PÚBLICAS DE CLIENTE / TURISTA
  // =========================================================================
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'la-chuspa-core', firebase: getFirebaseSyncState() });
  });

  app.get('/api/public/firebase-status', publicLimiter, (_req, res) => {
    res.json(getFirebaseSyncState());
  });

  app.post('/api/public/firebase-sync', publicLimiter, async (_req, res, next) => {
    try {
      await syncSnapshotToFirebaseRtdb(db);
      res.json({ ok: true, firebase: getFirebaseSyncState() });
    } catch (err) {
      next(err);
    }
  });

  // =========================================================================
  // 1.1 AVATAR HUMANOIDE REALISTA (Proxy seguro HeyGen Interactive Avatar WebRTC)
  // =========================================================================
  const HEYGEN_API_BASE = 'https://api.heygen.com/v1';

  function getHeygenConfig() {
    const apiKey = (process.env.HEYGEN_API_KEY || '').trim();
    const avatarId = (process.env.HEYGEN_AVATAR_ID || 'Wayne_20240711').trim();
    const voiceId = (process.env.HEYGEN_VOICE_ID || '').trim();
    return {
      configured: apiKey.length > 0,
      apiKey,
      avatarId,
      voiceId,
    };
  }

  app.get('/api/public/avatar/status', publicLimiter, (_req, res) => {
    const cfg = getHeygenConfig();
    res.json({
      configured: cfg.configured,
      provider: cfg.configured ? 'heygen-webrtc' : 'realistic-local',
      avatar_id: cfg.avatarId,
    });
  });

  app.post('/api/public/avatar/session', publicLimiter, async (_req, res, next) => {
    try {
      const cfg = getHeygenConfig();
      if (!cfg.configured) {
        throw new HttpError(
          503,
          'HEYGEN_API_KEY no configurada en el servidor; usando motor realista local.'
        );
      }

      const tokenRes = await fetch(`${HEYGEN_API_BASE}/streaming.create_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': cfg.apiKey,
        },
        signal: AbortSignal.timeout(8000),
      });
      const tokenJson = (await tokenRes.json().catch(() => ({}))) as Record<string, any>;
      const sessionToken = tokenJson?.data?.token;
      if (!tokenRes.ok || !sessionToken) {
        throw new HttpError(502, tokenJson?.message || 'No se pudo generar token de sesión HeyGen');
      }

      const newRes = await fetch(`${HEYGEN_API_BASE}/streaming.new`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          quality: 'high',
          avatar_name: cfg.avatarId,
          version: 'v2',
          video_encoding: 'H264',
          ...(cfg.voiceId
            ? { voice: { voice_id: cfg.voiceId, rate: 1.0, emotion: 'Friendly' } }
            : {}),
        }),
        signal: AbortSignal.timeout(10000),
      });
      const newJson = (await newRes.json().catch(() => ({}))) as Record<string, any>;
      if (!newRes.ok || !newJson?.data?.session_id) {
        throw new HttpError(502, newJson?.message || 'No se pudo iniciar sesión WebRTC con HeyGen');
      }

      res.json({
        session_id: newJson.data.session_id,
        session_token: sessionToken,
        sdp: newJson.data.sdp,
        ice_servers: newJson.data.ice_servers2 || newJson.data.ice_servers || [],
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/public/avatar/start', publicLimiter, async (req, res, next) => {
    try {
      const { session_id, session_token, sdp } = req.body || {};
      if (typeof session_id !== 'string' || !session_id.trim() || !sdp) {
        throw new HttpError(400, 'session_id y sdp son obligatorios');
      }
      const cfg = getHeygenConfig();
      const authHeader =
        typeof session_token === 'string' && session_token.trim()
          ? `Bearer ${session_token.trim()}`
          : '';
      if (!authHeader && !cfg.configured) {
        throw new HttpError(503, 'Avatar WebRTC no configurado en el servidor');
      }
      const upstream = await fetch(`${HEYGEN_API_BASE}/streaming.start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : { 'X-Api-Key': cfg.apiKey }),
        },
        body: JSON.stringify({ session_id: session_id.trim(), sdp }),
        signal: AbortSignal.timeout(8000),
      });
      const data = (await upstream.json().catch(() => ({}))) as Record<string, any>;
      if (!upstream.ok) {
        throw new HttpError(upstream.status || 502, data?.message || 'Error iniciando stream WebRTC');
      }
      res.json({ ok: true, data: data?.data || {} });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/public/avatar/ice', publicLimiter, async (req, res, next) => {
    try {
      const { session_id, session_token, candidate } = req.body || {};
      if (typeof session_id !== 'string' || !session_id.trim() || !candidate) {
        throw new HttpError(400, 'session_id y candidate son obligatorios');
      }
      const cfg = getHeygenConfig();
      const authHeader =
        typeof session_token === 'string' && session_token.trim()
          ? `Bearer ${session_token.trim()}`
          : '';
      if (!authHeader && !cfg.configured) {
        throw new HttpError(503, 'Avatar WebRTC no configurado en el servidor');
      }
      const upstream = await fetch(`${HEYGEN_API_BASE}/streaming.ice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : { 'X-Api-Key': cfg.apiKey }),
        },
        body: JSON.stringify({ session_id: session_id.trim(), candidate }),
        signal: AbortSignal.timeout(6000),
      });
      if (!upstream.ok) {
        throw new HttpError(upstream.status || 502, 'Error enviando candidato ICE');
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/public/avatar/speak', publicLimiter, async (req, res, next) => {
    try {
      const { session_id, session_token, text } = req.body || {};
      if (typeof session_id !== 'string' || !session_id.trim()) {
        throw new HttpError(400, 'session_id obligatorio');
      }
      if (typeof text !== 'string' || !text.trim()) {
        throw new HttpError(400, 'text obligatorio');
      }
      const cfg = getHeygenConfig();
      const authHeader =
        typeof session_token === 'string' && session_token.trim()
          ? `Bearer ${session_token.trim()}`
          : '';
      if (!authHeader && !cfg.configured) {
        throw new HttpError(503, 'Avatar WebRTC no configurado en el servidor');
      }
      const upstream = await fetch(`${HEYGEN_API_BASE}/streaming.task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : { 'X-Api-Key': cfg.apiKey }),
        },
        body: JSON.stringify({
          session_id: session_id.trim(),
          text: text.trim().slice(0, 600),
          task_type: 'repeat',
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = (await upstream.json().catch(() => ({}))) as Record<string, any>;
      if (!upstream.ok) {
        throw new HttpError(upstream.status || 502, data?.message || 'Error al hablar en WebRTC');
      }
      res.json({ ok: true, data: data?.data || {} });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/public/avatar/stop', publicLimiter, async (req, res, next) => {
    try {
      const { session_id, session_token } = req.body || {};
      if (typeof session_id !== 'string' || !session_id.trim()) {
        throw new HttpError(400, 'session_id obligatorio');
      }
      const cfg = getHeygenConfig();
      const authHeader =
        typeof session_token === 'string' && session_token.trim()
          ? `Bearer ${session_token.trim()}`
          : '';
      if (authHeader || cfg.configured) {
        await fetch(`${HEYGEN_API_BASE}/streaming.stop`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader ? { Authorization: authHeader } : { 'X-Api-Key': cfg.apiKey }),
          },
          body: JSON.stringify({ session_id: session_id.trim() }),
          signal: AbortSignal.timeout(5000),
        }).catch(() => {});
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/public/consulta-documento', publicLimiter, async (req, res, next) => {
    try {
      const tipo = String(req.query.tipo || '').trim().toUpperCase();
      const numero = String(req.query.numero || '').trim();
      const nombreQuery = String(req.query.nombre || '').trim();

      if (tipo === 'EXTRANJERO') {
        const cleanDoc = numero.toUpperCase();
        if (!isValidForeignDoc(cleanDoc)) {
          throw new HttpError(
            400,
            'El Pasaporte o Carné de Extranjería debe tener entre 6 y 20 caracteres alfanuméricos.'
          );
        }
        const finalNombre =
          nombreQuery.length >= 2 ? nombreQuery.slice(0, 120) : 'Pasajero / Cliente Extranjero';
        res.json({
          valid: true,
          validado: true,
          tipo: 'EXTRANJERO',
          numero: cleanDoc,
          nombre_completo: finalNombre,
          source: 'MIGRACIONES_EXTRANJERO',
          fuente: 'MIGRACIONES_EXTRANJERO',
        });
        return;
      }

      if (tipo !== 'DNI' && tipo !== 'RUC') {
        throw new HttpError(400, 'Tipo de documento debe ser DNI, RUC o EXTRANJERO');
      }
      if (tipo === 'DNI' && !isValidDni(numero)) {
        throw new HttpError(400, 'El DNI peruano debe tener exactamente 8 dígitos numéricos');
      }
      if (tipo === 'RUC' && !isValidRuc(numero)) {
        throw new HttpError(400, 'El RUC peruano debe tener 11 dígitos válidos (SUNAT)');
      }

      const bypassCache = String(req.query.nocache || '') === '1';
      const cached = !bypassCache
        ? (db
            .prepare('SELECT * FROM documentos_peru WHERE tipo = ? AND numero = ?')
            .get(tipo, numero) as
            | {
                tipo: 'DNI' | 'RUC';
                numero: string;
                nombre_completo: string;
                razon_social: string | null;
                estado: string | null;
                condicion: string | null;
                direccion: string | null;
              }
            | undefined)
        : undefined;

      if (cached) {
        res.json({
          valid: true,
          validado: true,
          tipo: cached.tipo,
          numero: cached.numero,
          nombre_completo: cached.nombre_completo,
          razon_social: cached.razon_social || undefined,
          estado: cached.estado || undefined,
          condicion: cached.condicion || undefined,
          direccion: cached.direccion || undefined,
          source: 'CACHE',
          fuente: 'CACHE',
        });
        return;
      }

      let nombreCompleto = '';
      let razonSocial: string | null = null;
      let estado: string | null = null;
      let condicion: string | null = null;
      let direccion: string | null = null;
      let source: 'RENIEC' | 'SUNAT' | 'VALIDACION_LOCAL' = 'VALIDACION_LOCAL';
      let providerUsed: 'apisperu' | 'apisnetpe' | undefined;

      if (process.env.NODE_ENV !== 'test') {
        const devCfg = await resolveDevApiConfig();
        const apisperuToken = devCfg.tokenConsultasDniRuc;
        const prov = devCfg.proveedorConsultas;

        if (apisperuToken && (prov === 'apisperu' || prov === 'auto')) {
          try {
            const apisperuEndpoint =
              tipo === 'DNI'
                ? `https://dniruc.apisperu.com/api/v1/dni/${encodeURIComponent(numero)}?token=${encodeURIComponent(apisperuToken)}`
                : `https://dniruc.apisperu.com/api/v1/ruc/${encodeURIComponent(numero)}?token=${encodeURIComponent(apisperuToken)}`;
            const apRes = await fetch(apisperuEndpoint, {
              headers: { Accept: 'application/json' },
              signal: AbortSignal.timeout(5500),
            });
            if (apRes.ok) {
              const apData = (await apRes.json()) as Record<string, any>;
              if (apData && apData.success !== false) {
                if (tipo === 'DNI') {
                  const joined = [apData.nombres, apData.apellidoPaterno, apData.apellidoMaterno]
                    .filter(Boolean)
                    .join(' ')
                    .trim();
                  nombreCompleto = String(joined || apData.nombre || '').trim();
                  if (nombreCompleto) {
                    source = 'RENIEC';
                    providerUsed = 'apisperu';
                  }
                } else {
                  razonSocial =
                    String(apData.razonSocial || apData.nombreComercial || apData.nombre || '').trim() || null;
                  nombreCompleto = razonSocial || '';
                  estado = apData.estado ? String(apData.estado) : null;
                  condicion = apData.condicion ? String(apData.condicion) : null;
                  direccion = apData.direccion ? String(apData.direccion) : null;
                  if (nombreCompleto) {
                    source = 'SUNAT';
                    providerUsed = 'apisperu';
                  }
                }
              }
            }
          } catch {
            // Fall through to secondary provider / local validation
          }
        }

        if (!nombreCompleto && (prov === 'apisnetpe' || prov === 'auto')) {
          const candidates = [
            apisperuToken
              ? tipo === 'DNI'
                ? `https://api.apis.net.pe/v2/reniec/dni?numero=${encodeURIComponent(numero)}&token=${encodeURIComponent(apisperuToken)}`
                : `https://api.apis.net.pe/v2/sunat/ruc?numero=${encodeURIComponent(numero)}&token=${encodeURIComponent(apisperuToken)}`
              : '',
            tipo === 'DNI'
              ? `https://api.apis.net.pe/v1/dni?numero=${encodeURIComponent(numero)}`
              : `https://api.apis.net.pe/v1/ruc?numero=${encodeURIComponent(numero)}`,
          ].filter(Boolean);

          for (const endpoint of candidates) {
            try {
              const upstream = await fetch(endpoint, {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(4500),
              });
              if (upstream.ok) {
                const data = (await upstream.json()) as Record<string, any>;
                if (tipo === 'DNI') {
                  const joined = [data.nombres, data.apellidoPaterno, data.apellidoMaterno]
                    .filter(Boolean)
                    .join(' ')
                    .trim();
                  nombreCompleto = String(data.nombreCompleto || data.nombre || joined || '').trim();
                  if (nombreCompleto) {
                    source = 'RENIEC';
                    providerUsed = 'apisnetpe';
                    break;
                  }
                } else {
                  razonSocial = String(data.nombre || data.razonSocial || '').trim() || null;
                  nombreCompleto = razonSocial || '';
                  estado = data.estado ? String(data.estado) : null;
                  condicion = data.condicion ? String(data.condicion) : null;
                  direccion = data.direccion ? String(data.direccion) : null;
                  if (nombreCompleto) {
                    source = 'SUNAT';
                    providerUsed = 'apisnetpe';
                    break;
                  }
                }
              }
            } catch {
              // Try next endpoint
            }
          }
        }
      }

      if (!nombreCompleto) {
        nombreCompleto =
          tipo === 'DNI'
            ? `Ciudadano Verificado DNI ${numero}`
            : `Empresa Verificada RUC ${numero}`;
        if (tipo === 'RUC') {
          razonSocial = nombreCompleto;
        }
        source = 'VALIDACION_LOCAL';
      } else {
        db.prepare(`
          INSERT OR REPLACE INTO documentos_peru (tipo, numero, nombre_completo, razon_social, estado, condicion, direccion, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(tipo, numero, nombreCompleto, razonSocial, estado, condicion, direccion, source);

        if (process.env.DISABLE_FIREBASE_SYNC !== 'true') {
          const baseUrl = getRtdbBaseUrl();
          if (baseUrl) {
            void fetch(`${baseUrl}/lachuspa/documentos/${tipo}_${numero}.json`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                valid: true,
                validado: true,
                tipo,
                numero,
                nombre_completo: nombreCompleto,
                razon_social: razonSocial,
                estado,
                condicion,
                direccion,
                source,
                fuente: source,
                updated_at: new Date().toISOString(),
              }),
            }).catch(() => {});
          }
        }
      }

      res.json({
        valid: true,
        validado: true,
        tipo,
        numero,
        nombre_completo: nombreCompleto,
        razon_social: razonSocial || undefined,
        estado: estado || undefined,
        condicion: condicion || undefined,
        direccion: direccion || undefined,
        source,
        fuente: providerUsed || source,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/public/directorio', publicLimiter, (_req, res) => {
    const rawNegocios = db
      .prepare(`
        SELECT id, codigo, rubro, nombre, descripcion, zona, lat, lng, en_linea, calificacion,
               horario_apertura, horario_cierre, abierto_24h, metodos_pago_aceptados,
               tarifa_minima_centavos, radio_cobertura_km,
               tipo_persona, documento_tipo, documento_numero, razon_social,
               tipo_negocio, modalidades_venta, panel_ia_json, estado_regla, motivo_estado
        FROM negocios
        WHERE activo = 1
        ORDER BY rubro ASC, calificacion DESC
      `)
      .all() as Array<Record<string, unknown>>;
    const negocios = rawNegocios.map((n) => ({
      ...n,
      panel_ia: safeParseJson(n.panel_ia_json),
    }));
    const rawServicios = db
      .prepare(`
        SELECT s.id, s.negocio_id, s.categoria, s.nombre, s.descripcion, s.precio_centavos, s.duracion_min, s.stock,
               s.unidad_medida, s.atributos_json, n.nombre AS negocio_nombre, n.zona, n.calificacion
        FROM servicios_catalogo s
        JOIN negocios n ON n.id = s.negocio_id
        WHERE n.activo = 1 AND n.en_linea = 1 AND s.disponible = 1 AND s.stock > 0 AND s.categoria = n.rubro
        ORDER BY s.categoria ASC, s.precio_centavos ASC
      `)
      .all() as Array<Record<string, unknown>>;
    const servicios = rawServicios.map((s) => ({
      ...s,
      atributos: safeParseJson(s.atributos_json),
    }));
    const unidades = db
      .prepare(`
        SELECT u.id, u.negocio_id, u.conductor_nombre, u.placa, u.modelo, u.color,
               u.tarifa_base_centavos, u.tarifa_km_centavos, u.calificacion, u.lat, u.lng, u.estado, u.certificada,
               n.nombre AS negocio_nombre, n.zona
        FROM unidades_conductores u
        JOIN negocios n ON n.id = u.negocio_id
        WHERE n.activo = 1 AND n.en_linea = 1 AND n.rubro = 'TRANSPORTE' AND u.estado = 'DISPONIBLE'
      `)
      .all();
    res.json({ negocios, servicios, unidades });
  });

  app.post('/api/public/ai/generar-panel-rubro', publicLimiter, async (req, res, next) => {
    try {
      const { rubro_usuario, nombre, descripcion, zona } = req.body || {};
      if (typeof rubro_usuario !== 'string' || rubro_usuario.trim().length < 2) {
        throw new HttpError(400, 'Describe el rubro o giro del negocio (mínimo 2 caracteres).');
      }
      const panel_ia = await generateAiBusinessPanelConfig({
        rubro_usuario,
        nombre: typeof nombre === 'string' ? nombre : undefined,
        descripcion: typeof descripcion === 'string' ? descripcion : undefined,
        zona: typeof zona === 'string' ? zona : undefined,
      });
      res.json({ panel_ia });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/public/asistente', publicLimiter, async (req, res, next) => {
    try {
      const { query, categoria, lat, lng, destino } = req.body || {};
      if (typeof query !== 'string' && !categoria) {
        throw new HttpError(400, 'Ingresa una solicitud o elige una categoría');
      }
      if (categoria && !RUBROS.includes(categoria)) {
        throw new HttpError(400, 'Categoría inválida');
      }
      const result = await runConciergeSearch(db, {
        query: typeof query === 'string' ? query : '',
        categoria,
        lat: typeof lat === 'number' ? lat : undefined,
        lng: typeof lng === 'number' ? lng : undefined,
        destino: typeof destino === 'string' ? destino : undefined,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Pedido directo de catálogo (comida, farmacia, tour, hotel) - NUNCA acepta otra categoría o negocio ajeno
  app.post('/api/public/pedidos', publicLimiter, (req, res, next) => {
    try {
      const {
        negocio_id,
        servicio_id,
        categoria,
        metodo_pago,
        cliente_nombre,
        cliente_telefono,
        cliente_documento_tipo,
        cliente_documento_numero,
        cliente_documento_verificado,
        transcripcion,
        promotor_codigo,
        fecha_hora_reserva,
      } = req.body || {};

      if (!Number.isInteger(negocio_id) || !Number.isInteger(servicio_id)) {
        throw new HttpError(400, 'negocio_id y servicio_id son obligatorios');
      }
      if (!RUBROS.includes(categoria) || categoria === 'TRANSPORTE') {
        throw new HttpError(400, 'Categoría inválida para pedido de catálogo');
      }
      if (!METODOS_PAGO.includes(metodo_pago as MetodoPago)) {
        throw new HttpError(400, 'Método de pago inválido');
      }
      if (typeof cliente_nombre !== 'string' || cliente_nombre.trim().length < 2) {
        throw new HttpError(400, 'Nombre del cliente obligatorio');
      }
      if (typeof cliente_telefono !== 'string' || cliente_telefono.trim().length < 6) {
        throw new HttpError(400, 'Teléfono WhatsApp obligatorio');
      }

      const { docTipo, docNum, docVerif, docDireccionFiscal, comprobanteTipo } =
        parseClienteDocumentoInput(req.body || {});

      const negocio = db
        .prepare('SELECT * FROM negocios WHERE id = ? AND activo = 1')
        .get(negocio_id) as unknown as NegocioRow | undefined;
      if (!negocio) {
        throw new HttpError(404, 'Negocio no encontrado o inactivo');
      }
      if (negocio.rubro !== categoria) {
        throw new HttpError(
          400,
          `Categoría incompatible: el negocio pertenece a ${negocio.rubro}, no a ${categoria}`
        );
      }

      // REGLA SECCIÓN 4: Nunca buscar por id solo; siempre filtrar por negocio_id y categoria
      const item = db
        .prepare(`
          SELECT * FROM servicios_catalogo
          WHERE id = ? AND negocio_id = ? AND categoria = ? AND disponible = 1
        `)
        .get(servicio_id, negocio_id, categoria) as
        | {
            id: number;
            negocio_id: number;
            categoria: Rubro;
            nombre: string;
            precio_centavos: number;
            duracion_min: number;
            stock: number;
          }
        | undefined;
      if (!item) {
        throw new HttpError(
          400,
          'El servicio solicitado no pertenece al negocio o categoría indicada'
        );
      }
      if (item.stock <= 0) {
        throw new HttpError(409, 'Servicio sin stock disponible');
      }

      let validPromo: string | null = null;
      if (typeof promotor_codigo === 'string' && promotor_codigo.trim()) {
        const promo = db
          .prepare('SELECT codigo FROM partners_afiliados WHERE codigo = ? AND activo = 1')
          .get(promotor_codigo.trim().toUpperCase()) as { codigo: string } | undefined;
        if (promo) validPromo = promo.codigo;
      }

      const pin = generateOrderPin();
      const { hash, salt } = hashPin(pin);
      const codigo = generateCode('PED-CUSCO');

      const insertRes = db
        .prepare(`
          INSERT INTO pedidos_ordenes (
            codigo, negocio_id, referido_negocio_id, promotor_codigo, categoria,
            servicio_id, unidad_id, item_nombre, transcripcion, monto_centavos,
            metodo_pago, estado, cliente_nombre, cliente_telefono,
            cliente_documento_tipo, cliente_documento_numero, cliente_documento_verificado,
            cliente_direccion_fiscal, comprobante_tipo,
            eta_min, fecha_hora_reserva, pin_hash, pin_salt, pin_cifrado, expires_at
          )
          VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?, ?, 'PENDIENTE_CONFIRMACION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now', '+2 hours'))
        `)
        .run(
          codigo,
          negocio.id,
          validPromo,
          categoria,
          item.id,
          item.nombre,
          typeof transcripcion === 'string' && transcripcion.trim() ? transcripcion.trim() : item.nombre,
          item.precio_centavos, // Precio calculado estrictamente en servidor
          metodo_pago,
          cliente_nombre.trim(),
          cliente_telefono.trim(),
          docTipo,
          docNum,
          docVerif,
          docDireccionFiscal,
          comprobanteTipo,
          item.duracion_min,
          typeof fecha_hora_reserva === 'string' ? fecha_hora_reserva.trim() : null,
          hash,
          salt
        );

      logWhatsAppNotification(
        db,
        cliente_telefono.trim(),
        'pedido_recibido',
        codigo,
        `Tu solicitud ${codigo} (${item.nombre}) fue enviada a ${negocio.nombre}. Tu PIN de entrega es ${pin}. Compártelo solo al recibir.`
      );

      const created = db
        .prepare('SELECT * FROM pedidos_ordenes WHERE id = ?')
        .get(Number(insertRes.lastInsertRowid)) as unknown as PedidoRow;

      void syncOrderPinToFirebaseRtdb(codigo, pin);

      res.status(201).json({
        pedido: sanitizeOrderPublic(created),
        cliente_pin: pin,
      });
    } catch (err) {
      next(err);
    }
  });

  // Pedido / Reserva de Comparador de Minimarkets con verificación DNI/RUC RENIEC/SUNAT
  app.post('/api/public/market-pedidos', publicLimiter, (req, res, next) => {
    try {
      const {
        market_nombre,
        market_zona,
        items_resumen,
        monto_centavos,
        metodo_pago,
        cliente_nombre,
        cliente_telefono,
        cliente_documento_tipo,
        cliente_documento_numero,
        cliente_documento_verificado,
        tipo_entrega,
      } = req.body || {};

      if (typeof market_nombre !== 'string' || market_nombre.trim().length < 2) {
        throw new HttpError(400, 'Nombre del minimarket obligatorio');
      }
      if (!METODOS_PAGO.includes(metodo_pago as MetodoPago)) {
        throw new HttpError(400, 'Método de pago inválido');
      }
      if (typeof cliente_nombre !== 'string' || cliente_nombre.trim().length < 2) {
        throw new HttpError(400, 'Nombre del cliente obligatorio');
      }
      if (typeof cliente_telefono !== 'string' || cliente_telefono.trim().length < 6) {
        throw new HttpError(400, 'Teléfono WhatsApp obligatorio');
      }
      if (!Number.isInteger(monto_centavos) || monto_centavos < 100 || monto_centavos > 2000000) {
        throw new HttpError(400, 'Monto del pedido inválido');
      }

      const { docTipo, docNum, docVerif, docDireccionFiscal, comprobanteTipo } =
        parseClienteDocumentoInput(req.body || {});

      // Asignar a un negocio activo de minimarket/restaurante/farmacia en red para que el panel multinegocio lo reciba en vivo
      const targetBiz =
        (db
          .prepare(
            "SELECT * FROM negocios WHERE activo = 1 AND en_linea = 1 AND (LOWER(tipo_negocio) LIKE '%market%' OR LOWER(tipo_negocio) LIKE '%bodega%' OR rubro IN ('RESTAURANTE','FARMACIA')) ORDER BY id ASC LIMIT 1"
          )
          .get() as unknown as NegocioRow | undefined) ||
        (db.prepare('SELECT * FROM negocios WHERE activo = 1 ORDER BY id ASC LIMIT 1').get() as unknown as NegocioRow);

      if (!targetBiz) {
        throw new HttpError(404, 'No hay negocios receptores activos');
      }

      const pin = generateOrderPin();
      const { hash, salt } = hashPin(pin);
      const codigo = generateCode('MKT-CUSCO');
      const rawResumen = items_resumen || req.body?.item_resumen;
      const resumenClean =
        typeof rawResumen === 'string' && rawResumen.trim()
          ? rawResumen.trim().slice(0, 320)
          : `Canasta Market ${market_nombre.trim()}`;

      const insertRes = db
        .prepare(`
          INSERT INTO pedidos_ordenes (
            codigo, negocio_id, referido_negocio_id, promotor_codigo, categoria,
            servicio_id, unidad_id, item_nombre, transcripcion, monto_centavos,
            metodo_pago, estado, cliente_nombre, cliente_telefono,
            cliente_documento_tipo, cliente_documento_numero, cliente_documento_verificado,
            cliente_direccion_fiscal, comprobante_tipo,
            destino_texto, eta_min, pin_hash, pin_salt, pin_cifrado, expires_at
          )
          VALUES (?, ?, NULL, NULL, ?, NULL, NULL, ?, ?, ?, ?, 'PENDIENTE_CONFIRMACION', ?, ?, ?, ?, ?, ?, ?, ?, 20, ?, ?, NULL, datetime('now', '+2 hours'))
        `)
        .run(
          codigo,
          targetBiz.id,
          targetBiz.rubro,
          `${market_nombre.trim()} · ${resumenClean.slice(0, 90)}`,
          `[${tipo_entrega === 'DELIVERY' ? 'DELIVERY' : 'RESERVA EN TIENDA'}] ${market_nombre.trim()} (${String(
            market_zona || 'Cusco'
          )}): ${resumenClean}`,
          monto_centavos,
          metodo_pago,
          cliente_nombre.trim(),
          cliente_telefono.trim(),
          docTipo,
          docNum,
          docVerif,
          docDireccionFiscal,
          comprobanteTipo,
          String(market_zona || 'Cusco'),
          hash,
          salt
        );

      logWhatsAppNotification(
        db,
        cliente_telefono.trim(),
        'pedido_market',
        codigo,
        `Tu pedido ${codigo} en ${market_nombre.trim()} (${resumenClean}) está sincronizado. PIN de entrega: ${pin}.`
      );

      const created = db
        .prepare('SELECT * FROM pedidos_ordenes WHERE id = ?')
        .get(Number(insertRes.lastInsertRowid)) as unknown as PedidoRow;

      void syncOrderPinToFirebaseRtdb(codigo, pin);

      res.status(201).json({
        pedido: sanitizeOrderPublic(created),
        cliente_pin: pin,
      });
    } catch (err) {
      next(err);
    }
  });

  // Pedido de Taxi con GPS: tarifa calculada exclusivamente en el servidor
  app.post('/api/public/taxi/pedir', publicLimiter, (req, res, next) => {
    try {
      const {
        unidad_id,
        metodo_pago,
        cliente_nombre,
        cliente_telefono,
        origen_texto,
        destino_texto,
        origen_lat,
        origen_lng,
        destino_lat,
        destino_lng,
        promotor_codigo,
      } = req.body || {};

      if (!Number.isInteger(unidad_id)) {
        throw new HttpError(400, 'unidad_id es obligatorio');
      }
      if (!METODOS_PAGO.includes(metodo_pago as MetodoPago)) {
        throw new HttpError(400, 'Método de pago inválido');
      }
      if (typeof cliente_nombre !== 'string' || cliente_nombre.trim().length < 2) {
        throw new HttpError(400, 'Nombre obligatorio');
      }
      if (typeof cliente_telefono !== 'string' || cliente_telefono.trim().length < 6) {
        throw new HttpError(400, 'WhatsApp obligatorio');
      }

      const unidad = db
        .prepare(`
          SELECT u.*, n.rubro, n.nombre AS negocio_nombre, n.activo, n.en_linea
          FROM unidades_conductores u
          JOIN negocios n ON n.id = u.negocio_id
          WHERE u.id = ?
        `)
        .get(unidad_id) as
        | {
            id: number;
            negocio_id: number;
            conductor_nombre: string;
            placa: string;
            modelo: string;
            tarifa_base_centavos: number;
            tarifa_km_centavos: number;
            lat: number;
            lng: number;
            estado: string;
            rubro: Rubro;
            negocio_nombre: string;
            activo: number;
            en_linea: number;
          }
        | undefined;

      if (!unidad) {
        throw new HttpError(404, 'Unidad de taxi no encontrada');
      }
      if (unidad.rubro !== 'TRANSPORTE') {
        throw new HttpError(400, 'La unidad no pertenece a un negocio de transporte');
      }
      if (!unidad.activo || !unidad.en_linea || unidad.estado !== 'DISPONIBLE') {
        throw new HttpError(409, 'La unidad seleccionada no está disponible');
      }

      const oLat = typeof origen_lat === 'number' ? origen_lat : -13.5167;
      const oLng = typeof origen_lng === 'number' ? origen_lng : -71.9788;
      const dLat = typeof destino_lat === 'number' ? destino_lat : -13.5356;
      const dLng = typeof destino_lng === 'number' ? destino_lng : -71.9388;

      const tripKm =
        typeof destino_lat === 'number' && typeof destino_lng === 'number'
          ? Math.max(1.5, haversineKm(oLat, oLng, dLat, dLng))
          : destino_texto
          ? Math.max(2.4, Math.min(18, 2.5 + (String(destino_texto).trim().length % 7) * 0.9))
          : 3.2;

      const pickupDistKm = haversineKm(oLat, oLng, unidad.lat, unidad.lng);
      const etaMin = Math.max(2, Math.round(pickupDistKm * 3.8 + 2));
      const montoCentavos = calculateTaxiFareServer(
        unidad.tarifa_base_centavos,
        unidad.tarifa_km_centavos,
        tripKm
      );

      let validPromo: string | null = null;
      if (typeof promotor_codigo === 'string' && promotor_codigo.trim()) {
        const promo = db
          .prepare('SELECT codigo FROM partners_afiliados WHERE codigo = ? AND activo = 1')
          .get(promotor_codigo.trim().toUpperCase()) as { codigo: string } | undefined;
        if (promo) validPromo = promo.codigo;
      }

      const pin = generateOrderPin();
      const { hash, salt } = hashPin(pin);
      const codigo = generateCode('LOG-CUSCO');
      const destinoClean = typeof destino_texto === 'string' && destino_texto.trim()
        ? destino_texto.trim()
        : 'Destino en Cusco';
      const origenClean = typeof origen_texto === 'string' && origen_texto.trim()
        ? origen_texto.trim()
        : 'Ubicación GPS actual';

      const { docTipo, docNum, docVerif, docDireccionFiscal } =
        parseClienteDocumentoInput(req.body || {}, { allowInvoice: false });

      const insertRes = db
        .prepare(`
          INSERT INTO pedidos_ordenes (
            codigo, negocio_id, referido_negocio_id, promotor_codigo, categoria,
            servicio_id, unidad_id, item_nombre, transcripcion, monto_centavos,
            metodo_pago, estado, cliente_nombre, cliente_telefono,
            cliente_documento_tipo, cliente_documento_numero, cliente_documento_verificado,
            cliente_direccion_fiscal, comprobante_tipo,
            origen_texto, destino_texto, origen_lat, origen_lng, destino_lat, destino_lng,
            conductor_lat, conductor_lng, distancia_km, eta_min,
            pin_hash, pin_salt, pin_cifrado, expires_at
          )
          VALUES (?, ?, NULL, ?, 'TRANSPORTE', NULL, ?, ?, ?, ?, ?, 'PENDIENTE_CONFIRMACION', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now', '+45 minutes'))
        `)
        .run(
          codigo,
          unidad.negocio_id,
          validPromo,
          unidad.id,
          `Taxi ${unidad.modelo} (${unidad.placa}) · ${unidad.conductor_nombre}`,
          `Traslado desde ${origenClean} hasta ${destinoClean}`,
          montoCentavos,
          metodo_pago,
          cliente_nombre.trim(),
          cliente_telefono.trim(),
          docTipo,
          docNum,
          docVerif,
          docDireccionFiscal,
          origenClean,
          destinoClean,
          oLat,
          oLng,
          dLat,
          dLng,
          unidad.lat,
          unidad.lng,
          tripKm,
          etaMin,
          hash,
          salt
        );

      logWhatsAppNotification(
        db,
        cliente_telefono.trim(),
        'pedido_recibido',
        codigo,
        `Solicitaste unidad ${unidad.modelo} (${unidad.placa}) hacia ${destinoClean}. Tarifa: S/ ${(montoCentavos / 100).toFixed(2)}. PIN de abordaje: ${pin}.`
      );

      const created = db
        .prepare(`
          SELECT p.*, u.lat AS unidad_lat, u.lng AS unidad_lng, u.conductor_nombre, u.placa, u.modelo
          FROM pedidos_ordenes p
          LEFT JOIN unidades_conductores u ON u.id = p.unidad_id
          WHERE p.id = ?
        `)
        .get(Number(insertRes.lastInsertRowid)) as unknown as PedidoRow;

      void syncOrderPinToFirebaseRtdb(codigo, pin);

      res.status(201).json({
        pedido: sanitizeOrderPublic(created),
        cliente_pin: pin,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/public/pedidos/:codigo', publicLimiter, (req, res, next) => {
    try {
      const codigo = String(req.params.codigo || '').trim().toUpperCase();
      const row = db
        .prepare(`
          SELECT p.*, n.nombre AS negocio_nombre, n.zona AS negocio_zona, n.lat AS negocio_lat, n.lng AS negocio_lng,
                 n.documento_numero AS emisor_ruc, COALESCE(n.razon_social, n.nombre) AS emisor_razon_social, n.zona AS emisor_direccion,
                 u.conductor_nombre, u.placa, u.modelo, u.lat AS unidad_lat, u.lng AS unidad_lng
          FROM pedidos_ordenes p
          JOIN negocios n ON n.id = p.negocio_id
          LEFT JOIN unidades_conductores u ON u.id = p.unidad_id
          WHERE p.codigo = ?
        `)
        .get(codigo) as unknown as (PedidoRow & { cliente_telefono: string }) | undefined;
      if (!row) throw new HttpError(404, 'Pedido no encontrado');

      const mensajes = db
        .prepare(`
          SELECT id, canal, plantilla, mensaje, estado, created_at
          FROM log_procesos_notificaciones
          WHERE pedido_codigo = ?
          ORDER BY id ASC
        `)
        .all(codigo);

      const resena = db
        .prepare('SELECT id, calificacion, comentario, created_at FROM resenas_valoraciones WHERE pedido_id = ?')
        .get(row.id);

      const puntos = db
        .prepare('SELECT puntos FROM usuarios_clientes WHERE telefono = ?')
        .get(row.cliente_telefono) as { puntos: number } | undefined;

      res.json({
        pedido: sanitizeOrderPublic(row),
        notificaciones_whatsapp: mensajes,
        resena: resena || null,
        puntos_cliente: puntos?.puntos ?? 0,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/public/pedidos/:codigo/comprobante', publicLimiter, (req, res, next) => {
    try {
      const codigo = String(req.params.codigo || '').trim().toUpperCase();
      const row = db
        .prepare(`
          SELECT p.*, n.nombre AS negocio_nombre, n.documento_numero AS emisor_ruc,
                 COALESCE(n.razon_social, n.nombre) AS emisor_razon_social, n.zona AS emisor_direccion
          FROM pedidos_ordenes p
          JOIN negocios n ON n.id = p.negocio_id
          WHERE p.codigo = ?
        `)
        .get(codigo) as unknown as
        | (PedidoRow & {
            negocio_nombre: string;
            emisor_ruc: string | null;
            emisor_razon_social: string | null;
            emisor_direccion: string | null;
          })
        | undefined;

      if (!row) throw new HttpError(404, 'Pedido no encontrado');
      if (row.categoria === 'TRANSPORTE') {
        throw new HttpError(
          400,
          'Los servicios de taxi no emiten comprobante electrónico; el documento solo identifica al pasajero.'
        );
      }
      if (row.estado !== 'ENTREGADO_PAGADO') {
        throw new HttpError(
          409,
          'El comprobante electrónico se emite al finalizar y liquidar el pedido'
        );
      }

      res.json({ comprobante: buildComprobantePayload(row) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/public/pedidos/:codigo/cancelar', publicLimiter, (req, res, next) => {
    try {
      const codigo = String(req.params.codigo || '').trim().toUpperCase();
      const { cliente_telefono, motivo } = req.body || {};
      if (typeof cliente_telefono !== 'string' || !cliente_telefono.trim()) {
        throw new HttpError(400, 'Debes indicar el teléfono registrado en el pedido para cancelar');
      }

      const pedido = db
        .prepare('SELECT * FROM pedidos_ordenes WHERE codigo = ?')
        .get(codigo) as unknown as PedidoRow | undefined;
      if (!pedido) throw new HttpError(404, 'Pedido no encontrado');

      if (!timingSafeEqualString(pedido.cliente_telefono.trim(), cliente_telefono.trim())) {
        throw new HttpError(403, 'El teléfono no coincide con el titular del pedido');
      }

      const updated = cancelarPedido(
        db,
        pedido.id,
        typeof motivo === 'string' && motivo.trim() ? motivo.trim() : 'Cancelado por el cliente'
      );
      res.json({ pedido: sanitizeOrderPublic(updated) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/public/pedidos/:codigo/resena', publicLimiter, (req, res, next) => {
    try {
      const codigo = String(req.params.codigo || '').trim().toUpperCase();
      const { cliente_telefono, calificacion, comentario } = req.body || {};
      const pedido = db
        .prepare('SELECT * FROM pedidos_ordenes WHERE codigo = ?')
        .get(codigo) as unknown as PedidoRow | undefined;
      if (!pedido) throw new HttpError(404, 'Pedido no encontrado');
      if (pedido.estado !== 'ENTREGADO_PAGADO') {
        throw new HttpError(409, 'Solo puedes reseñar pedidos entregados y completados');
      }
      if (
        typeof cliente_telefono !== 'string' ||
        !timingSafeEqualString(pedido.cliente_telefono.trim(), cliente_telefono.trim())
      ) {
        throw new HttpError(403, 'Solo el cliente titular del pedido puede dejar una reseña');
      }
      if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
        throw new HttpError(400, 'Calificación debe estar entre 1 y 5');
      }
      if (typeof comentario !== 'string' || comentario.trim().length < 3) {
        throw new HttpError(400, 'Escribe un breve comentario');
      }
      try {
        db.prepare(`
          INSERT INTO resenas_valoraciones (pedido_id, negocio_id, cliente_nombre, calificacion, comentario)
          VALUES (?, ?, ?, ?, ?)
        `).run(pedido.id, pedido.negocio_id, pedido.cliente_nombre, calificacion, comentario.trim());
      } catch {
        throw new HttpError(409, 'Este pedido ya cuenta con una reseña verificada');
      }
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Divisas (público: consultar y bloquear tasa)
  app.get('/api/public/divisas', publicLimiter, (_req, res) => {
    const tasas = db
      .prepare(`
        SELECT a.*, n.nombre AS negocio_nombre, n.zona, n.calificacion
        FROM agentes_cambio a
        JOIN negocios n ON n.id = a.negocio_id
        WHERE n.activo = 1 AND n.rubro = 'CASA_CAMBIO' AND a.disponible = 1
        ORDER BY a.moneda_origen ASC, a.tasa_compra DESC
      `)
      .all();
    res.json({ tasas });
  });

  app.post('/api/public/divisas/reservar', publicLimiter, (req, res, next) => {
    try {
      const { negocio_id, moneda, operacion, monto_origen, cliente_nombre, cliente_telefono } =
        req.body || {};
      if (!Number.isInteger(negocio_id)) throw new HttpError(400, 'negocio_id inválido');
      if (operacion !== 'COMPRA' && operacion !== 'VENTA') {
        throw new HttpError(400, 'Operación debe ser COMPRA o VENTA');
      }
      if (typeof monto_origen !== 'number' || monto_origen <= 0 || monto_origen > 50000) {
        throw new HttpError(400, 'Monto inválido');
      }
      if (typeof cliente_nombre !== 'string' || cliente_nombre.trim().length < 2) {
        throw new HttpError(400, 'Nombre obligatorio');
      }
      if (typeof cliente_telefono !== 'string' || cliente_telefono.trim().length < 6) {
        throw new HttpError(400, 'WhatsApp obligatorio');
      }
      const { docTipo, docNum } = parseClienteDocumentoInput(req.body || {});
      const tasa = db
        .prepare(
          "SELECT * FROM agentes_cambio WHERE negocio_id = ? AND moneda_origen = ? AND moneda_destino = 'PEN' AND disponible = 1"
        )
        .get(negocio_id, String(moneda || 'USD').toUpperCase()) as
        | { tasa_compra: number; tasa_venta: number; moneda_origen: string }
        | undefined;
      if (!tasa) throw new HttpError(404, 'Tasa de cambio no disponible');

      const rate = operacion === 'COMPRA' ? tasa.tasa_compra : tasa.tasa_venta;
      const montoDestino = Math.round(monto_origen * rate * 100) / 100;
      const codigoRetiro = generateCode('CAM-CUSCO');

      db.prepare(`
        INSERT INTO bloqueos_tasas_divisas (negocio_id, codigo_retiro, cliente_nombre, cliente_telefono, moneda, operacion, monto_origen, tasa_aplicada, monto_destino)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        negocio_id,
        codigoRetiro,
        cliente_nombre.trim(),
        cliente_telefono.trim(),
        tasa.moneda_origen,
        operacion,
        monto_origen,
        rate,
        montoDestino
      );

      res.status(201).json({
        codigo_retiro: codigoRetiro,
        moneda: tasa.moneda_origen,
        operacion,
        monto_origen,
        tasa_aplicada: rate,
        monto_destino_pen: montoDestino,
        cliente_documento_tipo: docTipo,
        cliente_documento_numero: docNum,
      });
    } catch (err) {
      next(err);
    }
  });

  // Butacas / Asientos interprovinciales
  app.get('/api/public/butacas', publicLimiter, (_req, res) => {
    const rutas = db
      .prepare(`
        SELECT a.*, n.nombre AS negocio_nombre
        FROM asientos_servicios a
        JOIN negocios n ON n.id = a.negocio_id
        WHERE n.activo = 1
      `)
      .all() as Array<{ id: number }>;

    const reservasStmt = db.prepare(
      "SELECT asiento_numero FROM reservas_citas WHERE asiento_servicio_id = ? AND estado != 'CANCELADO'"
    );
    const enriched = rutas.map((r) => {
      const ocupados = (reservasStmt.all(r.id) as Array<{ asiento_numero: number }>).map(
        (x) => x.asiento_numero
      );
      return { ...r, asientos_ocupados: ocupados };
    });
    res.json({ rutas: enriched });
  });

  app.post('/api/public/butacas/reservar', publicLimiter, (req, res, next) => {
    try {
      const { asiento_servicio_id, asiento_numero, cliente_nombre, cliente_telefono } =
        req.body || {};
      if (!Number.isInteger(asiento_servicio_id) || !Number.isInteger(asiento_numero)) {
        throw new HttpError(400, 'Ruta y número de asiento obligatorios');
      }
      if (typeof cliente_nombre !== 'string' || cliente_nombre.trim().length < 2) {
        throw new HttpError(400, 'Nombre obligatorio');
      }
      if (typeof cliente_telefono !== 'string' || cliente_telefono.trim().length < 6) {
        throw new HttpError(400, 'WhatsApp obligatorio');
      }
      const { docTipo, docNum } = parseClienteDocumentoInput(req.body || {});
      const ruta = db
        .prepare('SELECT * FROM asientos_servicios WHERE id = ?')
        .get(asiento_servicio_id) as
        | { id: number; codigo_ruta: string; ruta: string; total_asientos: number }
        | undefined;
      if (!ruta) throw new HttpError(404, 'Ruta no encontrada');
      if (asiento_numero < 1 || asiento_numero > ruta.total_asientos) {
        throw new HttpError(400, 'Número de asiento fuera de rango');
      }

      const pin = generateOrderPin();
      const { hash, salt } = hashPin(pin);
      try {
        const resInsert = db
          .prepare(`
            INSERT INTO reservas_citas (asiento_servicio_id, asiento_numero, cliente_nombre, cliente_telefono, pin_hash, pin_salt, estado)
            VALUES (?, ?, ?, ?, ?, ?, 'RESERVADO')
          `)
          .run(
            asiento_servicio_id,
            asiento_numero,
            cliente_nombre.trim(),
            cliente_telefono.trim(),
            hash,
            salt
          );

        logWhatsAppNotification(
          db,
          cliente_telefono.trim(),
          'reserva_butaca',
          ruta.codigo_ruta,
          `Butaca #${asiento_numero} confirmada en ${ruta.ruta}. PIN de abordaje: ${pin}.`
        );

        res.status(201).json({
          reserva_id: Number(resInsert.lastInsertRowid),
          codigo_ruta: ruta.codigo_ruta,
          asiento_numero,
          cliente_pin: pin,
          cliente_documento_tipo: docTipo,
          cliente_documento_numero: docNum,
        });
      } catch {
        throw new HttpError(409, `El asiento #${asiento_numero} ya está reservado`);
      }
    } catch (err) {
      next(err);
    }
  });

  const EMERGENCY_STATION_COORDS: Record<
    EntidadEmergencia,
    { lat: number; lng: number; label: string }
  > = {
    SAMU: { lat: -13.5236, lng: -71.9585, label: 'Ambulancia SAMU Cusco 106' },
    SERENAZGO: { lat: -13.5179, lng: -71.9812, label: 'Central Serenazgo Cusco' },
    PNP_105: { lat: -13.5162, lng: -71.9776, label: 'Comisaría Turismo PNP 105' },
    BOMBEROS: { lat: -13.5218, lng: -71.9834, label: 'Cía. Bomberos Santiago N° 116' },
  };

  function resolveStationForUnitLabel(
    unitLabel: string,
    fallbackEntity: EntidadEmergencia
  ): { lat: number; lng: number } {
    const low = unitLabel.toLowerCase();
    if (low.includes('pnp') || low.includes('polic')) return EMERGENCY_STATION_COORDS.PNP_105;
    if (low.includes('bomber')) return EMERGENCY_STATION_COORDS.BOMBEROS;
    if (low.includes('seren')) return EMERGENCY_STATION_COORDS.SERENAZGO;
    if (low.includes('samu') || low.includes('ambul')) return EMERGENCY_STATION_COORDS.SAMU;
    return EMERGENCY_STATION_COORDS[fallbackEntity] || EMERGENCY_STATION_COORDS.SAMU;
  }

  const EMERGENCY_DEFAULT_WHATSAPP: Record<EntidadEmergencia, string> = {
    SAMU: '+51984106106',
    SERENAZGO: '+51984100100',
    PNP_105: '+51984105105',
    BOMBEROS: '+51984116116',
  };

  app.post('/api/public/emergencias/auth', authLimiter, (req, res, next) => {
    try {
      const rawEntidad = String(req.body?.entidad || 'TODOS').trim().toUpperCase();
      const rawPin = String(req.body?.pin || '').trim();
      const validEntities = ['TODOS', ...ENTIDADES_EMERGENCIA];
      if (!validEntities.includes(rawEntidad)) {
        throw new HttpError(400, 'Central de emergencia inválida');
      }
      if (!/^\d{4}$/.test(rawPin)) {
        throw new HttpError(400, 'Ingresa un PIN de 4 dígitos');
      }
      const expectedPin = (process.env.EMERGENCY_PIN || '1234').trim();
      if (!timingSafeEqualString(rawPin, expectedPin)) {
        throw new HttpError(401, 'PIN de central de emergencias incorrecto');
      }
      const token = createSessionToken({ role: 'ADMIN' }, 8 * 60 * 60);
      res.json({
        ok: true,
        entidad: rawEntidad,
        token,
      });
    } catch (err) {
      next(err);
    }
  });

  // Emergencias SOS
  app.post('/api/public/emergencias', publicLimiter, (req, res, next) => {
    try {
      const {
        cliente_nombre,
        cliente_telefono,
        solicitante_nombre,
        solicitante_documento_tipo,
        solicitante_documento_numero,
        herido_nombre,
        ubicacion_texto,
        lat,
        lng,
        mensaje,
        entidad_objetivo,
        entidad_whatsapp,
        sincronizada_todas,
      } = req.body || {};

      const resolvedSolicitante =
        typeof solicitante_nombre === 'string' && solicitante_nombre.trim().length >= 2
          ? solicitante_nombre.trim()
          : typeof cliente_nombre === 'string'
            ? cliente_nombre.trim()
            : '';

      if (resolvedSolicitante.length < 2) {
        throw new HttpError(400, 'Nombre obligatorio');
      }
      if (typeof cliente_telefono !== 'string' || cliente_telefono.trim().length < 6) {
        throw new HttpError(400, 'Teléfono obligatorio');
      }

      const resolvedHerido =
        typeof herido_nombre === 'string' && herido_nombre.trim().length >= 2
          ? herido_nombre.trim()
          : typeof cliente_nombre === 'string' && cliente_nombre.trim().length >= 2
            ? cliente_nombre.trim()
            : resolvedSolicitante;

      let cleanDocTipo: 'DNI' | 'RUC' | 'EXTRANJERO' | null = null;
      let cleanDocNum: string | null = null;
      if (typeof solicitante_documento_numero === 'string' && solicitante_documento_numero.trim()) {
        const rawDoc = solicitante_documento_numero.trim();
        const rawDigits = rawDoc.replace(/\D/g, '');
        const reqT = String(
          solicitante_documento_tipo ||
            (rawDigits.length === 11 ? 'RUC' : /^\d{8}$/.test(rawDigits) ? 'DNI' : 'EXTRANJERO')
        )
          .trim()
          .toUpperCase();
        if (reqT === 'RUC' && isValidRuc(rawDigits)) {
          cleanDocTipo = 'RUC';
          cleanDocNum = rawDigits;
        } else if (reqT === 'DNI' && isValidDni(rawDigits)) {
          cleanDocTipo = 'DNI';
          cleanDocNum = rawDigits;
        } else if (reqT === 'EXTRANJERO' && isValidForeignDoc(rawDoc)) {
          cleanDocTipo = 'EXTRANJERO';
          cleanDocNum = rawDoc.toUpperCase();
        } else {
          throw new HttpError(400, 'Documento de identidad inválido en alerta SOS');
        }
      }

      const rawEntidad = String(entidad_objetivo || 'SAMU').trim().toUpperCase();
      const targetEntity: EntidadEmergencia = (ENTIDADES_EMERGENCIA as readonly string[]).includes(rawEntidad)
        ? (rawEntidad as EntidadEmergencia)
        : 'SAMU';

      const resolvedEntityWhatsapp =
        typeof entidad_whatsapp === 'string' && entidad_whatsapp.trim().length >= 6
          ? entidad_whatsapp.trim().slice(0, 24)
          : EMERGENCY_DEFAULT_WHATSAPP[targetEntity];

      const emLat = typeof lat === 'number' && Number.isFinite(lat) ? lat : -13.5167;
      const emLng = typeof lng === 'number' && Number.isFinite(lng) ? lng : -71.9788;
      const syncAll = sincronizada_todas === false || sincronizada_todas === 0 ? 0 : 1;

      const codigo = generateCode('SOS-CUSCO');
      const resInsert = db
        .prepare(`
          INSERT INTO alertas_emergencias (
            codigo, cliente_nombre, cliente_telefono, solicitante_documento_tipo, solicitante_documento_numero,
            solicitante_nombre, herido_nombre, ubicacion_texto, lat, lng, mensaje, entidad_objetivo,
            estado, sincronizada_todas
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVA', ?)
        `)
        .run(
          codigo,
          resolvedHerido,
          cliente_telefono.trim(),
          cleanDocTipo,
          cleanDocNum,
          resolvedSolicitante,
          resolvedHerido,
          typeof ubicacion_texto === 'string' && ubicacion_texto.trim()
            ? ubicacion_texto.trim()
            : `${emLat.toFixed(5)}, ${emLng.toFixed(5)}`,
          emLat,
          emLng,
          typeof mensaje === 'string' && mensaje.trim() ? mensaje.trim() : 'Asistencia inmediata requerida',
          targetEntity,
          syncAll
        );

      const mapsLink = `https://www.google.com/maps?q=${emLat.toFixed(6)},${emLng.toFixed(6)}`;
      logWhatsAppNotification(
        db,
        resolvedEntityWhatsapp,
        'alerta_sos_central',
        codigo,
        `🚨 SOS ${codigo} (${targetEntity}). Solicitante: ${resolvedSolicitante} (${cliente_telefono.trim()}). Herido: ${resolvedHerido}. Maps: ${mapsLink}`
      );
      logWhatsAppNotification(
        db,
        cliente_telefono.trim(),
        'alerta_sos',
        codigo,
        `Alerta ${codigo} enviada a ${targetEntity} (${resolvedEntityWhatsapp}). Herido: ${resolvedHerido}. Ubicación: ${mapsLink}`
      );

      void syncSnapshotToFirebaseRtdb(db);

      const created = db
        .prepare(
          `SELECT id, codigo, cliente_nombre, cliente_telefono, solicitante_documento_tipo, solicitante_documento_numero,
                  solicitante_nombre, herido_nombre, ubicacion_texto, lat, lng, mensaje, entidad_objetivo,
                  estado, atendida_por, unidad_lat, unidad_lng, distancia_km, eta_min, sincronizada_todas, created_at
           FROM alertas_emergencias WHERE codigo = ?`
        )
        .get(codigo);

      res.status(201).json({
        id: Number(resInsert.lastInsertRowid),
        codigo,
        entidad_objetivo: targetEntity,
        entidad_whatsapp: resolvedEntityWhatsapp,
        estado: 'ACTIVA',
        emergencia: created,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/public/emergencias', publicLimiter, (_req, res) => {
    const emergencias = db
      .prepare(`
        SELECT id, codigo, cliente_nombre, cliente_telefono, solicitante_documento_tipo, solicitante_documento_numero,
               solicitante_nombre, herido_nombre, ubicacion_texto, lat, lng, mensaje, entidad_objetivo,
               estado, atendida_por, unidad_lat, unidad_lng, distancia_km, eta_min, sincronizada_todas, created_at
        FROM alertas_emergencias
        ORDER BY id DESC
        LIMIT 50
      `)
      .all();
    res.json({ emergencias });
  });

  app.post('/api/public/emergencias/:codigo/despachar', publicLimiter, (req, res, next) => {
    try {
      const codigo = String(req.params.codigo || '').trim().toUpperCase();
      const { atendida_por, unidad_lat, unidad_lng } = req.body || {};
      const unidad =
        typeof atendida_por === 'string' && atendida_por.trim()
          ? atendida_por.trim().slice(0, 80)
          : 'Cía. Bomberos Santiago N° 116';

      const existing = db
        .prepare('SELECT id, codigo, estado, entidad_objetivo, lat, lng, cliente_telefono FROM alertas_emergencias WHERE codigo = ?')
        .get(codigo) as
        | {
            id: number;
            codigo: string;
            estado: string;
            entidad_objetivo: EntidadEmergencia;
            lat: number | null;
            lng: number | null;
            cliente_telefono: string | null;
          }
        | undefined;
      if (!existing) {
        throw new HttpError(404, 'Alerta de emergencia no encontrada');
      }

      const fallbackCoords = resolveStationForUnitLabel(unidad, existing.entidad_objetivo || 'SAMU');
      const uLat = typeof unidad_lat === 'number' && Number.isFinite(unidad_lat) ? unidad_lat : fallbackCoords.lat;
      const uLng = typeof unidad_lng === 'number' && Number.isFinite(unidad_lng) ? unidad_lng : fallbackCoords.lng;
      const tLat = existing.lat ?? -13.5167;
      const tLng = existing.lng ?? -71.9788;
      const distKm = Number(Math.max(0.2, haversineKm(uLat, uLng, tLat, tLng)).toFixed(2));
      const etaMin = Math.max(1, Math.round(distKm * 2.4 + 1));

      db.prepare(`
        UPDATE alertas_emergencias
        SET estado = 'ATENDIDA', atendida_por = ?, unidad_lat = ?, unidad_lng = ?, distancia_km = ?, eta_min = ?
        WHERE codigo = ?
      `).run(unidad, uLat, uLng, distKm, etaMin, codigo);

      if (existing.cliente_telefono) {
        logWhatsAppNotification(
          db,
          existing.cliente_telefono,
          'despacho_sos',
          codigo,
          `Auxilio ${codigo} aceptado por ${unidad}. Unidad en ruta (${distKm} km · ETA ${etaMin} min).`
        );
      }

      void syncSnapshotToFirebaseRtdb(db);

      const updated = db
        .prepare(
          `SELECT id, codigo, cliente_nombre, cliente_telefono, solicitante_documento_tipo, solicitante_documento_numero,
                  solicitante_nombre, herido_nombre, ubicacion_texto, lat, lng, mensaje, entidad_objetivo,
                  estado, atendida_por, unidad_lat, unidad_lng, distancia_km, eta_min, sincronizada_todas, created_at
           FROM alertas_emergencias WHERE codigo = ?`
        )
        .get(codigo);

      res.json({ ok: true, emergencia: updated });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/public/emergencias/:codigo/ubicacion', publicLimiter, (req, res, next) => {
    try {
      const codigo = String(req.params.codigo || '').trim().toUpperCase();
      const { unidad_lat, unidad_lng } = req.body || {};
      if (typeof unidad_lat !== 'number' || typeof unidad_lng !== 'number' || !Number.isFinite(unidad_lat) || !Number.isFinite(unidad_lng)) {
        throw new HttpError(400, 'Coordenadas GPS de unidad inválidas');
      }

      const existing = db
        .prepare('SELECT id, codigo, lat, lng FROM alertas_emergencias WHERE codigo = ?')
        .get(codigo) as { id: number; codigo: string; lat: number | null; lng: number | null } | undefined;
      if (!existing) {
        throw new HttpError(404, 'Alerta de emergencia no encontrada');
      }

      const tLat = existing.lat ?? -13.5167;
      const tLng = existing.lng ?? -71.9788;
      const distKm = Number(Math.max(0.05, haversineKm(unidad_lat, unidad_lng, tLat, tLng)).toFixed(2));
      const etaMin = distKm <= 0.12 ? 1 : Math.max(1, Math.round(distKm * 2.4 + 1));

      db.prepare(`
        UPDATE alertas_emergencias
        SET unidad_lat = ?, unidad_lng = ?, distancia_km = ?, eta_min = ?
        WHERE codigo = ?
      `).run(unidad_lat, unidad_lng, distKm, etaMin, codigo);

      void syncSnapshotToFirebaseRtdb(db);

      const updated = db
        .prepare(
          `SELECT id, codigo, cliente_nombre, cliente_telefono, solicitante_documento_tipo, solicitante_documento_numero,
                  solicitante_nombre, herido_nombre, ubicacion_texto, lat, lng, mensaje, entidad_objetivo,
                  estado, atendida_por, unidad_lat, unidad_lng, distancia_km, eta_min, sincronizada_todas, created_at
           FROM alertas_emergencias WHERE codigo = ?`
        )
        .get(codigo);

      res.json({ ok: true, emergencia: updated });
    } catch (err) {
      next(err);
    }
  });

  // Webhook WhatsApp Business Cloud API (Meta)
  app.get('/api/whatsapp/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
    if (mode === 'subscribe' && expected && typeof token === 'string' && timingSafeEqualString(token, expected)) {
      res.status(200).send(String(challenge || ''));
      return;
    }
    res.status(403).json({ error: 'Token de verificación inválido' });
  });

  app.post('/api/whatsapp/webhook', publicLimiter, async (req, res, next) => {
    try {
      const text = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;
      const from = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || '+51000000000';
      if (typeof text === 'string' && text.trim()) {
        const search = await runConciergeSearch(db, { query: text });
        logWhatsAppNotification(db, String(from), 'respuesta_asistente', null, search.respuesta_voz);
        res.json({ ok: true, respuesta: search.respuesta_voz, categoria: search.categoria });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Auto-registro de nuevo negocio multirubro en La Chuspa (incluye diseño IA multi-rubro)
  app.post('/api/public/negocios/registro', authLimiter, (req, res, next) => {
    try {
      const {
        rubro,
        nombre,
        telefono,
        zona,
        lat,
        lng,
        descripcion,
        pin,
        tipo_persona,
        documento_tipo,
        documento_numero,
        razon_social,
        tipo_negocio,
        modalidades_venta,
        panel_ia,
        panel_ia_json,
        catalogo_inicial,
      } = req.body || {};
      if (!RUBROS.includes(rubro)) throw new HttpError(400, 'Rubro inválido');
      if (typeof nombre !== 'string' || nombre.trim().length < 2) {
        throw new HttpError(400, 'Nombre comercial obligatorio');
      }
      if (typeof telefono !== 'string' || telefono.trim().length < 6) {
        throw new HttpError(400, 'Teléfono WhatsApp obligatorio');
      }
      const cleanPin = String(pin || '').trim();
      if (!/^\d{4}$/.test(cleanPin)) {
        throw new HttpError(400, 'Define un PIN numérico de 4 dígitos');
      }

      const nextPersona = tipo_persona === 'NATURAL' ? 'NATURAL' : 'JURIDICA';
      const nextDocTipo = documento_tipo === 'DNI' || nextPersona === 'NATURAL' ? 'DNI' : 'RUC';
      let nextDocNum: string | null = null;
      if (documento_numero && String(documento_numero).trim()) {
        const cleanDoc = String(documento_numero).trim();
        if (nextDocTipo === 'DNI' && !isValidDni(cleanDoc)) {
          throw new HttpError(400, 'DNI del titular inválido (8 dígitos)');
        }
        if (nextDocTipo === 'RUC' && !isValidRuc(cleanDoc)) {
          throw new HttpError(400, 'RUC del negocio inválido según dígito verificador SUNAT');
        }
        nextDocNum = cleanDoc;
      }

      const nextTipoNegocio =
        typeof tipo_negocio === 'string' && tipo_negocio.trim()
          ? tipo_negocio.trim().slice(0, 80)
          : 'Comercio Multirubro';
      const nextModalidades = Array.isArray(modalidades_venta)
        ? modalidades_venta.map(String).filter(Boolean).join(',') || 'Unidad,Servicio'
        : typeof modalidades_venta === 'string' && modalidades_venta.trim()
          ? modalidades_venta.trim().slice(0, 320)
          : 'Unidad,Servicio';

      const nextLat =
        typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : -13.5167;
      const nextLng =
        typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180
          ? lng
          : -71.9788;

      const rawPanelObj =
        panel_ia && typeof panel_ia === 'object'
          ? panel_ia
          : typeof panel_ia_json === 'string'
            ? safeParseJson(panel_ia_json)
            : null;
      const nextPanelJson = rawPanelObj ? JSON.stringify(rawPanelObj) : null;

      const codigo = generateCode(`NEG-${rubro.slice(0, 2)}`);
      const { hash, salt } = hashPin(cleanPin);

      const insertRes = db
        .prepare(`
          INSERT INTO negocios (
            codigo, rubro, nombre, telefono, descripcion, lat, lng, zona, en_linea, activo, saldo, saldo_retenido,
            tipo_persona, documento_tipo, documento_numero, razon_social, tipo_negocio, modalidades_venta, panel_ia_json, estado_regla
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, 0, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO')
        `)
        .run(
          codigo,
          rubro,
          nombre.trim(),
          telefono.trim(),
          typeof descripcion === 'string' && descripcion.trim()
            ? descripcion.trim()
            : `Negocio verificado en ${nextTipoNegocio} en Cusco`,
          nextLat,
          nextLng,
          typeof zona === 'string' && zona.trim() ? zona.trim() : 'Centro Histórico, Cusco',
          nextPersona,
          nextDocTipo,
          nextDocNum,
          typeof razon_social === 'string' && razon_social.trim() ? razon_social.trim().slice(0, 140) : null,
          nextTipoNegocio,
          nextModalidades,
          nextPanelJson
        );
      const id = Number(insertRes.lastInsertRowid);
      db.prepare('INSERT INTO seguridad_credenciales (negocio_id, pin_hash, pin_salt) VALUES (?, ?, ?)').run(
        id,
        hash,
        salt
      );

      // Si el agente IA generó catálogo inicial, poblar servicios_catalogo automáticamente
      const starterItems: Array<Record<string, any>> = Array.isArray(catalogo_inicial)
        ? catalogo_inicial
        : Array.isArray((rawPanelObj as Record<string, any> | null)?.catalogo_inicial)
          ? ((rawPanelObj as Record<string, any>).catalogo_inicial as Array<Record<string, any>>)
          : [];

      if (starterItems.length > 0 && rubro !== 'TRANSPORTE' && rubro !== 'CASA_CAMBIO') {
        const insertServ = db.prepare(`
          INSERT INTO servicios_catalogo (
            negocio_id, categoria, nombre, descripcion, precio_centavos, duracion_min, stock, unidad_medida, atributos_json, disponible
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `);
        for (const item of starterItems.slice(0, 12)) {
          const itemName = typeof item?.nombre === 'string' ? item.nombre.trim().slice(0, 120) : '';
          const itemPrice = Math.round(Number(item?.precio_centavos) || 0);
          if (itemName.length >= 2 && itemPrice > 0) {
            const attrJson =
              item?.atributos && typeof item.atributos === 'object'
                ? JSON.stringify(item.atributos)
                : null;
            insertServ.run(
              id,
              rubro,
              itemName,
              typeof item?.descripcion === 'string' ? item.descripcion.trim().slice(0, 260) : '',
              itemPrice,
              Math.max(5, Math.round(Number(item?.duracion_min) || 30)),
              Math.max(1, Math.round(Number(item?.stock) || 20)),
              typeof item?.unidad_medida === 'string' && item.unidad_medida.trim()
                ? item.unidad_medida.trim().slice(0, 64)
                : 'Unidad',
              attrJson
            );
          }
        }
      }

      const negocio = db.prepare('SELECT * FROM negocios WHERE id = ?').get(id) as unknown as NegocioRow;
      const token = createSessionToken({
        role: 'NEGOCIO',
        negocioId: negocio.id,
        rubro: negocio.rubro,
      });

      void syncNegocioPinToFirebaseRtdb(negocio.codigo, cleanPin);

      res.status(201).json({
        token,
        negocio: {
          ...negocio,
          en_linea: negocio.en_linea === 1,
          abierto_24h: negocio.abierto_24h === 1,
          auto_aceptar_pedidos: negocio.auto_aceptar_pedidos === 1,
          alerta_voz_activa: negocio.alerta_voz_activa === 1,
          panel_ia: safeParseJson(negocio.panel_ia_json),
          saldo_libre: negocio.saldo - negocio.saldo_retenido,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // =========================================================================
  // 2. RUTAS DE NEGOCIO / PRESTADOR (Autenticación con PIN 4 dígitos + JWT)
  // =========================================================================
  app.post('/api/negocio/login', authLimiter, (req, res, next) => {
    try {
      const { negocio_id, codigo, pin } = req.body || {};
      if (typeof pin !== 'string' || !/^\d{4}$/.test(pin.trim())) {
        throw new HttpError(400, 'Ingresa tu PIN de 4 dígitos');
      }

      const negocio = (
        Number.isInteger(negocio_id)
          ? db.prepare('SELECT * FROM negocios WHERE id = ?').get(negocio_id)
          : typeof codigo === 'string'
          ? db.prepare('SELECT * FROM negocios WHERE codigo = ?').get(codigo.trim().toUpperCase())
          : undefined
      ) as unknown as NegocioRow | undefined;

      if (!negocio) {
        throw new HttpError(401, 'Credenciales inválidas');
      }
      if (!negocio.activo) {
        const regla = negocio.estado_regla && negocio.estado_regla !== 'ACTIVO' ? negocio.estado_regla : 'INCUMPLIMIENTO';
        const detalle = negocio.motivo_estado ? `: ${negocio.motivo_estado}` : ' por administración';
        throw new HttpError(403, `Negocio suspendido (${regla})${detalle}`);
      }

      const cred = db
        .prepare('SELECT * FROM seguridad_credenciales WHERE negocio_id = ?')
        .get(negocio.id) as
        | {
            negocio_id: number;
            pin_hash: string;
            pin_salt: string;
            intentos_fallidos: number;
            bloqueado_hasta: string | null;
          }
        | undefined;
      if (!cred) {
        throw new HttpError(401, 'Credenciales no configuradas');
      }

      if (cred.bloqueado_hasta && new Date(cred.bloqueado_hasta).getTime() > Date.now()) {
        throw new HttpError(
          423,
          'PIN bloqueado por seguridad tras 3 intentos fallidos. Solicita desbloqueo al administrador.'
        );
      }

      const ok = verifyPin(pin.trim(), cred.pin_hash, cred.pin_salt);
      if (!ok) {
        const intentos = cred.intentos_fallidos + 1;
        const bloqueadoHasta =
          intentos >= 3 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
        db.prepare(`
          UPDATE seguridad_credenciales
          SET intentos_fallidos = ?, bloqueado_hasta = ?
          WHERE negocio_id = ?
        `).run(intentos, bloqueadoHasta, negocio.id);

        db.prepare(`
          INSERT INTO seguridad_auditoria (actor_tipo, actor_id, accion, detalle, ip)
          VALUES ('NEGOCIO', ?, 'LOGIN_FALLIDO', ?, ?)
        `).run(String(negocio.id), `Intento ${intentos}/3`, req.ip || '');

        if (intentos >= 3) {
          throw new HttpError(
            423,
            'PIN bloqueado durante 15 minutos tras 3 intentos fallidos.'
          );
        }
        throw new HttpError(401, `PIN incorrecto (${intentos}/3)`);
      }

      db.prepare(
        'UPDATE seguridad_credenciales SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE negocio_id = ?'
      ).run(negocio.id);

      const token = createSessionToken({
        role: 'NEGOCIO',
        negocioId: negocio.id,
        rubro: negocio.rubro,
      });

      res.json({
        token,
        negocio: {
          id: negocio.id,
          codigo: negocio.codigo,
          rubro: negocio.rubro,
          nombre: negocio.nombre,
          zona: negocio.zona,
          en_linea: negocio.en_linea === 1,
          saldo: negocio.saldo,
          saldo_retenido: negocio.saldo_retenido,
          saldo_libre: negocio.saldo - negocio.saldo_retenido,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/negocio/:negocioId/resumen', requireBusinessAuth, (req: AuthedRequest, res, next) => {
    try {
      const negocioId = Number(req.params.negocioId);
      const negocio = db.prepare('SELECT * FROM negocios WHERE id = ?').get(negocioId) as unknown as
        | NegocioRow
        | undefined;
      if (!negocio) throw new HttpError(404, 'Negocio no encontrado');

      const movimientos = db
        .prepare(
          "SELECT * FROM ledger_movimientos WHERE cuenta_tipo = 'NEGOCIO' AND negocio_id = ? ORDER BY id DESC LIMIT 40"
        )
        .all(negocioId);
      const recargas = db
        .prepare('SELECT * FROM negocios_recargas WHERE negocio_id = ? ORDER BY id DESC LIMIT 20')
        .all(negocioId);
      const rawServicios = db
        .prepare('SELECT * FROM servicios_catalogo WHERE negocio_id = ? AND categoria = ? ORDER BY id DESC')
        .all(negocioId, negocio.rubro) as Array<Record<string, unknown>>;
      const servicios = rawServicios.map((s) => ({
        ...s,
        atributos: safeParseJson(s.atributos_json),
      }));
      const unidades =
        negocio.rubro === 'TRANSPORTE'
          ? db.prepare('SELECT * FROM unidades_conductores WHERE negocio_id = ?').all(negocioId)
          : [];
      const tasas =
        negocio.rubro === 'CASA_CAMBIO'
          ? db.prepare('SELECT * FROM agentes_cambio WHERE negocio_id = ?').all(negocioId)
          : [];
      const regla = db
        .prepare('SELECT * FROM reglas_comision WHERE rubro = ?')
        .get(negocio.rubro);

      res.json({
        negocio: {
          ...negocio,
          en_linea: negocio.en_linea === 1,
          abierto_24h: negocio.abierto_24h === 1,
          auto_aceptar_pedidos: negocio.auto_aceptar_pedidos === 1,
          alerta_voz_activa: negocio.alerta_voz_activa === 1,
          panel_ia: safeParseJson(negocio.panel_ia_json),
          saldo_libre: negocio.saldo - negocio.saldo_retenido,
        },
        regla_comision: regla,
        facturacion_apisperu_activa:
          negocio.rubro === 'TRANSPORTE'
            ? false
            : isApisperuBillingConfigured(getLocalDevApiConfig().tokenFacturacionApisperu),
        movimientos,
        recargas,
        servicios,
        unidades,
        tasas,
      });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/negocio/:negocioId/estado', requireBusinessAuth, (req: AuthedRequest, res, next) => {
    try {
      const negocioId = Number(req.params.negocioId);
      const enLinea = req.body?.en_linea ? 1 : 0;
      db.prepare('UPDATE negocios SET en_linea = ? WHERE id = ?').run(enLinea, negocioId);
      res.json({ ok: true, en_linea: enLinea === 1 });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/negocio/:negocioId/configuracion', requireBusinessAuth, (req: AuthedRequest, res, next) => {
    try {
      const negocioId = Number(req.params.negocioId);
      const current = db.prepare('SELECT * FROM negocios WHERE id = ?').get(negocioId) as unknown as
        | NegocioRow
        | undefined;
      if (!current) throw new HttpError(404, 'Negocio no encontrado');

      const {
        nombre,
        telefono,
        descripcion,
        zona,
        lat,
        lng,
        en_linea,
        horario_apertura,
        horario_cierre,
        abierto_24h,
        metodos_pago_aceptados,
        auto_aceptar_pedidos,
        alerta_voz_activa,
        tarifa_minima_centavos,
        radio_cobertura_km,
        tipo_persona,
        documento_tipo,
        documento_numero,
        razon_social,
        tipo_negocio,
        modalidades_venta,
        panel_ia,
        panel_ia_json,
      } = req.body || {};

      const nextNombre =
        typeof nombre === 'string' && nombre.trim().length >= 2 ? nombre.trim().slice(0, 120) : current.nombre;
      const nextTel =
        typeof telefono === 'string' && telefono.trim().length >= 6
          ? telefono.trim().slice(0, 32)
          : current.telefono;
      const nextDesc =
        typeof descripcion === 'string' ? descripcion.trim().slice(0, 500) : current.descripcion;
      const nextZona =
        typeof zona === 'string' && zona.trim().length >= 2 ? zona.trim().slice(0, 140) : current.zona;
      const nextLat = typeof lat === 'number' && Number.isFinite(lat) ? lat : current.lat;
      const nextLng = typeof lng === 'number' && Number.isFinite(lng) ? lng : current.lng;
      const nextEnLinea = typeof en_linea === 'boolean' ? (en_linea ? 1 : 0) : current.en_linea;
      const nextOpen =
        typeof horario_apertura === 'string' && /^\d{2}:\d{2}$/.test(horario_apertura)
          ? horario_apertura
          : current.horario_apertura || '07:00';
      const nextClose =
        typeof horario_cierre === 'string' && /^\d{2}:\d{2}$/.test(horario_cierre)
          ? horario_cierre
          : current.horario_cierre || '22:30';
      const next24h =
        typeof abierto_24h === 'boolean' ? (abierto_24h ? 1 : 0) : current.abierto_24h ?? 0;
      const nextMetodos =
        typeof metodos_pago_aceptados === 'string' && metodos_pago_aceptados.trim()
          ? metodos_pago_aceptados.trim().slice(0, 120)
          : current.metodos_pago_aceptados || 'Yape,Plin,Efectivo,Tarjeta';
      const nextAuto =
        typeof auto_aceptar_pedidos === 'boolean'
          ? auto_aceptar_pedidos
            ? 1
            : 0
          : current.auto_aceptar_pedidos ?? 0;
      const nextVoz =
        typeof alerta_voz_activa === 'boolean'
          ? alerta_voz_activa
            ? 1
            : 0
          : current.alerta_voz_activa ?? 1;
      const nextTarifaMin =
        Number.isInteger(tarifa_minima_centavos) && tarifa_minima_centavos >= 100
          ? Math.min(500000, tarifa_minima_centavos)
          : current.tarifa_minima_centavos ?? 600;
      const nextRadio =
        typeof radio_cobertura_km === 'number' && radio_cobertura_km >= 1 && radio_cobertura_km <= 80
          ? Number(radio_cobertura_km.toFixed(1))
          : current.radio_cobertura_km ?? 8.0;

      const nextPersona =
        tipo_persona === 'NATURAL' || tipo_persona === 'JURIDICA'
          ? tipo_persona
          : current.tipo_persona || 'JURIDICA';
      const nextDocTipo =
        documento_tipo === 'DNI' || documento_tipo === 'RUC'
          ? documento_tipo
          : nextPersona === 'NATURAL'
            ? 'DNI'
            : 'RUC';
      let nextDocNumero = current.documento_numero ?? null;
      if (documento_numero !== undefined) {
        const cleanDoc = String(documento_numero || '').trim();
        if (!cleanDoc) {
          nextDocNumero = null;
        } else {
          if (nextDocTipo === 'DNI' && !isValidDni(cleanDoc)) {
            throw new HttpError(400, 'DNI inválido (debe tener 8 dígitos)');
          }
          if (nextDocTipo === 'RUC' && !isValidRuc(cleanDoc)) {
            throw new HttpError(400, 'RUC inválido según dígito verificador SUNAT');
          }
          nextDocNumero = cleanDoc;
        }
      }
      const nextRazonSocial =
        typeof razon_social === 'string'
          ? razon_social.trim().slice(0, 140) || null
          : current.razon_social ?? null;
      const nextTipoNegocio =
        typeof tipo_negocio === 'string' && tipo_negocio.trim()
          ? tipo_negocio.trim().slice(0, 80)
          : current.tipo_negocio || 'Comercio Multirubro';
      const nextModalidades = Array.isArray(modalidades_venta)
        ? modalidades_venta.map(String).filter(Boolean).join(',') || 'Unidad,Servicio'
        : typeof modalidades_venta === 'string' && modalidades_venta.trim()
          ? modalidades_venta.trim().slice(0, 320)
          : current.modalidades_venta || 'Unidad,Servicio';

      let nextPanelJson = current.panel_ia_json ?? null;
      if (panel_ia && typeof panel_ia === 'object') {
        nextPanelJson = JSON.stringify(panel_ia);
      } else if (typeof panel_ia_json === 'string' && panel_ia_json.trim()) {
        nextPanelJson = panel_ia_json;
      }

      db.prepare(`
        UPDATE negocios
        SET nombre = ?, telefono = ?, descripcion = ?, zona = ?, lat = ?, lng = ?, en_linea = ?,
            horario_apertura = ?, horario_cierre = ?, abierto_24h = ?, metodos_pago_aceptados = ?,
            auto_aceptar_pedidos = ?, alerta_voz_activa = ?, tarifa_minima_centavos = ?, radio_cobertura_km = ?,
            tipo_persona = ?, documento_tipo = ?, documento_numero = ?, razon_social = ?,
            tipo_negocio = ?, modalidades_venta = ?, panel_ia_json = ?
        WHERE id = ?
      `).run(
        nextNombre,
        nextTel,
        nextDesc,
        nextZona,
        nextLat,
        nextLng,
        nextEnLinea,
        nextOpen,
        nextClose,
        next24h,
        nextMetodos,
        nextAuto,
        nextVoz,
        nextTarifaMin,
        nextRadio,
        nextPersona,
        nextDocTipo,
        nextDocNumero,
        nextRazonSocial,
        nextTipoNegocio,
        nextModalidades,
        nextPanelJson,
        negocioId
      );

      const updated = db.prepare('SELECT * FROM negocios WHERE id = ?').get(negocioId) as unknown as NegocioRow;
      res.json({
        ok: true,
        negocio: {
          ...updated,
          en_linea: updated.en_linea === 1,
          abierto_24h: updated.abierto_24h === 1,
          auto_aceptar_pedidos: updated.auto_aceptar_pedidos === 1,
          alerta_voz_activa: updated.alerta_voz_activa === 1,
          panel_ia: safeParseJson(updated.panel_ia_json),
          saldo_libre: updated.saldo - updated.saldo_retenido,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/negocio/:negocioId/pin', requireBusinessAuth, (req: AuthedRequest, res, next) => {
    try {
      const negocioId = Number(req.params.negocioId);
      const pinActual = String(req.body?.pin_actual || '').trim();
      const pinNuevo = String(req.body?.pin_nuevo || '').trim();
      if (!/^\d{4}$/.test(pinActual) || !/^\d{4}$/.test(pinNuevo)) {
        throw new HttpError(400, 'Ambos PIN deben tener exactamente 4 dígitos numéricos');
      }
      const cred = db
        .prepare('SELECT pin_hash, pin_salt FROM seguridad_credenciales WHERE negocio_id = ?')
        .get(negocioId) as { pin_hash: string; pin_salt: string } | undefined;
      if (!cred || !verifyPin(pinActual, cred.pin_hash, cred.pin_salt)) {
        throw new HttpError(401, 'El PIN actual es incorrecto');
      }
      const { hash, salt } = hashPin(pinNuevo);
      db.prepare(
        'UPDATE seguridad_credenciales SET pin_hash = ?, pin_salt = ?, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE negocio_id = ?'
      ).run(hash, salt, negocioId);
      db.prepare(`
        INSERT INTO seguridad_auditoria (actor_tipo, actor_id, accion, detalle, ip)
        VALUES ('NEGOCIO', ?, 'CAMBIO_PIN', 'PIN actualizado desde panel de configuración', ?)
      `).run(String(negocioId), req.ip || '');
      const bizRow = db.prepare('SELECT codigo FROM negocios WHERE id = ?').get(negocioId) as
        | { codigo: string }
        | undefined;
      if (bizRow?.codigo) {
        void syncNegocioPinToFirebaseRtdb(bizRow.codigo, pinNuevo);
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/negocio/:negocioId/pedidos', requireBusinessAuth, (req: AuthedRequest, res, next) => {
    try {
      const negocioId = Number(req.params.negocioId);
      const negocio = db.prepare('SELECT * FROM negocios WHERE id = ?').get(negocioId) as unknown as
        | NegocioRow
        | undefined;
      if (!negocio) throw new HttpError(404, 'Negocio no encontrado');

      const rol = String(req.query.rol || 'TODOS').toUpperCase();
      let rows: PedidoRow[];
      if (rol === 'PRESTADOR') {
        // ESTRICTA SEPARACIÓN POR CATEGORÍA: Solo pedidos de su propio rubro y negocio
        rows = db
          .prepare(`
            SELECT p.*, ref.nombre AS referidor_nombre,
                   prov.documento_numero AS emisor_ruc,
                   COALESCE(prov.razon_social, prov.nombre) AS emisor_razon_social,
                   prov.zona AS emisor_direccion,
                   u.lat AS unidad_lat, u.lng AS unidad_lng,
                   u.conductor_nombre, u.placa, u.modelo
            FROM pedidos_ordenes p
            JOIN negocios prov ON prov.id = p.negocio_id
            LEFT JOIN negocios ref ON ref.id = p.referido_negocio_id
            LEFT JOIN unidades_conductores u ON u.id = p.unidad_id
            WHERE p.negocio_id = ? AND p.categoria = ?
            ORDER BY p.id DESC
          `)
          .all(negocioId, negocio.rubro) as unknown as PedidoRow[];
      } else if (rol === 'REFERIDOR') {
        rows = db
          .prepare(`
            SELECT p.*, prov.nombre AS prestador_nombre,
                   prov.documento_numero AS emisor_ruc,
                   COALESCE(prov.razon_social, prov.nombre) AS emisor_razon_social,
                   prov.zona AS emisor_direccion,
                   u.lat AS unidad_lat, u.lng AS unidad_lng,
                   u.conductor_nombre, u.placa, u.modelo
            FROM pedidos_ordenes p
            JOIN negocios prov ON prov.id = p.negocio_id
            LEFT JOIN unidades_conductores u ON u.id = p.unidad_id
            WHERE p.referido_negocio_id = ?
            ORDER BY p.id DESC
          `)
          .all(negocioId) as unknown as PedidoRow[];
      } else {
        rows = db
          .prepare(`
            SELECT p.*, prov.nombre AS prestador_nombre, ref.nombre AS referidor_nombre,
                   prov.documento_numero AS emisor_ruc,
                   COALESCE(prov.razon_social, prov.nombre) AS emisor_razon_social,
                   prov.zona AS emisor_direccion,
                   u.lat AS unidad_lat, u.lng AS unidad_lng,
                   u.conductor_nombre, u.placa, u.modelo
            FROM pedidos_ordenes p
            JOIN negocios prov ON prov.id = p.negocio_id
            LEFT JOIN negocios ref ON ref.id = p.referido_negocio_id
            LEFT JOIN unidades_conductores u ON u.id = p.unidad_id
            WHERE (p.negocio_id = ? AND p.categoria = ?) OR p.referido_negocio_id = ?
            ORDER BY p.id DESC
          `)
          .all(negocioId, negocio.rubro, negocioId) as unknown as PedidoRow[];
      }

      const sanitized = rows.map((r) =>
        sanitizeOrderForBusiness(r as unknown as Record<string, unknown>, negocioId)
      );
      res.json({ pedidos: sanitized });
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/api/negocio/:negocioId/pedidos/:pedidoId/aceptar',
    requireBusinessAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const pedidoId = Number(req.params.pedidoId);
        const updated = aceptarPedido(db, pedidoId, negocioId);
        res.json({
          pedido: sanitizeOrderForBusiness(updated as unknown as Record<string, unknown>, negocioId),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/negocio/:negocioId/pedidos/:pedidoId/rechazar',
    requireBusinessAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const pedidoId = Number(req.params.pedidoId);
        const pedido = db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedidoId) as unknown as
          | PedidoRow
          | undefined;
        if (!pedido) throw new HttpError(404, 'Pedido no encontrado');
        if (pedido.negocio_id !== negocioId) {
          throw new HttpError(403, 'Este pedido pertenece a otro negocio');
        }
        if (pedido.estado !== 'PENDIENTE_CONFIRMACION') {
          throw new HttpError(409, 'Solo puedes rechazar pedidos pendientes de confirmación');
        }
        const updated = cancelarPedido(
          db,
          pedidoId,
          typeof req.body?.motivo === 'string' && req.body.motivo.trim()
            ? req.body.motivo.trim()
            : 'Rechazado por el prestador'
        );
        res.json({
          pedido: sanitizeOrderForBusiness(updated as unknown as Record<string, unknown>, negocioId),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/negocio/:negocioId/pedidos/:pedidoId/validar-pin',
    requireBusinessAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const pedidoId = Number(req.params.pedidoId);
        const { pin } = req.body || {};
        const result = validarSoloPin(db, pedidoId, negocioId, String(pin || ''));
        res.json({
          ok: true,
          pedido: sanitizeOrderForBusiness(result.pedido as unknown as Record<string, unknown>, negocioId),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.patch(
    '/api/negocio/:negocioId/pedidos/:pedidoId/etapa',
    requireBusinessAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const pedidoId = Number(req.params.pedidoId);
        const etapaRaw = String(req.body?.etapa || '').toUpperCase();
        if (etapaRaw !== 'EN_RUTA_DESTINO' && etapaRaw !== 'LLEGADO_DESTINO') {
          throw new HttpError(400, 'Etapa inválida (usa EN_RUTA_DESTINO o LLEGADO_DESTINO)');
        }
        const updated = actualizarEtapaViaje(
          db,
          pedidoId,
          negocioId,
          etapaRaw as 'EN_RUTA_DESTINO' | 'LLEGADO_DESTINO'
        );
        res.json({
          ok: true,
          pedido: sanitizeOrderForBusiness(updated as unknown as Record<string, unknown>, negocioId),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/negocio/:negocioId/pedidos/:pedidoId/finalizar-viaje',
    requireBusinessAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const pedidoId = Number(req.params.pedidoId);
        const pin = req.body?.pin ? String(req.body.pin) : undefined;
        const result = finalizarViajeConfirmado(db, pedidoId, negocioId, pin);
        res.json({
          ok: true,
          pedido: sanitizeOrderForBusiness(result.pedido as unknown as Record<string, unknown>, negocioId),
          puntos_otorgados: result.puntosGanados,
          comprobante: null,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/negocio/:negocioId/pedidos/:pedidoId/entregar',
    requireBusinessAuth,
    async (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const pedidoId = Number(req.params.pedidoId);
        const { pin } = req.body || {};
        const result = validarPinYEntregar(db, pedidoId, negocioId, String(pin || ''));
        const issuer = db
          .prepare(
            'SELECT nombre AS negocio_nombre, documento_numero AS emisor_ruc, COALESCE(razon_social, nombre) AS emisor_razon_social, zona AS emisor_direccion FROM negocios WHERE id = ?'
          )
          .get(result.pedido.negocio_id) as
          | {
              negocio_nombre: string;
              emisor_ruc: string | null;
              emisor_razon_social: string | null;
              emisor_direccion: string | null;
            }
          | undefined;
        let enriched = {
          ...result.pedido,
          negocio_nombre: issuer?.negocio_nombre,
          emisor_ruc: issuer?.emisor_ruc || null,
          emisor_razon_social: issuer?.emisor_razon_social || null,
          emisor_direccion: issuer?.emisor_direccion || null,
        };

        let comprobantePayload: ReturnType<typeof buildComprobantePayload> | null = null;
        if (enriched.categoria !== 'TRANSPORTE') {
          const initialComp = buildComprobantePayload(enriched);
          const devCfg = await resolveDevApiConfig();
          const apisperuRes = await enviarComprobanteApisperu(
            enriched.categoria,
            initialComp,
            devCfg.tokenFacturacionApisperu
          );
          db.prepare(
            'UPDATE pedidos_ordenes SET comprobante_hash = ?, comprobante_sunat_estado = ? WHERE id = ?'
          ).run(apisperuRes.hash, apisperuRes.estado, enriched.id);
          enriched = {
            ...enriched,
            comprobante_hash: apisperuRes.hash,
            comprobante_sunat_estado: apisperuRes.estado,
          };
          comprobantePayload = buildComprobantePayload(enriched);
        }

        res.json({
          pedido: sanitizeOrderForBusiness(enriched as unknown as Record<string, unknown>, negocioId),
          puntos_otorgados: result.puntosGanados,
          comprobante: comprobantePayload,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/negocio/:negocioId/pedidos/:pedidoId/emitir-sunat',
    requireBusinessAuth,
    async (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const pedidoId = Number(req.params.pedidoId);
        const row = db
          .prepare(`
            SELECT p.*, n.nombre AS negocio_nombre, n.documento_numero AS emisor_ruc,
                   COALESCE(n.razon_social, n.nombre) AS emisor_razon_social, n.zona AS emisor_direccion
            FROM pedidos_ordenes p
            JOIN negocios n ON n.id = p.negocio_id
            WHERE p.id = ?
          `)
          .get(pedidoId) as unknown as
          | (PedidoRow & {
              negocio_nombre: string;
              emisor_ruc: string | null;
              emisor_razon_social: string | null;
              emisor_direccion: string | null;
            })
          | undefined;

        if (!row) throw new HttpError(404, 'Pedido no encontrado');
        if (row.negocio_id !== negocioId) throw new HttpError(403, 'Sin permiso');
        if (row.categoria === 'TRANSPORTE') {
          throw new HttpError(
            400,
            'La facturación electrónica está deshabilitada para servicios de taxi.'
          );
        }
        if (row.estado !== 'ENTREGADO_PAGADO') {
          throw new HttpError(
            409,
            'Solo puedes emitir comprobante SUNAT cuando el pedido esté entregado y liquidado.'
          );
        }

        const comp = buildComprobantePayload(row);
        const devCfg = await resolveDevApiConfig();
        const apisperuRes = await enviarComprobanteApisperu(
          row.categoria,
          comp,
          devCfg.tokenFacturacionApisperu
        );
        db.prepare(
          'UPDATE pedidos_ordenes SET comprobante_hash = ?, comprobante_sunat_estado = ? WHERE id = ?'
        ).run(apisperuRes.hash, apisperuRes.estado, row.id);

        const updatedComp = buildComprobantePayload({
          ...row,
          comprobante_hash: apisperuRes.hash,
          comprobante_sunat_estado: apisperuRes.estado,
        });
        res.json({
          ok: true,
          enviado_apisperu: apisperuRes.sent,
          mensaje: apisperuRes.mensaje || null,
          comprobante: updatedComp,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/negocio/:negocioId/pedidos/:pedidoId/contraoferta',
    requireBusinessAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const pedidoId = Number(req.params.pedidoId);
        const { monto_centavos } = req.body || {};
        if (!Number.isInteger(monto_centavos) || monto_centavos < 500 || monto_centavos > 500000) {
          throw new HttpError(400, 'Contraoferta inválida (mínimo S/ 5.00)');
        }
        const pedido = db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedidoId) as unknown as
          | PedidoRow
          | undefined;
        if (!pedido) throw new HttpError(404, 'Pedido no encontrado');
        if (pedido.negocio_id !== negocioId) throw new HttpError(403, 'Sin permiso');
        if (pedido.categoria !== 'TRANSPORTE' || pedido.estado !== 'PENDIENTE_CONFIRMACION') {
          throw new HttpError(409, 'Solo disponible en traslados pendientes');
        }
        db.prepare(
          "UPDATE pedidos_ordenes SET contraoferta_centavos = ?, monto_centavos = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(monto_centavos, monto_centavos, pedidoId);
        res.json({ ok: true, monto_centavos });
      } catch (err) {
        next(err);
      }
    }
  );

  // Reservas referidas (ej: taxista reserva guía de turismo)
  app.get(
    '/api/negocio/:negocioId/guias-disponibles',
    requireBusinessAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const tours = db
          .prepare(`
            SELECT s.id AS servicio_id, s.negocio_id, s.categoria, s.nombre, s.descripcion, s.precio_centavos, s.duracion_min,
                   n.nombre AS negocio_nombre, n.zona, n.calificacion
            FROM servicios_catalogo s
            JOIN negocios n ON n.id = s.negocio_id
            WHERE n.rubro = 'TURISMO' AND s.categoria = 'TURISMO' AND n.activo = 1 AND n.en_linea = 1 AND s.disponible = 1 AND n.id != ?
            ORDER BY s.precio_centavos ASC
          `)
          .all(negocioId);
        res.json({ guias: tours });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/negocio/:negocioId/reservas-referidas',
    requireBusinessAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const referidorId = Number(req.params.negocioId);
        const {
          negocio_destino_id,
          servicio_id,
          cliente_nombre,
          cliente_telefono,
          fecha_hora_reserva,
          metodo_pago,
        } = req.body || {};

        if (!Number.isInteger(negocio_destino_id) || !Number.isInteger(servicio_id)) {
          throw new HttpError(400, 'negocio_destino_id y servicio_id son obligatorios');
        }
        if (negocio_destino_id === referidorId) {
          throw new HttpError(400, 'Un negocio no puede referirse a sí mismo');
        }
        if (typeof cliente_nombre !== 'string' || cliente_nombre.trim().length < 2) {
          throw new HttpError(400, 'Nombre del turista obligatorio');
        }
        if (typeof cliente_telefono !== 'string' || cliente_telefono.trim().length < 6) {
          throw new HttpError(400, 'WhatsApp del turista obligatorio');
        }

        const prestador = db
          .prepare('SELECT * FROM negocios WHERE id = ? AND activo = 1')
          .get(negocio_destino_id) as unknown as NegocioRow | undefined;
        if (!prestador) throw new HttpError(404, 'Negocio prestador no encontrado');

        const item = db
          .prepare(
            'SELECT * FROM servicios_catalogo WHERE id = ? AND negocio_id = ? AND categoria = ? AND disponible = 1'
          )
          .get(servicio_id, prestador.id, prestador.rubro) as
          | { id: number; nombre: string; precio_centavos: number; duracion_min: number }
          | undefined;
        if (!item) {
          throw new HttpError(400, 'Servicio no pertenece al prestador indicado');
        }

        const pago = METODOS_PAGO.includes(metodo_pago as MetodoPago) ? metodo_pago : 'Efectivo';
        const pin = generateOrderPin();
        const { hash, salt } = hashPin(pin);
        const pinCifrado = encryptOrderPin(pin);
        const codigo = generateCode('REF-CUSCO');

        const insertRes = db
          .prepare(`
            INSERT INTO pedidos_ordenes (
              codigo, negocio_id, referido_negocio_id, categoria, servicio_id,
              item_nombre, transcripcion, monto_centavos, metodo_pago, estado,
              cliente_nombre, cliente_telefono, eta_min, fecha_hora_reserva,
              pin_hash, pin_salt, pin_cifrado, expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE_CONFIRMACION', ?, ?, ?, ?, ?, ?, ?, datetime('now', '+12 hours'))
          `)
          .run(
            codigo,
            prestador.id,
            referidorId,
            prestador.rubro,
            item.id,
            item.nombre,
            `Reserva referida por socio #${referidorId}`,
            item.precio_centavos,
            pago,
            cliente_nombre.trim(),
            cliente_telefono.trim(),
            item.duracion_min,
            typeof fecha_hora_reserva === 'string' && fecha_hora_reserva.trim()
              ? fecha_hora_reserva.trim()
              : 'Hoy · Próxima salida',
            hash,
            salt,
            pinCifrado
          );

        logWhatsAppNotification(
          db,
          cliente_telefono.trim(),
          'reserva_referida',
          codigo,
          `Tu reserva ${codigo} (${item.nombre}) con ${prestador.nombre} fue solicitada.`
        );

        const created = db
          .prepare('SELECT * FROM pedidos_ordenes WHERE id = ?')
          .get(Number(insertRes.lastInsertRowid)) as unknown as PedidoRow;

        void syncOrderPinToFirebaseRtdb(codigo, pin);

        // NUNCA devolver el PIN al referidor en la respuesta
        res.status(201).json({
          pedido: sanitizeOrderForBusiness(
            created as unknown as Record<string, unknown>,
            referidorId
          ),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post('/api/negocio/:negocioId/recargas', requireBusinessAuth, (req: AuthedRequest, res, next) => {
    try {
      const negocioId = Number(req.params.negocioId);
      const { monto_centavos, metodo, codigo_operacion } = req.body || {};
      if (!METODOS_RECARGA.includes(metodo as MetodoRecarga)) {
        throw new HttpError(400, 'Método de recarga inválido (Yape, Plin o Transferencia)');
      }
      const recarga = solicitarRecarga(
        db,
        negocioId,
        Number(monto_centavos),
        metodo as MetodoRecarga,
        String(codigo_operacion || '')
      );
      res.status(201).json({ recarga });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/negocio/:negocioId/servicios', requireBusinessAuth, (req: AuthedRequest, res, next) => {
    try {
      const negocioId = Number(req.params.negocioId);
      const negocio = db.prepare('SELECT * FROM negocios WHERE id = ?').get(negocioId) as unknown as NegocioRow;
      const { nombre, descripcion, precio_centavos, duracion_min, stock, unidad_medida, atributos } = req.body || {};
      if (typeof nombre !== 'string' || nombre.trim().length < 2) {
        throw new HttpError(400, 'Nombre del servicio obligatorio');
      }
      if (!Number.isInteger(precio_centavos) || precio_centavos <= 0) {
        throw new HttpError(400, 'Precio inválido');
      }
      const nextUnidad =
        typeof unidad_medida === 'string' && unidad_medida.trim()
          ? unidad_medida.trim().slice(0, 64)
          : 'Unidad';
      const attrJson =
        atributos && typeof atributos === 'object' && !Array.isArray(atributos)
          ? JSON.stringify(atributos)
          : null;
      const insertRes = db
        .prepare(`
          INSERT INTO servicios_catalogo (
            negocio_id, categoria, nombre, descripcion, precio_centavos, duracion_min, stock, unidad_medida, atributos_json, disponible
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `)
        .run(
          negocioId,
          negocio.rubro,
          nombre.trim(),
          typeof descripcion === 'string' ? descripcion.trim() : '',
          precio_centavos,
          Number.isInteger(duracion_min) ? duracion_min : 30,
          Number.isInteger(stock) ? stock : 20,
          nextUnidad,
          attrJson
        );
      const createdRow = db
        .prepare('SELECT * FROM servicios_catalogo WHERE id = ?')
        .get(Number(insertRes.lastInsertRowid)) as Record<string, unknown>;
      res.status(201).json({
        servicio: {
          ...createdRow,
          atributos: safeParseJson(createdRow.atributos_json),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.patch(
    '/api/negocio/:negocioId/servicios/:servicioId',
    requireBusinessAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const servicioId = Number(req.params.servicioId);
        const negocio = db.prepare('SELECT * FROM negocios WHERE id = ?').get(negocioId) as unknown as NegocioRow;
        const item = db
          .prepare('SELECT * FROM servicios_catalogo WHERE id = ? AND negocio_id = ? AND categoria = ?')
          .get(servicioId, negocioId, negocio.rubro);
        if (!item) throw new HttpError(404, 'Servicio no encontrado en este negocio');

        const { nombre, descripcion, duracion_min, stock, disponible, precio_centavos, unidad_medida, atributos } = req.body || {};
        if (stock !== undefined && (!Number.isInteger(stock) || stock < 0)) {
          throw new HttpError(400, 'Stock inválido');
        }
        if (precio_centavos !== undefined && (!Number.isInteger(precio_centavos) || precio_centavos <= 0)) {
          throw new HttpError(400, 'Precio inválido');
        }
        const attrJson =
          atributos && typeof atributos === 'object' && !Array.isArray(atributos)
            ? JSON.stringify(atributos)
            : null;
        db.prepare(`
          UPDATE servicios_catalogo
          SET nombre = COALESCE(?, nombre),
              descripcion = COALESCE(?, descripcion),
              duracion_min = COALESCE(?, duracion_min),
              stock = COALESCE(?, stock),
              disponible = COALESCE(?, disponible),
              precio_centavos = COALESCE(?, precio_centavos),
              unidad_medida = COALESCE(?, unidad_medida),
              atributos_json = COALESCE(?, atributos_json)
          WHERE id = ? AND negocio_id = ? AND categoria = ?
        `).run(
          typeof nombre === 'string' && nombre.trim().length >= 2 ? nombre.trim() : null,
          typeof descripcion === 'string' ? descripcion.trim() : null,
          Number.isInteger(duracion_min) && duracion_min > 0 ? duracion_min : null,
          stock ?? null,
          disponible === undefined ? null : disponible ? 1 : 0,
          precio_centavos ?? null,
          typeof unidad_medida === 'string' && unidad_medida.trim() ? unidad_medida.trim().slice(0, 64) : null,
          attrJson,
          servicioId,
          negocioId,
          negocio.rubro
        );
        const updatedRow = db
          .prepare('SELECT * FROM servicios_catalogo WHERE id = ?')
          .get(servicioId) as Record<string, unknown>;
        res.json({
          servicio: {
            ...updatedRow,
            atributos: safeParseJson(updatedRow.atributos_json),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.delete(
    '/api/negocio/:negocioId/servicios/:servicioId',
    requireBusinessAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const servicioId = Number(req.params.servicioId);
        const used = db
          .prepare("SELECT id FROM pedidos_ordenes WHERE servicio_id = ? AND estado IN ('PENDIENTE_CONFIRMACION','CONFIRMADO_PREPARACION')")
          .get(servicioId);
        if (used) {
          throw new HttpError(409, 'Este servicio tiene pedidos en curso; desactívalo en lugar de eliminarlo');
        }
        db.prepare('DELETE FROM servicios_catalogo WHERE id = ? AND negocio_id = ?').run(
          servicioId,
          negocioId
        );
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  // Gestión completa de unidades / taxis del negocio de TRANSPORTE
  app.post('/api/negocio/:negocioId/unidades', requireBusinessAuth, (req: AuthedRequest, res, next) => {
    try {
      const negocioId = Number(req.params.negocioId);
      const negocio = db.prepare('SELECT * FROM negocios WHERE id = ?').get(negocioId) as unknown as NegocioRow;
      if (!negocio || negocio.rubro !== 'TRANSPORTE') {
        throw new HttpError(400, 'Solo negocios de Transporte pueden registrar unidades');
      }
      const {
        conductor_nombre,
        placa,
        modelo,
        color,
        tarifa_base_centavos,
        tarifa_km_centavos,
      } = req.body || {};
      if (typeof conductor_nombre !== 'string' || conductor_nombre.trim().length < 2) {
        throw new HttpError(400, 'Nombre del conductor obligatorio');
      }
      const cleanPlaca = String(placa || '').trim().toUpperCase();
      if (cleanPlaca.length < 5) {
        throw new HttpError(400, 'Placa vehicular válida obligatoria');
      }
      if (typeof modelo !== 'string' || modelo.trim().length < 2) {
        throw new HttpError(400, 'Modelo de vehículo obligatorio');
      }
      const base = Number.isInteger(tarifa_base_centavos) ? tarifa_base_centavos : 600;
      const km = Number.isInteger(tarifa_km_centavos) ? tarifa_km_centavos : 220;
      if (base < 200 || km < 50) {
        throw new HttpError(400, 'Tarifas inválidas');
      }
      const insertRes = db
        .prepare(`
          INSERT INTO unidades_conductores (
            negocio_id, conductor_nombre, placa, modelo, color,
            tarifa_base_centavos, tarifa_km_centavos, lat, lng, estado, certificada
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISPONIBLE', 1)
        `)
        .run(
          negocioId,
          conductor_nombre.trim(),
          cleanPlaca,
          modelo.trim(),
          typeof color === 'string' && color.trim() ? color.trim() : 'Plata',
          base,
          km,
          negocio.lat,
          negocio.lng
        );
      res.status(201).json({
        unidad: db
          .prepare('SELECT * FROM unidades_conductores WHERE id = ?')
          .get(Number(insertRes.lastInsertRowid)),
      });
    } catch (err) {
      next(err);
    }
  });

  app.patch(
    '/api/negocio/:negocioId/unidades/:unidadId',
    requireBusinessAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const unidadId = Number(req.params.unidadId);
        const unit = db
          .prepare('SELECT * FROM unidades_conductores WHERE id = ? AND negocio_id = ?')
          .get(unidadId, negocioId);
        if (!unit) throw new HttpError(404, 'Unidad no encontrada en este negocio');

        const {
          conductor_nombre,
          modelo,
          color,
          tarifa_base_centavos,
          tarifa_km_centavos,
          estado,
          lat,
          lng,
        } = req.body || {};

        const validEstados = ['DISPONIBLE', 'OCUPADO', 'FUERA_SERVICIO'];
        if (estado !== undefined && !validEstados.includes(String(estado))) {
          throw new HttpError(400, 'Estado vehicular inválido');
        }
        if (tarifa_base_centavos !== undefined && (!Number.isInteger(tarifa_base_centavos) || tarifa_base_centavos < 200)) {
          throw new HttpError(400, 'Tarifa base inválida');
        }
        if (tarifa_km_centavos !== undefined && (!Number.isInteger(tarifa_km_centavos) || tarifa_km_centavos < 50)) {
          throw new HttpError(400, 'Tarifa por km inválida');
        }
        const validLat =
          typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null;
        const validLng =
          typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null;

        db.prepare(`
          UPDATE unidades_conductores
          SET conductor_nombre = COALESCE(?, conductor_nombre),
              modelo = COALESCE(?, modelo),
              color = COALESCE(?, color),
              tarifa_base_centavos = COALESCE(?, tarifa_base_centavos),
              tarifa_km_centavos = COALESCE(?, tarifa_km_centavos),
              estado = COALESCE(?, estado),
              lat = COALESCE(?, lat),
              lng = COALESCE(?, lng)
          WHERE id = ? AND negocio_id = ?
        `).run(
          typeof conductor_nombre === 'string' && conductor_nombre.trim() ? conductor_nombre.trim() : null,
          typeof modelo === 'string' && modelo.trim() ? modelo.trim() : null,
          typeof color === 'string' && color.trim() ? color.trim() : null,
          tarifa_base_centavos ?? null,
          tarifa_km_centavos ?? null,
          estado ?? null,
          validLat,
          validLng,
          unidadId,
          negocioId
        );

        if (validLat !== null && validLng !== null) {
          db.prepare(`
            UPDATE pedidos_ordenes
            SET conductor_lat = ?, conductor_lng = ?, updated_at = datetime('now')
            WHERE unidad_id = ? AND estado IN ('PENDIENTE_CONFIRMACION', 'CONFIRMADO_PREPARACION')
          `).run(validLat, validLng, unidadId);
        }

        res.json({
          unidad: db.prepare('SELECT * FROM unidades_conductores WHERE id = ?').get(unidadId),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.delete(
    '/api/negocio/:negocioId/unidades/:unidadId',
    requireBusinessAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const unidadId = Number(req.params.unidadId);
        const active = db
          .prepare("SELECT id FROM pedidos_ordenes WHERE unidad_id = ? AND estado IN ('PENDIENTE_CONFIRMACION','CONFIRMADO_PREPARACION')")
          .get(unidadId);
        if (active) {
          throw new HttpError(409, 'La unidad tiene viajes activos; cámbiala a FUERA_SERVICIO');
        }
        db.prepare('DELETE FROM unidades_conductores WHERE id = ? AND negocio_id = ?').run(
          unidadId,
          negocioId
        );
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post('/api/negocio/:negocioId/divisas', requireBusinessAuth, (req: AuthedRequest, res, next) => {
    try {
      const negocioId = Number(req.params.negocioId);
      const negocio = db.prepare('SELECT * FROM negocios WHERE id = ?').get(negocioId) as unknown as NegocioRow;
      if (!negocio || negocio.rubro !== 'CASA_CAMBIO') {
        throw new HttpError(400, 'Solo casas de cambio pueden registrar monedas');
      }
      const monedaOrigen = String(req.body?.moneda_origen || '').trim().toUpperCase();
      const tasaCompra = Number(req.body?.tasa_compra);
      const tasaVenta = Number(req.body?.tasa_venta);
      if (monedaOrigen.length !== 3) throw new HttpError(400, 'Moneda debe ser código de 3 letras (ej. USD, EUR)');
      if (!Number.isFinite(tasaCompra) || tasaCompra <= 0 || !Number.isFinite(tasaVenta) || tasaVenta <= 0) {
        throw new HttpError(400, 'Tasas de compra y venta inválidas');
      }
      db.prepare(`
        INSERT INTO agentes_cambio (negocio_id, moneda_origen, moneda_destino, tasa_compra, tasa_venta, disponible)
        VALUES (?, ?, 'PEN', ?, ?, 1)
        ON CONFLICT(negocio_id, moneda_origen, moneda_destino) DO UPDATE SET
          tasa_compra = excluded.tasa_compra,
          tasa_venta = excluded.tasa_venta,
          disponible = 1,
          updated_at = datetime('now')
      `).run(negocioId, monedaOrigen, tasaCompra, tasaVenta);

      res.status(201).json({
        tasa: db
          .prepare("SELECT * FROM agentes_cambio WHERE negocio_id = ? AND moneda_origen = ? AND moneda_destino = 'PEN'")
          .get(negocioId, monedaOrigen),
      });
    } catch (err) {
      next(err);
    }
  });

  // Ruta autenticada para actualizar tasas de cambio (Cierre de pendiente sección 13)
  app.patch(
    '/api/negocio/:negocioId/divisas/:tasaId',
    requireBusinessAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const tasaId = Number(req.params.tasaId);
        const { tasa_compra, tasa_venta, disponible } = req.body || {};
        const tasa = db
          .prepare('SELECT * FROM agentes_cambio WHERE id = ? AND negocio_id = ?')
          .get(tasaId, negocioId);
        if (!tasa) throw new HttpError(404, 'Tasa de cambio no encontrada para este negocio');
        if (tasa_compra !== undefined && (typeof tasa_compra !== 'number' || tasa_compra <= 0)) {
          throw new HttpError(400, 'Tasa de compra inválida');
        }
        if (tasa_venta !== undefined && (typeof tasa_venta !== 'number' || tasa_venta <= 0)) {
          throw new HttpError(400, 'Tasa de venta inválida');
        }
        db.prepare(`
          UPDATE agentes_cambio
          SET tasa_compra = COALESCE(?, tasa_compra),
              tasa_venta = COALESCE(?, tasa_venta),
              disponible = COALESCE(?, disponible),
              updated_at = datetime('now')
          WHERE id = ? AND negocio_id = ?
        `).run(
          tasa_compra ?? null,
          tasa_venta ?? null,
          disponible === undefined ? null : disponible ? 1 : 0,
          tasaId,
          negocioId
        );
        res.json({
          tasa: db.prepare('SELECT * FROM agentes_cambio WHERE id = ?').get(tasaId),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Ruta autenticada para validar abordaje de butaca con PIN (Cierre de pendiente sección 13)
  app.post(
    '/api/negocio/:negocioId/butacas/:reservaId/validar',
    requireBusinessAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const reservaId = Number(req.params.reservaId);
        const { pin } = req.body || {};
        const reserva = db
          .prepare(`
            SELECT r.*, a.negocio_id
            FROM reservas_citas r
            JOIN asientos_servicios a ON a.id = r.asiento_servicio_id
            WHERE r.id = ?
          `)
          .get(reservaId) as
          | { id: number; negocio_id: number; pin_hash: string; pin_salt: string; estado: string }
          | undefined;
        if (!reserva) throw new HttpError(404, 'Reserva de asiento no encontrada');
        if (reserva.negocio_id !== negocioId) throw new HttpError(403, 'Sin permiso');
        if (!verifyPin(String(pin || '').trim(), reserva.pin_hash, reserva.pin_salt)) {
          throw new HttpError(400, 'PIN de butaca incorrecto');
        }
        db.prepare("UPDATE reservas_citas SET estado = 'ABORDO' WHERE id = ?").run(reservaId);
        res.json({ ok: true, estado: 'ABORDO' });
      } catch (err) {
        next(err);
      }
    }
  );

  // =========================================================================
  // 3. RUTAS DE ADMINISTRADOR LA CHUSPA
  // =========================================================================
  app.get('/api/admin/bootstrap-status', (_req, res) => {
    const envPinSet = Boolean(process.env.SUPERADMIN_PIN?.trim());
    const claimed = db.prepare('SELECT id FROM admin_config WHERE id = 1').get();
    res.json({
      configured: envPinSet || Boolean(claimed),
      requires_claim: !envPinSet && !claimed,
    });
  });

  app.post('/api/admin/bootstrap-claim', authLimiter, (req, res, next) => {
    try {
      if (process.env.NODE_ENV === 'production' || process.env.SUPERADMIN_PIN?.trim()) {
        throw new HttpError(403, 'Configuración de administrador gestionada por entorno');
      }
      const existing = db.prepare('SELECT id FROM admin_config WHERE id = 1').get();
      if (existing) {
        throw new HttpError(409, 'El PIN maestro ya fue configurado');
      }
      const pin = String(req.body?.pin || '').trim();
      if (pin.length < 4 || pin.length > 32) {
        throw new HttpError(400, 'El PIN maestro debe tener entre 4 y 32 caracteres');
      }
      const { hash, salt } = hashPin(pin);
      db.prepare('INSERT INTO admin_config (id, pin_hash, pin_salt) VALUES (1, ?, ?)').run(
        hash,
        salt
      );
      const token = createSessionToken({ role: 'ADMIN' });
      res.status(201).json({ token });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/admin/login', authLimiter, (req, res, next) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const ipRow = db
        .prepare('SELECT * FROM admin_ip_intentos WHERE ip = ?')
        .get(ip) as
        | { ip: string; intentos_fallidos: number; bloqueado_hasta: string | null }
        | undefined;

      if (ipRow?.bloqueado_hasta && new Date(ipRow.bloqueado_hasta).getTime() > Date.now()) {
        throw new HttpError(423, 'Acceso de administrador bloqueado temporalmente por intentos fallidos');
      }

      const pin = String(req.body?.pin || '').trim();
      if (!pin) throw new HttpError(400, 'Ingresa el PIN maestro');

      const envPin = process.env.SUPERADMIN_PIN?.trim();
      let valid = false;
      if (envPin) {
        valid = timingSafeEqualString(pin, envPin);
      } else {
        const claimed = db
          .prepare('SELECT pin_hash, pin_salt FROM admin_config WHERE id = 1')
          .get() as { pin_hash: string; pin_salt: string } | undefined;
        if (!claimed) {
          throw new HttpError(409, 'Configura primero el PIN maestro del sistema');
        }
        valid = verifyPin(pin, claimed.pin_hash, claimed.pin_salt);
      }

      if (!valid) {
        const intentos = (ipRow?.intentos_fallidos || 0) + 1;
        const bloqueadoHasta =
          intentos >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
        db.prepare(`
          INSERT INTO admin_ip_intentos (ip, intentos_fallidos, bloqueado_hasta)
          VALUES (?, ?, ?)
          ON CONFLICT(ip) DO UPDATE SET
            intentos_fallidos = excluded.intentos_fallidos,
            bloqueado_hasta = excluded.bloqueado_hasta
        `).run(ip, intentos, bloqueadoHasta);

        if (intentos >= 5) {
          throw new HttpError(423, 'Demasiados intentos fallidos. IP bloqueada por 15 minutos.');
        }
        throw new HttpError(401, `PIN maestro incorrecto (${intentos}/5)`);
      }

      db.prepare('DELETE FROM admin_ip_intentos WHERE ip = ?').run(ip);
      const token = createSessionToken({ role: 'ADMIN' });
      res.json({ token });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/admin/panel', requireAdminAuth, (_req, res) => {
    const recargas = db
      .prepare(`
        SELECT r.*, n.nombre AS negocio_nombre, n.codigo AS negocio_codigo, n.rubro
        FROM negocios_recargas r
        JOIN negocios n ON n.id = r.negocio_id
        ORDER BY CASE WHEN r.estado = 'PENDIENTE' THEN 0 ELSE 1 END, r.id DESC
        LIMIT 80
      `)
      .all();

    const negocios = db
      .prepare(`
        SELECT n.*, s.intentos_fallidos, s.bloqueado_hasta
        FROM negocios n
        LEFT JOIN seguridad_credenciales s ON s.negocio_id = n.id
        ORDER BY n.id ASC
      `)
      .all() as unknown as Array<NegocioRow & { intentos_fallidos: number; bloqueado_hasta: string | null }>;

    const reglas = db.prepare('SELECT * FROM reglas_comision ORDER BY rubro').all();
    const unidades = db
      .prepare(`
        SELECT u.*, n.nombre AS negocio_nombre
        FROM unidades_conductores u
        JOIN negocios n ON n.id = u.negocio_id
        ORDER BY u.id ASC
      `)
      .all();
    const emergencias = db
      .prepare('SELECT * FROM alertas_emergencias ORDER BY CASE WHEN estado = \'ACTIVA\' THEN 0 ELSE 1 END, id DESC LIMIT 40')
      .all();
    const partners = db
      .prepare(`
        SELECT p.*, COALESCE(SUM(pc.monto_centavos), 0) AS comision_acumulada_centavos, COUNT(pc.id) AS pedidos_atribuidos
        FROM partners_afiliados p
        LEFT JOIN partner_comisiones pc ON pc.partner_id = p.id
        GROUP BY p.id
        ORDER BY p.id DESC
      `)
      .all();
    const auditoria = auditarLibroContable(db);

    res.json({
      recargas,
      negocios: negocios.map((n) => ({
        ...n,
        saldo_libre: n.saldo - n.saldo_retenido,
        bloqueado: Boolean(n.bloqueado_hasta && new Date(n.bloqueado_hasta).getTime() > Date.now()),
      })),
      reglas_comision: reglas,
      unidades,
      emergencias,
      partners,
      auditoria,
    });
  });

  app.post('/api/admin/negocios', requireAdminAuth, (req, res, next) => {
    try {
      const {
        rubro,
        nombre,
        telefono,
        zona,
        descripcion,
        tipo_persona,
        documento_tipo,
        documento_numero,
        razon_social,
        tipo_negocio,
        modalidades_venta,
      } = req.body || {};
      if (!RUBROS.includes(rubro)) throw new HttpError(400, 'Rubro inválido');
      if (typeof nombre !== 'string' || nombre.trim().length < 2) {
        throw new HttpError(400, 'Nombre obligatorio');
      }
      if (typeof telefono !== 'string' || telefono.trim().length < 6) {
        throw new HttpError(400, 'Teléfono obligatorio');
      }

      const nextPersona = tipo_persona === 'NATURAL' ? 'NATURAL' : 'JURIDICA';
      const nextDocTipo = documento_tipo === 'DNI' || nextPersona === 'NATURAL' ? 'DNI' : 'RUC';
      let nextDocNum: string | null = null;
      if (documento_numero && String(documento_numero).trim()) {
        const cleanDoc = String(documento_numero).trim();
        if (nextDocTipo === 'DNI' && !isValidDni(cleanDoc)) {
          throw new HttpError(400, 'DNI inválido (8 dígitos)');
        }
        if (nextDocTipo === 'RUC' && !isValidRuc(cleanDoc)) {
          throw new HttpError(400, 'RUC inválido según dígito verificador SUNAT');
        }
        nextDocNum = cleanDoc;
      }

      const nextTipoNegocio =
        typeof tipo_negocio === 'string' && tipo_negocio.trim()
          ? tipo_negocio.trim().slice(0, 80)
          : 'Comercio Multirubro';
      const nextModalidades = Array.isArray(modalidades_venta)
        ? modalidades_venta.map(String).filter(Boolean).join(',') || 'Unidad,Servicio'
        : typeof modalidades_venta === 'string' && modalidades_venta.trim()
          ? modalidades_venta.trim().slice(0, 160)
          : 'Unidad,Servicio';

      const codigo = generateCode(`NEG-${rubro.slice(0, 2)}`);
      const pinInicial = generateOrderPin();
      const { hash, salt } = hashPin(pinInicial);

      const insertRes = db
        .prepare(`
          INSERT INTO negocios (
            codigo, rubro, nombre, telefono, descripcion, lat, lng, zona, en_linea, activo, saldo, saldo_retenido,
            tipo_persona, documento_tipo, documento_numero, razon_social, tipo_negocio, modalidades_venta, estado_regla
          )
          VALUES (?, ?, ?, ?, ?, -13.5167, -71.9788, ?, 1, 1, 0, 0, ?, ?, ?, ?, ?, ?, 'ACTIVO')
        `)
        .run(
          codigo,
          rubro,
          nombre.trim(),
          telefono.trim(),
          typeof descripcion === 'string' ? descripcion.trim() : '',
          typeof zona === 'string' && zona.trim() ? zona.trim() : 'Centro Histórico, Cusco',
          nextPersona,
          nextDocTipo,
          nextDocNum,
          typeof razon_social === 'string' && razon_social.trim() ? razon_social.trim().slice(0, 140) : null,
          nextTipoNegocio,
          nextModalidades
        );
      const id = Number(insertRes.lastInsertRowid);
      db.prepare('INSERT INTO seguridad_credenciales (negocio_id, pin_hash, pin_salt) VALUES (?, ?, ?)').run(
        id,
        hash,
        salt
      );
      const negocio = db.prepare('SELECT * FROM negocios WHERE id = ?').get(id);
      // El PIN inicial aleatorio se muestra UNA SOLA VEZ al administrador
      res.status(201).json({ negocio, pin_inicial: pinInicial });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/admin/negocios/:id/estado', requireAdminAuth, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { activo, estado_regla, motivo_estado } = req.body || {};

      let nextEstadoRegla: EstadoRegla;
      let nextActivo: number;

      if (typeof estado_regla === 'string' && (ESTADOS_REGLA as readonly string[]).includes(estado_regla.toUpperCase())) {
        nextEstadoRegla = estado_regla.toUpperCase() as EstadoRegla;
        nextActivo = nextEstadoRegla === 'ACTIVO' ? 1 : 0;
      } else {
        nextActivo = activo ? 1 : 0;
        nextEstadoRegla = nextActivo === 1 ? 'ACTIVO' : 'INCUMPLIMIENTO';
      }

      const nextMotivo =
        nextEstadoRegla === 'ACTIVO'
          ? null
          : typeof motivo_estado === 'string' && motivo_estado.trim()
            ? motivo_estado.trim().slice(0, 240)
            : nextEstadoRegla === 'ESTAFA'
              ? 'Suspendido por reporte de estafa o cobro fraudulento'
              : 'Suspendido por incumplimiento de reglas de servicio';

      db.prepare('UPDATE negocios SET activo = ?, estado_regla = ?, motivo_estado = ? WHERE id = ?').run(
        nextActivo,
        nextEstadoRegla,
        nextMotivo,
        id
      );
      res.json({
        ok: true,
        activo: nextActivo === 1,
        estado_regla: nextEstadoRegla,
        motivo_estado: nextMotivo,
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/admin/negocios/:id/unlock', requireAdminAuth, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      db.prepare(
        'UPDATE seguridad_credenciales SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE negocio_id = ?'
      ).run(id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/admin/recargas/:id/aprobar', requireAdminAuth, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const result = aprobarRecarga(db, id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/admin/recargas/:id/rechazar', requireAdminAuth, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const result = rechazarRecarga(db, id, String(req.body?.motivo || ''));
      res.json({ recarga: result });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/admin/reglas-comision/:rubro', requireAdminAuth, (req, res, next) => {
    try {
      const rubro = String(req.params.rubro || '').toUpperCase() as Rubro;
      if (!RUBROS.includes(rubro)) throw new HttpError(400, 'Rubro inválido');
      const { porcentaje_plataforma, porcentaje_referido } = req.body || {};
      if (
        !Number.isInteger(porcentaje_plataforma) ||
        !Number.isInteger(porcentaje_referido) ||
        porcentaje_plataforma < 0 ||
        porcentaje_plataforma > 50 ||
        porcentaje_referido < 0 ||
        porcentaje_referido > 50 ||
        porcentaje_plataforma + porcentaje_referido > 50
      ) {
        throw new HttpError(
          400,
          'Cada porcentaje debe estar entre 0 y 50, y su suma no puede superar 50'
        );
      }
      db.prepare(`
        UPDATE reglas_comision
        SET porcentaje_plataforma = ?, porcentaje_referido = ?, updated_at = datetime('now')
        WHERE rubro = ?
      `).run(porcentaje_plataforma, porcentaje_referido, rubro);
      res.json({ regla: db.prepare('SELECT * FROM reglas_comision WHERE rubro = ?').get(rubro) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/admin/ajustes-saldo', requireAdminAuth, (req, res, next) => {
    try {
      const { negocio_id, delta_centavos, motivo } = req.body || {};
      const result = ajustarSaldoAdmin(
        db,
        Number(negocio_id),
        Number(delta_centavos),
        String(motivo || '')
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/admin/auditoria', requireAdminAuth, (_req, res) => {
    res.json(auditarLibroContable(db));
  });

  app.post('/api/admin/unidades/:id/certificar', requireAdminAuth, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const certificada = req.body?.certificada ? 1 : 0;
      db.prepare('UPDATE unidades_conductores SET certificada = ? WHERE id = ?').run(
        certificada,
        id
      );
      res.json({ ok: true, certificada: certificada === 1 });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/admin/emergencias/:id/atender', requireAdminAuth, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const atendidaPor = String(req.body?.atendida_por || 'Central La Chuspa').trim();
      db.prepare(
        "UPDATE alertas_emergencias SET estado = 'ATENDIDA', atendida_por = ? WHERE id = ?"
      ).run(atendidaPor, id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/admin/partners', requireAdminAuth, (req, res, next) => {
    try {
      const { codigo, nombre, telefono, porcentaje_comision } = req.body || {};
      const cleanCode = String(codigo || '').trim().toUpperCase();
      if (cleanCode.length < 3 || typeof nombre !== 'string' || nombre.trim().length < 2) {
        throw new HttpError(400, 'Código y nombre obligatorios');
      }
      if (!Number.isInteger(porcentaje_comision) || porcentaje_comision < 1 || porcentaje_comision > 25) {
        throw new HttpError(400, 'Comisión de promotor debe estar entre 1% y 25%');
      }
      db.prepare(
        'INSERT INTO partners_afiliados (codigo, nombre, telefono, porcentaje_comision, activo) VALUES (?, ?, ?, ?, 1)'
      ).run(cleanCode, nombre.trim(), String(telefono || '+51984000000').trim(), porcentaje_comision);
      res.status(201).json({ ok: true, codigo: cleanCode });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/admin/dev-api', requireAdminAuth, async (_req, res, next) => {
    try {
      const cfg = await resolveDevApiConfig();
      res.json({
        proveedorConsultas: cfg.proveedorConsultas,
        hasTokenConsultas: Boolean(cfg.tokenConsultasDniRuc),
        tokenConsultasPreview: maskSecretPreview(cfg.tokenConsultasDniRuc),
        hasTokenFacturacion: Boolean(cfg.tokenFacturacionApisperu),
        tokenFacturacionPreview: maskSecretPreview(cfg.tokenFacturacionApisperu),
        firebaseDevApiUrl: `${getRtdbBaseUrl()}/dev_api.json`,
        updatedAt: cfg.updatedAt,
      });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/admin/dev-api', requireAdminAuth, async (req, res, next) => {
    try {
      const body = req.body || {};
      const current = getLocalDevApiConfig();
      const proveedor: ProveedorConsultas =
        body.proveedorConsultas === 'apisperu' || body.proveedorConsultas === 'apisnetpe'
          ? body.proveedorConsultas
          : 'auto';

      const clearConsultas = body.clearConsultas === true;
      const clearFacturacion = body.clearFacturacion === true;
      const rawConsultas =
        typeof body.tokenConsultasDniRuc === 'string' ? body.tokenConsultasDniRuc.trim() : '';
      const rawFacturacion =
        typeof body.tokenFacturacionApisperu === 'string' ? body.tokenFacturacionApisperu.trim() : '';

      if (rawConsultas.length > 1024 || rawFacturacion.length > 1024) {
        throw new HttpError(400, 'Longitud de token inválida');
      }

      const nextConsultas = clearConsultas ? '' : rawConsultas || current.tokenConsultasDniRuc;
      const nextFacturacion = clearFacturacion
        ? ''
        : rawFacturacion || current.tokenFacturacionApisperu;

      const nowIso = new Date().toISOString();
      db.prepare(`
        INSERT INTO dev_api_config (id, proveedor_consultas, token_consultas, token_facturacion, updated_at)
        VALUES (1, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          proveedor_consultas = excluded.proveedor_consultas,
          token_consultas = excluded.token_consultas,
          token_facturacion = excluded.token_facturacion,
          updated_at = excluded.updated_at
      `).run(proveedor, nextConsultas, nextFacturacion, nowIso);

      let syncedFirebase = false;
      if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_FIREBASE_SYNC !== 'true') {
        const baseUrl = getRtdbBaseUrl();
        if (baseUrl) {
          try {
            const fbRes = await fetch(`${baseUrl}/dev_api.json`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                proveedorConsultas: proveedor,
                tokenConsultasDniRuc: nextConsultas,
                tokenFacturacionApisperu: nextFacturacion,
                updated_at: nowIso,
              }),
              signal: AbortSignal.timeout(4500),
            });
            syncedFirebase = fbRes.ok;
          } catch {
            syncedFirebase = false;
          }
        }
      }

      res.json({
        ok: true,
        syncedFirebase,
        proveedorConsultas: proveedor,
        hasTokenConsultas: Boolean(nextConsultas),
        tokenConsultasPreview: maskSecretPreview(nextConsultas),
        hasTokenFacturacion: Boolean(nextFacturacion),
        tokenFacturacionPreview: maskSecretPreview(nextFacturacion),
        updatedAt: nowIso,
      });
    } catch (err) {
      next(err);
    }
  });

  // Manejo centralizado de errores HTTP claros
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Error interno del servidor';
    res.status(500).json({ error: msg });
  });

  return app;
}
