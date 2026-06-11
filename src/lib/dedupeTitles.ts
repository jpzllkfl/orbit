import type { OrbitNode } from '../types/orbit';

/** One entry per TMDB id or normalized title+year — keeps the richest metadata. */
export function dedupeTitleKey(n: OrbitNode): string {
  if (n.tmdbId) return `tmdb:${n.tmdbId}`;
  return `${n.type}:${(n.title || '').trim().toLowerCase()}:${n.year || ''}`;
}

function richness(n: OrbitNode): number {
  return (n.poster ? 4 : 0) + (n.backdrop ? 2 : 0) + (n.tmdbId ? 2 : 0) + (n.genre ? 1 : 0);
}

export function dedupeTitleNodes(nodes: OrbitNode[]): OrbitNode[] {
  const best = new Map<string, OrbitNode>();
  for (const n of nodes) {
    const key = dedupeTitleKey(n);
    const prev = best.get(key);
    if (!prev || richness(n) > richness(prev)) best.set(key, n);
  }
  return [...best.values()];
}
