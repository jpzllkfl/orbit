import type { Episode, OrbitNode } from '../types/orbit';
import { OrbitMedia } from './orbitMedia';
import { isDesktopApp } from './isDesktop';
import { DESKTOP_MEDIA_LS, getOmsPlaybackOrigin, normalizeOrigin } from './orbitServer';
import { shouldUseMediaRelay } from './omsStreamUrls';

/** True when this browser can reach the Orbit Media Server that owns local file paths. */
export function canReachOmsPlayback(): boolean {
  if (isDesktopApp()) return true;
  if (shouldUseMediaRelay()) return true;
  if (typeof window === 'undefined') return false;
  const page = window.location.origin;
  const playback = getOmsPlaybackOrigin();
  if (playback === page) return true;
  try {
    const remote = localStorage.getItem(DESKTOP_MEDIA_LS);
    if (!remote) return false;
    const norm = normalizeOrigin(remote);
    if (norm.startsWith('https://') && page.startsWith('https://')) return norm === page;
    if (page.startsWith('https://') && norm.startsWith('http://')) return false;
    return norm === playback;
  } catch {
    return false;
  }
}

export function omsPlaybackId(node: OrbitNode, episode?: Episode | null): string | null {
  return episode?.omsItemId || node.omsItemId || null;
}

/** Fill episode.omsItemId from OMS when the synced tree only has show-level metadata. */
export async function resolveEpisodeOmsId(node: OrbitNode, episode: Episode | null): Promise<Episode | null> {
  if (!episode || episode.omsItemId) return episode;
  const libId = node.omsLibraryId;
  const showTitle = node.omsShowTitle || node.title;
  if (!libId || !showTitle) return episode;
  try {
    const eps = await OrbitMedia.showEpisodes(libId, showTitle, episode.season);
    const hit = eps.find((e) => e.episode === episode.n);
    if (hit?.id) return { ...episode, omsItemId: hit.id };
  } catch {
    /* offline */
  }
  return episode;
}
