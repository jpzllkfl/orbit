/* ============ ORBIT — playback progress store ============
   Tracks where you left off (movies + episodes) so Continue Watching and
   Resume work. Keyed by title id (+ episode), persisted to localStorage. */
window.OrbitProgress = (function () {
  const LS = 'orbit.cw.v1';
  function read() { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } }
  function write(m) { try { localStorage.setItem(LS, JSON.stringify(m)); } catch (e) {} }

  function key(node, episode) { return node.id + (episode ? ':s' + episode.season + 'e' + episode.n : ''); }
  function snap(node) {
    const { id, title, year, type, genre, rating, runtime, seasons, epsPerSeason, plexKey, partKey } = node;
    return { id, title, year, type, genre, rating, runtime, seasons, epsPerSeason, plexKey, partKey };
  }

  function set(node, episode, t, d) {
    if (!d || t < 3) return;
    const m = read();
    const k = key(node, episode);
    const pct = Math.max(0, Math.min(1, t / d));
    if (pct >= 0.97) { delete m[k]; write(m); invalidateList(); return; }   // finished → drop
    m[k] = {
      key: k, node: snap(node),
      episode: episode ? { season: episode.season, n: episode.n, title: episode.title } : null,
      t, d, pct, updatedAt: Date.now(),
    };
    write(m);
    invalidateList();
  }
  function get(node, episode) { return read()[key(node, episode)] || null; }
  function remove(k) { const m = read(); delete m[k]; write(m); invalidateList(); }
  let listCache = null;
  let listCacheAt = 0;
  function invalidateList() { listCache = null; }
  function list() {
    const now = Date.now();
    if (listCache && now - listCacheAt < 800) return listCache;
    listCache = Object.values(read())
      .filter((r) => r.pct > 0.005 && r.pct < 0.97)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    listCacheAt = now;
    return listCache;
  }
  function clearAll() { write({}); }

  function watchedKey(id) { return 'orbit.watched.' + id; }
  function setWatched(id, on) {
    try {
      if (on) localStorage.setItem(watchedKey(id), '1');
      else localStorage.removeItem(watchedKey(id));
    } catch (e) { /* ignore */ }
  }
  function isWatched(id) {
    try { return localStorage.getItem(watchedKey(id)) === '1'; } catch (e) { return false; }
  }

  /** Apply Plex viewOffset / viewCount onto local progress + watched flags. */
  function applyPlexState(node, episode, { viewOffset, viewCount, duration } = {}) {
    const offset = viewOffset || 0;
    const dur = duration || node.duration || (node.runtime ? node.runtime * 60000 : 0);
    const views = viewCount || 0;
    if (offset > 30000 && dur > 0) {
      set(node, episode || null, offset / 1000, dur / 1000);
      return;
    }
    if (views > 0 && offset < 30000) {
      setWatched(node.id, true);
      remove(key(node, episode || null));
    }
  }

  return { key, set, get, remove, list, clearAll, setWatched, isWatched, applyPlexState };
})();

export const Progress = window.OrbitProgress;
export default Progress;
