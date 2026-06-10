import { removeOmsLibraryFromTree } from './importLibraryFromOms';
import { OrbitMedia } from './orbitMedia';
import { syncOmsAfterChange } from './omsSync';
import { removeNodeFromTree } from './treeMutations';
import type { OrbitNode } from '../types/orbit';

export type DeleteLibraryOpts = {
  tree: OrbitNode;
  omsLibraryId?: string;
  libraryName?: string;
  sidebarNodeId?: string;
};

/** Remove a library from OMS (if applicable) and drop it from the sidebar tree immediately. */
export async function deleteOrbitLibrary(opts: DeleteLibraryOpts): Promise<OrbitNode> {
  const { tree, omsLibraryId, libraryName, sidebarNodeId } = opts;
  const next = structuredClone(tree);

  if (omsLibraryId) {
    try {
      await OrbitMedia.removeLibrary(omsLibraryId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (!/not found/i.test(msg)) throw e;
    }
  }

  if (sidebarNodeId) {
    removeNodeFromTree(next, sidebarNodeId);
  }

  const stripped = removeOmsLibraryFromTree(next, omsLibraryId, libraryName);
  stripped.children = stripped.children || [];

  try {
    await syncOmsAfterChange();
  } catch {
    /* offline */
  }

  return stripped;
}
