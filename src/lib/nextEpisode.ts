import Plex from './plex.js';
import { OrbitMedia } from './orbitMedia';
import type { Episode, OrbitNode } from '../types/orbit';

function epFromOmsRow(row: { season: number; episode: number; title: string; id: string }): Episode {
  return {
    season: row.season,
    n: row.episode,
    title: row.title,
    omsItemId: row.id,
  };
}

async function nextOmsEpisode(show: OrbitNode, current: Episode): Promise<Episode | null> {
  const libId = show.omsLibraryId;
  const showTitle = show.omsShowTitle || show.title;
  if (!libId || !showTitle) return null;

  const seasons = await OrbitMedia.showSeasons(libId, showTitle).catch(() => []);
  const seasonNums = seasons.map((s) => s.season).sort((a, b) => a - b);
  if (!seasonNums.length) seasonNums.push(current.season);

  const loadSeason = async (season: number) => {
    const rows = await OrbitMedia.showEpisodes(libId, showTitle, season);
    return rows.map(epFromOmsRow).sort((a, b) => a.n - b.n);
  };

  let eps = await loadSeason(current.season);
  let idx = eps.findIndex((e) => e.n === current.n);
  if (idx >= 0 && idx < eps.length - 1) return eps[idx + 1];

  const si = seasonNums.indexOf(current.season);
  if (si < 0 || si >= seasonNums.length - 1) return null;
  const nextSeason = seasonNums[si + 1];
  eps = await loadSeason(nextSeason);
  return eps[0] || null;
}

/** Next episode in order after the one that just finished. */
export async function nextEpisodeAfter(
  show: OrbitNode,
  current: Episode,
): Promise<Episode | null> {
  if (show.type !== 'show') return null;

  if (show.omsLibraryId) {
    try {
      const next = await nextOmsEpisode(show, current);
      if (next) return next;
    } catch {
      /* fall through */
    }
  }

  if (!show.plexKey) return null;
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
