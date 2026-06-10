/** Orbit ships with TMDB enabled — override with ORBIT_TMDB_API_KEY only if you use your own key. */
export const BUILTIN_TMDB_KEY = 'b379792391747f1606e1d7a933dd2aea';

function envTmdbKey() {
  const raw = (process.env.ORBIT_TMDB_API_KEY || '').trim();
  if (!raw || raw === 'undefined' || raw === 'null' || raw === 'changeme' || raw === 'set') return '';
  return raw;
}

/** Call once at process start so Docker/Electron always have a key even if env is blank. */
export function ensureTmdbEnvAtBoot() {
  if (!envTmdbKey()) {
    process.env.ORBIT_TMDB_API_KEY = BUILTIN_TMDB_KEY;
  }
}

export function getDefaultTmdbKey() {
  return envTmdbKey() || BUILTIN_TMDB_KEY;
}

export function isTmdbConfigured() {
  return !!getDefaultTmdbKey();
}

export function resolveTmdbKey(override) {
  const o = (override || '').trim();
  // Ignore junk client overrides — always fall back to server baked-in key.
  if (o && o !== 'set' && o.length >= 20) return o;
  return getDefaultTmdbKey();
}

export function tmdbAuthHeaders(apiKey) {
  const k = (apiKey || getDefaultTmdbKey()).trim();
  if (!k) throw new Error('TMDB is not available on this Orbit server.');
  if (k.length > 40) return { Authorization: `Bearer ${k}` };
  return {};
}

export function withTmdbKey(url, apiKey) {
  const k = (apiKey || getDefaultTmdbKey()).trim();
  if (!k || k.length > 40) return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'api_key=' + encodeURIComponent(k);
}
