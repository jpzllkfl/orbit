import Lib from './library.js';
import Plex from './plex.js';
import { treeHasContent } from './importUtils.ts';
import { isDesktopApp } from './isDesktop.ts';
import { slimTreeForMemory } from './treeSlim.ts';
import { TreeStore } from './treeStore.ts';

/** Keys persisted to the Orbit account (server-side). */
const SYNC_KEY_PREFIXES = [
  'orbit.tree.',
  'orbit.conn.',
  'orbit.tmdb.',
  'orbit.art.overrides.',
  'orbit.cw.',
  'orbit.home.rows.',
  'orbit.plex.',
  'orbit.watched.',
  'orbit.oms.',
  'orbit.server.home.',
  'orbit.desktop.media.',
];

const SKIP_KEYS = new Set(['orbit.session.v1', 'orbit.art.cache.v1']);

export function shouldSyncKey(key: string) {
  if (SKIP_KEYS.has(key)) return false;
  return SYNC_KEY_PREFIXES.some((p) => key.startsWith(p));
}

export function collectSyncBundle(): Record<string, string> {
  const bundle: Record<string, string> = {};
  try {
    const cached = TreeStore.load();
    if (cached && treeHasContent(cached)) {
      const treeRaw = TreeStore.exportRaw();
      if (treeRaw) {
        try {
          bundle['orbit.tree.v1'] = JSON.stringify(slimTreeForMemory(JSON.parse(treeRaw) as import('../types/orbit').OrbitNode));
        } catch {
          bundle['orbit.tree.v1'] = treeRaw;
        }
      }
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !shouldSyncKey(key)) continue;
      if (key === 'orbit.tree.v1') continue;
      const val = localStorage.getItem(key);
      if (val != null) bundle[key] = val;
    }
  } catch {
    /* ignore */
  }
  return bundle;
}

export function hydrateSyncedModules() {
  try {
    Plex.reloadFromStorage();
    Lib.reloadFromStorage();
    Lib.loadKey();
  } catch {
    /* ignore */
  }
}

const APPLY_FIRST = [
  'orbit.server.home.v1',
  'orbit.tree.v1',
  'orbit.conn.v1',
  'orbit.plex.conn',
  'orbit.tmdb.v1',
  'orbit.oms.libraries.v1',
  'orbit.desktop.media.v1',
];

/** Drop embedded base64 art — it balloons sync size and can exceed localStorage quota. */
function slimArtOverrides(raw: string): string {
  try {
    const obj = JSON.parse(raw) as Record<string, Record<string, string>>;
    let changed = false;
    for (const entry of Object.values(obj)) {
      if (!entry || typeof entry !== 'object') continue;
      for (const [field, val] of Object.entries(entry)) {
        if (typeof val === 'string' && val.startsWith('data:')) {
          delete entry[field];
          changed = true;
        }
      }
    }
    return changed ? JSON.stringify(obj) : raw;
  } catch {
    return raw;
  }
}

function orderedSyncEntries(bundle: Record<string, string>) {
  const entries = Object.entries(bundle).filter(([key, val]) => shouldSyncKey(key) && typeof val === 'string');
  const rank = new Map(APPLY_FIRST.map((k, i) => [k, i]));
  entries.sort((a, b) => (rank.get(a[0]) ?? 99) - (rank.get(b[0]) ?? 99));
  return entries;
}

const DEFER_ON_DESKTOP = new Set(['orbit.art.overrides.v1']);
const SKIP_ON_DESKTOP_PREFIX = 'orbit.watched.';

export function applySyncBundle(bundle: Record<string, string>) {
  if (!bundle || typeof bundle !== 'object') return 0;
  const entries = orderedSyncEntries(bundle);
  if (!entries.length) {
    void TreeStore.clearAsync();
    return 0;
  }
  let applied = 0;
  let treeIngested = false;
  const desktop = isDesktopApp();
  const deferred: Array<[string, string]> = [];

  for (const [key, val] of orderedSyncEntries(bundle)) {
    if (desktop && key.startsWith(SKIP_ON_DESKTOP_PREFIX)) continue;
    if (key === 'orbit.tree.v1') {
      if (TreeStore.ingestSyncRaw(val)) {
        applied++;
        treeIngested = true;
      }
      continue;
    }
    const payload = key === 'orbit.art.overrides.v1' ? slimArtOverrides(val) : val;
    if (desktop && DEFER_ON_DESKTOP.has(key)) {
      deferred.push([key, payload]);
      continue;
    }
    try {
      localStorage.setItem(key, payload);
      applied++;
    } catch {
      /* quota — tree/conn are applied first so library can still load */
    }
  }
  if (applied) {
    if (!treeIngested) TreeStore.invalidate();
    hydrateSyncedModules();
  }
  if (deferred.length) {
    const applyDeferred = () => {
      for (const [key, payload] of deferred) {
        try {
          localStorage.setItem(key, payload);
        } catch {
          /* ignore */
        }
      }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(applyDeferred, { timeout: 120000 });
    else window.setTimeout(applyDeferred, 8000);
  }
  return applied;
}
