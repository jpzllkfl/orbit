import { Lib, Plex } from './index';
import { plexArtFromNode } from './importUtils';
import { hiResBackdrop } from './artUrls';
import type { OrbitNode } from '../types/orbit';

/** Immediate hero backdrop URL (Plex / overrides / cached). */
export function syncHeroBackdrop(node: OrbitNode): string | null {
  const ov = Lib.getOverride(node.id);
  if (ov?.backdrop) return hiResBackdrop(ov.backdrop);

  const plex = plexArtFromNode(node);
  if (node.backdrop) return hiResBackdrop(node.backdrop);
  if (plex?.backdrop) return hiResBackdrop(plex.backdrop);

  if (node.plexKey && Plex.connected) {
    const art = Plex.imgUrl('/library/metadata/' + node.plexKey + '/art', 'backdrop');
    const thumb = Plex.imgUrl('/library/metadata/' + node.plexKey + '/thumb', 'card');
    if (art) return hiResBackdrop(art);
    if (thumb) return hiResBackdrop(thumb);
  }

  const cached = Lib.getCached(node);
  if (cached?.backdrop) return hiResBackdrop(cached.backdrop);
  if (cached?.poster) return hiResBackdrop(cached.poster);

  if (node.poster) return hiResBackdrop(node.poster);
  if (plex?.poster) return hiResBackdrop(plex.poster);

  return null;
}

/** Full async fallback chain for hero backdrops. */
export async function asyncHeroBackdrop(node: OrbitNode): Promise<string | null> {
  const sync = syncHeroBackdrop(node);
  if (sync) return sync;

  try {
    const resolved = await Lib.resolve(node);
    if (resolved?.backdrop || resolved?.poster) {
      return hiResBackdrop(resolved.backdrop || resolved.poster);
    }
  } catch {
    /* ignore */
  }

  try {
    const tmdb = await Lib.resolveTmdb(node);
    if (tmdb?.backdrop || tmdb?.poster) {
      return hiResBackdrop(tmdb.backdrop || tmdb.poster);
    }
  } catch {
    /* ignore */
  }

  return null;
}
