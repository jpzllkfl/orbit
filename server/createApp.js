import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAuthRouter } from './auth-router.js';
import { lanAddresses } from './network.js';
import { createPlexRouter } from './plex-proxy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');

export function createApp() {
  const app = express();
  const hasDist = fs.existsSync(path.join(DIST, 'index.html'));

  app.disable('x-powered-by');
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'orbit', plexProxy: true });
  });

  app.get('/api/config', (_req, res) => {
    res.json({ plexProxy: true, version: '1.0', proxyBuild: '2025-06-08', native: !!process.env.ORBIT_NATIVE });
  });

  app.get('/api/network', (req, res) => {
    const port = Number(req.socket?.localPort) || Number(process.env.PORT) || 8090;
    res.json({
      port,
      lan: lanAddresses(),
      hostname: req.hostname || 'localhost',
    });
  });

  app.use('/api/plex', createPlexRouter());
  app.use('/api/auth', createAuthRouter());

  if (hasDist) {
    app.use(express.static(DIST, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(DIST, 'index.html'));
    });
  } else {
    app.get('*', (_req, res) => {
      res.status(503).type('text/plain').send(
        'Orbit UI not built. Run: npm run build\nOr for development: npm run dev:all (Vite on :5173, API on :8080)',
      );
    });
  }

  return app;
}
