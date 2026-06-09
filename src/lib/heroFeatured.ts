import Lib from './library.js';
import { titleNodesForRoot } from './treeIndex';
import type { HeroConfig } from './settings';
import type { OrbitNode } from '../types/orbit';

function shuffle<T>(arr: T[], seed: number) {
  const a = arr.slice();
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dedupe(arr: OrbitNode[]) {
  const seen = new Set<string>();
  const out: OrbitNode[] = [];
  for (const n of arr) {
    const k = n.id || n.title + '|' + (n.year || '');
    if (!seen.has(k)) {
      seen.add(k);
      out.push(n);
    }
  }
  return out;
}

function normTitle(x: string) {
  return (x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function poolFromLibraries(tree: OrbitNode, libs: OrbitNode[], ids: string[]) {
  const pick = ids.length ? libs.filter((l) => ids.includes(l.id) || ids.includes(l.libKey || '')) : libs;
  const out: OrbitNode[] = [];
  const seen = new Set<string>();
  for (const lib of pick) {
    for (const n of titleNodesForRoot(tree, lib)) {
      const k = n.title + '|' + (n.year || '');
      if (!seen.has(k)) {
        seen.add(k);
        out.push(n);
      }
    }
  }
  return out;
}

const SOURCE_LABELS: Record<HeroConfig['source'], string> = {
  random: 'Featured',
  trending_movies: 'Trending movies',
  trending_shows: 'Trending shows',
  trending_all: 'Trending now',
  libraries: 'From your libraries',
};

export function heroSourceLabel(source: HeroConfig['source']) {
  return SOURCE_LABELS[source] || 'Featured';
}

export async function buildHeroFeatured(
  tree: OrbitNode,
  libs: OrbitNode[],
  config: HeroConfig,
  scopeLib?: OrbitNode | null,
): Promise<{ items: OrbitNode[]; label: string }> {
  const count = Math.max(3, Math.min(config.count || 8, 16));
  const seed = (config.seed || 1) + Math.floor(Date.now() / 86400000);
  const label = heroSourceLabel(config.source);

  let pool: OrbitNode[] = [];
  if (config.source === 'libraries') {
    pool = poolFromLibraries(tree, libs, config.libraryIds || []);
  } else if (scopeLib) {
    pool = dedupe(titleNodesForRoot(tree, scopeLib));
  } else {
    pool = dedupe(titleNodesForRoot(tree, null));
  }

  if (!pool.length) return { items: [], label };

  if (config.source === 'random') {
    return { items: shuffle(pool, seed).slice(0, count), label };
  }

  if (!Lib.connected) {
    return { items: shuffle(pool, seed).slice(0, count), label };
  }

  try {
    const norm = normTitle;
    const rank = new Map<string, number>();

    if (config.source === 'trending_movies' || config.source === 'trending_all') {
      const m = await Lib.trending('movie');
      m.forEach((x, i) => {
        const kk = norm(x.title);
        if (!rank.has(kk)) rank.set(kk, (x.popularity || 0) + (1000 - i));
      });
    }
    if (config.source === 'trending_shows' || config.source === 'trending_all') {
      const t = await Lib.trending('show');
      t.forEach((x, i) => {
        const kk = norm(x.title);
        const sc = (x.popularity || 0) + (1000 - i);
        rank.set(kk, Math.max(rank.get(kk) || 0, sc));
      });
    }

    let hits = pool
      .filter((n) => rank.has(norm(n.title)))
      .sort((a, b) => (rank.get(norm(b.title)) || 0) - (rank.get(norm(a.title)) || 0));

    if (hits.length < 3) {
      hits = shuffle(pool, seed);
    }

    return { items: hits.slice(0, count), label };
  } catch {
    return { items: shuffle(pool, seed).slice(0, count), label };
  }
}
