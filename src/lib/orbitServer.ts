import { isDesktopApp } from './isDesktop.ts';

/** Canonical Orbit server (auth + OMS). Plex-style: one home, all clients connect to it. */
const HOME_LS = 'orbit.server.home.v1';

/** Cloud home used by packaged desktop when no override is saved (must match your live site). */
export const DEFAULT_CLOUD_HOME =
  (import.meta.env.VITE_ORBIT_HOME as string | undefined)?.trim() || 'https://orbit.broken-eye.com';

export function normalizeOrigin(url: string): string {
  const t = (url || '').trim().replace(/\/+$/, '');
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return 'https://' + t;
}

function isPrivateHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h.startsWith('192.168.') ||
      h.startsWith('10.') ||
      h.endsWith('.local')
    );
  } catch {
    return false;
  }
}

function isLocalHome(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0';
  } catch {
    return false;
  }
}

export function getHomeServer(): string {
  const pageOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  try {
    const stored = localStorage.getItem(HOME_LS);
    if (stored) {
      const norm = normalizeOrigin(stored);
      // Account sync may carry a LAN home from desktop — don't use it on the public site.
      if (pageOrigin && isPrivateHost(norm) && !isPrivateHost(pageOrigin)) {
        return pageOrigin;
      }
      // Packaged desktop must not use loopback as home — that is a separate local DB from the web app.
      if (isDesktopApp() && isLocalHome(norm)) {
        return DEFAULT_CLOUD_HOME;
      }
      return norm;
    }
  } catch {
    /* ignore */
  }
  // Desktop installer: default to cloud home so sign-in shares libraries with web/iPad.
  if (isDesktopApp()) return DEFAULT_CLOUD_HOME;
  return pageOrigin || '';
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
