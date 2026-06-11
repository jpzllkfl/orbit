import type { Episode } from '../types/orbit';

export type SeasonRow = { season: number; title: string; poster: string | null; episodes: number };

export type TmdbEpisodeRow = {
  n: number;
  season: number;
  title: string;
  synopsis: string;
  runtime: number | null;
  still: string | null;
};

/** True when a title is a generic placeholder like "Episode 3" or "E03". */
export function isGenericEpisodeTitle(title?: string, n?: number): boolean {
  const t = (title || '').trim();
  if (!t) return true;
  if (/^episode\s*\d+$/i.test(t)) return true;
  if (/^e\d+$/i.test(t)) return true;
  if (n != null && t === `Episode ${n}`) return true;
  return false;
}

export function episodesNeedTmdbEnrich(eps: Episode[]): boolean {
  return eps.some((ep) => isGenericEpisodeTitle(ep.title, ep.n) || !ep.synopsis || !ep.still);
}

/** Merge local episode rows (OMS/Plex ids) with TMDB metadata by season+episode number. */
export function mergeEpisodesWithTmdb(base: Episode[], tmdb: TmdbEpisodeRow[]): Episode[] {
  const byNum = new Map(tmdb.map((ep) => [ep.n, ep]));
  return base.map((ep) => {
    const meta = byNum.get(ep.n);
    if (!meta) return ep;
    return {
      ...ep,
      title: isGenericEpisodeTitle(ep.title, ep.n) ? meta.title : ep.title || meta.title,
      synopsis: ep.synopsis || meta.synopsis || undefined,
      runtime: ep.runtime ?? meta.runtime ?? undefined,
      still: ep.still || meta.still || undefined,
    };
  });
}

/** Fill missing season posters/titles from TMDB season list. */
export function mergeSeasonRowsWithTmdb(base: SeasonRow[], tmdb: SeasonRow[]): SeasonRow[] {
  const bySeason = new Map(tmdb.map((s) => [s.season, s]));
  return base.map((row) => {
    const meta = bySeason.get(row.season);
    if (!meta) return row;
    const genericTitle = /^season\s*\d+$/i.test((row.title || '').trim());
    return {
      ...row,
      title: genericTitle && meta.title ? meta.title : row.title,
      poster: row.poster || meta.poster,
      episodes: row.episodes || meta.episodes,
    };
  });
}
