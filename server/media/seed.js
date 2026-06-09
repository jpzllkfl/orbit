import fs from 'fs';
import { DEFAULT_OMS_LIBRARIES } from './catalog.js';
import { addLibrary, listLibraries } from './libraries.js';
import { scanLibrary } from './scanner.js';

export function seedDefaultLibraries() {
  const added = [];
  const skipped = [];
  const missing = [];

  for (const def of DEFAULT_OMS_LIBRARIES) {
    const libs = listLibraries();
    if (libs.some((l) => l.rootPath === def.mount)) {
      skipped.push(def);
      continue;
    }
    if (!fs.existsSync(def.mount)) {
      missing.push(def);
      continue;
    }
    try {
      addLibrary({ name: def.name, type: def.type, rootPath: def.mount });
      added.push(def);
    } catch (e) {
      skipped.push({ ...def, error: e.message });
    }
  }

  return { added, skipped, missing, total: DEFAULT_OMS_LIBRARIES.length };
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
  if (process.env.ORBIT_DOCKER !== '1') return null;
  if (process.env.ORBIT_OMS_AUTO_SEED === '0') return null;
  const libs = listLibraries();
  if (libs.length > 0) return null;
  return seedDefaultLibraries();
}
