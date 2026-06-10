import { authApiUrl, mediaApiUrl, getOmsManagementServer } from './orbitServer';

function authToken(): string | null {
  try {
    return localStorage.getItem('orbit.session.v1');
  } catch {
    return null;
  }
}

/** Fetch Orbit auth API on the account home server. */
export async function orbitApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  const token = authToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  if (init.body && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(authApiUrl(path), { ...init, headers });
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
