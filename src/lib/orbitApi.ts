import { authApiUrl, getAuthServer, getOmsManagementServer } from './orbitServer';
import { isDesktopApp } from './isDesktop';

function authToken(): string | null {
  try {
    return localStorage.getItem('orbit.session.v1');
  } catch {
    return null;
  }
}

function apiFetchHeaders(init: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  const token = authToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  if (init.body && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

/** Local embedded server on desktop — residential IP for YouTube TV Innertube calls. */
export function getYoutubeTvApiBase(): string {
  if (isDesktopApp() && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return getAuthServer();
}

/** Fetch Orbit auth API on the account home server. */
export async function orbitApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(authApiUrl(path), { ...init, headers: apiFetchHeaders(init) });
}

/** YouTube TV API — local server on desktop (home IP), cloud elsewhere. */
export async function youtubeTvApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = getYoutubeTvApiBase();
  const p = path.startsWith('/') ? path : '/' + path;
  return fetch(base + p, { ...init, headers: apiFetchHeaders(init) });
}

/** Fetch Orbit Media Server API (local on desktop, same-site on web). */
export async function orbitMediaFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  const token = authToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  if (init.body && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  const base = getOmsManagementServer();
  const p = path.startsWith('/') ? path : '/' + path;
  return fetch(base + p, { ...init, headers });
}
