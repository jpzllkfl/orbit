import { resolveSession } from './auth-store.js';
import { setUserState } from './auth-store.js';
import { YTTV_BUNDLE_KEY } from './youtubeTv/store.js';

const CLOUD_HOME = () =>
  String(process.env.ORBIT_CLOUD_HOME || 'https://orbit.broken-eye.com').replace(/\/+$/, '');

/** Electron / packaged desktop — local API with cloud account tokens. */
export function isNativeDesktop() {
  return Boolean(process.env.ORBIT_NATIVE || process.env.ORBIT_DATA_DIR);
}

function bearerToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

async function fetchCloudJson(path, token) {
  const res = await fetch(`${CLOUD_HOME()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12000),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/** Pull YouTube TV credentials from the cloud account into local server state. */
export async function hydrateYoutubeTvFromCloud(cloudUserId, token) {
  const { ok, json } = await fetchCloudJson('/api/auth/sync', token);
  if (!ok) return false;
  const yttv = json?.bundle?.[YTTV_BUNDLE_KEY];
  if (!yttv || typeof yttv !== 'string') return false;
  setUserState(cloudUserId, { [YTTV_BUNDLE_KEY]: yttv });
  return true;
}

/**
 * Resolve Orbit user from local session, or (desktop only) validate cloud bearer token
 * and cache cloud-side YouTube TV credentials locally for residential-IP API calls.
 */
export async function resolveAuthWithCloudBridge(req) {
  const token = bearerToken(req);
  if (!token) return null;

  const local = resolveSession(token);
  if (local) return local;

  if (!isNativeDesktop()) return null;

  const { ok, json } = await fetchCloudJson('/api/auth/me', token);
  if (!ok || !json?.user?.id) return null;

  await hydrateYoutubeTvFromCloud(json.user.id, token).catch(() => false);
  return json.user;
}

export function requireAuthWithCloudBridge(req, res, next) {
  void resolveAuthWithCloudBridge(req)
    .then((user) => {
      if (!user) return res.status(401).json({ error: 'Sign in to Orbit first.' });
      req.orbitUser = user;
      res.locals.orbitUserId = user.id;
      next();
    })
    .catch(() => {
      res.status(502).json({
        error: 'Could not reach your Orbit account. Check your internet connection and try again.',
      });
    });
}
