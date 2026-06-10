import { getDb } from './db.js';
import { getLibrary, listLibraries } from './libraries.js';
import { sleep, tmdbSearch } from './tmdb.js';

function itemsNeedingMatch(libraryId) {
  return getDb()
    .prepare(
      `SELECT id, type, title, year, show_title FROM media_items
       WHERE library_id = ? AND (tmdb_id IS NULL OR tmdb_id = 0)`,
    )
    .all(libraryId);
}

function setItemTmdb(id, tmdbId, title, year) {
  getDb()
    .prepare('UPDATE media_items SET tmdb_id = ?, title = COALESCE(?, title), year = COALESCE(?, year) WHERE id = ?')
    .run(tmdbId, title || null, year ?? null, id);
}

function setShowTmdb(libraryId, showTitle, tmdbId) {
  getDb()
    .prepare('UPDATE media_items SET tmdb_id = ? WHERE library_id = ? AND show_title = ?')
    .run(tmdbId, libraryId, showTitle);
}

/** Match movies by file title/year; TV by show folder name once per show. */
export async function matchLibrary(libraryId, apiKey, onProgress) {
  const lib = getLibrary(libraryId);
  if (!lib) throw new Error('Library not found.');

  const rows = itemsNeedingMatch(libraryId);
  if (!rows.length) return { matched: 0, skipped: 0, libraryId };

  let matched = 0;
  const showDone = new Set();

  if (lib.type === 'movie') {
    for (const row of rows) {
      onProgress?.({ message: `Matching ${row.title}…` });
      try {
        const hit = await tmdbSearch('movie', row.title, row.year, apiKey);
        if (hit?.id) {
          const year = hit.release_date ? Number(String(hit.release_date).slice(0, 4)) : row.year;
          setItemTmdb(row.id, hit.id, hit.title || row.title, year);
          matched++;
        }
      } catch {
        /* skip row */
      }
      await sleep(280);
    }
  } else {
    for (const row of rows) {
      const showTitle = (row.show_title || row.title || '').trim();
      if (!showTitle || showDone.has(showTitle)) continue;
      showDone.add(showTitle);
      onProgress?.({ message: `Matching show ${showTitle}…` });
      try {
        const hit = await tmdbSearch('tv', showTitle, row.year, apiKey);
        if (hit?.id) {
          setShowTmdb(libraryId, showTitle, hit.id);
          matched++;
        }
      } catch {
        /* skip */
      }
      await sleep(280);
    }
  }

  return { matched, skipped: rows.length - matched, libraryId };
}

export async function matchAllLibraries(apiKey, onProgress) {
  const libs = listLibraries().filter((l) => l.itemCount > 0);
  let total = 0;
  for (const lib of libs) {
    onProgress?.({ message: `Matching ${lib.name}…`, libraryId: lib.id });
    const r = await matchLibrary(lib.id, apiKey, onProgress);
    total += r.matched;
  }
  return { matched: total, libraries: libs.length };
}
