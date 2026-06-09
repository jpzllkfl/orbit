import OT from './helpers.js';
import Plex from './plex.js';
import type { OrbitNode, ProgressRecord } from '../types/orbit';

type PlexHubRaw = {
  type?: string;
  ratingKey?: string | number;
  title?: string;
  grandparentTitle?: string;
  grandparentRatingKey?: string | number;
  parentIndex?: number;
  index?: number;
  viewOffset?: number;
  viewCount?: number;
  duration?: number;
  lastViewedAt?: number;
};

function findByPlexKey(tree: OrbitNode, plexKey: string): OrbitNode | null {
  for (const { node } of OT.allTitles(tree)) {
    if (node.plexKey === plexKey) return node;
  }
  return null;
}

function hydrateNode(tree: OrbitNode, node: OrbitNode): OrbitNode {
  if (!node.plexKey) return node;
  const full = findByPlexKey(tree, node.plexKey);
  if (!full) return node;
  return { ...full, viewOffset: node.viewOffset ?? full.viewOffset, viewCount: node.viewCount ?? full.viewCount };
}

function hubItemToRecord(tree: OrbitNode, raw: PlexHubRaw): ProgressRecord | null {
  if (!raw?.ratingKey) return null;

  if (raw.type === 'episode') {
    const showKey = String(raw.grandparentRatingKey || '');
    if (!showKey) return null;
    const baseShow =
      findByPlexKey(tree, showKey) ||
      ({
        id: 'plex_show_' + showKey,
        type: 'show' as const,
        title: raw.grandparentTitle || 'Series',
        plexKey: showKey,
      } satisfies OrbitNode);
    const episode = {
      season: raw.parentIndex || 1,
      n: raw.index || 1,
      title: raw.title,
    };
    const dur = raw.duration ? raw.duration / 1000 : 0;
    const t = raw.viewOffset ? raw.viewOffset / 1000 : 0;
    const pct = dur > 0 ? Math.max(0, Math.min(1, t / dur)) : 0;
    if (pct >= 0.97) return null;
    const show = hydrateNode(tree, baseShow);
    return {
      key: show.id + ':s' + episode.season + 'e' + episode.n,
      node: show,
      episode,
      t,
      d: dur,
      pct,
      updatedAt: raw.lastViewedAt || Date.now(),
    };
  }

  const mapped = Plex.toTitle(raw) as OrbitNode;
  const dur = mapped.duration ? mapped.duration / 1000 : mapped.runtime ? mapped.runtime * 60 : 0;
  const t = mapped.viewOffset ? mapped.viewOffset / 1000 : 0;
  const pct = dur > 0 ? Math.max(0, Math.min(1, t / dur)) : 0;
  if (pct >= 0.97) return null;
  const node = hydrateNode(tree, mapped);
  return {
    key: node.id,
    node,
    episode: null,
    t,
    d: dur,
    pct,
    updatedAt: mapped.lastViewedAt || Date.now(),
  };
}

function onDeckToRecord(tree: OrbitNode, raw: PlexHubRaw): ProgressRecord | null {
  if (!raw?.ratingKey || raw.type !== 'episode') return null;
  const showKey = String(raw.grandparentRatingKey || '');
  if (!showKey) return null;
  const baseShow =
    findByPlexKey(tree, showKey) ||
    ({
      id: 'plex_show_' + showKey,
      type: 'show' as const,
      title: raw.grandparentTitle || 'Series',
      plexKey: showKey,
    } satisfies OrbitNode);
  const episode = {
    season: raw.parentIndex || 1,
    n: raw.index || 1,
    title: raw.title,
  };
  const show = hydrateNode(tree, { ...baseShow, plexKey: showKey, partKey: null });
  return {
    key: 'deck_' + show.id + ':s' + episode.season + 'e' + episode.n,
    node: show,
    episode,
    pct: 0,
    updatedAt: Date.now(),
  };
}

/** Continue Watching row — same hub Plex native apps use. */
export async function loadPlexContinueWatching(tree: OrbitNode): Promise<ProgressRecord[]> {
  if (!Plex.connected) return [];
  const items = await Plex.fetchContinueWatching(24);
  const out: ProgressRecord[] = [];
  for (const raw of items) {
    const rec = hubItemToRecord(tree, raw as PlexHubRaw);
    if (rec) out.push(rec);
  }
  return out;
}

/** On Deck (next episodes) — Plex home hub. */
export async function loadPlexOnDeck(tree: OrbitNode): Promise<ProgressRecord[]> {
  if (!Plex.connected) return [];
  const items = await Plex.fetchOnDeck(24);
  const out: ProgressRecord[] = [];
  for (const raw of items) {
    const rec = onDeckToRecord(tree, raw as PlexHubRaw);
    if (rec) out.push(rec);
  }
  return out;
}
