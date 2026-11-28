import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { runConciergeSearch } from './assistant.ts';
import { logWhatsAppNotification } from './finance.ts';
import {
  createSessionToken,
  hashPin,
  requireUserAuth,
  verifyPin,
  type AuthedRequest,
} from './security.ts';
import { HttpError } from './types.ts';

export interface DocumentLookupOutput {
  valid: boolean;
  validado: boolean;
  tipo: 'DNI' | 'RUC' | 'EXTRANJERO';
  numero: string;
  nombre_completo: string;
  razon_social?: string;
  estado?: string;
  condicion?: string;
  direccion?: string;
  source: string;
  fuente: string;
}

export interface CuentaUsuarioRow {
  id: number;
  wechat_id: string;
  documento_tipo: 'DNI' | 'RUC' | 'EXTRANJERO';
  documento_numero: string;
  nombre: string;
  direccion_fiscal: string | null;
  pais_codigo: string;
  pais_nombre: string;
  whatsapp: string;
  password_hash: string;
  password_salt: string;
  whatsapp_verificado: number;
  otp_hash: string | null;
  otp_salt: string | null;
  otp_expires_at: string | null;
  otp_intentos: number;
  idioma: string;
  estado_texto: string;
  avatar_url: string;
  notificaciones_activas: number;
  mostrar_siempre_arriba: number;
  created_at: string;
  updated_at: string;
}

function maskPhone(phone: string): string {
  const clean = String(phone || '').trim();
  if (clean.length <= 5) return '***';
  return `${clean.slice(0, 4)}****${clean.slice(-3)}`;
}

export function sanitizeCuentaUsuario(row: CuentaUsuarioRow) {
  return {
    id: row.id,
    wechat_id: row.wechat_id,
    documento_tipo: row.documento_tipo,
    documento_numero: row.documento_numero,
    nombre: row.nombre,
    direccion_fiscal: row.direccion_fiscal || '',
    pais_codigo: row.pais_codigo,
    pais_nombre: row.pais_nombre,
    whatsapp: row.whatsapp,
    whatsapp_masked: maskPhone(row.whatsapp),
    whatsapp_verificado: row.whatsapp_verificado === 1,
    idioma: row.idioma || 'Español',
    estado_texto: row.estado_texto || '',
    avatar_url: row.avatar_url || '',
    notificaciones_activas: row.notificaciones_activas === 1,
    mostrar_siempre_arriba: row.mostrar_siempre_arriba === 1,
    created_at: row.created_at,
  };
}

function normalizeWhatsapp(rawWhatsapp: string, paisCodigo?: string): string {
  const trimmed = String(rawWhatsapp || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  const code = String(paisCodigo || '+51').trim();
  const codeDigits = code.replace(/\D/g, '') || '51';
  if (!digits || digits.length < 6 || digits.length > 16) {
    throw new HttpError(400, 'Ingresa un número de WhatsApp válido (mínimo 6 dígitos).');
  }
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.startsWith(codeDigits) && digits.length >= codeDigits.length + 6) {
    return `+${digits}`;
  }
  return `+${codeDigits}${digits}`;
}

function buildWechatId(tipo: string, numero: string): string {
  const clean = `${tipo}_${numero}`.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const suffix = crypto.randomBytes(2).toString('hex');
  return `chuspa_${clean}_${suffix}`.slice(0, 32);
}

async function sendWhatsAppOtp(
  db: DatabaseSync,
  whatsapp: string,
  code: string,
  nombre: string
): Promise<{ whatsapp_enviado_via: 'whatsapp_cloud_api' | 'whatsapp_sandbox'; preview_otp_code?: string }> {
  const mensaje = `🔐 La Chuspa · Hola ${nombre}, tu código de verificación de registro es: ${code}. Válido por 10 minutos. No lo compartas.`;
  logWhatsAppNotification(db, whatsapp, 'verificacion_registro_whatsapp', null, mensaje);

  const waToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (waToken && phoneId && process.env.NODE_ENV !== 'test') {
    try {
      const apiRes = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: whatsapp.replace(/\D/g, ''),
          type: 'text',
          text: { body: mensaje },
        }),
        signal: AbortSignal.timeout(6000),
      });
      if (apiRes.ok) {
        return { whatsapp_enviado_via: 'whatsapp_cloud_api' };
      }
    } catch {
      // Fall through to sandbox logging if external WhatsApp API fails
    }
  }

  return {
    whatsapp_enviado_via: 'whatsapp_sandbox',
    preview_otp_code: code,
  };
}

