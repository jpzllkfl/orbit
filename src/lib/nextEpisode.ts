import Plex from './plex.js';
import type { Episode, OrbitNode } from '../types/orbit';

/** Next episode in order after the one that just finished. */
export async function nextEpisodeAfter(
  show: OrbitNode,
  current: Episode,
): Promise<Episode | null> {
  if (!show.plexKey || show.type !== 'show') return null;
  try {
    const leaves = await Plex.fetchShowLeaves(show.plexKey);
    const sorted = leaves.slice().sort((a, b) => a.season - b.season || a.episode - b.episode);
    const idx = sorted.findIndex((l) => l.season === current.season && l.episode === current.n);
    if (idx < 0 || idx >= sorted.length - 1) return null;
    const next = sorted[idx + 1];
    return { season: next.season, n: next.episode, title: next.title || '' };
  } catch {
    return null;
  }
}
