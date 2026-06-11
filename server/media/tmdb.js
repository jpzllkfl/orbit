const TMDB = 'https://api.themoviedb.org/3';

function authHeaders(apiKey) {
  const k = (apiKey || '').trim();
  if (!k) throw new Error('TMDB API key required.');
  if (k.length > 40) return { Authorization: `Bearer ${k}` };
  return {};
}

function withKey(url, apiKey) {
  const k = (apiKey || '').trim();
  if (k.length > 40) return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'api_key=' + encodeURIComponent(k);
}

const GENRE_NAMES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie', 53: 'Thriller',
  10752: 'War', 37: 'Western', 10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
  10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
};

export function genreNameFromIds(ids) {
  const id = (ids || [])[0];
  return id ? GENRE_NAMES[id] || '' : '';
}

export function tmdbImgUrl(path, size = 'w500') {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export async function tmdbSearch(kind, title, year, apiKey) {
  const params = new URLSearchParams({ query: (title || '').trim(), include_adult: 'false' });
  if (year) params.set(kind === 'tv' ? 'first_air_date_year' : 'year', String(year));
  const url = withKey(`${TMDB}/search/${kind}?${params}`, apiKey);
  const res = await fetch(url, { headers: authHeaders(apiKey) });
  if (!res.ok) throw new Error('TMDB search failed (' + res.status + ')');
  const json = await res.json();
  return (json.results || [])[0] || null;
}

/** Try several title variants until one matches TMDB. */
export async function tmdbSearchAny(kind, queries, year, apiKey) {
  for (const q of queries || []) {
    const query = (q || '').trim();
    if (!query) continue;
    try {
      const hit = await tmdbSearch(kind, query, year, apiKey);
      if (hit?.id) return hit;
    } catch {
      /* try next query */
    }
    await sleep(220);
  }
  return null;
}

export async function tmdbDetails(kind, id, apiKey) {
  const url = withKey(`${TMDB}/${kind}/${id}`, apiKey);
  const res = await fetch(url, { headers: authHeaders(apiKey) });
  if (!res.ok) throw new Error('TMDB details failed (' + res.status + ')');
  return res.json();
}

/** Resolve TVDB/IMDB ids to TMDB records (Sonarr-style {tvdb-123} folders). */
export async function tmdbFindExternal(kind, externalId, source, apiKey) {
  const id = Number(externalId);
  if (!id) return null;
  const url = withKey(`${TMDB}/find/${id}?external_source=${encodeURIComponent(source)}`, apiKey);
  const res = await fetch(url, { headers: authHeaders(apiKey) });
  if (!res.ok) throw new Error('TMDB find failed (' + res.status + ')');
  const json = await res.json();
  const key = kind === 'tv' ? 'tv_results' : 'movie_results';
  return (json[key] || [])[0] || null;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
