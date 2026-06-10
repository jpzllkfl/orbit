import { isDesktopApp } from './isDesktop.ts';

/** Account + cloud sync (auth, settings bundle). */
const HOME_LS = 'orbit.server.home.v1';

/** Desktop Plex-PC media server URL synced for web/iPad playback. */
export const DESKTOP_MEDIA_LS = 'orbit.desktop.media.v1';

/** Cloud home used by packaged desktop for account sync (must match your live site). */
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

/** Auth + account sync server. */
export function getAuthServer(): string {
  const pageOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  if (isDesktopApp()) {
    try {
      const stored = localStorage.getItem(HOME_LS);
      if (stored) {
        const norm = normalizeOrigin(stored);
        if (!isLocalHome(norm)) return norm;
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_CLOUD_HOME;
  }
  try {
    const stored = localStorage.getItem(HOME_LS);
    if (stored) {
      const norm = normalizeOrigin(stored);
      if (pageOrigin && isPrivateHost(norm) && !isPrivateHost(pageOrigin)) {
        return pageOrigin;
      }
      return norm;
    }
  } catch {
    /* ignore */
  }
  return pageOrigin || '';
}

/** Orbit Media Server — local on desktop (Plex-style), cloud on web/iPad. */
export function getMediaServer(): string {
  if (isDesktopApp() && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return getOmsPlaybackOrigin();
}

/** Where OMS streams should be fetched (desktop LAN URL when libraries were scanned on Plex PC). */
export function getOmsPlaybackOrigin(): string {
  if (isDesktopApp() && typeof window !== 'undefined') {
    return window.location.origin;
  }
  try {
    const remote = localStorage.getItem(DESKTOP_MEDIA_LS);
    if (remote && canUseDesktopMediaUrl(normalizeOrigin(remote))) {
      return normalizeOrigin(remote);
    }
  } catch {
    /* ignore */
  }
  return getAuthServer();
}

/** OMS library management (Connections panel) — always the page's Orbit server on web. */
export function getOmsManagementServer(): string {
  if (isDesktopApp() && typeof window !== 'undefined') {
    return window.location.origin;
  }
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }
  return getAuthServer();
}

/** Browsers block https://orbit.broken-eye.com → http://192.168.x.x (mixed content + CORS). */
function canUseDesktopMediaUrl(url: string): boolean {
  if (typeof window === 'undefined' || !url) return false;
  const page = window.location.origin;
  if (page.startsWith('https://') && url.startsWith('http://')) return false;
  if (isPrivateHost(url) && !isPrivateHost(page)) return false;
  return true;
}

export function getHomeServer(): string {
  return getAuthServer();
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

export function setDesktopMediaOrigin(url: string) {
  const norm = normalizeOrigin(url);
  if (!norm) {
    localStorage.removeItem(DESKTOP_MEDIA_LS);
    return;
  }
  localStorage.setItem(DESKTOP_MEDIA_LS, norm);
}

/** True when API calls go to a different host than this page (e.g. desktop → orbit.broken-eye.com). */
export function isUsingRemoteHome(): boolean {
  if (typeof window === 'undefined') return false;
  return getAuthServer() !== window.location.origin;
}

export function authApiUrl(path: string): string {
  const base = getAuthServer();
  const p = path.startsWith('/') ? path : '/' + path;
  return base + p;
}

export function mediaApiUrl(path: string): string {
  const base = getOmsPlaybackOrigin();
  const p = path.startsWith('/') ? path : '/' + path;
  return base + p;
}

/** @deprecated Use authApiUrl or mediaApiUrl */
export function apiUrl(path: string): string {
  if (path.startsWith('/api/media') || path.startsWith('/api/tmdb') || path.startsWith('/api/art')) {
    return mediaApiUrl(path);
  }
  return authApiUrl(path);
}
