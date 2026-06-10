import fs from 'fs';
import { DEFAULT_OMS_LIBRARIES } from './catalog.js';
import { addFolderToLibrary, listLibraries } from './libraries.js';
import { scanLibrary } from './scanner.js';

/** Manual bulk add only — not used on boot. */
export function syncCatalogLibraries() {
  const added = [];
  const skipped = [];
  const missing = [];

  for (const def of DEFAULT_OMS_LIBRARIES) {
    if (!fs.existsSync(def.mount)) {
      missing.push(def);
      continue;
    }
    try {
      const result = addFolderToLibrary({ name: def.name, type: def.type, folderPath: def.mount });
      if (result.created) added.push(def);
      else skipped.push(def);
    } catch (e) {
      skipped.push({ ...def, error: e.message });
    }
  }

  return { added, missing, skipped, total: DEFAULT_OMS_LIBRARIES.length, libraries: listLibraries() };
}

export function seedDefaultLibraries() {
  return syncCatalogLibraries();
}

export function scanAllLibraries(onProgress) {
  const libs = listLibraries().filter((l) => l.pathExists);
  const results = [];
  for (const lib of libs) {
    onProgress?.({ libraryId: lib.id, name: lib.name, phase: 'start' });
    try {
      const r = scanLibrary(lib.id, (ev) =>
        onProgress?.({ libraryId: lib.id, name: lib.name, ...ev }),
      );
      results.push({ libraryId: lib.id, name: lib.name, ok: true, ...r });
    } catch (e) {
      results.push({ libraryId: lib.id, name: lib.name, ok: false, error: e.message });
    }
  }
  return results;
}

export function maybeAutoSeedOnBoot() {
  return null;
}
