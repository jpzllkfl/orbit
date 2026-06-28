import { getUserState, setUserState } from '../auth-store.js';

export const YTTV_BUNDLE_KEY = 'orbit.youtubetv.v1';

const pendingAuth = new Map();

export function getPendingAuth(userId) {
  return pendingAuth.get(userId) || null;
}

export function setPendingAuth(userId, data) {
  if (!data) pendingAuth.delete(userId);
  else pendingAuth.set(userId, data);
}

export function loadCredentials(userId) {
  const state = getUserState(userId);
  const raw = state.bundle?.[YTTV_BUNDLE_KEY];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveCredentials(userId, credentials) {
  const payload = JSON.stringify({
    credentials,
    connectedAt: Date.now(),
  });
  setUserState(userId, { [YTTV_BUNDLE_KEY]: payload });
  return credentials;
}

export function clearCredentials(userId) {
  const state = getUserState(userId);
  const bundle = { ...(state.bundle || {}) };
  delete bundle[YTTV_BUNDLE_KEY];
  setUserState(userId, bundle);
  pendingAuth.delete(userId);
}

export function connectionStatus(userId) {
  const stored = loadCredentials(userId);
  if (!stored?.credentials?.access_token) {
    return { connected: false };
  }
  return {
    connected: true,
    connectedAt: stored.connectedAt || null,
    expiresAt: stored.credentials.expiry_date || null,
  };
}
