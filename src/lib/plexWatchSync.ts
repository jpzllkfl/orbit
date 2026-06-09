import OT from './helpers.js';
import Plex from './plex.js';
import Progress from './progress.js';
import type { OrbitNode } from '../types/orbit';

/** Pull watch progress and watched flags from Plex into Orbit's local store. */
export async function syncWatchStateFromPlex(tree: OrbitNode) {
  if (!Plex.connected) return { movies: 0, episodes: 0 };

  let movies = 0;
  let episodes = 0;
  const showKeys = new Set<string>();

  for (const { node } of OT.allTitles(tree)) {
    if (node.type === 'movie' && node.plexKey) {
      Progress.applyPlexState(node, null, {
        viewOffset: node.viewOffset,
        viewCount: node.viewCount,
        duration: node.duration ?? undefined,
      });
      if (node.viewOffset || node.viewCount) movies++;
    } else if (node.type === 'show' && node.plexKey) {
      showKeys.add(node.plexKey);
    }
  }

  for (const showKey of showKeys) {
    const show = OT.allTitles(tree).map((x) => x.node).find((n) => n.plexKey === showKey);
    if (!show) continue;
    try {
      const leaves = await Plex.fetchShowLeaves(showKey);
      for (const ep of leaves) {
        Progress.applyPlexState(
          show,
          { season: ep.season, n: ep.episode, title: ep.title },
          { viewOffset: ep.viewOffset, viewCount: ep.viewCount, duration: ep.duration },
        );
        if (ep.viewOffset || ep.viewCount) episodes++;
      }
    } catch {
      /* show unreachable */
    }
  }

  return { movies, episodes };
}
