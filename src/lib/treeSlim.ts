import type { OrbitNode } from '../types/orbit';

const KEEP = new Set([
  'id',
  'type',
  'title',
  'year',
  'genre',
  'runtime',
  'rating',
  'seasons',
  'epsPerSeason',
  'libKey',
  'plexKey',
  'partKey',
  'omsItemId',
  'omsPath',
  'omsLibraryId',
  'omsShowTitle',
  'duration',
  'videoCodec',
  'audioCodec',
  'resolution',
  'container',
  'viewCount',
  'viewOffset',
  'lastViewedAt',
  'addedAt',
  'tmdbId',
  'smart',
  'children',
]);

/** Drop poster/backdrop/blurb URLs from deep nodes — posters load lazily via Plex/TMDB. */
export function slimTreeForMemory(root: OrbitNode, keepArtDepth = 1): OrbitNode {
  function walk(n: OrbitNode, depth: number): OrbitNode {
    const out: OrbitNode = { id: n.id, type: n.type, title: n.title };
    for (const k of KEEP) {
      if (k === 'children') continue;
      const v = n[k as keyof OrbitNode];
      if (v !== undefined && v !== null && v !== '') (out as unknown as Record<string, unknown>)[k] = v;
    }
    if (depth <= keepArtDepth || n.type === 'movie' || n.type === 'show' || n.omsItemId || n.tmdbId) {
      if (n.poster) out.poster = n.poster;
      if (n.backdrop) out.backdrop = n.backdrop;
      if (n.blurb) out.blurb = n.blurb;
      if (n.tagline) out.tagline = n.tagline;
    }
    if (n.children?.length) {
      out.children = n.children.map((ch) => walk(ch, depth + 1));
    }
    return out;
  }
  return walk(root, 0);
}

/** Null out heavy URL fields before parse — legacy helper for scripts; do not use before slimTreeForMemory. */
export function stripArtFromJson(raw: string): string {
  return raw
    .replace(/"poster":"(?:\\.|[^"\\])*"/g, '"poster":null')
    .replace(/"backdrop":"(?:\\.|[^"\\])*"/g, '"backdrop":null')
    .replace(/"blurb":"(?:\\.|[^"\\])*"/g, '"blurb":null')
    .replace(/"tagline":"(?:\\.|[^"\\])*"/g, '"tagline":null');
}
