import { Router } from 'express';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { resolveSession } from '../auth-store.js';
import {
  connectionStatus,
  clearCredentials,
  loadCredentials,
} from './store.js';
import {
  disconnect,
  listChannels,
  pollConnect,
  resolveStream,
  startConnect,
} from './client.js';

function bearerToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

function requireAuth(req, res, next) {
  const user = resolveSession(bearerToken(req));
  if (!user) return res.status(401).json({ error: 'Sign in to Orbit first.' });
  req.orbitUser = user;
  next();
}

function rewriteHls(body, baseUrl, proxyBase) {
  const dir = baseUrl.replace(/[^/]+$/, '');
  return body
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return line;
      let abs = t;
      if (!/^https?:\/\//i.test(t)) {
        try {
          abs = new URL(t, dir).toString();
        } catch {
          return line;
        }
      }
      return `${proxyBase}?url=${encodeURIComponent(abs)}`;
    })
    .join('\n');
}

export function createYoutubeTvRouter() {
  const router = Router();

  router.get('/status', requireAuth, (req, res) => {
    res.json(connectionStatus(req.orbitUser.id));
  });

  router.post('/connect/start', requireAuth, async (req, res) => {
    try {
      const out = await startConnect(req.orbitUser.id);
      res.json(out);
    } catch (e) {
      res.status(502).json({ error: e.message || 'Could not start YouTube TV sign-in.' });
    }
  });

  router.get('/connect/poll', requireAuth, async (req, res) => {
    try {
      const out = await pollConnect(req.orbitUser.id);
      res.json(out);
    } catch (e) {
      res.status(502).json({ error: e.message || 'Sign-in poll failed.' });
    }
  });

  router.post('/disconnect', requireAuth, async (req, res) => {
    try {
      await disconnect(req.orbitUser.id);
      clearCredentials(req.orbitUser.id);
      res.json({ ok: true });
    } catch (e) {
      clearCredentials(req.orbitUser.id);
      res.json({ ok: true });
    }
  });

  router.get('/channels', requireAuth, async (req, res) => {
    try {
      const channels = await listChannels(req.orbitUser.id);
      res.json({ channels });
    } catch (e) {
      res.status(502).json({ error: e.message || 'Could not load YouTube TV channels.' });
    }
  });

  router.get('/stream/:videoId', requireAuth, async (req, res) => {
    const videoId = String(req.params.videoId || '').trim();
    if (!videoId) {
      res.status(400).json({ error: 'Missing channel id.' });
      return;
    }
    try {
      if (!loadCredentials(req.orbitUser.id)) {
        res.status(401).json({ error: 'YouTube TV not connected.' });
        return;
      }
      const { url, title } = await resolveStream(req.orbitUser.id, videoId);
      res.json({
        url: `/api/youtube-tv/proxy?url=${encodeURIComponent(url)}`,
        title,
      });
    } catch (e) {
      res.status(502).json({ error: e.message || 'Stream resolution failed.' });
    }
  });

  router.get('/proxy', requireAuth, async (req, res) => {
    const url = String(req.query.url || '');
    if (!/^https?:\/\//i.test(url)) {
      res.status(400).json({ error: 'Invalid stream URL.' });
      return;
    }
    try {
      const headers = {};
      if (req.headers.range) headers.Range = req.headers.range;
      const upstream = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(120000),
      });
      const ct = upstream.headers.get('content-type') || '';
      const isM3u8 = url.includes('.m3u8') || ct.includes('mpegurl');

      if (isM3u8 && upstream.ok) {
        const text = await upstream.text();
        const host = `${req.protocol}://${req.get('host')}`;
        const rewritten = rewriteHls(text, url, `${host}/api/youtube-tv/proxy`);
        res.status(200);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(rewritten);
        return;
      }

      res.status(upstream.status);
      for (const [key, value] of upstream.headers) {
        const k = key.toLowerCase();
        if (['content-type', 'content-length', 'content-range', 'accept-ranges'].includes(k)) {
          res.setHeader(key, value);
        }
      }
      if (!upstream.body) {
        res.end();
        return;
      }
      await pipeline(Readable.fromWeb(upstream.body), res);
    } catch (e) {
      if (!res.headersSent) {
        res.status(502).json({ error: e.message || 'Stream proxy failed.' });
      }
    }
  });

  return router;
}
