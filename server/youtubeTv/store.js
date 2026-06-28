import { getUserState, replaceUserState, setUserState } from '../auth-store.js';

export const YTTV_BUNDLE_KEY = 'orbit.youtubetv.v1';

const pendingAuth = new Map();

export function getPendingAuth(userId) {
  return pendingAuth.get(userId) || null;
}

export function setPendingAuth(userId, data) {
  if (!data) pendingAuth.delete(userId);
  else pendingAuth.set(userId, data);
}

function normalizeCredentials(credentials) {
  if (!credentials || typeof credentials !== 'object') return null;
  const creds = { ...credentials };
  if (creds.expires_in && !creds.expiry_date) {
    creds.expiry_date = new Date(Date.now() + Number(creds.expires_in) * 1000).toISOString();
    delete creds.expires_in;
  }
  if (!creds.access_token || !creds.refresh_token) return null;
  if (!creds.expiry_date) {
    creds.expiry_date = new Date(Date.now() + 3600 * 1000).toISOString();
  }
  return creds;
}

export function loadCredentials(userId) {
  const state = getUserState(userId);
  const raw = state.bundle?.[YTTV_BUNDLE_KEY];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.credentials) {
      parsed.credentials = normalizeCredentials(parsed.credentials);
      if (!parsed.credentials) return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveCredentials(userId, credentials) {
  const normalized = normalizeCredentials(credentials);
  if (!normalized) throw new Error('Invalid YouTube TV credentials.');
  const payload = JSON.stringify({
    credentials: normalized,
    connectedAt: Date.now(),
  });
  setUserState(userId, { [YTTV_BUNDLE_KEY]: payload });
  return normalized;
}

export function clearCredentials(userId) {
  const state = getUserState(userId);
  if (!state.bundle?.[YTTV_BUNDLE_KEY]) return;
  const bundle = { ...(state.bundle || {}) };
  delete bundle[YTTV_BUNDLE_KEY];
  replaceUserState(userId, bundle);
  pendingAuth.delete(userId);
}

export function connectionStatus(userId) {
  const stored = loadCredentials(userId);
  if (!stored?.credentials?.access_token || !stored?.credentials?.refresh_token) {
    return { connected: false };
  }
  return {
    connected: true,
    connectedAt: stored.connectedAt || null,
    expiresAt: stored.credentials.expiry_date || null,
  };
}