function seedInitialChatsIfEmpty(db: DatabaseSync, usuario: CuentaUsuarioRow) {
  const countRow = db
    .prepare('SELECT COUNT(*) AS cnt FROM usuario_chats_mensajes WHERE usuario_id = ?')
    .get(usuario.id) as { cnt: number };
  if (countRow.cnt > 0) return;

  const insert = db.prepare(`
    INSERT INTO usuario_chats_mensajes (usuario_id, conversacion_id, remitente, tipo_contenido, texto, meta_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    usuario.id,
    'agente_chuspa',
    'AGENT',
    'TEXTO',
    `¡Bienvenido a La Chuspa, ${usuario.nombre}! Soy tu Agente Concierge en Cusco. Escríbeme o mantén pulsado para hablar (ej. "Quiero un taxi a la Plaza de Armas", "Farmacia abierta", "Necesito gasfitero") y te mostraré opciones verificadas aquí mismo.`,
    null
  );
  insert.run(
    usuario.id,
    'equipo_chuspa',
    'SYSTEM',
    'TEXTO',
    `Tu cuenta (${usuario.documento_tipo} ${usuario.documento_numero}) quedó verificada con WhatsApp ${maskPhone(usuario.whatsapp)}. Puedes usar tus credenciales en Taxis, Comercios, Oficios y Emergencias SOS.`,
    null
  );
}

function parseDocCredentials(
  rawTipo: unknown,
  rawNumero: unknown
): { tipo: 'DNI' | 'RUC' | 'EXTRANJERO'; numero: string } {
  const numClean = String(rawNumero || '').trim();
  let tipo = String(rawTipo || '').trim().toUpperCase();
  if (!tipo) {
    if (/^\d{8}$/.test(numClean)) tipo = 'DNI';
    else if (/^\d{11}$/.test(numClean)) tipo = 'RUC';
    else tipo = 'EXTRANJERO';
  }
  if (tipo !== 'DNI' && tipo !== 'RUC' && tipo !== 'EXTRANJERO') {
    throw new HttpError(400, 'Tipo de documento debe ser DNI, RUC o EXTRANJERO.');
  }
  const normalizedNum = tipo === 'EXTRANJERO' ? numClean.toUpperCase() : numClean.replace(/\D/g, '');
  if (tipo === 'DNI' && !/^\d{8}$/.test(normalizedNum)) {
    throw new HttpError(400, 'El DNI peruano debe tener exactamente 8 dígitos.');
  }
  if (tipo === 'RUC' && !/^(10|15|16|17|20)\d{9}$/.test(normalizedNum)) {
    throw new HttpError(400, 'El RUC peruano debe tener 11 dígitos válidos.');
  }
  if (tipo === 'EXTRANJERO' && !/^[A-Z0-9-]{6,20}$/.test(normalizedNum)) {
    throw new HttpError(400, 'El Pasaporte o ID Extranjero debe tener entre 6 y 20 caracteres alfanuméricos.');
  }
  return { tipo, numero: normalizedNum };
}

export function registerUserAuthRoutes(
  app: Express,
  deps: {
    db: DatabaseSync;
    authLimiter: RequestHandler;
    publicLimiter: RequestHandler;
    lookupPeruDocument: (
      tipo: string,
      numero: string,
      nombreQuery?: string,
      bypassCache?: boolean
    ) => Promise<DocumentLookupOutput>;
  }
): void {
  const { db, authLimiter, lookupPeruDocument } = deps;

  // Caso 1: Registro de nuevo usuario (DNI/RUC sincronizado con RENIEC/SUNAT o Pasaporte Extranjero + WhatsApp + Contraseña -> envía OTP WhatsApp)
  app.post('/api/public/usuarios/registro', authLimiter, async (req, res, next) => {
    try {
      const body = req.body || {};
      const { tipo, numero } = parseDocCredentials(body.documento_tipo, body.documento_numero);
      const paisCodigo =
        typeof body.pais_codigo === 'string' && body.pais_codigo.trim()
          ? body.pais_codigo.trim().slice(0, 8)
          : '+51';
      const paisNombre =
        typeof body.pais_nombre === 'string' && body.pais_nombre.trim()
          ? body.pais_nombre.trim().slice(0, 60)
          : 'Perú';
      const whatsapp = normalizeWhatsapp(String(body.whatsapp || ''), paisCodigo);
      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length < 6 || password.length > 100) {
        throw new HttpError(400, 'La contraseña debe tener entre 6 y 100 caracteres.');
      }
      if (body.acepto_terminos === false) {
        throw new HttpError(400, 'Debes aceptar los Términos de servicio y Política de Privacidad.');
      }
      const idioma =
        typeof body.idioma === 'string' && body.idioma.trim()
          ? body.idioma.trim().slice(0, 40)
          : 'Español';

      const providedName = typeof body.nombre === 'string' ? body.nombre.trim().slice(0, 120) : '';
      if (tipo === 'EXTRANJERO' && providedName.length < 3) {
        throw new HttpError(400, 'Ingresa tu nombre completo tal como figura en tu Pasaporte o documento.');
      }

      const lookup = await lookupPeruDocument(tipo, numero, providedName);
      const resolvedNombre =
        tipo === 'EXTRANJERO'
          ? providedName
          : lookup.nombre_completo || providedName || `Titular ${tipo} ${numero}`;
      const direccionFiscal = lookup.direccion || null;

      const existing = db
        .prepare('SELECT * FROM cuentas_usuarios WHERE documento_tipo = ? AND documento_numero = ?')
        .get(tipo, numero) as unknown as CuentaUsuarioRow | undefined;

      if (existing && existing.whatsapp_verificado === 1) {
        throw new HttpError(
          409,
          `El ${tipo} ${numero} ya está registrado y verificado. Inicia sesión con tu contraseña.`
        );
      }

      const { hash: passwordHash, salt: passwordSalt } = hashPin(password);
      const otpCode = String(crypto.randomInt(100000, 1000000));
      const { hash: otpHash, salt: otpSalt } = hashPin(otpCode);
      const otpExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

      let userId: number;
      if (existing) {
        db.prepare(`
          UPDATE cuentas_usuarios
          SET nombre = ?, direccion_fiscal = ?, pais_codigo = ?, pais_nombre = ?, whatsapp = ?,
              password_hash = ?, password_salt = ?, whatsapp_verificado = 0,
              otp_hash = ?, otp_salt = ?, otp_expires_at = ?, otp_intentos = 0,
              idioma = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(
          resolvedNombre,
          direccionFiscal,
          paisCodigo,
          paisNombre,
          whatsapp,
          passwordHash,
          passwordSalt,
          otpHash,
          otpSalt,
          otpExpiresAt,
          idioma,
          existing.id
        );
        userId = existing.id;
      } else {
        const wechatId = buildWechatId(tipo, numero);
        const info = db
          .prepare(`
            INSERT INTO cuentas_usuarios (
              wechat_id, documento_tipo, documento_numero, nombre, direccion_fiscal,
              pais_codigo, pais_nombre, whatsapp, password_hash, password_salt,
              whatsapp_verificado, otp_hash, otp_salt, otp_expires_at, otp_intentos, idioma
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, ?)
          `)
          .run(
            wechatId,
            tipo,
            numero,
            resolvedNombre,
            direccionFiscal,
            paisCodigo,
            paisNombre,
            whatsapp,
            passwordHash,
            passwordSalt,
            otpHash,
            otpSalt,
            otpExpiresAt,
            idioma
          );
        userId = Number(info.lastInsertRowid);
      }

      const saved = db
        .prepare('SELECT * FROM cuentas_usuarios WHERE id = ?')
        .get(userId) as unknown as CuentaUsuarioRow;
      const delivery = await sendWhatsAppOtp(db, whatsapp, otpCode, resolvedNombre);

      res.status(201).json({
        ok: true,
        requires_whatsapp_verification: true,
        reniec_sunat_fuente: lookup.fuente || lookup.source,
        usuario: sanitizeCuentaUsuario(saved),
        ...delivery,
      });
    } catch (err) {
      next(err);
    }
  });

  // Reenviar código de validación a WhatsApp
  app.post('/api/public/usuarios/reenviar-codigo', authLimiter, async (req, res, next) => {
    try {
      const body = req.body || {};
      const { tipo, numero } = parseDocCredentials(body.documento_tipo, body.documento_numero);
      const user = db
        .prepare('SELECT * FROM cuentas_usuarios WHERE documento_tipo = ? AND documento_numero = ?')
        .get(tipo, numero) as unknown as CuentaUsuarioRow | undefined;

      if (!user) {
        throw new HttpError(404, 'No encontramos una cuenta registrada con ese documento.');
      }
      if (user.whatsapp_verificado === 1) {
        throw new HttpError(400, 'Este usuario ya verificó su WhatsApp. Inicia sesión normalmente.');
      }

      const otpCode = String(crypto.randomInt(100000, 1000000));
      const { hash: otpHash, salt: otpSalt } = hashPin(otpCode);
      const otpExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

      db.prepare(`
        UPDATE cuentas_usuarios
        SET otp_hash = ?, otp_salt = ?, otp_expires_at = ?, otp_intentos = 0, updated_at = datetime('now')
        WHERE id = ?
      `).run(otpHash, otpSalt, otpExpiresAt, user.id);

      const delivery = await sendWhatsAppOtp(db, user.whatsapp, otpCode, user.nombre);
      res.json({
        ok: true,
        whatsapp_masked: maskPhone(user.whatsapp),
        ...delivery,
      });
    } catch (err) {
      next(err);
    }
  });

  // Validar código de seguridad enviado al WhatsApp (habilita inicio de sesión)
  app.post('/api/public/usuarios/verificar-whatsapp', authLimiter, (req, res, next) => {
    try {
      const body = req.body || {};
      const { tipo, numero } = parseDocCredentials(body.documento_tipo, body.documento_numero);
      const codigo = String(body.codigo || '').replace(/\D/g, '');
      if (!/^\d{6}$/.test(codigo)) {
        throw new HttpError(400, 'Ingresa el código de 6 dígitos enviado a tu WhatsApp.');
      }

      const user = db
        .prepare('SELECT * FROM cuentas_usuarios WHERE documento_tipo = ? AND documento_numero = ?')
        .get(tipo, numero) as unknown as CuentaUsuarioRow | undefined;

      if (!user) {
        throw new HttpError(404, 'No encontramos una cuenta con ese documento.');
      }
      if (user.whatsapp_verificado === 1) {
        res.json({
          ok: true,
          verified: true,
          message: 'Tu WhatsApp ya estaba verificado. Puedes iniciar sesión.',
          usuario: sanitizeCuentaUsuario(user),
        });
        return;
      }
      if (user.otp_intentos >= 5) {
        throw new HttpError(
          429,
          'Demasiados intentos fallidos. Solicita un nuevo código a tu WhatsApp.'
        );
      }
      if (!user.otp_hash || !user.otp_salt || !user.otp_expires_at) {
        throw new HttpError(400, 'No hay un código activo. Solicita reenviar el código a tu WhatsApp.');
      }
      if (new Date(user.otp_expires_at).getTime() < Date.now()) {
        throw new HttpError(400, 'El código de WhatsApp expiró. Solicita uno nuevo.');
      }
      if (!verifyPin(codigo, user.otp_hash, user.otp_salt)) {
        db.prepare('UPDATE cuentas_usuarios SET otp_intentos = otp_intentos + 1 WHERE id = ?').run(user.id);
        throw new HttpError(401, 'Código de verificación incorrecto. Revisa tu WhatsApp e inténtalo de nuevo.');
      }

      db.prepare(`
        UPDATE cuentas_usuarios
        SET whatsapp_verificado = 1, otp_hash = NULL, otp_salt = NULL, otp_expires_at = NULL, otp_intentos = 0,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(user.id);

      db.prepare(`
        INSERT OR IGNORE INTO usuarios_clientes (telefono, nombre, puntos)
        VALUES (?, ?, 0)
      `).run(user.whatsapp, user.nombre);

      const updated = db
        .prepare('SELECT * FROM cuentas_usuarios WHERE id = ?')
        .get(user.id) as unknown as CuentaUsuarioRow;
      seedInitialChatsIfEmpty(db, updated);

      res.json({
        ok: true,
        verified: true,
        message: 'WhatsApp validado correctamente. Ya puedes iniciar sesión con tu documento y contraseña.',
        usuario: sanitizeCuentaUsuario(updated),
      });
    } catch (err) {
      next(err);
    }
  });

  // Caso 2: Iniciar sesión con DNI/RUC (peruano) o Pasaporte (extranjero) + contraseña
  app.post('/api/public/usuarios/login', authLimiter, (req, res, next) => {
    try {
      const body = req.body || {};
      const { tipo, numero } = parseDocCredentials(body.documento_tipo, body.documento_numero);
      const password = typeof body.password === 'string' ? body.password : '';
      if (!password) {
        throw new HttpError(400, 'Ingresa tu contraseña.');
      }

      const user = db
        .prepare('SELECT * FROM cuentas_usuarios WHERE documento_tipo = ? AND documento_numero = ?')
        .get(tipo, numero) as unknown as CuentaUsuarioRow | undefined;

      if (!user || !verifyPin(password, user.password_hash, user.password_salt)) {
        throw new HttpError(401, 'Documento o contraseña incorrectos.');
      }

      if (user.whatsapp_verificado !== 1) {
        res.status(403).json({
          error: 'Tu cuenta aún no ha validado el código de seguridad enviado a tu WhatsApp.',
          code: 'WHATSAPP_UNVERIFIED',
          whatsapp_masked: maskPhone(user.whatsapp),
          documento_tipo: user.documento_tipo,
          documento_numero: user.documento_numero,
        });
        return;
      }

      seedInitialChatsIfEmpty(db, user);
      const token = createSessionToken(
        { role: 'CLIENTE', usuarioId: user.id },
        7 * 24 * 3600
      );

      res.json({
        token,
        usuario: sanitizeCuentaUsuario(user),
      });
    } catch (err) {
      next(err);
    }
  });

  // Perfil del usuario autenticado (Menú "Yo" + Configuración)
  app.get('/api/usuario/perfil', requireUserAuth, (req: AuthedRequest, res, next) => {
    try {
      const user = db
        .prepare('SELECT * FROM cuentas_usuarios WHERE id = ?')
        .get(req.session!.usuarioId!) as unknown as CuentaUsuarioRow | undefined;
      if (!user) {
        throw new HttpError(404, 'Usuario no encontrado');
      }
      res.json({ usuario: sanitizeCuentaUsuario(user) });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/usuario/perfil', requireUserAuth, (req: AuthedRequest, res, next) => {
    try {
      const userId = req.session!.usuarioId!;
      const current = db
        .prepare('SELECT * FROM cuentas_usuarios WHERE id = ?')
        .get(userId) as unknown as CuentaUsuarioRow | undefined;
      if (!current) {
        throw new HttpError(404, 'Usuario no encontrado');
      }

      const body = req.body || {};
      const nextNombre =
        typeof body.nombre === 'string' && body.nombre.trim().length >= 2
          ? body.nombre.trim().slice(0, 120)
          : current.nombre;
      const nextIdioma =
        typeof body.idioma === 'string' && body.idioma.trim()
          ? body.idioma.trim().slice(0, 40)
          : current.idioma;
      const nextEstado =
        typeof body.estado_texto === 'string'
          ? body.estado_texto.trim().slice(0, 120)
          : current.estado_texto;
      const nextAvatar =
        typeof body.avatar_url === 'string' && /^$|^https?:\/\/|^data:image\//i.test(body.avatar_url.trim())
          ? body.avatar_url.trim().slice(0, 500)
          : current.avatar_url;
      const nextNotif =
        typeof body.notificaciones_activas === 'boolean'
          ? body.notificaciones_activas
            ? 1
            : 0
          : current.notificaciones_activas;
      const nextTop =
        typeof body.mostrar_siempre_arriba === 'boolean'
          ? body.mostrar_siempre_arriba
            ? 1
            : 0
          : current.mostrar_siempre_arriba;

      db.prepare(`
        UPDATE cuentas_usuarios
        SET nombre = ?, idioma = ?, estado_texto = ?, avatar_url = ?,
            notificaciones_activas = ?, mostrar_siempre_arriba = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(nextNombre, nextIdioma, nextEstado, nextAvatar, nextNotif, nextTop, userId);

      const updated = db
        .prepare('SELECT * FROM cuentas_usuarios WHERE id = ?')
        .get(userId) as unknown as CuentaUsuarioRow;
      res.json({ usuario: sanitizeCuentaUsuario(updated) });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/usuario/password', requireUserAuth, (req: AuthedRequest, res, next) => {
    try {
      const userId = req.session!.usuarioId!;
      const user = db
        .prepare('SELECT * FROM cuentas_usuarios WHERE id = ?')
        .get(userId) as unknown as CuentaUsuarioRow | undefined;
      if (!user) throw new HttpError(404, 'Usuario no encontrado');

      const { current_password, new_password } = req.body || {};
      if (typeof current_password !== 'string' || !verifyPin(current_password, user.password_hash, user.password_salt)) {
        throw new HttpError(401, 'La contraseña actual es incorrecta.');
      }
      if (typeof new_password !== 'string' || new_password.length < 6 || new_password.length > 100) {
        throw new HttpError(400, 'La nueva contraseña debe tener entre 6 y 100 caracteres.');
      }
      const { hash, salt } = hashPin(new_password);
      db.prepare("UPDATE cuentas_usuarios SET password_hash = ?, password_salt = ?, updated_at = datetime('now') WHERE id = ?").run(
        hash,
        salt,
        userId
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Chats WeChat del usuario + conversación en vivo con Agente La Chuspa
  app.get('/api/usuario/chats', requireUserAuth, (req: AuthedRequest, res, next) => {
    try {
      const userId = req.session!.usuarioId!;
      const user = db
        .prepare('SELECT * FROM cuentas_usuarios WHERE id = ?')
        .get(userId) as unknown as CuentaUsuarioRow | undefined;
      if (!user) throw new HttpError(404, 'Usuario no encontrado');
      seedInitialChatsIfEmpty(db, user);

      const rows = db
        .prepare(`
          SELECT id, conversacion_id, remitente, tipo_contenido, texto, meta_json, created_at
          FROM usuario_chats_mensajes
          WHERE usuario_id = ?
          ORDER BY id ASC
        `)
        .all(userId) as Array<{
        id: number;
        conversacion_id: string;
        remitente: string;
        tipo_contenido: string;
        texto: string;
        meta_json: string | null;
        created_at: string;
      }>;

      const mensajes = rows.map((r) => ({
        ...r,
        meta: r.meta_json ? JSON.parse(r.meta_json) : null,
      }));
      res.json({ mensajes });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/usuario/chats/mensaje', requireUserAuth, async (req: AuthedRequest, res, next) => {
    try {
      const userId = req.session!.usuarioId!;
      const body = req.body || {};
      const conversacionId =
        typeof body.conversacion_id === 'string' && body.conversacion_id.trim()
          ? body.conversacion_id.trim().slice(0, 64)
          : 'agente_chuspa';
      const tipoContenido =
        typeof body.tipo_contenido === 'string' &&
        ['TEXTO', 'VOZ', 'UBICACION', 'STICKER', 'TARJETA'].includes(body.tipo_contenido)
          ? body.tipo_contenido
          : 'TEXTO';
      const texto = typeof body.texto === 'string' ? body.texto.trim().slice(0, 1200) : '';
      if (!texto) {
        throw new HttpError(400, 'Escribe o dicta un mensaje.');
      }

      const metaObj = body.meta && typeof body.meta === 'object' ? body.meta : null;
      const insUser = db
        .prepare(`
          INSERT INTO usuario_chats_mensajes (usuario_id, conversacion_id, remitente, tipo_contenido, texto, meta_json)
          VALUES (?, ?, 'USER', ?, ?, ?)
        `)
        .run(userId, conversacionId, tipoContenido, texto, metaObj ? JSON.stringify(metaObj) : null);

      const userMessage = db
        .prepare('SELECT id, conversacion_id, remitente, tipo_contenido, texto, meta_json, created_at FROM usuario_chats_mensajes WHERE id = ?')
        .get(Number(insUser.lastInsertRowid)) as Record<string, any>;

      let agentMessage: Record<string, any> | null = null;
      let assistantResult: Record<string, any> | null = null;

      if (conversacionId === 'agente_chuspa') {
        if (tipoContenido === 'UBICACION') {
          const lat = typeof body.lat === 'number' ? body.lat : -13.5167;
          const lng = typeof body.lng === 'number' ? body.lng : -71.9788;
          const replyText = `Ubicación GPS recibida (${lat.toFixed(4)}, ${lng.toFixed(4)}). Ya puedo ubicarte para taxis cercanos, boticas 24h o entregas a domicilio en Cusco.`;
          const insAgent = db
            .prepare(`
              INSERT INTO usuario_chats_mensajes (usuario_id, conversacion_id, remitente, tipo_contenido, texto, meta_json)
              VALUES (?, ?, 'AGENT', 'UBICACION', ?, ?)
            `)
            .run(userId, conversacionId, replyText, JSON.stringify({ lat, lng }));
          agentMessage = db
            .prepare('SELECT id, conversacion_id, remitente, tipo_contenido, texto, meta_json, created_at FROM usuario_chats_mensajes WHERE id = ?')
            .get(Number(insAgent.lastInsertRowid)) as Record<string, any>;
        } else if (tipoContenido === 'STICKER') {
          const replyText = '¡Recibido! Cuando quieras, dime si necesitas taxi, farmacia, restaurante o algún oficio en Cusco.';
          const insAgent = db
            .prepare(`
              INSERT INTO usuario_chats_mensajes (usuario_id, conversacion_id, remitente, tipo_contenido, texto, meta_json)
              VALUES (?, ?, 'AGENT', 'TEXTO', ?, NULL)
            `)
            .run(userId, conversacionId, replyText);
          agentMessage = db
            .prepare('SELECT id, conversacion_id, remitente, tipo_contenido, texto, meta_json, created_at FROM usuario_chats_mensajes WHERE id = ?')
            .get(Number(insAgent.lastInsertRowid)) as Record<string, any>;
        } else {
          const search = await runConciergeSearch(db, {
            query: texto,
            lat: typeof body.lat === 'number' ? body.lat : -13.5167,
            lng: typeof body.lng === 'number' ? body.lng : -71.9788,
          });
          assistantResult = search as unknown as Record<string, any>;
          const metaPayload = {
            categoria: search.categoria,
            modo_resultado: search.modo_resultado,
            rubro_solicitado: search.rubro_solicitado,
            sin_resultados_exactos: search.sin_resultados_exactos,
            oficio_normalizado: search.oficio_normalizado || null,
            opciones: search.opciones.slice(0, 8),
            alternativas_otros_rubros: search.alternativas_otros_rubros.slice(0, 4),
          };
          const insAgent = db
            .prepare(`
              INSERT INTO usuario_chats_mensajes (usuario_id, conversacion_id, remitente, tipo_contenido, texto, meta_json)
              VALUES (?, ?, 'AGENT', 'OPCIONES', ?, ?)
            `)
            .run(userId, conversacionId, search.respuesta_voz, JSON.stringify(metaPayload));
          agentMessage = db
            .prepare('SELECT id, conversacion_id, remitente, tipo_contenido, texto, meta_json, created_at FROM usuario_chats_mensajes WHERE id = ?')
            .get(Number(insAgent.lastInsertRowid)) as Record<string, any>;
        }
      } else if (conversacionId.startsWith('negocio_')) {
        const negId = Number(conversacionId.replace('negocio_', ''));
        const biz = Number.isInteger(negId)
          ? (db.prepare('SELECT nombre, zona, telefono FROM negocios WHERE id = ?').get(negId) as
              | { nombre: string; zona: string; telefono: string }
              | undefined)
          : undefined;
        if (biz) {
          const autoReply = `${biz.nombre} (${biz.zona}) recibió tu mensaje. Puedes reservar o pagar directo desde el catálogo o comunicarte al ${biz.telefono}.`;
          const insContact = db
            .prepare(`
              INSERT INTO usuario_chats_mensajes (usuario_id, conversacion_id, remitente, tipo_contenido, texto, meta_json)
              VALUES (?, ?, 'CONTACT', 'TEXTO', ?, NULL)
            `)
            .run(userId, conversacionId, autoReply);
          agentMessage = db
            .prepare('SELECT id, conversacion_id, remitente, tipo_contenido, texto, meta_json, created_at FROM usuario_chats_mensajes WHERE id = ?')
            .get(Number(insContact.lastInsertRowid)) as Record<string, any>;
        }
      }

      res.status(201).json({
        user_message: {
          ...userMessage,
          meta: userMessage.meta_json ? JSON.parse(userMessage.meta_json) : null,
        },
        agent_message: agentMessage
          ? {
              ...agentMessage,
              meta: agentMessage.meta_json ? JSON.parse(agentMessage.meta_json) : null,
            }
          : null,
        assistant_result: assistantResult,
      });
    } catch (err) {
      next(err);
    }
  });
}
