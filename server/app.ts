import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  calculateTaxiFareServer,
  haversineKm,
  runConciergeSearch,
} from './assistant.ts';
import {
  aceptarPedido,
  ajustarSaldoAdmin,
  aprobarRecarga,
  auditarLibroContable,
  cancelarPedido,
  logWhatsAppNotification,
  rechazarRecarga,
  solicitarRecarga,
  validarPinYEntregar,
} from './finance.ts';
import { syncSnapshotToFirebaseRtdb } from './rtdbSync.ts';
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
  HttpError,
  METODOS_PAGO,
  METODOS_RECARGA,
  RUBROS,
  type MetodoPago,
  type MetodoRecarga,
  type NegocioRow,
  type PedidoRow,
  type Rubro,
} from './types.ts';

function generateCode(prefix: string): string {
  const num = crypto.randomInt(1000, 9999);
  return `${prefix}-${num}`;
}

export function createApp(options: { db: DatabaseSync; skipRateLimit?: boolean }) {
  const { db, skipRateLimit = false } = options;
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    const reqOrigin = req.headers.origin;
    const isAuthRoute = req.path.startsWith('/api/negocio') || req.path.startsWith('/api/admin');
    const configuredOrigins = (process.env.CORS_ORIGIN || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (reqOrigin) {
      if (configuredOrigins.includes(reqOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', reqOrigin);
        res.setHeader('Vary', 'Origin');
      } else if (!isAuthRoute) {
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

  // =========================================================================
  // 1. RUTAS PÚBLICAS DE CLIENTE / TURISTA
  // =========================================================================
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'la-chuspa-core' });
  });

  app.get('/api/public/directorio', publicLimiter, (_req, res) => {
    const negocios = db
      .prepare(`
        SELECT id, codigo, rubro, nombre, descripcion, zona, lat, lng, en_linea, calificacion
        FROM negocios
        WHERE activo = 1
        ORDER BY rubro ASC, calificacion DESC
      `)
      .all();
    const servicios = db
      .prepare(`
        SELECT s.id, s.negocio_id, s.categoria, s.nombre, s.descripcion, s.precio_centavos, s.duracion_min, s.stock,
               n.nombre AS negocio_nombre, n.zona, n.calificacion
        FROM servicios_catalogo s
        JOIN negocios n ON n.id = s.negocio_id
        WHERE n.activo = 1 AND n.en_linea = 1 AND s.disponible = 1 AND s.stock > 0 AND s.categoria = n.rubro
        ORDER BY s.categoria ASC, s.precio_centavos ASC
      `)
      .all();
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

      const negocio = db
        .prepare('SELECT * FROM negocios WHERE id = ? AND activo = 1')
        .get(negocio_id) as NegocioRow | undefined;
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
            metodo_pago, estado, cliente_nombre, cliente_telefono, eta_min,
            fecha_hora_reserva, pin_hash, pin_salt, pin_cifrado, expires_at
          )
          VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?, ?, 'PENDIENTE_CONFIRMACION', ?, ?, ?, ?, ?, ?, NULL, datetime('now', '+2 hours'))
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

      const insertRes = db
        .prepare(`
          INSERT INTO pedidos_ordenes (
            codigo, negocio_id, referido_negocio_id, promotor_codigo, categoria,
            servicio_id, unidad_id, item_nombre, transcripcion, monto_centavos,
            metodo_pago, estado, cliente_nombre, cliente_telefono,
            origen_texto, destino_texto, origen_lat, origen_lng, distancia_km, eta_min,
            pin_hash, pin_salt, pin_cifrado, expires_at
          )
          VALUES (?, ?, NULL, ?, 'TRANSPORTE', NULL, ?, ?, ?, ?, ?, 'PENDIENTE_CONFIRMACION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now', '+45 minutes'))
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
          origenClean,
          destinoClean,
          oLat,
          oLng,
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
        .prepare('SELECT * FROM pedidos_ordenes WHERE id = ?')
        .get(Number(insertRes.lastInsertRowid)) as unknown as PedidoRow;

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
        });
      } catch {
        throw new HttpError(409, `El asiento #${asiento_numero} ya está reservado`);
      }
    } catch (err) {
      next(err);
    }
  });

  // Emergencias SOS
  app.post('/api/public/emergencias', publicLimiter, (req, res, next) => {
    try {
      const { cliente_nombre, cliente_telefono, ubicacion_texto, lat, lng, mensaje } =
        req.body || {};
      if (typeof cliente_nombre !== 'string' || cliente_nombre.trim().length < 2) {
        throw new HttpError(400, 'Nombre obligatorio');
      }
      if (typeof cliente_telefono !== 'string' || cliente_telefono.trim().length < 6) {
        throw new HttpError(400, 'Teléfono obligatorio');
      }
      const codigo = generateCode('SOS-CUSCO');
      const resInsert = db
        .prepare(`
          INSERT INTO alertas_emergencias (codigo, cliente_nombre, cliente_telefono, ubicacion_texto, lat, lng, mensaje, estado)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVA')
        `)
        .run(
          codigo,
          cliente_nombre.trim(),
          cliente_telefono.trim(),
          typeof ubicacion_texto === 'string' && ubicacion_texto.trim()
            ? ubicacion_texto.trim()
            : 'Cusco, Perú',
          typeof lat === 'number' ? lat : -13.5167,
          typeof lng === 'number' ? lng : -71.9788,
          typeof mensaje === 'string' && mensaje.trim() ? mensaje.trim() : 'Asistencia inmediata requerida'
        );

      logWhatsAppNotification(
        db,
        cliente_telefono.trim(),
        'alerta_sos',
        codigo,
        `Alerta ${codigo} activada. Centro de control La Chuspa y contactos de confianza notificados.`
      );

      res.status(201).json({
        id: Number(resInsert.lastInsertRowid),
        codigo,
        estado: 'ACTIVA',
      });
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
        throw new HttpError(403, 'Este negocio se encuentra suspendido por administración');
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
      const negocio = db.prepare('SELECT * FROM negocios WHERE id = ?').get(negocioId) as
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
      const servicios = db
        .prepare('SELECT * FROM servicios_catalogo WHERE negocio_id = ? AND categoria = ? ORDER BY id DESC')
        .all(negocioId, negocio.rubro);
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
          saldo_libre: negocio.saldo - negocio.saldo_retenido,
        },
        regla_comision: regla,
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

  app.get('/api/negocio/:negocioId/pedidos', requireBusinessAuth, (req: AuthedRequest, res, next) => {
    try {
      const negocioId = Number(req.params.negocioId);
      const negocio = db.prepare('SELECT * FROM negocios WHERE id = ?').get(negocioId) as
        | NegocioRow
        | undefined;
      if (!negocio) throw new HttpError(404, 'Negocio no encontrado');

      const rol = String(req.query.rol || 'TODOS').toUpperCase();
      let rows: PedidoRow[];
      if (rol === 'PRESTADOR') {
        // ESTRICTA SEPARACIÓN POR CATEGORÍA: Solo pedidos de su propio rubro y negocio
        rows = db
          .prepare(`
            SELECT p.*, ref.nombre AS referidor_nombre
            FROM pedidos_ordenes p
            LEFT JOIN negocios ref ON ref.id = p.referido_negocio_id
            WHERE p.negocio_id = ? AND p.categoria = ?
            ORDER BY p.id DESC
          `)
          .all(negocioId, negocio.rubro) as unknown as PedidoRow[];
      } else if (rol === 'REFERIDOR') {
        rows = db
          .prepare(`
            SELECT p.*, prov.nombre AS prestador_nombre
            FROM pedidos_ordenes p
            JOIN negocios prov ON prov.id = p.negocio_id
            WHERE p.referido_negocio_id = ?
            ORDER BY p.id DESC
          `)
          .all(negocioId) as unknown as PedidoRow[];
      } else {
        rows = db
          .prepare(`
            SELECT p.*, prov.nombre AS prestador_nombre, ref.nombre AS referidor_nombre
            FROM pedidos_ordenes p
            JOIN negocios prov ON prov.id = p.negocio_id
            LEFT JOIN negocios ref ON ref.id = p.referido_negocio_id
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
        const pedido = db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedidoId) as
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
    '/api/negocio/:negocioId/pedidos/:pedidoId/entregar',
    requireBusinessAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const negocioId = Number(req.params.negocioId);
        const pedidoId = Number(req.params.pedidoId);
        const { pin } = req.body || {};
        const result = validarPinYEntregar(db, pedidoId, negocioId, String(pin || ''));
        res.json({
          pedido: sanitizeOrderForBusiness(
            result.pedido as unknown as Record<string, unknown>,
            negocioId
          ),
          puntos_otorgados: result.puntosGanados,
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
        if (!Number.isInteger(monto_centavos) || monto_centavos < 1000 || monto_centavos > 500000) {
          throw new HttpError(400, 'Contraoferta inválida');
        }
        const pedido = db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedidoId) as
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
          .get(negocio_destino_id) as NegocioRow | undefined;
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
      const { nombre, descripcion, precio_centavos, duracion_min, stock } = req.body || {};
      if (typeof nombre !== 'string' || nombre.trim().length < 2) {
        throw new HttpError(400, 'Nombre del servicio obligatorio');
      }
      if (!Number.isInteger(precio_centavos) || precio_centavos <= 0) {
        throw new HttpError(400, 'Precio inválido');
      }
      const insertRes = db
        .prepare(`
          INSERT INTO servicios_catalogo (negocio_id, categoria, nombre, descripcion, precio_centavos, duracion_min, stock, disponible)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `)
        .run(
          negocioId,
          negocio.rubro,
          nombre.trim(),
          typeof descripcion === 'string' ? descripcion.trim() : '',
          precio_centavos,
          Number.isInteger(duracion_min) ? duracion_min : 30,
          Number.isInteger(stock) ? stock : 20
        );
      res.status(201).json({
        servicio: db
          .prepare('SELECT * FROM servicios_catalogo WHERE id = ?')
          .get(Number(insertRes.lastInsertRowid)),
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

        const { stock, disponible, precio_centavos } = req.body || {};
        if (stock !== undefined && (!Number.isInteger(stock) || stock < 0)) {
          throw new HttpError(400, 'Stock inválido');
        }
        if (precio_centavos !== undefined && (!Number.isInteger(precio_centavos) || precio_centavos <= 0)) {
          throw new HttpError(400, 'Precio inválido');
        }
        db.prepare(`
          UPDATE servicios_catalogo
          SET stock = COALESCE(?, stock),
              disponible = COALESCE(?, disponible),
              precio_centavos = COALESCE(?, precio_centavos)
          WHERE id = ? AND negocio_id = ? AND categoria = ?
        `).run(
          stock ?? null,
          disponible === undefined ? null : disponible ? 1 : 0,
          precio_centavos ?? null,
          servicioId,
          negocioId,
          negocio.rubro
        );
        res.json({
          servicio: db.prepare('SELECT * FROM servicios_catalogo WHERE id = ?').get(servicioId),
        });
      } catch (err) {
        next(err);
      }
    }
  );

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
      const { rubro, nombre, telefono, zona, descripcion } = req.body || {};
      if (!RUBROS.includes(rubro)) throw new HttpError(400, 'Rubro inválido');
      if (typeof nombre !== 'string' || nombre.trim().length < 2) {
        throw new HttpError(400, 'Nombre obligatorio');
      }
      if (typeof telefono !== 'string' || telefono.trim().length < 6) {
        throw new HttpError(400, 'Teléfono obligatorio');
      }
      const codigo = generateCode(`NEG-${rubro.slice(0, 2)}`);
      const pinInicial = generateOrderPin();
      const { hash, salt } = hashPin(pinInicial);

      const insertRes = db
        .prepare(`
          INSERT INTO negocios (codigo, rubro, nombre, telefono, descripcion, lat, lng, zona, en_linea, activo, saldo, saldo_retenido)
          VALUES (?, ?, ?, ?, ?, -13.5167, -71.9788, ?, 1, 1, 0, 0)
        `)
        .run(
          codigo,
          rubro,
          nombre.trim(),
          telefono.trim(),
          typeof descripcion === 'string' ? descripcion.trim() : '',
          typeof zona === 'string' && zona.trim() ? zona.trim() : 'Centro Histórico, Cusco'
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
      const activo = req.body?.activo ? 1 : 0;
      db.prepare('UPDATE negocios SET activo = ? WHERE id = ?').run(activo, id);
      res.json({ ok: true, activo: activo === 1 });
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
