import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Rubro } from './types.ts';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

export function getJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET?.trim();
  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción');
  }
  return EPHEMERAL_SECRET;
}

export function getEncryptionKey(): Buffer {
  return crypto.createHash('sha256').update(getJwtSecret()).digest();
}

export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  const jwt = process.env.JWT_SECRET?.trim() || '';
  const superadminPin = process.env.SUPERADMIN_PIN?.trim() || '';
  const waToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || '';

  if (jwt.length < 32) {
    throw new Error('Falta JWT_SECRET válido (mínimo 32 caracteres) en modo producción.');
  }
  if (!superadminPin) {
    throw new Error('Falta SUPERADMIN_PIN en modo producción.');
  }
  if (!waToken) {
    throw new Error('Falta WHATSAPP_VERIFY_TOKEN en modo producción.');
  }
}

export function hashPin(pin: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, 64).toString('hex');
  return { hash: derived, salt };
}

export function verifyPin(pin: string, expectedHash: string, salt: string): boolean {
  if (!pin || !expectedHash || !salt) return false;
  const candidateBuf = crypto.scryptSync(pin, salt, 64);
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  if (candidateBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(candidateBuf, expectedBuf);
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = crypto.createHash('sha256').update(a).digest();
  const bufB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(bufA, bufB);
}

const TRIVIAL_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444',
  '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '2580', '0852', '1212',
]);

export function generateOrderPin(): string {
  for (let i = 0; i < 40; i++) {
    const code = String(crypto.randomInt(1000, 10000));
    if (!TRIVIAL_PINS.has(code)) {
      return code;
    }
  }
  return '7391';
}

export function encryptOrderPin(pin: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptOrderPin(payload: string | null): string | null {
  if (!payload) return null;
  const parts = payload.split(':');
  if (parts.length !== 3) return null;
  const [ivHex, tagHex, dataHex] = parts;
  try {
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export interface SessionPayload {
  role: 'NEGOCIO' | 'ADMIN' | 'CLIENTE';
  negocioId?: number;
  usuarioId?: number;
  rubro?: Rubro;
  iat: number;
  exp: number;
  jti: string;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function createSessionToken(
  data: Omit<SessionPayload, 'iat' | 'exp' | 'jti'>,
  ttlSeconds = 15 * 60
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadObj: SessionPayload = {
    ...data,
    iat: now,
    exp: now + ttlSeconds,
    jti: crypto.randomBytes(12).toString('hex'),
  };
  const payload = base64UrlEncode(JSON.stringify(payloadObj));
  const signature = base64UrlEncode(
    crypto.createHmac('sha256', getJwtSecret()).update(`${header}.${payload}`).digest()
  );
  return `${header}.${payload}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', getJwtSecret()).update(`${header}.${payload}`).digest()
  );
  if (!timingSafeEqualString(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!parsed.exp || parsed.exp < now) return null;
    if (parsed.role !== 'NEGOCIO' && parsed.role !== 'ADMIN' && parsed.role !== 'CLIENTE') return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface AuthedRequest extends Request {
  session?: SessionPayload;
}

function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

export function requireBusinessAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: 'Sesión requerida' });
    return;
  }
  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
    return;
  }
  if (session.role !== 'NEGOCIO' || !session.negocioId) {
    res.status(403).json({ error: 'Acceso restringido a sesiones de negocio' });
    return;
  }
  if (req.params.negocioId) {
    const targetId = Number(req.params.negocioId);
    if (!Number.isInteger(targetId) || targetId !== session.negocioId) {
      res.status(403).json({ error: 'No tienes permiso para acceder a otro negocio' });
      return;
    }
  }
  req.session = session;
  next();
}

export function requireUserAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: 'Sesión de usuario requerida' });
    return;
  }
  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
    return;
  }
  if (session.role !== 'CLIENTE' || !session.usuarioId) {
    res.status(403).json({ error: 'Acceso restringido a cuentas de usuario La Chuspa' });
    return;
  }
  req.session = session;
  next();
}

export function requireAdminAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: 'Sesión de administrador requerida' });
    return;
  }
  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
    return;
  }
  if (session.role !== 'ADMIN') {
    res.status(403).json({ error: 'Acceso exclusivo de administrador' });
    return;
  }
  req.session = session;
  next();
}

export function createRateLimiter(maxRequests: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      res.status(429).json({ error: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.' });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

export function sanitizeOrderForBusiness<T extends object>(
  row: T,
  viewerNegocioId: number
): Omit<T, 'pin_hash' | 'pin_salt' | 'pin_cifrado'> & { pin_prestador?: string } {
  const rec = row as Record<string, unknown>;
  const { pin_hash: _ph, pin_salt: _ps, pin_cifrado, ...rest } = rec;
  const out: Record<string, unknown> = { ...rest };
  // Solo en reserva referida, el PRESTADOR (no el referidor) recibe su PIN descifrado para entregarlo al referidor al terminar.
  if (
    typeof pin_cifrado === 'string' &&
    pin_cifrado.length > 0 &&
    rec.referido_negocio_id &&
    rec.negocio_id === viewerNegocioId &&
    rec.referido_negocio_id !== viewerNegocioId
  ) {
    const plain = decryptOrderPin(pin_cifrado);
    if (plain) {
      out.pin_prestador = plain;
    }
  }
  return out as Omit<T, 'pin_hash' | 'pin_salt' | 'pin_cifrado'> & { pin_prestador?: string };
}

export function sanitizeOrderPublic<T extends object>(
  row: T
): Omit<T, 'pin_hash' | 'pin_salt' | 'pin_cifrado' | 'cliente_telefono'> & {
  cliente_telefono_masked: string;
} {
  const rec = row as Record<string, unknown>;
  const { pin_hash: _ph, pin_salt: _ps, pin_cifrado: _pc, cliente_telefono, ...rest } = rec;
  const phoneStr = String(cliente_telefono || '');
  const masked =
    phoneStr.length >= 4 ? `${'*'.repeat(Math.max(0, phoneStr.length - 3))}${phoneStr.slice(-3)}` : '***';
  return {
    ...rest,
    cliente_telefono_masked: masked,
  } as Omit<T, 'pin_hash' | 'pin_salt' | 'pin_cifrado' | 'cliente_telefono'> & {
    cliente_telefono_masked: string;
  };
}
