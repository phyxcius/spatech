import 'dotenv/config';
import { createApp } from './app.ts';
import { initDatabase, seedDatabase } from './db.ts';
import { expireStaleOrders } from './finance.ts';
import {
  getRtdbBaseUrl,
  hydrateDatabaseFromFirebaseRtdb,
  syncSnapshotToFirebaseRtdb,
} from './rtdbSync.ts';
import { validateProductionEnv } from './security.ts';

function resolvePort(): number {
  const idx = process.argv.indexOf('--port');
  if (idx !== -1 && process.argv[idx + 1]) {
    const parsed = Number(process.argv[idx + 1]);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  const eqArg = process.argv.find((a) => a.startsWith('--port='));
  if (eqArg) {
    const parsed = Number(eqArg.split('=')[1]);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return Number(process.env.PORT || 3000);
}

function logEnvStatus(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const missing: string[] = [];
  if ((process.env.JWT_SECRET?.trim() || '').length < 32) missing.push('JWT_SECRET (min 32 chars)');
  if (!process.env.SUPERADMIN_PIN?.trim()) missing.push('SUPERADMIN_PIN');
  if (!process.env.WHATSAPP_VERIFY_TOKEN?.trim()) missing.push('WHATSAPP_VERIFY_TOKEN');

  if (missing.length > 0 && !isProd) {
    console.warn(
      `[La Chuspa Backend] Modo desarrollo: faltan variables opcionales en .env (${missing.join(', ')}). El servidor continuará con valores efímeros de desarrollo.`
    );
  }
}

async function bootstrap() {
  logEnvStatus();
  validateProductionEnv();

  const db = initDatabase();
  seedDatabase(db);
  await hydrateDatabaseFromFirebaseRtdb(db);
  void syncSnapshotToFirebaseRtdb(db);

  setInterval(() => {
    try {
      expireStaleOrders(db);
    } catch {
      // mantenimiento silencioso
    }
  }, 60_000).unref();

  const app = createApp({ db });
  app.get('/', (_req, res) => {
    res.json({
      ok: true,
      service: 'la-chuspa-backend',
      firebase_rtdb: getRtdbBaseUrl(),
      health: '/api/health',
    });
  });

  const port = resolvePort();
  app.listen(port, '0.0.0.0', () => {
    console.log(
      `La Chuspa Backend escuchando en http://0.0.0.0:${port} (${process.env.NODE_ENV === 'production' ? 'producción' : 'desarrollo'}) · Firebase RTDB: ${getRtdbBaseUrl()}`
    );
  });
}

bootstrap().catch((err) => {
  console.error('Error de configuración al iniciar backend:', err instanceof Error ? err.message : err);
  process.exit(1);
});
