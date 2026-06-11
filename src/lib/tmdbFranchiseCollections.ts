import { Lib } from '../lib';
import { loadSettings } from './settings';
import type { OrbitNode } from '../types/orbit';

function newId() {
  return 'fc_' + Math.random().toString(36).slice(2, 9);
}

function isColl(n: OrbitNode) {
  return n.type === 'collection';
}

async function movieCollection(tmdbId: number) {
  try {
    await Lib.ensureTmdbReady?.();
    const u = new URL('/api/tmdb/proxy', window.location.origin);
    u.searchParams.set('path', '/movie/' + tmdbId);
    const headers: Record<string, string> = {};
    if (Lib.key) headers['X-Orbit-Tmdb-Key'] = Lib.key;
    const res = await fetch(u.toString(), { headers });
    if (!res.ok) return null;
    const j = await res.json();
    return j.belongs_to_collection as { id: number; name: string; poster_path?: string; backdrop_path?: string } | null;
  } catch {
    return null;
  }
}

function img(path: string | undefined, size: string) {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;
}

/** Plex-style TMDB franchise collections — groups owned movies into auto collections. */
export async function applyFranchiseCollectionsToLibrary(lib: OrbitNode): Promise<OrbitNode | null> {
  if (!loadSettings().library.autoFranchiseCollections || !Lib.connected) return null;

  const children = lib.children || [];
  const manualColls = children.filter((c) => isColl(c) && !c.auto);
  const autoFranchiseIds = new Set(
    children.filter((c) => isColl(c) && c.auto && c.tmdbId).map((c) => c.tmdbId as number),
  );
  const movies = children.filter((c) => c.type === 'movie' && c.tmdbId);
  const others = children.filter((c) => c.type !== 'movie' || !c.tmdbId);

  if (movies.length < 2) return null;

  const groups = new Map<
    number,
    { name: string; poster?: string; backdrop?: string; kids: OrbitNode[] }
  >();

  for (let i = 0; i < movies.length; i += 8) {
    const chunk = movies.slice(i, i + 8);
    await Promise.all(
      chunk.map(async (m) => {
        const bc = await movieCollection(m.tmdbId!);
        if (!bc?.id) return;
        if (!groups.has(bc.id)) {
          groups.set(bc.id, {
            name: bc.name,
            poster: img(bc.poster_path, 'w780'),
            backdrop: img(bc.backdrop_path, 'original'),
            kids: [],
          });
        }
        groups.get(bc.id)!.kids.push(m);
      }),
    );
  }

  const newColls: OrbitNode[] = [];
  const absorbed = new Set<string>();

  for (const [id, g] of groups) {
    if (g.kids.length < 2) continue;
    if (autoFranchiseIds.has(id)) continue;
    g.kids.forEach((k) => absorbed.add(k.id));
    newColls.push({
      id: newId(),
      type: 'collection',
      title: g.name.replace(/\s*Collection$/i, ''),
      tmdbId: id,
      poster: g.poster,
      backdrop: g.backdrop,
      auto: true,
      blurb: `${g.kids.length} titles`,
      children: g.kids.slice().sort((a, b) => (a.year || 0) - (b.year || 0) || a.title.localeCompare(b.title)),
    });
  }

  if (!newColls.length) return null;

  const looseMovies = movies.filter((m) => !absorbed.has(m.id));
  const keptAuto = children.filter((c) => isColl(c) && c.auto && !c.tmdbId);
  return {
    ...lib,
    children: [...manualColls, ...newColls, ...keptAuto, ...looseMovies, ...others],
  };
}

export async function applyFranchiseCollectionsToTree(root: OrbitNode): Promise<OrbitNode | null> {
  let changed = false;
  const next = structuredClone(root);
  for (let i = 0; i < (next.children || []).length; i++) {
    const ch = next.children![i];
    if (ch.type !== 'library') continue;
    const updated = await applyFranchiseCollectionsToLibrary(ch);
    if (updated) {
      next.children![i] = updated;
      changed = true;
    }
  }
  return changed ? next : null;
}
