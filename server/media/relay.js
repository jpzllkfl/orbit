import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { getUserState, resolveSession } from '../auth-store.js';

function bearerOrQueryToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  const q = req.query?.orbit_token;
  return typeof q === 'string' && q.trim() ? q.trim() : null;
}

function normalizeOrigin(url) {
  return String(url || '')
    .trim()
    .replace(/\/+$/, '');
}

/** Desktop Plex-PC media origin from account sync (`orbit.desktop.media.v1`). */
export function resolveRelayOrigin(req) {
  const user = resolveSession(bearerOrQueryToken(req));
  if (!user) return null;
  const state = getUserState(user.id);
  const raw = state.bundle?.['orbit.desktop.media.v1'];
  if (!raw || typeof raw !== 'string') return null;
  const origin = normalizeOrigin(raw);
  if (!/^https?:\/\//i.test(origin)) return null;
  return origin;
}

export function relayAuthMiddleware(req, res, next) {
  if (!resolveRelayOrigin(req)) {
    return res.status(401).json({
      error: 'Sign in and sync from your Orbit desktop app to stream from your Plex PC.',
    });
  }
  next();
}

async function forwardUpstream(req, res, targetUrl, { rewriteM3u8 } = {}) {
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;
  const upstream = await fetch(targetUrl, {
    headers,
    signal: AbortSignal.timeout(300000),
  });

  if (rewriteM3u8 && (targetUrl.includes('.m3u8') || upstream.headers.get('content-type')?.includes('mpegurl'))) {
    const text = await upstream.text();
    if (!upstream.ok) {
      res.status(upstream.status).send(text);
      return;
    }
    const token = bearerOrQueryToken(req);
    const q = token ? `?orbit_token=${encodeURIComponent(token)}` : '';
    const base = `/api/media/relay/transcode/${rewriteM3u8.id}/`;
    const rewritten = text
      .split(/\r?\n/)
      .map((line) => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return line;
        if (t.startsWith('http://') || t.startsWith('https://')) {
          const name = t.split('/').pop()?.split('?')[0];
          return name ? `${base}${name}${q}` : line;
        }
        return `${base}${t.split('?')[0]}${q}`;
      })
      .join('\n');
    res.status(200);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(rewritten);
    return;
  }

  res.status(upstream.status);
  for (const [key, value] of upstream.headers) {
    const k = key.toLowerCase();
    if (['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'].includes(k)) {
      res.setHeader(key, value);
    }
  }
  if (!upstream.body) {
    res.end();
    return;
  }
  await pipeline(Readable.fromWeb(upstream.body), res);
}

export async function relayStreamItem(req, res) {
  const origin = resolveRelayOrigin(req);
  if (!origin) {
    res.status(401).json({ error: 'Not authorized for relay playback.' });
    return;
  }
  const id = encodeURIComponent(req.params.id);
  const target = `${origin}/api/media/stream/${id}`;
  try {
    await forwardUpstream(req, res, target);
  } catch (e) {
    if (!res.headersSent) {
      res.status(502).json({ error: e.message || 'Could not reach your desktop Orbit Media Server.' });
    }
  }
}

export async function relayTranscodeFile(req, res) {
  const origin = resolveRelayOrigin(req);
  if (!origin) {
    res.status(401).json({ error: 'Not authorized for relay playback.' });
    return;
  }
  const id = encodeURIComponent(req.params.id);
  const file = encodeURIComponent(req.params.file);
  const target = `${origin}/api/media/transcode/${id}/${file}`;
  const isManifest = String(req.params.file).endsWith('.m3u8');
  try {
    await forwardUpstream(req, res, target, isManifest ? { rewriteM3u8: { id: req.params.id } } : {});
  } catch (e) {
    if (!res.headersSent) {
      res.status(502).json({ error: e.message || 'Transcode relay failed.' });
    }
  }
}
