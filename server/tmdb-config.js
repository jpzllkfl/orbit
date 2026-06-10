/** Orbit ships with TMDB enabled — override with ORBIT_TMDB_API_KEY if needed. */
const BUILTIN_TMDB_KEY = 'b379792391747f1606e1d7a933dd2aea';

export function getDefaultTmdbKey() {
  return (process.env.ORBIT_TMDB_API_KEY || BUILTIN_TMDB_KEY).trim();
}

export function isTmdbConfigured() {
  return !!getDefaultTmdbKey();
}

export function resolveTmdbKey(override) {
  const o = (override || '').trim();
  if (o) return o;
  return getDefaultTmdbKey();
}

export function tmdbAuthHeaders(apiKey) {
  const k = (apiKey || '').trim();
  if (!k) throw new Error('TMDB is not configured on this Orbit server.');
  if (k.length > 40) return { Authorization: `Bearer ${k}` };
  return {};
}

export function withTmdbKey(url, apiKey) {
  const k = (apiKey || '').trim();
  if (!k || k.length > 40) return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'api_key=' + encodeURIComponent(k);
}
