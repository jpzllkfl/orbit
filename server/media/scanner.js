import fs from 'fs';
import path from 'path';
import { getDb } from './db.js';
import { getLibrary, updateLibraryScan } from './libraries.js';
import { isVideoFile, parseMovie, parseEpisode, showFromPath } from './naming.js';

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

export function scanLibrary(libraryId, onProgress) {
  const lib = getLibrary(libraryId);
  if (!lib) throw new Error('Library not found.');
  if (!fs.existsSync(lib.rootPath)) {
    throw new Error(`Folder not found: ${lib.rootPath}`);
  }
  if (!fs.statSync(lib.rootPath).isDirectory()) {
    throw new Error(`Path is not a folder: ${lib.rootPath}`);
  }

  const db = getDb();
  const clear = db.prepare('DELETE FROM media_items WHERE library_id = ?');
  const insert = insertStmt();

  updateLibraryScan(libraryId, { status: 'scanning', message: 'Walking files…', itemCount: 0 });
  onProgress?.({ phase: 'start', message: `Scanning ${lib.name}…` });

  clear.run(libraryId);

  let count = 0;
  const now = Date.now();
  const files = [...walkDir(lib.rootPath)];

  db.exec('BEGIN IMMEDIATE');
  try {
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
        showTitle = showFromPath(filePath, lib.rootPath);
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
        libraryId,
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
      if (count % 50 === 0) {
        onProgress?.({ phase: 'progress', message: `Found ${count} files…`, count });
      }
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

  updateLibraryScan(libraryId, {
    status: 'done',
    message: `Found ${count} video file${count === 1 ? '' : 's'}.`,
    itemCount: count,
  });
  onProgress?.({ phase: 'done', message: `Scan complete — ${count} items.`, count });

  return { itemCount: count, libraryId };
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
