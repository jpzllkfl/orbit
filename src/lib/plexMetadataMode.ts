import { loadSettings } from './settings';
import type { OrbitNode } from '../types/orbit';

/** Plex supplies posters, themes, and titles — OMS/local libraries stay the source for files and playback. */
export function plexMetadataOnly(): boolean {
  return loadSettings().connections?.plexMetadataOnly !== false;
}

export function treeHasOmsLibraries(tree: OrbitNode): boolean {
  return (tree.children || []).some(
    (c) =>
      c.type === 'library' &&
      !!(c.omsLibraryId || /orbit media server|\(oms\)/i.test(String(c.blurb || '') + c.title)),
  );
}

/** Skip Plex library import when OMS libraries exist or metadata-only mode is on. */
export function shouldImportPlexLibraries(tree: OrbitNode): boolean {
  if (plexMetadataOnly()) return false;
  if (treeHasOmsLibraries(tree)) return false;
  return true;
}
