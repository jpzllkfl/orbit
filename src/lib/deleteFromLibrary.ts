import { OrbitMedia } from './orbitMedia';
import { syncOmsAfterChange } from './omsSync';
import { removeNodeFromTree } from './treeMutations';
import type { OrbitNode } from '../types/orbit';

export function deleteConfirmTitle(node: OrbitNode): string {
  if (node.type === 'collection') return `Delete "${node.title}"?`;
  if (node.type === 'show') return `Remove "${node.title}" from library?`;
  return `Remove "${node.title}" from library?`;
}

export function deleteConfirmMessage(node: OrbitNode): string {
  if (node.type === 'collection') {
    return 'Removes this collection from your library. Titles inside it stay in the library.';
  }
  if (node.type === 'show') {
    return 'Removes this series and all indexed episodes from your Orbit library. Video files on disk are not deleted.';
  }
  return 'Removes this title from your Orbit library. The video file on disk is not deleted.';
}

export const EPISODE_DELETE_MESSAGE =
  'Removes this episode from the Orbit index. The video file on disk is not deleted.';

/** Remove a movie, show, or collection from the sidebar tree (and OMS index when applicable). */
export async function deleteFromLibrary(tree: OrbitNode, node: OrbitNode): Promise<OrbitNode> {
  const next = structuredClone(tree);

  if (node.type === 'movie' && node.omsItemId) {
    await OrbitMedia.deleteItem(node.omsItemId);
  } else if (node.type === 'show' && node.omsLibraryId && node.omsShowTitle) {
    await OrbitMedia.deleteShow(node.omsLibraryId, node.omsShowTitle);
  }

  removeNodeFromTree(next, node.id);

  try {
    await syncOmsAfterChange();
  } catch {
    /* offline */
  }

  return next;
}

/** Remove a single indexed episode from OMS (show detail view). */
export async function deleteEpisodeFromLibrary(omsItemId: string): Promise<void> {
  await OrbitMedia.deleteItem(omsItemId);
  try {
    await syncOmsAfterChange();
  } catch {
    /* offline */
  }
}
