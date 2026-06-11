import { loadSettings } from './settings';
import type { OrbitNode } from '../types/orbit';

function newId() {
  return 'ac_' + Math.random().toString(36).slice(2, 9);
}

function decadeLabel(year: number) {
  const d = Math.floor(year / 10) * 10;
  return `${d}s`;
}

/** Remove auto-generated decade/genre shells and keep their titles loose in the library. */
export function stripAutoCollectionsFromNode(node: OrbitNode): OrbitNode {
  const kids = (node.children || []).flatMap((ch) => {
    if (ch.type === 'collection' && ch.auto) {
      return ch.children || [];
    }
    if (ch.children?.length) {
      return [{ ...ch, children: stripAutoCollectionsFromNode(ch).children }];
    }
    return [ch];
  });
  return { ...node, children: kids };
}

export function stripAutoCollectionsFromTree(root: OrbitNode): OrbitNode {
  if (loadSettings().library.autoCollections) return root;
  return stripAutoCollectionsFromNode(root);
}

/** Optional decade/genre grouping — off by default; franchises are built manually. */
export function applyAutoCollectionsToLibrary(lib: OrbitNode): OrbitNode {
  if (!loadSettings().library.autoCollections) return lib;
  const titles = (lib.children || []).filter((c) => c.type === 'movie' || c.type === 'show');
  if (titles.length < 4) return { ...lib, children: titles };

  const byDecade = new Map<string, OrbitNode[]>();
  const byGenre = new Map<string, OrbitNode[]>();
  const noYear: OrbitNode[] = [];

  for (const t of titles) {
    if (t.year && t.year > 1900) {
      const label = decadeLabel(t.year);
      if (!byDecade.has(label)) byDecade.set(label, []);
      byDecade.get(label)!.push(t);
    } else {
      noYear.push(t);
    }
    const g = (t.genre || '').trim();
    if (g) {
      if (!byGenre.has(g)) byGenre.set(g, []);
      byGenre.get(g)!.push(t);
    }
  }

  const collections: OrbitNode[] = [];

  for (const [label, children] of [...byDecade.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    if (children.length < 2) continue;
    collections.push({
      id: newId(),
      type: 'collection',
      title: label,
      blurb: `${children.length} titles from the ${label}`,
      auto: true,
      children: children.sort((a, b) => a.title.localeCompare(b.title)),
    });
  }

  for (const [genre, children] of [...byGenre.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (children.length < 3) continue;
    collections.push({
      id: newId(),
      type: 'collection',
      title: genre,
      blurb: `${children.length} ${genre} titles`,
      auto: true,
      children: children.sort((a, b) => a.title.localeCompare(b.title)),
    });
  }

  if (!collections.length) return { ...lib, children: titles };

  if (noYear.length >= 2) {
    collections.push({
      id: newId(),
      type: 'collection',
      title: 'Undated',
      blurb: `${noYear.length} titles without a year`,
      auto: true,
      children: noYear,
    });
  }

  return { ...lib, children: [...collections, ...titles] };
}

export function decorateOmsLibraries(root: OrbitNode): OrbitNode {
  const stripped = stripAutoCollectionsFromTree(root);
  return {
    ...stripped,
    children: (stripped.children || []).map((ch) =>
      ch.type === 'library' && ch.omsLibraryId ? applyAutoCollectionsToLibrary(ch) : ch,
    ),
  };
}
