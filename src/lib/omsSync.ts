import type { MediaLibrary } from '../types/media';
import type { OrbitNode } from '../types/orbit';
import { fetchOmsTree, mergeOmsIntoTree } from './importLibraryFromOms';
import { seedArtFromOms } from './importUtils';
import { OrbitAccount } from './orbitAccount';
import { OrbitMedia } from './orbitMedia';
import { TreeStore } from './treeStore';

export const OMS_LIBS_KEY = 'orbit.oms.libraries.v1';

export type SyncedOmsLibrary = {
  id: string;
  name: string;
  type: 'movie' | 'tv';
  folders: string[];
};

export function toSyncedLibraries(libs: MediaLibrary[]): SyncedOmsLibrary[] {
  return libs.map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    folders: (l.folders || []).map((f) => f.path),
  }));
}

export function saveOmsLibrariesLocal(libs: SyncedOmsLibrary[]) {
  localStorage.setItem(OMS_LIBS_KEY, JSON.stringify(libs));
}

export function loadOmsLibrariesLocal(): SyncedOmsLibrary[] {
  try {
    const raw = localStorage.getItem(OMS_LIBS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SyncedOmsLibrary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Pull live OMS library list from server → localStorage (for account sync). */
export async function pullOmsLibrariesToSync(): Promise<SyncedOmsLibrary[]> {
  try {
    const libs = await OrbitMedia.listLibraries();
    const synced = toSyncedLibraries(libs);
    saveOmsLibrariesLocal(synced);
    return synced;
  } catch {
    return loadOmsLibrariesLocal();
  }
}

/** Apply synced library paths onto the home OMS server (add missing paths). Disabled — add folders manually in Connections. */
export async function reconcileOmsLibrariesFromSync(): Promise<number> {
  return 0;
}

/** After any OMS change: refresh sync blob and push to account. */
export async function syncOmsAfterChange(): Promise<void> {
  await pullOmsLibrariesToSync();
  if (OrbitAccount.signedIn && OrbitAccount.syncReady) {
    await OrbitAccount.pushSync();
  }
}

export function treeHasOmsContent(tree: OrbitNode | null | undefined): boolean {
  if (!tree) return false;
  const stack: OrbitNode[] = [tree];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.omsItemId || n.omsLibraryId || n.omsPath) return true;
    if (n.children) stack.push(...n.children);
  }
  return false;
}

/** If home OMS has scanned titles but the synced tree does not, merge them in. */
export async function maybeMergeOmsTree(tree: OrbitNode): Promise<OrbitNode | null> {
  if (treeHasOmsContent(tree)) return null;
  try {
    const st = await OrbitMedia.status();
    if (!st.items || st.items < 1) return null;
    const result = await fetchOmsTree();
    if (!result.tree) return null;
    const merged = mergeOmsIntoTree(tree, result.tree);
    seedArtFromOms(merged);
    TreeStore.save(merged);
    if (OrbitAccount.signedIn && OrbitAccount.syncReady) {
      await OrbitAccount.pushSync();
    }
    return merged;
  } catch {
    return null;
  }
}
