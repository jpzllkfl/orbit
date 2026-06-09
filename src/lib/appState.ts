import type { OrbitNode } from '../types/orbit';
import ORBIT_DATA from './data.js';
import { Conn } from './conn.ts';
import { countTitles, plexIsConfigured, seedArtFromPlex, treeHasContent, treeHasLibraries } from './importUtils.ts';

export { treeHasContent, treeHasLibraries, plexIsConfigured };
import { isDesktopApp } from './isDesktop.ts';
import { TreeStore } from './treeStore.ts';

let cached: { tree: OrbitNode; path: string[] } | null = null;

/** True when a saved Plex tree exists (no JSON parse). */
export function hasPersistedTree() {
  return TreeStore.hasSaved();
}

/** Empty shell — no demo titles until guest mode or an explicit fallback. */
export function emptyShell(): { tree: OrbitNode; path: string[] } {
  return {
    tree: {
      id: 'root',
      type: 'collection',
      title: 'Orbit',
      blurb: 'Loading your library…',
      children: [],
    },
    path: ['root'],
  };
}

/** Demo library for guest / offline preview only. */
export function demoAppState(): { tree: OrbitNode; path: string[] } {
  const demo = structuredClone(ORBIT_DATA.ROOT);
  return { tree: demo, path: [demo.id] };
}

function hydrateLoadedTree(saved: OrbitNode) {
  if (!isDesktopApp() && countTitles(saved) <= 80) seedArtFromPlex(saved);
  cached = { tree: saved, path: [saved.id] };
  return cached;
}

/** Restore persisted Plex library on load, else empty shell. */
export function loadAppState(): { tree: OrbitNode; path: string[] } {
  if (cached) return cached;

  const conn = Conn.load();
  if (conn?.connected && conn?.live) {
    const saved = TreeStore.load();
    if (saved) return hydrateLoadedTree(saved);
  }
  const saved = TreeStore.load();
  if (saved) return hydrateLoadedTree(saved);

  cached = emptyShell();
  return cached;
}

/** Restore persisted Plex library on load, else empty shell. */
export async function loadAppStateAsync(): Promise<{ tree: OrbitNode; path: string[] }> {
  if (cached) return cached;

  const saved = await TreeStore.loadAsync();
  if (saved) return hydrateLoadedTree(saved);

  const conn = Conn.load();
  if (conn?.connected && conn?.live) {
    const retry = await TreeStore.loadAsync();
    if (retry) return hydrateLoadedTree(retry);
  }

  cached = emptyShell();
  return cached;
}

export function resetAppStateCache(clearTree = true) {
  cached = null;
  if (clearTree) TreeStore.invalidate();
}
