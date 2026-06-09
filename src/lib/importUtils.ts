import Lib from './library.js';
import type { OrbitNode } from '../types/orbit';

/** Artwork URLs stored on a node when imported from Plex. */
export function plexArtFromNode(node: OrbitNode | null | undefined) {
  if (!node || (!node.poster && !node.backdrop)) return null;
  return { poster: node.poster || null, backdrop: node.backdrop || null };
}

/** Seed TMDB cache from Plex artwork on imported nodes. */
export function seedArtFromPlex(node: OrbitNode) {
  const art = plexArtFromNode(node);
  if (art) Lib.seed(node, art);
  for (const ch of node.children || []) seedArtFromPlex(ch);
}

export function countTitles(root: OrbitNode): number {
  let n = 0;
  (function walk(node: OrbitNode) {
    for (const ch of node.children || []) {
      if (ch.type === 'movie' || ch.type === 'show') n++;
      else walk(ch);
    }
  })(root);
  return n;
}

export function treeHasLibraries(tree: OrbitNode) {
  return (tree.children || []).some((n) => n.type === 'library');
}

/** True when the tree has actual titles — not just empty library shells. */
export function treeHasContent(tree: OrbitNode) {
  return countTitles(tree) > 0;
}

/** Plex account is linked — library import may still be required. */
export function plexIsConfigured(conn: { connected?: boolean; live?: boolean; libraries?: string[] } | null | undefined) {
  return !!(conn?.connected && conn?.live);
}
