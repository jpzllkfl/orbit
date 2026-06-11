import { getDb } from './db.js';
import { getLibrary, getLibraryFolders, listLibraries } from './libraries.js';
import { externalIdsFromPath, movieSearchQueries, showSearchQueries } from './naming.js';
import { genreNameFromIds, sleep, tmdbDetails, tmdbFindExternal, tmdbSearchAny } from './tmdb.js';

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
        overview = COALESCE(?, overview), genre = COALESCE(?, genre)
       WHERE id = ?`,
    )
    .run(
      hit.id,
      title || null,
      year,
      hit.poster_path || null,
      hit.backdrop_path || null,
      hit.overview || null,
      genreNameFromIds(hit.genre_ids) || null,
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
        overview = COALESCE(?, overview), genre = COALESCE(?, genre)
       WHERE library_id = ? AND show_title = ?`,
    )
    .run(
      hit.id,
      canonical || null,
      hit.poster_path || null,
      hit.backdrop_path || null,
      hit.overview || null,
      genreNameFromIds(hit.genre_ids) || null,
      libraryId,
      showTitle,
    );
}

async function resolveShowHit(showTitle, sample, root, apiKey) {
  const queries = showSearchQueries(showTitle, sample, root);
  let hit = null;
  if (sample.file_path) {
    const ids = externalIdsFromPath(sample.file_path, root);
    if (ids.tvdbId) {
      hit = await tmdbFindExternal('tv', ids.tvdbId, 'tvdb_id', apiKey);
    }
    if (!hit?.id && ids.tmdbId) {
      try {
        hit = await tmdbDetails('tv', ids.tmdbId, apiKey);
      } catch {
        /* fall back to search */
      }
    }
  }
  if (!hit?.id) {
    hit = await tmdbSearchAny('tv', queries, sample.year, apiKey);
  }
  return hit;
}

/** Re-match one TV show by folder/show name. */
export async function matchShowByTitle(libraryId, showTitle, apiKey, opts = {}) {
  const lib = getLibrary(libraryId);
  if (!lib || lib.type !== 'tv') throw new Error('TV library not found.');
  const title = (showTitle || '').trim();
  if (!title) throw new Error('Show title required.');
  if (opts.force) {
    getDb()
      .prepare(
        `UPDATE media_items SET tmdb_id = NULL, poster_path = NULL, backdrop_path = NULL, overview = NULL
         WHERE library_id = ? AND show_title = ?`,
      )
      .run(libraryId, title);
  }
  const sample = getDb()
    .prepare(
      `SELECT id, type, title, year, show_title, file_path, file_name FROM media_items
       WHERE library_id = ? AND show_title = ? LIMIT 1`,
    )
    .get(libraryId, title);
  if (!sample) throw new Error('Show not found in library.');
  const hit = await resolveShowHit(title, sample, libraryRootPath(libraryId), apiKey);
  if (hit?.id) {
    setShowTmdb(libraryId, title, hit);
    return { matched: 1, libraryId, showTitle: title };
  }
  return { matched: 0, libraryId, showTitle: title };
}

/** Re-match one movie file or its parent TV show. */
export async function matchMediaItem(itemId, apiKey, opts = {}) {
  const row = getDb()
    .prepare(
      `SELECT id, library_id, type, title, year, show_title, file_path, file_name FROM media_items WHERE id = ?`,
    )
    .get(itemId);
  if (!row) throw new Error('Item not found.');
  const lib = getLibrary(row.library_id);
  if (!lib) throw new Error('Library not found.');
  if (opts.force) {
    getDb()
      .prepare(
        `UPDATE media_items SET tmdb_id = NULL, poster_path = NULL, backdrop_path = NULL, overview = NULL WHERE id = ?`,
      )
      .run(itemId);
  }
  if (lib.type === 'movie') {
    const hit = await tmdbSearchAny('movie', movieSearchQueries(row, libraryRootPath(row.library_id)), row.year, apiKey);
    if (hit?.id) {
      setItemTmdb(row.id, hit, row.title, row.year);
      return { matched: 1, libraryId: row.library_id, itemId };
    }
    return { matched: 0, libraryId: row.library_id, itemId };
  }
  const showTitle = (row.show_title || '').trim();
  if (!showTitle) throw new Error('No show title on file.');
  return matchShowByTitle(row.library_id, showTitle, apiKey, opts);
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
      onProgress?.({ message: `Matching show ${showTitle}…` });
      try {
        const hit = await resolveShowHit(showTitle, sample, root, apiKey);
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

/** Apply a user-picked TMDB match to one movie or all episodes of a TV show. */
export async function applyManualMatch(opts, apiKey) {
  const libraryId = String(opts.libraryId || '');
  const tmdbId = Number(opts.tmdbId);
  if (!libraryId) throw new Error('libraryId required.');
  if (!tmdbId) throw new Error('tmdbId required.');

  const lib = getLibrary(libraryId);
  if (!lib) throw new Error('Library not found.');

  const mediaType = opts.mediaType === 'tv' || opts.mediaType === 'show' ? 'tv' : 'movie';
  const kind = mediaType === 'tv' ? 'tv' : 'movie';
  if (lib.type === 'movie' && kind === 'tv') throw new Error('Cannot match a TV show to a movie library.');
  if (lib.type === 'tv' && kind === 'movie') throw new Error('Cannot match a movie to a TV library.');

  const hit = await tmdbDetails(kind, tmdbId, apiKey);
  if (!hit?.id) throw new Error('TMDB record not found.');

  if (kind === 'movie') {
    const itemId = String(opts.itemId || '');
    if (!itemId) throw new Error('itemId required for movie match.');
    const row = getDb()
      .prepare(`SELECT id, library_id, title, year FROM media_items WHERE id = ? AND library_id = ?`)
      .get(itemId, libraryId);
    if (!row) throw new Error('Item not found in library.');
    setItemTmdb(row.id, hit, row.title, row.year);
    return { matched: 1, libraryId, itemId, tmdbId: hit.id };
  }

  let showTitle = (opts.showTitle || '').trim();
  if (!showTitle && opts.itemId) {
    const row = getDb()
      .prepare(`SELECT show_title FROM media_items WHERE id = ? AND library_id = ?`)
      .get(String(opts.itemId), libraryId);
    showTitle = (row?.show_title || '').trim();
  }
  if (!showTitle) throw new Error('Show title required.');

  const countRow = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM media_items WHERE library_id = ? AND show_title = ?`)
    .get(libraryId, showTitle);
  setShowTmdb(libraryId, showTitle, hit);
  const canonical = hit.name || hit.title || showTitle;
  return { matched: countRow?.n || 0, libraryId, showTitle: canonical, tmdbId: hit.id };
}
