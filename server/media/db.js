import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ORBIT_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = process.env.ORBIT_MEDIA_DB || path.join(DATA_DIR, 'orbit-media.sqlite');

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS libraries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('movie', 'tv')),
  root_path TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_scan_at INTEGER,
  last_scan_status TEXT,
  last_scan_message TEXT,
  item_count INTEGER NOT NULL DEFAULT 0
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
`;

export function getDbPath() {
  return DB_PATH;
}

export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export function mediaStats() {
  const d = getDb();
  const libraries = d.prepare('SELECT COUNT(*) AS n FROM libraries').get().n;
  const items = d.prepare('SELECT COUNT(*) AS n FROM media_items').get().n;
  return { libraries, items, dbPath: DB_PATH };
}
