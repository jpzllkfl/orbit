import { getDb } from './db.js';
import { listLibraries } from './libraries.js';
import { tmdbImgUrl } from './tmdb.js';

function newId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}

function libKey(name) {
  return (name || 'lib').toLowerCase().replace(/[^a-z0-9]/g, '') || 'lib';
}

function normTitle(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function rowScore(row) {
  return (row.poster_path ? 4 : 0) + (row.backdrop_path ? 2 : 0) + (row.tmdb_id ? 2 : 0) + (row.file_size || 0) / 1e15;
}

function dedupeMovieRows(rows) {
  const best = new Map();
  for (const row of rows) {
    if (row.type !== 'movie') continue;
    const key = row.tmdb_id ? `tmdb:${row.tmdb_id}` : `title:${normTitle(row.title)}:${row.year || ''}`;
    const prev = best.get(key);
    if (!prev || rowScore(row) > rowScore(prev)) best.set(key, row);
  }
  return [...best.values()];
}

function allItemsForLibrary(libraryId) {
  return getDb()
    .prepare(
      `SELECT id, type, title, year, season, episode, show_title, file_path, file_size, scanned_at,
              tmdb_id, poster_path, backdrop_path, overview, genre
       FROM media_items WHERE library_id = ? ORDER BY title`,
    )
    .all(libraryId);
}

function artFromRow(row) {
  return {
    poster: tmdbImgUrl(row.poster_path, 'w780') || undefined,
    backdrop: tmdbImgUrl(row.backdrop_path, 'original') || undefined,
  };
}

function movieNode(row, libraryId) {
  const art = artFromRow(row);
  return {
    id: row.id,
    type: 'movie',
    title: row.title,
    year: row.year || undefined,
    genre: row.genre || undefined,
    tmdbId: row.tmdb_id || undefined,
    poster: art.poster,
    backdrop: art.backdrop,
    blurb: row.overview ? String(row.overview).slice(0, 240) : undefined,
    omsItemId: row.id,
    omsPath: row.file_path,
    omsLibraryId: libraryId,
    addedAt: row.scanned_at || null,
  };
}

function buildTvChildren(rows, libraryId) {
  const byShow = new Map();
  for (const row of rows) {
    const showKey = row.tmdb_id
      ? `tmdb:${row.tmdb_id}`
      : `name:${normTitle(row.show_title || row.title || 'Unknown')}`;
    if (!byShow.has(showKey)) byShow.set(showKey, []);
    byShow.get(showKey).push(row);
  }

  const shows = [];
  for (const [showTitle, eps] of byShow) {
    const seasons = new Set(eps.map((e) => e.season).filter((s) => s != null));
    const first = eps[0];
    const withMeta = eps.find((e) => e.poster_path || e.tmdb_id) || first;
    const tmdbId = withMeta.tmdb_id || undefined;
    const art = artFromRow(withMeta);
    shows.push({
      id: newId('s'),
      type: 'show',
      title: withMeta.show_title || showTitle,
      seasons: seasons.size || undefined,
      genre: withMeta.genre || undefined,
      tmdbId,
      poster: art.poster,
      backdrop: art.backdrop,
      blurb: withMeta.overview ? String(withMeta.overview).slice(0, 240) : undefined,
      omsLibraryId: libraryId,
      omsShowTitle: withMeta.show_title || showTitle,
      addedAt: Math.max(...eps.map((e) => e.scanned_at || 0)) || null,
    });
  }
  shows.sort((a, b) => a.title.localeCompare(b.title));
  return shows;
}

function buildLibraryNode(lib) {
  const rows = allItemsForLibrary(lib.id);
  const movieRows = lib.type === 'movie' ? dedupeMovieRows(rows) : rows;
  const children = lib.type === 'movie' ? movieRows.map((r) => movieNode(r, lib.id)) : buildTvChildren(rows, lib.id);
  return {
    id: newId('lib'),
    type: 'library',
    title: lib.name,
    libKey: libKey(lib.name),
    blurb: `Orbit Media Server · ${rows.length} files`,
    omsLibraryId: lib.id,
    children,
  };
}

function countTitles(libs) {
  let n = 0;
  for (const lib of libs) {
    for (const ch of lib.children || []) {
      if (ch.type === 'movie' || ch.type === 'show') n++;
    }
  }
  return n;
}

/** Build an Orbit library tree from scanned OMS libraries. */
export function buildOrbitTreeFromOms() {
  const scanned = listLibraries().filter((l) => l.itemCount > 0 && l.pathExists);
  if (!scanned.length) {
    return { tree: null, titleCount: 0, libraryCount: 0 };
  }

  const libs = scanned.map(buildLibraryNode).filter((l) => (l.children?.length || 0) > 0);
  const titleCount = countTitles(libs);

  return {
    tree: {
      id: 'root',
      type: 'collection',
      title: 'Your Server',
      blurb: 'From Orbit Media Server.',
      children: libs,
    },
    titleCount,
    libraryCount: libs.length,
  };
}

export function getMediaItemById(id) {
  const row = getDb()
    .prepare(
      `SELECT id, library_id, type, title, file_path, file_name, file_size
       FROM media_items WHERE id = ?`,
    )
    .get(id);
  if (!row) return null;
  return {
    id: row.id,
    libraryId: row.library_id,
    type: row.type,
    title: row.title,
    filePath: row.file_path,
    fileName: row.file_name,
    fileSize: row.file_size,
  };
}
