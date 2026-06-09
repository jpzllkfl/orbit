import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { Router } from 'express';
import { buildOrbitTreeFromPlex, buildOrbitTreeFromPlexIncremental } from './plexImportTree.js';

const manifestCache = new Map();
const MANIFEST_TTL_MS = 8000;

function getCachedManifest(key) {
  const hit = manifestCache.get(key);
  if (!hit || Date.now() - hit.at > MANIFEST_TTL_MS) return null;
  return hit.body;
}

function setCachedManifest(key, body) {
  manifestCache.set(key, { at: Date.now(), body });
  if (manifestCache.size > 48) {
    const oldest = manifestCache.keys().next().value;
    if (oldest) manifestCache.delete(oldest);
  }
}

const PLEX_ID_HEADERS = [
  'x-plex-product',
  'x-plex-version',
  'x-plex-client-identifier',
  'x-plex-platform',
  'x-plex-device',
  'x-plex-token',
  'accept',
  'content-type',
];

function pickHeaders(req, extra = {}) {
  const out = { ...extra };
  for (const k of PLEX_ID_HEADERS) {
    const v = req.headers[k];
    if (v) out[k] = v;
  }
  return out;
}

function appendToken(url, token) {
  const u = new URL(url);
  if (token && !u.searchParams.has('X-Plex-Token')) {
    u.searchParams.set('X-Plex-Token', token);
  }
  return u.toString();
}

/** When Orbit runs in Docker, localhost/127.0.0.1 in Plex URLs point at the container, not the host. */
function resolvePlexBase(base) {
  const raw = String(base).replace(/\/+$/, '');
  if (process.env.ORBIT_DOCKER !== '1') return raw;
  try {
    const u = new URL(raw);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      u.hostname = 'host.docker.internal';
      return u.toString().replace(/\/+$/, '');
    }
  } catch {
    /* keep original */
  }
  return raw;
}

function upstreamPlexHeaders(req, token, clientId) {
  const out = {
    Accept: '*/*',
    'X-Plex-Token': String(token),
    'X-Plex-Product': req.headers['x-plex-product'] || 'Orbit',
    'X-Plex-Version': req.headers['x-plex-version'] || '1.0',
    'X-Plex-Client-Identifier': clientId || req.headers['x-plex-client-identifier'] || 'orbit',
    'X-Plex-Platform': req.headers['x-plex-platform'] || 'Web',
    'X-Plex-Device': req.headers['x-plex-device'] || 'Orbit',
  };
  if (req?.headers?.range) out.Range = req.headers.range;
  if (req?.headers?.['if-range']) out['If-Range'] = req.headers['if-range'];
  if (req?.headers?.['x-plex-client-capabilities']) {
    out['X-Plex-Client-Capabilities'] = req.headers['x-plex-client-capabilities'];
  } else {
    out['X-Plex-Client-Capabilities'] =
      'protocols=http-video,http-live-streaming,http-mp4-streaming;videoDecoders=h264{profile:high&resolution:1080};audioDecoders=aac{channels:6}';
  }
  out['X-Plex-Provides'] = req?.headers?.['x-plex-provides'] || 'client,player';
  return out;
}

function mediaProxyUrl(base, token, plexPath, clientId) {
  const q = new URLSearchParams({
    base: String(base),
    path: plexPath,
    token: String(token),
  });
  if (clientId) q.set('clientId', String(clientId));
  return `/api/plex/media?${q.toString()}`;
}

/** Plex HLS paths must be absolute — relative session/… and segment names break URL joining. */
function normalizePlexMediaPath(path, parentPath) {
  let p = String(path || '').trim();
  if (!p) return p;
  if (/^https?:\/\//i.test(p)) {
    try {
      const u = new URL(p);
      p = u.pathname + u.search;
    } catch {
      return p;
    }
  }
  if (/^session\//i.test(p)) {
    p = '/video/:/transcode/universal/' + p;
  } else if (!p.startsWith('/') && !p.includes('://') && parentPath) {
    const parent = String(parentPath).split('?')[0];
    const dir = parent.endsWith('/') ? parent : parent.replace(/\/[^/]*$/, '/');
    if (dir.includes('/transcode/universal/')) {
      p = dir + p;
    }
  }
  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

/** Plex transcode playlists reference 127.0.0.1 — rewrite every segment URL through our proxy. */
function plexPathFromUri(uri, plexBase, parentPath) {
  const raw = String(uri).trim();
  if (!raw) return raw;
  if (raw.startsWith('/') || /^session\//i.test(raw)) {
    return normalizePlexMediaPath(raw, parentPath);
  }
  try {
    const u = new URL(raw);
    const base = new URL(plexBase);
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.origin === base.origin) {
      return normalizePlexMediaPath(u.pathname + u.search, parentPath);
    }
    return normalizePlexMediaPath(u.pathname + u.search, parentPath);
  } catch {
    return normalizePlexMediaPath(raw, parentPath);
  }
}

