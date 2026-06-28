import { Router } from 'express';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { requireAuthWithCloudBridge } from '../auth-cloud-bridge.js';
import { resolveRelayOrigin } from '../media/relay.js';
import {
  connectionStatus,
  clearCredentials,
  loadCredentials,
} from './store.js';
import {
  classifyYoutubeTvError,
  disconnect,
  listChannels,
  pollConnect,
  relayInnertubeFetch,
  resolveStream,
  startConnect,
  buildClientBrowseRequests,
  channelsFromBrowsePayload,
} from './client.js';
import { sanitizeYoutubeTvErrorText } from './errors.js';

function respondYoutubeTvError(res, err, fallback) {
  const { message, needsReconnect } = classifyYoutubeTvError(err);
  if (needsReconnect) clearCredentials(res.locals.orbitUserId);
  res.status(needsReconnect ? 401 : 502).json({
    error: sanitizeYoutubeTvErrorText(message, fallback),
    needsReconnect,
    blockedByCloudflare: Boolean(err?.blockedByCloudflare),
    clientBrowseAvailable: Boolean(err?.clientBrowseAvailable || err?.blockedByCloudflare),
    relayConfigured: Boolean(err?.relayConfigured),
    relayFailed: Boolean(err?.relayFailed),
  });
}

function relayUnavailableMessage(origin) {
  if (!origin) {
    return 'YouTube TV blocked the cloud server. Open Orbit on your Plex PC, sign in, tap Sync now, then refresh Live TV.';
  }
  return `YouTube TV blocked the cloud server and could not reach your desktop Orbit at ${origin}. Keep Orbit open on your Plex PC, tap Sync in Connections, then refresh.`;
}

function relayFetchErrorMessage(origin, detail) {
  const hint = relayUnavailableMessage(origin);
  const extra = detail ? ` (${sanitizeYoutubeTvErrorText(detail, '')})` : '';
  return `${hint}${extra}`.trim();
}

const CHANNELS_DEADLINE_MS = 25000;
const RELAY_TIMEOUT_MS = 10000;

function withDeadline(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out. Try again or use the Orbit desktop app.`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function desktopRelayFetch(req) {
  const origin = resolveRelayOrigin(req);
  if (!origin) return null;
  return async (url, init = {}) => {
    let relayRes;
    try {
      relayRes = await fetch(`${origin}/api/youtube-tv/innertube-relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.toString(),
          method: init.method || 'POST',
          headers: init.headers || {},
          body: typeof init.body === 'string' ? init.body : '',
        }),
        signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
      });
    } catch (e) {
      const err = new Error(
        e?.name === 'TimeoutError' || e?.name === 'AbortError'
          ? 'Desktop Orbit did not respond in time. Open Orbit on your home PC and try again.'
          : 'Could not reach your desktop Orbit app. Open Orbit on your home PC (same account) and tap Sync now.',
      );
      err.relayUnreachable = true;
      throw err;
    }
    const payload = await relayRes.json().catch(() => ({}));
    if (!relayRes.ok) {
      throw new Error(payload.error || 'Desktop relay failed.');
    }
    const status = Number(payload.status) || 502;
    const contentType = payload.contentType || '';
    const bodyText = String(payload.body || '');
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
      text: async () => bodyText,
    };
  };
}

function requireAuth(req, res, next) {
  requireAuthWithCloudBridge(req, res, next);
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
    const relayOrigin = resolveRelayOrigin(req);
    try {
      const channels = await withDeadline(
        (async () => {
          try {
            return await listChannels(req.orbitUser.id);
          } catch (e) {
            if (!e?.blockedByCloudflare) throw e;
            const relayFetch = desktopRelayFetch(req);
            if (!relayFetch) {
              e.clientBrowseAvailable = true;
              e.relayConfigured = false;
              e.message = relayUnavailableMessage(null);
              throw e;
            }
            try {
              return await listChannels(req.orbitUser.id, { fetchImpl: relayFetch });
            } catch (relayErr) {
              relayErr.blockedByCloudflare = true;
              relayErr.clientBrowseAvailable = true;
              relayErr.relayConfigured = true;
              relayErr.relayFailed = true;
              relayErr.message = relayFetchErrorMessage(relayOrigin, relayErr.message);
              throw relayErr;
            }
          }
        })(),
        CHANNELS_DEADLINE_MS,
        'Channel load',
      );
      res.json({ channels });
    } catch (e) {
      if (e?.blockedByCloudflare) {
        e.relayConfigured = Boolean(relayOrigin);
      }
      respondYoutubeTvError(res, e, 'Could not load YouTube TV channels.');
    }
  });

  /** Short-lived browse requests for client/Electron relay (residential IP). */
  router.get('/browse-requests', requireAuth, async (req, res) => {
    try {
      const requests = await buildClientBrowseRequests(req.orbitUser.id);
      res.json({ requests });
    } catch (e) {
      respondYoutubeTvError(res, e, 'Could not prepare YouTube TV channel load.');
    }
  });

  /** Parse browse JSON returned by the user's browser or desktop app. */
  router.post('/channels/from-browse', requireAuth, async (req, res) => {
    try {
      const channels = channelsFromBrowsePayload(req.body || {});
      res.json({ channels });
    } catch (e) {
      respondYoutubeTvError(res, e, 'Could not parse YouTube TV channel guide.');
    }
  });

  /** Check whether cloud can reach the synced desktop for YouTube relay. */
  router.get('/relay-status', requireAuth, async (req, res) => {
    const origin = resolveRelayOrigin(req);
    if (!origin) {
      res.json({
        ok: false,
        configured: false,
        error: 'Desktop not linked. Open Orbit on your Plex PC, sign in, and tap Sync now.',
      });
      return;
    }
    try {
      const r = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(8000) });
      res.json({
        ok: r.ok,
        configured: true,
        origin,
      });
    } catch (e) {
      res.status(502).json({
        ok: false,
        configured: true,
        origin,
        error: e.message || 'Could not reach desktop Orbit on your LAN.',
      });
    }
  });

  /** LAN relay: cloud server asks desktop to run the YouTube fetch from a home IP. */
  router.post('/innertube-relay', async (req, res) => {
    try {
      const out = await relayInnertubeFetch(req.body || {});
      res.json(out);
    } catch (e) {
      res.status(502).json({ error: sanitizeYoutubeTvErrorText(e.message, 'Relay failed.') });
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
      respondYoutubeTvError(res, e, 'Stream resolution failed.');
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
