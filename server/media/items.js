import { getDb } from './db.js';
import { getLibrary, updateLibraryScan } from './libraries.js';

function refreshItemCount(libraryId) {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS c FROM media_items WHERE library_id = ?')
    .get(libraryId);
  const count = row?.c ?? 0;
  updateLibraryScan(libraryId, {
    status: 'done',
    message: null,
    itemCount: count,
  });
  return count;
}

export function deleteMediaItem(itemId) {
  const row = getDb().prepare('SELECT id, library_id FROM media_items WHERE id = ?').get(itemId);
  if (!row) return null;
  getDb().prepare('DELETE FROM media_items WHERE id = ?').run(itemId);
  const itemCount = refreshItemCount(row.library_id);
  return { libraryId: row.library_id, itemCount };
}

export function deleteShowByTitle(libraryId, showTitle) {
  const lib = getLibrary(libraryId);
  if (!lib) return null;
  const title = (showTitle || '').trim();
  if (!title) return null;
  const result = getDb()
    .prepare('DELETE FROM media_items WHERE library_id = ? AND show_title = ?')
    .run(libraryId, title);
  if (!result.changes) return null;
  return { libraryId, deleted: result.changes, itemCount: refreshItemCount(libraryId) };
}
