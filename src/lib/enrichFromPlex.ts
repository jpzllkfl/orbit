import { Lib, Plex } from '../lib';
import type { OrbitNode } from '../types/orbit';

function walkTitles(root: OrbitNode, out: OrbitNode[]) {
  for (const ch of root.children || []) {
    if (ch.type === 'movie' || ch.type === 'show') out.push(ch);
    else if (ch.type === 'collection' || ch.type === 'library') walkTitles(ch, out);
  }
}

function indexById(root: OrbitNode, map: Map<string, OrbitNode>) {
  for (const ch of root.children || []) {
    if (ch.type === 'movie' || ch.type === 'show') map.set(ch.id, ch);
    else if (ch.type === 'collection' || ch.type === 'library') indexById(ch, map);
  }
}

/** Link OMS / unmatched titles to Plex metadata for posters, plexKey, and theme paths. */
export async function enrichTreeFromPlex(root: OrbitNode): Promise<OrbitNode | null> {
  if (!Plex.connected || !Plex.findTitleMetadata) return null;

  const titles: OrbitNode[] = [];
  walkTitles(root, titles);
  const needs = titles.filter((n) => !n.poster || !n.plexKey);
  if (!needs.length) return null;

  const next = structuredClone(root);
  const byId = new Map<string, OrbitNode>();
  indexById(next, byId);

  let changed = false;
  const batch = 6;
  for (let i = 0; i < needs.length; i += batch) {
    await Promise.all(
      needs.slice(i, i + batch).map(async (src) => {
        const n = byId.get(src.id);
        if (!n) return;
        const hit = await Plex.findTitleMetadata!(n);
        if (!hit) return;
        changed = true;
        if (hit.plexKey && !n.plexKey) n.plexKey = hit.plexKey;
        if (hit.poster && !n.poster) n.poster = hit.poster;
        if (hit.backdrop && !n.backdrop) n.backdrop = hit.backdrop;
        if (hit.theme && !n.theme) n.theme = hit.theme;
        if (hit.tmdbId && !n.tmdbId) n.tmdbId = hit.tmdbId;
        Lib.seed(n, {
          poster: hit.poster,
          backdrop: hit.backdrop,
          tmdbId: hit.tmdbId ?? undefined,
        });
      }),
    );
  }

  return changed ? next : null;
}
