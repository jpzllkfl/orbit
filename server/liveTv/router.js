import { Router } from 'express';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

function isAllowedUrl(raw) {
  try {
    const u = new URL(raw);
    if (!/^https?:$/i.test(u.protocol)) return false;
    return true;
  } catch {
    return false;
  }
}

function rewriteIptvM3u8(body, baseUrl, proxyBase) {
  const base = new URL(baseUrl);
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
      if (new URL(abs).origin !== base.origin && !abs.includes('.m3u8') && !abs.includes('.ts')) {
        return abs;
      }
      return `${proxyBase}?url=${encodeURIComponent(abs)}`;
    })
    .join('\n');
}

export function createLiveTvRouter() {
  const router = Router();

  router.get('/m3u', async (req, res) => {
    const url = String(req.query.url || '');
    if (!isAllowedUrl(url)) {
      res.status(400).json({ error: 'Invalid playlist URL.' });
      return;
    }
    try {
      const upstream = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: `Playlist fetch failed (${upstream.status})` });
        return;
      }
      const text = await upstream.text();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(text);
    } catch (e) {
      res.status(502).json({ error: e.message || 'Could not fetch M3U playlist.' });
    }
  });

  router.get('/stream', async (req, res) => {
    const url = String(req.query.url || '');
    if (!isAllowedUrl(url)) {
      res.status(400).json({ error: 'Invalid stream URL.' });
      return;
    }
    try {
      const headers = {};
      if (req.headers.range) headers.Range = req.headers.range;
      const upstream = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(120000),
        redirect: 'follow',
      });
      const ct = upstream.headers.get('content-type') || '';
      const isM3u8 = url.includes('.m3u8') || ct.includes('mpegurl');

      if (isM3u8 && upstream.ok) {
        const text = await upstream.text();
        const host = `${req.protocol}://${req.get('host')}`;
        const rewritten = rewriteIptvM3u8(text, url, `${host}/api/livetv/stream`);
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
