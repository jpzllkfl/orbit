import { Conn } from './conn';
import Plex from './plex.js';
import { emptyShell, resetAppStateCache } from './appState';
import { OrbitAccount } from './orbitAccount';
import { OrbitMedia } from './orbitMedia';
import { OMS_LIBS_KEY } from './omsSync';
import { shouldSyncKey } from './syncBundle';
import { slimTreeForMemory } from './treeSlim';
import { TreeStore } from './treeStore';
import type { OrbitNode } from '../types/orbit';

const EXTRA_LOCAL_KEYS = [
  'orbit.tree.v1',
  'orbit.conn.v1',
  'orbit.plex.conn',
  'orbit.plex.account',
  'orbit.session.v1',
  OMS_LIBS_KEY,
];

/** Remove all Orbit library data from this browser. */
export async function clearLocalOrbitData() {
  const keys: string[] = [...EXTRA_LOCAL_KEYS];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && shouldSyncKey(key)) keys.push(key);
    }
    for (const key of [...new Set(keys)]) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    sessionStorage.removeItem('orbit.wizard.step.v1');
    sessionStorage.removeItem('orbit.guest.v1');
  } catch {
    /* ignore */
  }
  Conn.clear();
  Plex.disconnect();
  await TreeStore.clearAsync();
}

/**
 * Full reset: OMS index, sidebar library tree, Plex link, and cloud account state.
 */
export async function resetOrbitInstance(): Promise<OrbitNode> {
  const wipe = await OrbitMedia.wipeLibraries();

  await clearLocalOrbitData();

  const shell = emptyShell();
  shell.tree.title = 'Orbit';
  shell.tree.blurb = 'Add libraries in Connections to get started.';
  shell.tree.children = [];

  await TreeStore.saveImmediate(shell.tree);
  resetAppStateCache(false);

  if (OrbitAccount.signedIn) {
    try {
      await OrbitAccount.clearCloudSync();
    } catch {
      /* fallback */
    }
    try {
      await OrbitAccount.pushSyncReplace({
        'orbit.tree.v1': JSON.stringify(slimTreeForMemory(shell.tree)),
      });
    } catch {
      /* offline */
    }
  }

  if (!wipe?.ok) {
    throw new Error('Server wipe failed — try again.');
  }

  return shell.tree;
}