function rewriteM3u8Line(line, base, token, clientId, parentPath) {
  if (!line) return line;
  if (line.includes('URI="')) {
    return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
      const path = plexPathFromUri(uri, base, parentPath);
      return `URI="${mediaProxyUrl(base, token, path, clientId)}"`;
    });
  }
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return line;
  const path = plexPathFromUri(trimmed, base, parentPath);
  return mediaProxyUrl(base, token, path, clientId);
}

function rewriteM3u8(body, base, token, clientId, parentPath) {
  return body.split(/\r?\n/).map((line) => rewriteM3u8Line(line, base, token, clientId, parentPath)).join('\n');
}

function isM3u8(path, contentType) {
  const p = String(path || '');
  const ct = String(contentType || '').toLowerCase();
  return p.includes('.m3u8') || ct.includes('mpegurl') || ct.includes('m3u8');
}

function isImageResponse(path, contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return true;
  const p = String(path || '').toLowerCase();
  return p.includes('/thumb') || p.includes('/art') || p.includes('/photo') || /\.(jpe?g|png|webp|gif)(\?|$)/.test(p);
}

const imageCache = new Map();
const IMAGE_CACHE_MAX = 1200;

function imageCacheKey(base, plexPath, token) {
  return `${String(base)}|${String(plexPath)}|${String(token).slice(-10)}`;
}

function getCachedImage(key) {
  const hit = imageCache.get(key);
  if (!hit) return null;
  hit.at = Date.now();
  return hit;
}

function setCachedImage(key, buf, ct) {
  if (buf.length > 4_000_000) return;
  if (imageCache.size >= IMAGE_CACHE_MAX) {
    let oldestKey = null;
    let oldestAt = Infinity;
    for (const [k, v] of imageCache) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestKey = k;
      }
    }
    if (oldestKey) imageCache.delete(oldestKey);
  }
  imageCache.set(key, { buf, ct: ct || 'image/jpeg', at: Date.now() });
}

function sendCachedImage(res, cached, cacheStatus) {
  res.status(200);
  res.setHeader('content-type', cached.ct);
  res.setHeader('content-length', String(cached.buf.length));
  res.setHeader('cache-control', 'public, max-age=604800, immutable');
  res.setHeader('x-orbit-cache', cacheStatus);
  res.send(cached.buf);
}

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function sendError(res, status, body) {
  if (res.headersSent) return;
  res.status(status).json(body);
}

