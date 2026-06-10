import { getDb } from './db.js';
import { getLibrary, getLibraryFolders, listLibraries } from './libraries.js';
import { movieSearchQueries, showSearchQueries } from './naming.js';
import { sleep, tmdbSearchAny } from './tmdb.js';

function itemsNeedingMatch(libraryId, force = false) {
  if (force) {
    getDb()
      .prepare(
        `UPDATE media_items SET tmdb_id = NULL, poster_path = NULL, backdrop_path = NULL, overview = NULL
         WHERE library_id = ?`,
      )
      .run(libraryId);
  }
  return getDb()
    .prepare(
      `SELECT id, type, title, year, show_title, file_path, file_name FROM media_items
       WHERE library_id = ? AND (
         tmdb_id IS NULL OR tmdb_id = 0 OR poster_path IS NULL OR poster_path = ''
       )`,
    )
    .all(libraryId);
}

function libraryRootPath(libraryId) {
  const folders = getLibraryFolders(libraryId).filter((f) => f.pathExists);
  return folders[0]?.path || '';
}

function setItemTmdb(id, hit, fallbackTitle, fallbackYear) {
  const title = hit.title || hit.name || fallbackTitle;
  const year = hit.release_date
    ? Number(String(hit.release_date).slice(0, 4))
    : hit.first_air_date
      ? Number(String(hit.first_air_date).slice(0, 4))
      : fallbackYear ?? null;
  getDb()
    .prepare(
      `UPDATE media_items SET
        tmdb_id = ?, title = COALESCE(?, title), year = COALESCE(?, year),
        poster_path = COALESCE(?, poster_path), backdrop_path = COALESCE(?, backdrop_path),
        overview = COALESCE(?, overview)
       WHERE id = ?`,
    )
    .run(
      hit.id,
      title || null,
      year,
      hit.poster_path || null,
      hit.backdrop_path || null,
      hit.overview || null,
      id,
    );
}

function setShowTmdb(libraryId, showTitle, hit) {
  const canonical = hit.title || hit.name || showTitle;
  getDb()
    .prepare(
      `UPDATE media_items SET
        tmdb_id = ?, show_title = COALESCE(?, show_title),
        poster_path = COALESCE(?, poster_path), backdrop_path = COALESCE(?, backdrop_path),
        overview = COALESCE(?, overview)
       WHERE library_id = ? AND show_title = ?`,
    )
    .run(
      hit.id,
      canonical || null,
      hit.poster_path || null,
      hit.backdrop_path || null,
      hit.overview || null,
      libraryId,
      showTitle,
    );
}

/** Match movies by title/year; TV by show folder name once per show. */
export async function matchLibrary(libraryId, apiKey, onProgress, opts = {}) {
  const lib = getLibrary(libraryId);
  if (!lib) throw new Error('Library not found.');

  const rows = itemsNeedingMatch(libraryId, !!opts.force);
  if (!rows.length) return { matched: 0, skipped: 0, libraryId };

  const root = libraryRootPath(libraryId);
  let matched = 0;
  const showDone = new Set();

  if (lib.type === 'movie') {
    for (const row of rows) {
      const queries = movieSearchQueries(row, root);
      onProgress?.({ message: `Matching ${queries[0] || row.title}…` });
      try {
        const hit = await tmdbSearchAny('movie', queries, row.year, apiKey);
        if (hit?.id) {
          setItemTmdb(row.id, hit, row.title, row.year);
          matched++;
        }
      } catch (e) {
        onProgress?.({ message: `Skipped ${row.title}: ${e.message || 'no match'}` });
      }
      await sleep(280);
    }
  } else {
    const byShow = new Map();
    for (const row of rows) {
      const showTitle = (row.show_title || row.title || '').trim();
      if (!showTitle) continue;
      if (!byShow.has(showTitle)) byShow.set(showTitle, row);
    }

    for (const [showTitle, sample] of byShow) {
      if (showDone.has(showTitle)) continue;
      showDone.add(showTitle);
      const queries = showSearchQueries(showTitle, sample, root);
      onProgress?.({ message: `Matching show ${queries[0] || showTitle}…` });
      try {
        const hit = await tmdbSearchAny('tv', queries, sample.year, apiKey);
        if (hit?.id) {
          setShowTmdb(libraryId, showTitle, hit);
          matched++;
        }
      } catch (e) {
        onProgress?.({ message: `Skipped ${showTitle}: ${e.message || 'no match'}` });
      }
      await sleep(280);
    }
  }

  return { matched, skipped: rows.length - matched, libraryId };
}

export async function matchAllLibraries(apiKey, onProgress, opts = {}) {
  const libs = listLibraries().filter((l) => l.itemCount > 0);
  let total = 0;
  for (const lib of libs) {
    onProgress?.({ message: `Matching ${lib.name}…`, libraryId: lib.id });
    const r = await matchLibrary(lib.id, apiKey, onProgress, opts);
    total += r.matched;
  }
  return { matched: total, libraries: libs.length };
}
