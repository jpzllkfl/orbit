import type { OrbitNode } from '../types/orbit';
import { treeHasContent } from './importUtils.ts';
import { slimTreeForMemory, stripArtFromJson } from './treeSlim.ts';

const LS = 'orbit.tree.v1';
const IDB_NAME = 'orbit.v1';
const IDB_STORE = 'kv';

let parsedCache: OrbitNode | null | undefined;
let idbHasTree = false;
let idbReady: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function flushPersist() {
  if (!parsedCache) return;
  try {
    const json = JSON.stringify(parsedCache);
    if (useIdb()) {
      idbHasTree = true;
      void ensureIdbReady().then(() => idbSet(LS, json));
      try {
        localStorage.removeItem(LS);
      } catch {
        /* ignore */
      }
      return;
    }
    localStorage.setItem(LS, json);
  } catch {
    /* ignore */
  }
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flushPersist();
  }, 2000);
}

function useIdb() {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve((req.result as string) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, val: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

type ParseOpts = { stripArt?: boolean; slim?: boolean };

function parseAndCache(raw: string, opts: ParseOpts = {}): OrbitNode | null {
  const payload = opts.stripArt ? stripArtFromJson(raw) : raw;
  const parsed = JSON.parse(payload) as OrbitNode;
  if (!parsed?.id || !parsed?.type) {
    parsedCache = null;
    return null;
  }
  parsedCache = opts.slim ? slimTreeForMemory(parsed) : parsed;
  return parsedCache;
}

function isSlimStoredTree(raw: string): boolean {
  return !raw.includes('/api/plex/media') && !raw.includes('image.tmdb.org');
}

async function ensureIdbReady() {
  if (!useIdb()) return;
  if (!idbReady) {
    idbReady = (async () => {
      const ls = localStorage.getItem(LS);
      if (ls) {
        try {
          const tree = parseAndCache(ls, { stripArt: true, slim: true });
          if (tree) await idbSet(LS, JSON.stringify(tree));
          localStorage.removeItem(LS);
        } catch {
          /* keep LS fallback */
        }
      }
      try {
        idbHasTree = !!(await idbGet(LS));
      } catch {
        idbHasTree = false;
      }
    })();
  }
  await idbReady;
}

export const TreeStore = {
  hasSaved() {
    if (parsedCache) return true;
    if (localStorage.getItem(LS)) return true;
    if (useIdb() && idbHasTree) return true;
    return false;
  },

  /** Desktop boot — migrate LS → IDB, parse once, slim, drop raw JSON from memory. */
  async loadAsync(): Promise<OrbitNode | null> {
    if (parsedCache !== undefined) return parsedCache;
    let raw: string | null = null;
    let fromIdb = false;
    if (useIdb()) {
      await ensureIdbReady();
      try {
        raw = await idbGet(LS);
        fromIdb = !!raw;
      } catch {
        raw = null;
      }
    }
    if (!raw) raw = localStorage.getItem(LS);
    if (!raw) {
      parsedCache = null;
      return null;
    }
    try {
      const alreadySlim = fromIdb || isSlimStoredTree(raw);
      return parseAndCache(raw, {
        stripArt: useIdb() && !alreadySlim,
        slim: useIdb() && !alreadySlim,
      });
    } catch {
      parsedCache = null;
      return null;
    }
  },

  load(): OrbitNode | null {
    if (parsedCache !== undefined) return parsedCache;
    try {
      const raw = localStorage.getItem(LS);
      if (!raw) {
        parsedCache = null;
        return null;
      }
      const alreadySlim = isSlimStoredTree(raw);
      return parseAndCache(raw, { stripArt: !alreadySlim && useIdb(), slim: !alreadySlim && useIdb() });
    } catch {
      parsedCache = null;
      return null;
    }
  },

  /** Apply synced tree without duplicating a multi‑MB string in localStorage (desktop). */
  ingestSyncRaw(raw: string): boolean {
    try {
      const tree = parseAndCache(raw, { stripArt: useIdb(), slim: useIdb() });
      if (!tree) return false;
      if (!treeHasContent(tree)) {
        parsedCache = tree;
        idbHasTree = false;
        try {
          localStorage.removeItem(LS);
        } catch {
          /* ignore */
        }
        if (useIdb()) {
          void ensureIdbReady().then(() => idbDel(LS));
        }
        return true;
      }
      if (useIdb()) {
        idbHasTree = true;
        void ensureIdbReady().then(() => idbSet(LS, JSON.stringify(tree)));
        try {
          localStorage.removeItem(LS);
        } catch {
          /* ignore */
        }
        return true;
      }
      localStorage.setItem(LS, JSON.stringify(tree));
      return true;
    } catch {
      return false;
    }
  },

  exportRaw(): string | null {
    if (parsedCache) {
      try {
        return JSON.stringify(parsedCache);
      } catch {
        return null;
      }
    }
    return localStorage.getItem(LS);
  },

  save(tree: OrbitNode): boolean {
    parsedCache = slimTreeForMemory(tree);
    schedulePersist();
    return true;
  },

  clear() {
    try {
      localStorage.removeItem(LS);
    } catch {
      /* ignore */
    }
    if (useIdb()) {
      void ensureIdbReady().then(() => idbDel(LS));
    }
    parsedCache = undefined;
    idbHasTree = false;
  },

  /** Wait until IDB + localStorage tree is gone (for reset). */
  async clearAsync(): Promise<void> {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    try {
      localStorage.removeItem(LS);
    } catch {
      /* ignore */
    }
    parsedCache = null;
    idbHasTree = false;
    if (useIdb()) {
      await ensureIdbReady();
      await idbDel(LS);
    }
  },

  /** Persist immediately (reset must not wait 2s debounce). */
  async saveImmediate(tree: OrbitNode): Promise<void> {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    parsedCache = slimTreeForMemory(tree);
    const json = JSON.stringify(parsedCache);
    if (useIdb()) {
      await ensureIdbReady();
      if (!tree.children?.length) {
        await idbDel(LS);
        idbHasTree = false;
        try {
          localStorage.removeItem(LS);
        } catch {
          /* ignore */
        }
        return;
      }
      await idbSet(LS, json);
      idbHasTree = true;
      try {
        localStorage.removeItem(LS);
      } catch {
        /* ignore */
      }
      return;
    }
    if (!tree.children?.length) {
      try {
        localStorage.removeItem(LS);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      localStorage.setItem(LS, json);
    } catch {
      /* ignore */
    }
  },

  invalidate() {
    parsedCache = undefined;
  },
};
