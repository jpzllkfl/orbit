import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ORBIT_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = process.env.ORBIT_MEDIA_DB || path.join(DATA_DIR, 'orbit-media.sqlite');

let db = null;

const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS libraries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('movie', 'tv')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_scan_at INTEGER,
  last_scan_status TEXT,
  last_scan_message TEXT,
  item_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS library_folders (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  path TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media_items (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('movie', 'show', 'episode')),
  title TEXT NOT NULL,
  year INTEGER,
  season INTEGER,
  episode INTEGER,
  show_title TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  duration_ms INTEGER,
  video_codec TEXT,
  audio_codec TEXT,
  width INTEGER,
  height INTEGER,
  tmdb_id INTEGER,
  scanned_at INTEGER NOT NULL,
  UNIQUE(library_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_media_library ON media_items(library_id);
CREATE INDEX IF NOT EXISTS idx_media_type ON media_items(library_id, type);
CREATE INDEX IF NOT EXISTS idx_library_folders_lib ON library_folders(library_id);
`;

function migrateFromV1(database) {
  const cols = database.prepare('PRAGMA table_info(libraries)').all();
  const hasRootPath = cols.some((c) => c.name === 'root_path');
  if (!hasRootPath) return;

  database.exec(`CREATE TABLE IF NOT EXISTS library_folders (
    id TEXT PRIMARY KEY,
    library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    path TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  )`);

  const insertFolder = database.prepare(
    `INSERT OR IGNORE INTO library_folders (id, library_id, path, created_at) VALUES (?, ?, ?, ?)`,
  );
  const rows = database.prepare('SELECT * FROM libraries').all();
  for (const row of rows) {
    if (row.root_path) {
      insertFolder.run(
        'fld_' + Math.random().toString(36).slice(2, 11),
        row.id,
        path.resolve(row.root_path),
        row.created_at || Date.now(),
      );
    }
  }

  database.exec(`CREATE TABLE libraries_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('movie', 'tv')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_scan_at INTEGER,
    last_scan_status TEXT,
    last_scan_message TEXT,
    item_count INTEGER NOT NULL DEFAULT 0
  )`);
  database.exec(`INSERT INTO libraries_new
    SELECT id, name, type, created_at, updated_at, last_scan_at, last_scan_status, last_scan_message, item_count
    FROM libraries`);
  database.exec('DROP TABLE libraries');
  database.exec('ALTER TABLE libraries_new RENAME TO libraries');
}

export function getDbPath() {
  return DB_PATH;
}

export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_V2);
  migrateFromV1(db);
  return db;
}

export function mediaStats() {
  const d = getDb();
  const libraries = d.prepare('SELECT COUNT(*) AS n FROM libraries').get().n;
  const items = d.prepare('SELECT COUNT(*) AS n FROM media_items').get().n;
  return { libraries, items, dbPath: DB_PATH };
}
