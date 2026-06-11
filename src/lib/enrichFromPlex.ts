import { Lib, Plex } from '../lib';
import { plexMetadataOnly } from './plexMetadataMode';
import type { OrbitNode } from '../types/orbit';

type PlexTitleMeta = {
  plexKey?: string;
  poster?: string | null;
  backdrop?: string | null;
  theme?: string | null;
  tmdbId?: number | null;
  title?: string | null;
  year?: number | null;
  genre?: string | null;
};

type PlexCollMeta = {
  plexKey?: string;
  poster?: string | null;
  backdrop?: string | null;
  title?: string;
};

function walkNodes(root: OrbitNode, out: OrbitNode[]) {
  for (const ch of root.children || []) {
    if (ch.type === 'movie' || ch.type === 'show' || ch.type === 'collection') out.push(ch);
    if (ch.type === 'collection' || ch.type === 'library') walkNodes(ch, out);
  }
}

function indexById(root: OrbitNode, map: Map<string, OrbitNode>) {
  const all: OrbitNode[] = [];
  walkNodes(root, all);
  for (const n of all) map.set(n.id, n);
}

function applyTitleMeta(n: OrbitNode, hit: PlexTitleMeta, preferPlex: boolean) {
  const omsBacked = !!(n.omsItemId || n.omsLibraryId || n.omsPath);
  if (hit.plexKey) n.plexKey = hit.plexKey;
  if (hit.theme) n.theme = hit.theme;
  if (preferPlex || !n.poster) {
    if (hit.poster) n.poster = hit.poster;
    if (hit.backdrop) n.backdrop = hit.backdrop;
  }
  if (hit.tmdbId && !n.tmdbId) n.tmdbId = hit.tmdbId;
  if (hit.genre && !n.genre) n.genre = hit.genre;
  if (hit.year && !n.year) n.year = hit.year ?? undefined;
  if (hit.title && preferPlex && !omsBacked) n.title = hit.title;
  Lib.seed(n, {
    poster: hit.poster,
    backdrop: hit.backdrop,
    tmdbId: hit.tmdbId ?? undefined,
  });
}

function applyCollMeta(n: OrbitNode, hit: PlexCollMeta, preferPlex: boolean) {
  if (hit.plexKey) n.plexKey = hit.plexKey;
  if (preferPlex || !n.poster) {
    if (hit.poster) n.poster = hit.poster;
    if (hit.backdrop) n.backdrop = hit.backdrop;
  }
  Lib.seed(n, { poster: hit.poster, backdrop: hit.backdrop });
}

/**
 * Pull posters, backdrops, themes, and display metadata from Plex onto the existing OMS/local tree.
 * Does not add or move library titles — playback stays on OMS paths.
 */
export async function enrichTreeFromPlex(root: OrbitNode): Promise<OrbitNode | null> {
  if (!Plex.connected) return null;

  const preferPlex = plexMetadataOnly();
  const nodes: OrbitNode[] = [];
  walkNodes(root, nodes);

  const titles = nodes.filter((n) => n.type === 'movie' || n.type === 'show');
  const collections = nodes.filter((n) => n.type === 'collection');
  const titleTargets = preferPlex
    ? titles
    : titles.filter((n) => !n.poster || !n.plexKey || (n.type === 'show' && !n.theme));
  const collTargets = preferPlex
    ? collections
    : collections.filter((n) => !n.poster);

  if (!titleTargets.length && !collTargets.length) return null;

  const next = structuredClone(root);
  const byId = new Map<string, OrbitNode>();
  indexById(next, byId);

  let collIndex: Map<string, PlexCollMeta> | null = null;
  if (collTargets.length && Plex.buildCollectionIndex) {
    try {
      collIndex = await Plex.buildCollectionIndex();
    } catch {
      collIndex = null;
    }
  }

  let changed = false;
  const batch = 6;

  for (let i = 0; i < titleTargets.length; i += batch) {
    if (!Plex.findTitleMetadata) break;
    await Promise.all(
      titleTargets.slice(i, i + batch).map(async (src) => {
        const n = byId.get(src.id);
        if (!n) return;
        const hit = await Plex.findTitleMetadata!(n);
        if (!hit) return;
        changed = true;
        applyTitleMeta(n, hit, preferPlex);
      }),
    );
  }

  if (collIndex && Plex.findCollectionMetadata) {
    for (const src of collTargets) {
      const n = byId.get(src.id);
      if (!n) continue;
      const hit = Plex.findCollectionMetadata(n, collIndex);
      if (!hit) continue;
      changed = true;
      applyCollMeta(n, hit, preferPlex);
    }
  }

  return changed ? next : null;
}
