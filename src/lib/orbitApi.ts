import { apiUrl } from './orbitServer';

function authToken(): string | null {
  try {
    return localStorage.getItem('orbit.session.v1');
  } catch {
    return null;
  }
}

/** Fetch Orbit API on home server (local or remote) with auth when signed in. */
export async function orbitApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  const token = authToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  if (init.body && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(apiUrl(path), { ...init, headers });
}
