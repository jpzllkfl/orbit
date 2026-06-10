import fs from 'fs';
import path from 'path';
import { getDb } from './db.js';

function newId() {
  return 'lib_' + Math.random().toString(36).slice(2, 11);
}

function rowToLibrary(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    rootPath: row.root_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastScanAt: row.last_scan_at,
    lastScanStatus: row.last_scan_status,
    lastScanMessage: row.last_scan_message,
    itemCount: row.item_count,
    pathExists: fs.existsSync(row.root_path),
  };
}

export function listLibraries() {
  const rows = getDb().prepare('SELECT * FROM libraries ORDER BY name').all();
  return rows.map(rowToLibrary);
}

export function getLibrary(id) {
  const row = getDb().prepare('SELECT * FROM libraries WHERE id = ?').get(id);
  return rowToLibrary(row);
}

export function addLibrary({ name, type, rootPath }) {
  const trimmedName = (name || '').trim();
  const trimmedPath = (rootPath || '').trim();
  if (!trimmedName) throw new Error('Library name is required.');
  if (!trimmedPath) throw new Error('Folder path is required.');
  if (type !== 'movie' && type !== 'tv') throw new Error('Library type must be movie or tv.');

  const resolved = path.resolve(trimmedPath);
  const now = Date.now();
  const id = newId();

  try {
    getDb()
      .prepare(
        `INSERT INTO libraries (id, name, type, root_path, created_at, updated_at, item_count)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(id, trimmedName, type, resolved, now, now);
  } catch (e) {
    if (String(e.message || e).includes('UNIQUE')) {
      throw new Error('A library with this folder path already exists.');
    }
    throw e;
  }

  return getLibrary(id);
}

export function removeLibrary(id) {
  const lib = getLibrary(id);
  if (!lib) return false;
  getDb().prepare('DELETE FROM libraries WHERE id = ?').run(id);
  return true;
}

/** Delete all libraries and indexed media items (fresh start). */
export function wipeAllLibraries() {
  const d = getDb();
  d.exec('DELETE FROM media_items');
  d.exec('DELETE FROM libraries');
  return { ok: true };
}

export function updateLibrary(id, { name, type }) {
  const lib = getLibrary(id);
  if (!lib) throw new Error('Library not found.');
  const trimmedName = name != null ? String(name).trim() : lib.name;
  const nextType = type != null ? type : lib.type;
  if (!trimmedName) throw new Error('Library name is required.');
  if (nextType !== 'movie' && nextType !== 'tv') throw new Error('Library type must be movie or tv.');
  getDb()
    .prepare(`UPDATE libraries SET name = ?, type = ?, updated_at = ? WHERE id = ?`)
    .run(trimmedName, nextType, Date.now(), id);
  return getLibrary(id);
}

export function updateLibraryScan(id, { status, message, itemCount }) {
  const now = Date.now();
  getDb()
    .prepare(
      `UPDATE libraries SET
        last_scan_at = ?,
        last_scan_status = ?,
        last_scan_message = ?,
        item_count = ?,
        updated_at = ?
       WHERE id = ?`,
    )
    .run(now, status, message || null, itemCount ?? 0, now, id);
}
