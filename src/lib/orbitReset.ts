import { Conn } from './conn';
import Plex from './plex.js';
import { TreeStore } from './treeStore';
import { emptyShell } from './appState';
import { OrbitAccount } from './orbitAccount';
import { OrbitMedia } from './orbitMedia';
import { OMS_LIBS_KEY } from './omsSync';
import { shouldSyncKey } from './syncBundle';
import type { OrbitNode } from '../types/orbit';

/** Remove all Orbit sync keys from this browser (tree, Plex conn, OMS paths, etc.). */
export function clearLocalOrbitData() {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && shouldSyncKey(key)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
    localStorage.removeItem(OMS_LIBS_KEY);
    localStorage.removeItem('orbit.conn.v1');
    localStorage.removeItem('orbit.plex.conn');
    localStorage.removeItem('orbit.plex.account');
    sessionStorage.removeItem('orbit.wizard.step.v1');
  } catch {
    /* ignore */
  }
  Conn.clear();
  Plex.disconnect();
  TreeStore.clear();
}

/**
 * Full reset: OMS index on server, local library, Plex link, and cloud account state (replace, not merge).
 */
export async function resetOrbitInstance(): Promise<OrbitNode> {
  try {
    await OrbitMedia.wipeLibraries();
  } catch {
    /* OMS offline — still clear local */
  }

  clearLocalOrbitData();

  const shell = emptyShell();
  shell.tree.blurb = 'Add libraries in Connections to get started.';
  TreeStore.save(shell.tree);

  if (OrbitAccount.signedIn) {
    await OrbitAccount.pushSyncReplace({});
  }

  return shell.tree;
}
