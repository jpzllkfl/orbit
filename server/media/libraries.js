import fs from 'fs';
import path from 'path';
import { getDb, resetDb } from './db.js';

function newId(prefix = 'lib') {
  return prefix + '_' + Math.random().toString(36).slice(2, 11);
}

function folderRowToFolder(row) {
  if (!row) return null;
  const exists = fs.existsSync(row.path);
  return {
    id: row.id,
    libraryId: row.library_id,
    path: row.path,
    createdAt: row.created_at,
    pathExists: exists,
    readable: exists && fs.statSync(row.path).isDirectory(),
  };
}

function listFoldersForLibrary(libraryId) {
  const rows = getDb()
    .prepare('SELECT * FROM library_folders WHERE library_id = ? ORDER BY path')
    .all(libraryId);
  return rows.map(folderRowToFolder).filter(Boolean);
}

function rowToLibrary(row) {
  if (!row) return null;
  const folders = listFoldersForLibrary(row.id);
  const pathExists = folders.some((f) => f.pathExists);
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    folders,
    folderCount: folders.length,
    rootPath: folders[0]?.path || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastScanAt: row.last_scan_at,
    lastScanStatus: row.last_scan_status,
    lastScanMessage: row.last_scan_message,
    itemCount: row.item_count,
    pathExists,
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

export function findLibraryByNameType(name, type) {
  const row = getDb()
    .prepare('SELECT * FROM libraries WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND type = ?')
    .get(name, type);
  return rowToLibrary(row);
}

export function listAllFolderPaths() {
  return getDb().prepare('SELECT path FROM library_folders').all().map((r) => r.path);
}

function addFolderRow(libraryId, folderPath) {
  const resolved = path.resolve(folderPath.trim());
  if (!resolved) throw new Error('Folder path is required.');
  if (!fs.existsSync(resolved)) throw new Error(`Folder not found: ${resolved}`);
  if (!fs.statSync(resolved).isDirectory()) throw new Error(`Path is not a folder: ${resolved}`);

  const dup = getDb().prepare('SELECT library_id FROM library_folders WHERE path = ?').get(resolved);
  if (dup) throw new Error('This folder is already in a library.');

  const id = newId('fld');
  const now = Date.now();
  getDb()
    .prepare(`INSERT INTO library_folders (id, library_id, path, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, libraryId, resolved, now);
  getDb().prepare('UPDATE libraries SET updated_at = ? WHERE id = ?').run(now, libraryId);
  return folderRowToFolder(getDb().prepare('SELECT * FROM library_folders WHERE id = ?').get(id));
}

function createLibrary({ name, type }) {
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('Library name is required.');
  if (type !== 'movie' && type !== 'tv') throw new Error('Library type must be movie or tv.');
  const now = Date.now();
  const id = newId('lib');
  getDb()
    .prepare(
      `INSERT INTO libraries (id, name, type, created_at, updated_at, item_count)
       VALUES (?, ?, ?, ?, ?, 0)`,
    )
    .run(id, trimmedName, type, now, now);
  return getLibrary(id);
}

/** Plex-style: named library with many folder paths. Reuses library if name+type match. */
export function addFolderToLibrary({ name, type, folderPath }) {
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('Library name is required.');
  if (type !== 'movie' && type !== 'tv') throw new Error('Library type must be movie or tv.');
  const existing = findLibraryByNameType(trimmedName, type);
  const lib = existing || createLibrary({ name: trimmedName, type });
  const folder = addFolderRow(lib.id, folderPath);
  return { library: getLibrary(lib.id), folder, created: !existing };
}

export function addLibrary(opts) {
  return addFolderToLibrary(opts);
}

export function addLibraryFolder(libraryId, folderPath) {
  const lib = getLibrary(libraryId);
  if (!lib) throw new Error('Library not found.');
  const folder = addFolderRow(libraryId, folderPath);
  return { library: getLibrary(libraryId), folder };
}

export function removeLibraryFolder(folderId) {
  const row = getDb().prepare('SELECT * FROM library_folders WHERE id = ?').get(folderId);
  if (!row) return false;
  getDb().prepare('DELETE FROM media_items WHERE library_id = ? AND file_path LIKE ?').run(
    row.library_id,
    row.path + path.sep + '%',
  );
  getDb().prepare('DELETE FROM library_folders WHERE id = ?').run(folderId);
  const remaining = listFoldersForLibrary(row.library_id);
  if (!remaining.length) {
    getDb().prepare('DELETE FROM libraries WHERE id = ?').run(row.library_id);
    return { removedLibrary: true, libraryId: row.library_id };
  }
  return { removedLibrary: false, libraryId: row.library_id, library: getLibrary(row.library_id) };
}

export function removeLibrary(id) {
  const lib = getLibrary(id);
  if (!lib) return false;
  getDb().prepare('DELETE FROM libraries WHERE id = ?').run(id);
  return true;
}

export function wipeAllLibraries() {
  resetDb();
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

export function getLibraryFolders(libraryId) {
  return listFoldersForLibrary(libraryId);
}
