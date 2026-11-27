import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './backend/app.ts';
import { initDatabase, seedDatabase } from './backend/db.ts';
import { expireStaleOrders } from './backend/finance.ts';
import { hydrateDatabaseFromFirebaseRtdb, syncSnapshotToFirebaseRtdb } from './backend/rtdbSync.ts';
import { validateProductionEnv } from './backend/security.ts';

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
  if (process.env.npm_config_port) {
    const parsed = Number(process.env.npm_config_port);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  if (process.env.DEFAULT_APP_PORT) {
    const parsed = Number(process.env.DEFAULT_APP_PORT);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  const envPort = Number(process.env.PORT || 3000);
  const nginxPort = Number(process.env.NGINX_PORT || 0);
  if (nginxPort > 0 && envPort === nginxPort) {
    return 3000;
  }
  return envPort;
}

async function bootstrap() {
  validateProductionEnv();

  const db = initDatabase();
  seedDatabase(db);

  setInterval(() => {
    try {
      expireStaleOrders(db);
    } catch {
      // silent background maintenance
    }
  }, 60_000).unref();

  const app = createApp({ db });
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'frontend/dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vitePromise = createViteServer({
      configFile: path.resolve(process.cwd(), 'frontend/vite.config.ts'),
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = resolvePort();
  app.listen(port, '0.0.0.0', () => {
    console.log(`La Chuspa corriendo en http://0.0.0.0:${port} (${isProd ? 'producción' : 'desarrollo'})`);
    void hydrateDatabaseFromFirebaseRtdb(db).then(() => syncSnapshotToFirebaseRtdb(db));
  });
}

bootstrap().catch((err) => {
  console.error('Error fatal al iniciar La Chuspa:', err instanceof Error ? err.message : err);
  process.exit(1);
});
