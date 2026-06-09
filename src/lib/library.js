/* ============ ORBIT — data layer ============
   Resolves titles to real artwork + metadata via TMDB, and powers Smart Add
   (live search for titles AND franchise collections).
   - Bring-your-own free API key (v3 key or v4 read token), stored locally.
   - Resolved art cached in localStorage so reloads are instant.
   - No key / no match / offline → callers fall back to generated key-art. */
window.OrbitLib = (function () {
  const KEY_LS = 'orbit.tmdb.key';
  const CONN_LS = 'orbit.conn.v1';
  const CACHE_LS = 'orbit.art.cache.v1';

  let key = '';

  function mirrorConnKey() {
    try {
      const raw = localStorage.getItem(CONN_LS);
      if (!raw) return;
      const c = JSON.parse(raw);
      if (c && typeof c === 'object') {
        c.tmdbKey = key || undefined;
        localStorage.setItem(CONN_LS, JSON.stringify(c));
      }
    } catch (e) { /* ignore */ }
  }

  function loadKey() {
    try {
      const stored = (localStorage.getItem(KEY_LS) || '').trim();
      if (stored) {
        key = stored;
        return key;
      }
      const connRaw = localStorage.getItem(CONN_LS);
      if (connRaw) {
        const conn = JSON.parse(connRaw);
        const backup = (conn && conn.tmdbKey || '').trim();
        if (backup) {
          key = backup;
          try { localStorage.setItem(KEY_LS, key); } catch (e) { /* ignore */ }
          return key;
        }
      }
      const sess = (sessionStorage.getItem(KEY_LS) || '').trim();
      if (sess) {
        key = sess;
        try { localStorage.setItem(KEY_LS, key); } catch (e) { /* ignore */ }
        return key;
      }
    } catch (e) { /* ignore */ }
    key = '';
    return key;
  }

  loadKey();
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_LS) || '{}'); } catch (e) { cache = {}; }

  const listeners = new Set();
  const inflight = new Map();
  const resolveQueue = [];
  let resolveActive = 0;
  const RESOLVE_MAX = 3;

  function plexPosterFor(node) {
    const Plex = window.OrbitPlex;
    if (!Plex?.connected || !node?.plexKey) return null;
    const poster = Plex.imgUrl('/library/metadata/' + node.plexKey + '/thumb', 'card');
    return poster || null;
  }

  function runResolveQueue() {
    while (resolveActive < RESOLVE_MAX && resolveQueue.length) {
      const job = resolveQueue.shift();
      resolveActive++;
      job().finally(() => {
        resolveActive--;
        runResolveQueue();
      });
    }
  }

  function enqueueResolve(fn) {
    return new Promise((resolve, reject) => {
      resolveQueue.push(() => fn().then(resolve, reject));
      runResolveQueue();
    });
  }

  // user artwork overrides, keyed by node id (persisted)
  const OV_LS = 'orbit.art.overrides.v1';
  let overrides = {};
  try { overrides = JSON.parse(localStorage.getItem(OV_LS) || '{}'); } catch (e) { overrides = {}; }
  function saveOv() { try { localStorage.setItem(OV_LS, JSON.stringify(overrides)); } catch (e) {} }
  function reloadFromStorage() {
    loadKey();
    try { overrides = JSON.parse(localStorage.getItem(OV_LS) || '{}'); } catch (e) { overrides = {}; }
    notify();
  }
  function getOverride(id) { return id && overrides[id] ? overrides[id] : null; }
  function setOverride(id, art) { if (!id) return; overrides[id] = { ...(overrides[id] || {}), ...art }; saveOv(); notify(); }
  function clearOverride(id) { if (id) { delete overrides[id]; saveOv(); notify(); } }

  // condensed genre-id → label (movie + tv)
  const GENRES = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
    10759: 'Action', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
    10765: 'Sci-Fi', 10766: 'Drama', 10767: 'Talk', 10768: 'War',
  };
  const genreName = (id) => GENRES[id] || '';

  function notify() { listeners.forEach((f) => { try { f(); } catch (e) {} }); }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  let saveCacheTimer = null;
  function saveCache() {
    if (saveCacheTimer) clearTimeout(saveCacheTimer);
    saveCacheTimer = setTimeout(() => {
      saveCacheTimer = null;
      try { localStorage.setItem(CACHE_LS, JSON.stringify(cache)); } catch (e) {}
    }, 2500);
  }

  function ck(node) {
    return (node.type === 'show' ? 'tv' : 'movie') + ':' + (node.title || '').toLowerCase() + ':' + (node.year || '');
  }
  function imgUrl(path, size) { return path ? 'https://image.tmdb.org/t/p/' + (size || 'w500') + path : null; }

  async function apiGet(path, params) {
    const u = new URL('https://api.themoviedb.org/3' + path);
    Object.entries(params || {}).forEach(([k, v]) => { if (v != null && v !== '') u.searchParams.set(k, v); });
    u.searchParams.set('language', 'en-US');
    const opts = {};
    if (key.startsWith('ey')) opts.headers = { Authorization: 'Bearer ' + key };
    else u.searchParams.set('api_key', key);
    const res = await fetch(u.toString(), opts);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // normalize a TMDB movie/tv record into Orbit's art+meta shape
  function normalize(r) {
    const isTv = r.media_type === 'tv' || (r.media_type == null && r.first_air_date != null);
    return {
      type: isTv ? 'show' : 'movie',
      title: r.title || r.name || 'Untitled',
      year: +(((r.release_date || r.first_air_date || '').slice(0, 4)) || 0) || null,
      genre: genreName((r.genre_ids || [])[0]),
      overview: r.overview || '',
      poster: imgUrl(r.poster_path, 'w500'),
      backdrop: imgUrl(r.backdrop_path, 'w1280'),
      rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
      tmdbId: r.id,
      popularity: r.popularity || 0,
    };
  }

  function getCached(node) {
    if (!node || node.type === 'collection') return null;
    const v = cache[ck(node)];
    return v && !v.empty ? v : null;
  }

  // resolve art — Plex poster first; TMDB only when needed and throttled
  async function resolve(node) {
    if (!node || node.type === 'collection') return null;
    const k = ck(node);
    if (cache[k]) {
      if (cache[k].plex) return cache[k];
      return cache[k].empty ? null : cache[k];
    }
    const plexPoster = plexPosterFor(node);
    if (plexPoster) {
      const data = { poster: plexPoster, backdrop: plexPoster, plex: true };
      cache[k] = data;
      saveCache();
      return data;
    }
    if (!key) return null;
    if (inflight.has(k)) return inflight.get(k);
    const p = enqueueResolve(async () => {
      try {
        const kind = node.type === 'show' ? 'tv' : 'movie';
        const params = { query: node.title, include_adult: false };
        if (node.year) params[kind === 'tv' ? 'first_air_date_year' : 'year'] = node.year;
        const json = await apiGet('/search/' + kind, params);
        const hit = (json.results || [])[0];
        const data = hit ? {
          poster: imgUrl(hit.poster_path, 'w500'),
          backdrop: imgUrl(hit.backdrop_path, 'w1280'),
          overview: hit.overview || '',
          rating: hit.vote_average ? Math.round(hit.vote_average * 10) / 10 : null,
          tmdbId: hit.id,
        } : { empty: true };
        cache[k] = data; saveCache();
        return data.empty ? null : data;
      } catch (e) { return null; }
      finally { inflight.delete(k); }
    });
    inflight.set(k, p);
    return p;
  }

  // force a TMDB lookup (ignores any Plex-seeded cache) — used as a fallback when
  // a primary (e.g. Plex server) image URL fails to load. Cached separately.
  async function resolveTmdb(node) {
    if (!node || node.type === 'collection' || !key) return null;
    const k = 'tmdb:' + ck(node);
    if (cache[k]) return cache[k].empty ? null : cache[k];
    if (inflight.has(k)) return inflight.get(k);
    const p = (async () => {
      try {
        const kind = node.type === 'show' ? 'tv' : 'movie';
        const params = { query: node.title, include_adult: false };
        if (node.year) params[kind === 'tv' ? 'first_air_date_year' : 'year'] = node.year;
        const json = await apiGet('/search/' + kind, params);
        const hit = (json.results || [])[0];
        const data = hit ? {
          poster: imgUrl(hit.poster_path, 'w500'), backdrop: imgUrl(hit.backdrop_path, 'w1280'),
          overview: hit.overview || '', rating: hit.vote_average ? Math.round(hit.vote_average * 10) / 10 : null, popularity: hit.popularity || 0, tmdbId: hit.id,
        } : { empty: true };
        cache[k] = data; saveCache();
        return data.empty ? null : data;
      } catch (e) { return null; } finally { inflight.delete(k); }
    })();
    inflight.set(k, p);
    return p;
  }

  async function resolveLogo(node) {
    if (!node || node.type === 'collection' || !key) return null;
    const k = 'logo:' + ck(node);
    if (cache[k]) return cache[k].empty ? null : cache[k].url;
    try {
      const base = await resolveTmdb(node);
      const id = base && base.tmdbId;
      if (!id) { cache[k] = { empty: true }; saveCache(); return null; }
      const kind = node.type === 'show' ? 'tv' : 'movie';
      const j = await apiGet('/' + kind + '/' + id + '/images', { include_image_language: 'en,null' });
      const logos = (j.logos || []).filter((l) => l.file_path);
      logos.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
      const en = logos.find((l) => l.iso_639_1 === 'en') || logos[0];
      const url = en ? imgUrl(en.file_path, 'w500') : null;
      cache[k] = url ? { url } : { empty: true }; saveCache();
      return url;
    } catch (e) { return null; }
  }
  // TMDB trending this week (used to feature what's hot that you actually own)
  async function trending(kind) {
    if (!key) return [];
    try {
      const j = await apiGet('/trending/' + (kind === 'show' ? 'tv' : 'movie') + '/week', {});
      return (j.results || []).map((r) => ({
        title: r.title || r.name,
        year: (r.release_date || r.first_air_date || '').slice(0, 4),
        type: kind === 'show' ? 'show' : 'movie',
        popularity: r.popularity || 0,
      }));
    } catch (e) { return []; }
  }

  async function searchTitles(q) {
    if (!key || !q.trim()) return [];
    try {
      const json = await apiGet('/search/multi', { query: q, include_adult: false });
      return (json.results || [])
        .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
        .map(normalize)
        .sort((a, b) => b.popularity - a.popularity);
    } catch (e) { return []; }
  }
  async function searchCollections(q) {
    if (!key || !q.trim()) return [];
    try {
      const json = await apiGet('/search/collection', { query: q });
      return (json.results || []).map((r) => ({
        type: 'collection', title: r.name, tmdbId: r.id,
        poster: imgUrl(r.poster_path, 'w500'), backdrop: imgUrl(r.backdrop_path, 'w1280'),
        overview: r.overview || '',
      }));
    } catch (e) { return []; }
  }
  async function collectionParts(id) {
    if (!key) return [];
    try {
      const json = await apiGet('/collection/' + id, {});
      return (json.parts || []).map((p) => normalize({ ...p, media_type: 'movie' }))
        .sort((a, b) => (a.year || 0) - (b.year || 0));
    } catch (e) { return []; }
  }

  // alternate official posters/backdrops for a node (for the art picker)
  async function fetchImages(node) {
    if (!key || !node) return null;
    try {
      let id = node.tmdbId || (getCached(node) || {}).tmdbId;
      if (!id) { const r = await resolve(node); id = r && r.tmdbId; }
      if (!id) return null;
      const kind = node.type === 'show' ? 'tv' : 'movie';
      const j = await apiGet('/' + kind + '/' + id + '/images', { include_image_language: 'en,null' });
      return {
        posters: (j.posters || []).slice(0, 12).map((p) => imgUrl(p.file_path, 'w342')),
        backdrops: (j.backdrops || []).slice(0, 8).map((p) => imgUrl(p.file_path, 'w780')),
      };
    } catch (e) { return null; }
  }

  // pre-seed the cache from Plex import or a search result so art shows instantly
  function seed(node, art) {
    if (!node || !art) return;
    cache[ck(node)] = {
      poster: art.poster || null, backdrop: art.backdrop || null,
      overview: art.overview || '', rating: art.rating || null, tmdbId: art.tmdbId,
      plex: !!(art.poster || art.backdrop),
    };
    saveCache();
  }

  function setKey(k) {
    key = (k || '').trim();
    try { localStorage.setItem(KEY_LS, key); } catch (e) { /* ignore */ }
    try { sessionStorage.setItem(KEY_LS, key); } catch (e) { /* ignore */ }
    mirrorConnKey();
    notify();
  }
  function clearCache() { cache = {}; saveCache(); notify(); }

  async function tmdbIdFor(node) {
    if (!node || node.type === 'collection') return null;
    let id = node.tmdbId || (getCached(node) || {}).tmdbId;
    if (!id) { const r = await resolve(node); id = r && r.tmdbId; }
    return id || null;
  }

  // full title details + credits for detail pages
  async function fetchDetails(node) {
    if (!key || !node || node.type === 'collection') return null;
    try {
      const id = await tmdbIdFor(node);
      if (!id) return null;
      const kind = node.type === 'show' ? 'tv' : 'movie';
      const j = await apiGet('/' + kind + '/' + id, { append_to_response: 'credits' });
      const genres = (j.genres || []).map((g) => g.name);
      const director = (j.credits && j.credits.crew || []).find((c) => c.job === 'Director');
      const creators = (j.created_by || []).map((c) => c.name);
      const cast = ((j.credits && j.credits.cast) || []).slice(0, 18).map((c) => ({
        name: c.name,
        character: c.character || '',
        photo: imgUrl(c.profile_path, 'w185'),
      }));
      return {
        overview: j.overview || '',
        tagline: j.tagline || '',
        status: j.status || null,
        genres,
        voteAverage: j.vote_average ? Math.round(j.vote_average * 10) / 10 : null,
        runtime: kind === 'movie' && j.runtime ? j.runtime : null,
        seasons: kind === 'tv' ? j.number_of_seasons : null,
        episodes: kind === 'tv' ? j.number_of_episodes : null,
        director: director ? director.name : null,
        creators,
        cast,
        network: kind === 'tv' && j.networks && j.networks[0] ? j.networks[0].name : null,
        studio: kind === 'movie' && j.production_companies && j.production_companies[0] ? j.production_companies[0].name : null,
        tmdbId: id,
      };
    } catch (e) { return null; }
  }

  async function fetchShowSeasons(node) {
    if (!key || !node || node.type !== 'show') return [];
    try {
      const id = await tmdbIdFor(node);
      if (!id) return [];
      const j = await apiGet('/tv/' + id);
      return (j.seasons || [])
        .filter((s) => s.season_number > 0)
        .map((s) => ({
          season: s.season_number,
          title: s.name || 'Season ' + s.season_number,
          poster: s.poster_path ? imgUrl(s.poster_path, 'w342') : null,
          episodes: s.episode_count || 0,
        }))
        .sort((a, b) => a.season - b.season);
    } catch (e) { return []; }
  }

  async function fetchSeasonEpisodes(node, season) {
    if (!key || !node || node.type !== 'show' || !season) return [];
    try {
      const id = await tmdbIdFor(node);
      if (!id) return [];
      const j = await apiGet('/tv/' + id + '/season/' + season);
      return (j.episodes || [])
        .filter((ep) => ep.episode_number > 0)
        .map((ep) => ({
          n: ep.episode_number,
          season,
          title: ep.name || 'Episode ' + ep.episode_number,
          synopsis: ep.overview || '',
          runtime: ep.runtime || null,
          still: ep.still_path ? imgUrl(ep.still_path, 'w300') : null,
        }))
        .sort((a, b) => a.n - b.n);
    } catch (e) { return []; }
  }

  return {
    resolve, resolveTmdb, resolveLogo, trending, getCached, seed, setKey, onChange, clearCache, imgUrl,
    searchTitles, searchCollections, collectionParts, fetchImages, fetchDetails, fetchShowSeasons, fetchSeasonEpisodes,
    getOverride, setOverride, clearOverride,
    loadKey, reloadFromStorage,
    get connected() { loadKey(); return !!key; },
    get key() { loadKey(); return key; },
  };
})();

export const Lib = window.OrbitLib;
export default Lib;