async function forwardResponse(upstream, res, { buffer = false } = {}) {
  res.status(upstream.status);
  const skip = new Set(['transfer-encoding', 'connection', 'content-encoding', 'content-length']);
  upstream.headers.forEach((value, key) => {
    if (skip.has(key.toLowerCase())) return;
    res.setHeader(key, value);
  });
  if (!upstream.body) {
    res.end();
    return;
  }
  // Buffer JSON API responses — streaming breaks when fetch decompresses gzip but
  // upstream Content-Length still reflects the compressed size (truncated JSON).
  if (buffer) {
    const text = await upstream.text();
    const buf = Buffer.from(text, 'utf8');
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('content-length', String(buf.length));
    res.send(buf);
    return;
  }
  try {
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (e) {
    if (!res.headersSent) throw e;
    res.destroy?.();
  }
}

export function createPlexRouter() {
  const router = Router();

  router.post('/import-tree/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    try {
      const base = req.body?.base || req.headers['x-orbit-plex-base'];
      const token = req.body?.token || req.headers['x-orbit-plex-token'];
      const keys = req.body?.keys;
      if (!base || !token) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Missing Plex base URL or token' })}\n\n`);
        res.end();
        return;
      }
      const result = await buildOrbitTreeFromPlexIncremental(String(base), String(token), keys, (ev) => {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      });
      if (!result.titleCount) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Plex returned no titles' })}\n\n`);
      }
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: String(e.message || e) })}\n\n`);
    }
    res.end();
  });

  /** Build full library tree server-side (large libraries — keeps renderer stable). */
  router.post('/import-tree', async (req, res) => {
    try {
      const base = req.body?.base || req.headers['x-orbit-plex-base'];
      const token = req.body?.token || req.headers['x-orbit-plex-token'];
      const keys = req.body?.keys;
      if (!base || !token) {
        res.status(400).json({ error: 'Missing Plex base URL or token' });
        return;
      }
      const result = await buildOrbitTreeFromPlex(String(base), String(token), keys);
      if (!result.titleCount) {
        res.status(502).json({ error: 'Plex returned no titles', sectionKeys: result.sectionKeys });
        return;
      }
      res.json(result);
    } catch (e) {
      res.status(502).json({ error: String(e.message || e) });
    }
  });

  /** JSON + binary proxy to a Plex Media Server (CORS bypass). */
  router.use('/proxy', async (req, res) => {
    try {
      const base = req.headers['x-orbit-plex-base'];
      const token = req.headers['x-orbit-plex-token'] || req.query['X-Plex-Token'];
      if (!base || !token) {
        res.status(400).json({ error: 'Missing X-Orbit-Plex-Base or X-Orbit-Plex-Token' });
        return;
      }

      const baseUrl = resolvePlexBase(base);
      const sub = req.url.startsWith('/') ? req.url : '/' + req.url;
      const target = appendToken(baseUrl + sub, String(token));

      const body = await readBody(req);
      const upstream = await fetch(target, {
        method: req.method,
        headers: upstreamPlexHeaders(req, token),
        ...(body ? { body, duplex: 'half' } : {}),
        redirect: 'follow',
      });

      if (!upstream.ok && process.env.DEBUG_PLEX === '1') {
        console.warn('[plex-proxy]', upstream.status, target);
      }

      await forwardResponse(upstream, res, { buffer: true });
    } catch (e) {
      if (process.env.DEBUG_PLEX === '1') console.error('[plex-proxy]', e);
      sendError(res, 502, { error: 'Plex proxy failed', detail: String(e.message || e) });
    }
  });

  /** Image / video URLs for <img> and <video> (cannot send custom headers). */
  router.get('/media', async (req, res) => {
    try {
      const base = req.query.base;
      const path = req.query.path;
      const token = req.query.token;
      const clientId = req.query.clientId;
      if (!base || !path || !token) {
        res.status(400).json({ error: 'Missing base, path, or token query params' });
        return;
      }
      const baseUrl = resolvePlexBase(base);
      const plexPath = normalizePlexMediaPath(path);
      const cacheKey = imageCacheKey(base, plexPath, token);
      const cachedHit = getCachedImage(cacheKey);
      if (cachedHit) {
        sendCachedImage(res, cachedHit, 'hit');
        return;
      }

      const target = appendToken(baseUrl + plexPath, String(token));
      const isManifest = isM3u8(plexPath, '');
      const isLiveTranscode = plexPath.includes('/transcode/');
      // Live transcode playlists change every segment — caching them causes buffer loops.
      if (isManifest && !isLiveTranscode) {
        const mKey = cacheKey + ':m3u8';
        const cachedManifest = getCachedManifest(mKey);
        if (cachedManifest) {
          res.status(200);
          res.setHeader('content-type', 'application/vnd.apple.mpegurl; charset=utf-8');
          res.setHeader('content-length', String(cachedManifest.length));
          res.setHeader('cache-control', 'no-cache');
          res.send(cachedManifest);
          return;
        }
      }

      const mediaHeaders = upstreamPlexHeaders(req, token, clientId);
      if (req.headers.range) mediaHeaders.Range = req.headers.range;

      const upstream = await fetch(target, {
        redirect: 'follow',
        headers: mediaHeaders,
      });

      if (!upstream.ok) {
        if (process.env.DEBUG_PLEX === '1') {
          console.warn('[plex-media]', upstream.status, target);
        }
        res.status(upstream.status);
        const errText = await upstream.text().catch(() => '');
        res.send(errText || upstream.statusText);
        return;
      }

      const ct = upstream.headers.get('content-type') || '';
      if (isM3u8(plexPath, ct)) {
        const text = await upstream.text();
        const rewritten = rewriteM3u8(text, base, token, clientId, plexPath);
        const buf = Buffer.from(rewritten, 'utf8');
        if (!isLiveTranscode) setCachedManifest(cacheKey + ':m3u8', buf);
        res.status(200);
        res.setHeader('content-type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('content-length', String(buf.length));
        res.setHeader('cache-control', 'no-cache');
        res.send(buf);
        return;
      }

      if (isImageResponse(plexPath, ct)) {
        const buf = Buffer.from(await upstream.arrayBuffer());
        const imgCt = ct || 'image/jpeg';
        setCachedImage(cacheKey, buf, imgCt);
        sendCachedImage(res, { buf, ct: imgCt }, 'miss');
        return;
      }

      await forwardResponse(upstream, res, { buffer: false });
    } catch (e) {
      if (process.env.DEBUG_PLEX === '1') console.error('[plex-media]', e);
      sendError(res, 502, { error: 'Media proxy failed', detail: String(e.message || e) });
    }
  });

  /** Proxy to plex.tv (PIN auth, resources discovery). */
  router.use('/tv', async (req, res) => {
    try {
      const sub = req.url.startsWith('/') ? req.url : '/' + req.url;
      const target = 'https://plex.tv/api' + sub;
      const body = await readBody(req);
      const upstream = await fetch(target, {
        method: req.method,
        headers: pickHeaders(req, { Accept: 'application/json' }),
        ...(body ? { body, duplex: 'half' } : {}),
      });
      await forwardResponse(upstream, res, { buffer: true });
    } catch (e) {
      sendError(res, 502, { error: 'plex.tv proxy failed', detail: String(e.message || e) });
    }
  });

  return router;
}
