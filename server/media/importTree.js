import { getDb } from './db.js';
import { listLibraries } from './libraries.js';

function newId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}

function libKey(name) {
  return (name || 'lib').toLowerCase().replace(/[^a-z0-9]/g, '') || 'lib';
}

function allItemsForLibrary(libraryId) {
  return getDb()
    .prepare(
      `SELECT id, type, title, year, season, episode, show_title, file_path, scanned_at, tmdb_id
       FROM media_items WHERE library_id = ? ORDER BY title`,
    )
    .all(libraryId);
}

function movieNode(row) {
  return {
    id: row.id,
    type: 'movie',
    title: row.title,
    year: row.year || undefined,
    tmdbId: row.tmdb_id || undefined,
    omsItemId: row.id,
    omsPath: row.file_path,
    addedAt: row.scanned_at || null,
  };
}

function buildTvChildren(rows, libraryId) {
  const byShow = new Map();
  for (const row of rows) {
    const showName = (row.show_title || row.title || 'Unknown').trim();
    if (!byShow.has(showName)) byShow.set(showName, []);
    byShow.get(showName).push(row);
  }

  const shows = [];
  for (const [showTitle, eps] of byShow) {
    const seasons = new Set(eps.map((e) => e.season).filter((s) => s != null));
    const first = eps[0];
    const tmdbId = eps.find((e) => e.tmdb_id)?.tmdb_id || undefined;
    shows.push({
      id: newId('s'),
      type: 'show',
      title: showTitle,
      seasons: seasons.size || undefined,
      tmdbId,
      omsLibraryId: libraryId,
      omsShowTitle: showTitle,
      omsItemId: first.id,
      omsPath: first.file_path,
      addedAt: Math.max(...eps.map((e) => e.scanned_at || 0)) || null,
    });
  }
  shows.sort((a, b) => a.title.localeCompare(b.title));
  return shows;
}

function buildLibraryNode(lib) {
  const rows = allItemsForLibrary(lib.id);
  const children = lib.type === 'movie' ? rows.map(movieNode) : buildTvChildren(rows, lib.id);
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
