import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAuthRouter } from './auth-router.js';
import { lanAddresses } from './network.js';
import { createMediaRouter } from './media/router.js';
import { mediaStats } from './media/db.js';
import { createArtRouter } from './art-router.js';
import { createPlexRouter } from './plex-proxy.js';
import { createTmdbRouter } from './tmdb-router.js';
import { isTmdbConfigured } from './tmdb-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');

export function createApp() {
  const app = express();
  const hasDist = fs.existsSync(path.join(DIST, 'index.html'));

  app.disable('x-powered-by');
  app.use(express.json({ limit: '25mb' }));

  // Allow desktop / other origins to call auth + OMS on the home server (Bearer token).
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Orbit-Tmdb-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/api/health', (_req, res) => {
    let media = { enabled: false };
    try {
      media = { enabled: true, ...mediaStats() };
    } catch {
      /* media db not ready */
    }
    res.json({ ok: true, service: 'orbit', plexProxy: true, mediaServer: media });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      plexProxy: true,
      mediaServer: true,
      tmdb: { available: isTmdbConfigured() },
      version: '1.0',
      proxyBuild: '2025-06-08',
      native: !!process.env.ORBIT_NATIVE,
    });
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
  app.use('/api/media', createMediaRouter());
  app.use('/api/tmdb', createTmdbRouter());
  app.use('/api/art', createArtRouter());
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
