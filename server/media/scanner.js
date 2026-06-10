import fs from 'fs';
import path from 'path';
import { getDb } from './db.js';
import { getLibrary, getLibraryFolders, updateLibraryScan } from './libraries.js';
import { matchLibrary } from './matcher.js';
import { isVideoFile, parseMovie, parseEpisode, showFromPath } from './naming.js';
import { getDefaultTmdbKey, isTmdbConfigured } from '../tmdb-config.js';

function newItemId() {
  return 'mi_' + Math.random().toString(36).slice(2, 11);
}

function* walkDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name.startsWith('.')) continue;
      yield* walkDir(full);
    } else if (ent.isFile()) {
      yield full;
    }
  }
}

const insertStmt = () =>
  getDb().prepare(
    `INSERT INTO media_items (
      id, library_id, type, title, year, season, episode, show_title,
      file_path, file_name, file_size, scanned_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

function looksLikeMovieRelease(filePath, fileName) {
  const parsed = parseMovie(fileName);
  if (parsed.year) return true;
  const folder = path.basename(path.dirname(filePath));
  if (/\(\d{4}\)/.test(folder) || /\[\d{4}\]/.test(folder)) return true;
  return false;
}

function scanFiles(lib, rootPath, files, insert, now) {
  let count = 0;
  let skippedMovies = 0;

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    if (!isVideoFile(fileName)) continue;

    let type = lib.type === 'tv' ? 'episode' : 'movie';
    let title = fileName;
    let year = null;
    let season = null;
    let episode = null;
    let showTitle = null;

    if (lib.type === 'movie') {
      const parsed = parseMovie(fileName);
      title = parsed.title;
      year = parsed.year;
      type = 'movie';
    } else {
      const ep = parseEpisode(fileName);
      if (!ep && looksLikeMovieRelease(filePath, fileName)) {
        skippedMovies++;
        continue;
      }
      showTitle = showFromPath(filePath, rootPath);
      if (ep) {
        season = ep.season;
        episode = ep.episode;
        title = ep.title;
        type = 'episode';
      } else {
        title = parseMovie(fileName).title;
        type = 'episode';
      }
    }

    let fileSize = null;
    try {
      fileSize = fs.statSync(filePath).size;
    } catch {
      /* ignore */
    }

    insert.run(
      newItemId(),
      lib.id,
      type,
      title,
      year,
      season,
      episode,
      showTitle,
      filePath,
      fileName,
      fileSize,
      now,
    );
    count++;
  }

  return { count, skippedMovies };
}

export async function scanLibrary(libraryId, onProgress) {
  const lib = getLibrary(libraryId);
  if (!lib) throw new Error('Library not found.');
  const folders = getLibraryFolders(libraryId).filter((f) => f.pathExists && f.readable);
  if (!folders.length) throw new Error('No valid folders on disk for this library.');

  const db = getDb();
  const clear = db.prepare('DELETE FROM media_items WHERE library_id = ?');
  const insert = insertStmt();

  updateLibraryScan(libraryId, { status: 'scanning', message: 'Walking files…', itemCount: 0 });
  onProgress?.({ phase: 'start', message: `Scanning ${lib.name}…` });

  clear.run(libraryId);

  let totalCount = 0;
  let totalSkipped = 0;
  const now = Date.now();

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const folder of folders) {
      onProgress?.({ phase: 'progress', message: `Scanning ${folder.path}…` });
      const files = [...walkDir(folder.path)];
      const { count, skippedMovies } = scanFiles(lib, folder.path, files, insert, now);
      totalCount += count;
      totalSkipped += skippedMovies;
    }
    db.exec('COMMIT');
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  }

  const folderNote =
    folders.length > 1 ? ` across ${folders.length} folders` : '';
  const skipNote =
    totalSkipped > 0
      ? ` Skipped ${totalSkipped} movie-like file${totalSkipped === 1 ? '' : 's'}.`
      : '';
  updateLibraryScan(libraryId, {
    status: 'done',
    message: `Found ${totalCount} video file${totalCount === 1 ? '' : 's'}${folderNote}.${skipNote}`,
    itemCount: totalCount,
  });
  onProgress?.({ phase: 'done', message: `Scan complete — ${totalCount} items.`, count: totalCount });

  if (isTmdbConfigured() && totalCount > 0) {
    onProgress?.({ phase: 'match', message: 'Matching TMDB posters and titles…' });
    try {
      await matchLibrary(libraryId, getDefaultTmdbKey(), (ev) =>
        onProgress?.({ phase: 'match', message: ev.message || 'Matching TMDB…' }),
      );
    } catch {
      /* TMDB offline — scan still succeeded */
    }
  }

  return { itemCount: totalCount, libraryId };
}

export function listItems(libraryId, limit = 100) {
  const rows = getDb()
    .prepare(
      `SELECT id, type, title, year, season, episode, show_title, file_name, file_path
       FROM media_items WHERE library_id = ? ORDER BY title LIMIT ?`,
    )
    .all(libraryId, limit);
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    year: r.year,
    season: r.season,
    episode: r.episode,
    showTitle: r.show_title,
    fileName: r.file_name,
    filePath: r.file_path,
  }));
}
