import type { OrbitNode } from '../types/orbit';

export type TmdbFranchisePart = {
  type: string;
  title: string;
  year?: number | null;
  tmdbId?: number;
};

function normTitle(t: string) {
  return (t || '').trim().toLowerCase().replace(/^(the|a|an)\s+/i, '');
}

/** Map TMDB collection parts onto titles that already exist in the user's libraries. */
export function matchPartsToLibrary(library: OrbitNode[], parts: TmdbFranchisePart[]): OrbitNode[] {
  const byTmdb = new Map<number, OrbitNode>();
  const byTitleYear = new Map<string, OrbitNode>();

  for (const n of library) {
    if (n.type !== 'movie' && n.type !== 'show') continue;
    if (n.tmdbId) byTmdb.set(n.tmdbId, n);
    const key = `${n.type}:${normTitle(n.title)}:${n.year || ''}`;
    if (!byTitleYear.has(key)) byTitleYear.set(key, n);
  }

  const out: OrbitNode[] = [];
  const seen = new Set<string>();

  for (const p of parts) {
    const wantType = p.type === 'show' ? 'show' : 'movie';
    let hit: OrbitNode | undefined;
    if (p.tmdbId) hit = byTmdb.get(p.tmdbId);
    if (!hit) {
      hit = byTitleYear.get(`${wantType}:${normTitle(p.title)}:${p.year || ''}`);
    }
    if (hit && !seen.has(hit.id)) {
      seen.add(hit.id);
      out.push(hit);
    }
  }

  return out;
}

export function countPartsInLibrary(library: OrbitNode[], parts: TmdbFranchisePart[]) {
  const matched = matchPartsToLibrary(library, parts);
  return { matched: matched.length, total: parts.length };
}

export function isTitleInLibrary(library: OrbitNode[], part: TmdbFranchisePart): boolean {
  return matchPartsToLibrary(library, [part]).length > 0;
}
