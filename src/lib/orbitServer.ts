/** Canonical Orbit server (auth + OMS). Plex-style: one home, all clients connect to it. */
const HOME_LS = 'orbit.server.home.v1';

export function normalizeOrigin(url: string): string {
  const t = (url || '').trim().replace(/\/+$/, '');
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return 'https://' + t;
}

export function getHomeServer(): string {
  try {
    const stored = localStorage.getItem(HOME_LS);
    if (stored) return normalizeOrigin(stored);
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function setHomeServer(url: string) {
  const norm = normalizeOrigin(url);
  if (!norm) {
    localStorage.removeItem(HOME_LS);
    return;
  }
  localStorage.setItem(HOME_LS, norm);
}

export function clearHomeServer() {
  localStorage.removeItem(HOME_LS);
}

/** True when API calls go to a different host than this page (e.g. desktop → orbit.broken-eye.com). */
export function isUsingRemoteHome(): boolean {
  if (typeof window === 'undefined') return false;
  return getHomeServer() !== window.location.origin;
}

export function apiUrl(path: string): string {
  const base = getHomeServer();
  const p = path.startsWith('/') ? path : '/' + path;
  return base + p;
}
