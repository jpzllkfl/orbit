import { Router } from 'express';
import { getDefaultTmdbKey, isTmdbConfigured, resolveTmdbKey, tmdbAuthHeaders, withTmdbKey } from './tmdb-config.js';

const TMDB = 'https://api.themoviedb.org/3';

export function createTmdbRouter() {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json({
      available: isTmdbConfigured(),
      source: isTmdbConfigured() ? 'server' : 'none',
    });
  });

  /** Proxy TMDB v3 — client passes path like /search/movie?query=... */
  router.get('/proxy', async (req, res) => {
    try {
      const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
      if (!rawPath.startsWith('/')) {
        res.status(400).json({ error: 'Invalid TMDB path.' });
        return;
      }
      const override = req.headers['x-orbit-tmdb-key'];
      const apiKey = resolveTmdbKey(typeof override === 'string' ? override : '');
      if (!apiKey) {
        res.status(503).json({ error: 'TMDB is not configured. Set ORBIT_TMDB_API_KEY on the Orbit server.' });
        return;
      }

      const extra = new URLSearchParams();
      for (const [k, v] of Object.entries(req.query)) {
        if (k === 'path' || v == null) continue;
        extra.set(k, String(v));
      }
      if (!extra.has('language')) extra.set('language', 'en-US');

      let url = TMDB + rawPath;
      const q = extra.toString();
      if (q) url += (rawPath.includes('?') ? '&' : '?') + q;
      url = withTmdbKey(url, apiKey);

      const upstream = await fetch(url, { headers: tmdbAuthHeaders(apiKey) });
      const body = await upstream.text();
      res.status(upstream.status);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
      res.send(body);
    } catch (e) {
      res.status(502).json({ error: e.message || 'TMDB proxy failed.' });
    }
  });

  router.get('/configured', (_req, res) => {
    res.json({ key: getDefaultTmdbKey() ? 'set' : 'missing' });
  });

  return router;
}
