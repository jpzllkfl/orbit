import type { OrbitNode } from '../types/orbit';
import { dedupeTitleNodes } from './dedupeTitles';
import { countTitles } from './importUtils';

let sig = '';
let allNodes: OrbitNode[] = [];
let searchPool: OrbitNode[] = [];
const byLibrary = new Map<string, OrbitNode[]>();

function isColl(n: OrbitNode) {
  return n.type === 'collection' || n.type === 'library';
}

function walk(n: OrbitNode, trail: string[], out: OrbitNode[], libKey: string | null) {
  for (const ch of n.children || []) {
    if (isColl(ch) && ch.type === 'collection') {
      walk(ch, [...trail, ch.title], out, libKey);
    } else if (ch.type === 'movie' || ch.type === 'show') {
      out.push(ch);
      if (libKey) {
        const list = byLibrary.get(libKey);
        if (list) list.push(ch);
      }
    }
  }
}

function walkSearch(n: OrbitNode, out: OrbitNode[]) {
  for (const ch of n.children || []) {
    if (ch.type === 'movie' || ch.type === 'show') out.push(ch);
    else if (ch.type === 'collection' || ch.type === 'library') {
      if (ch.type === 'collection') out.push(ch);
      walkSearch(ch, out);
    }
  }
}

function rebuild(root: OrbitNode) {
  const nextSig = `${(root.children || []).length}:${countTitles(root)}`;
  if (nextSig === sig) return;
  sig = nextSig;
  allNodes = [];
  searchPool = [];
  byLibrary.clear();
  for (const lib of root.children || []) {
    if (lib.type !== 'library') continue;
    const key = lib.libKey || lib.id;
    byLibrary.set(key, []);
    walk(lib, [lib.title], allNodes, key);
    walkSearch(lib, searchPool);
  }
}

export function titleNodes(root: OrbitNode): OrbitNode[] {
  rebuild(root);
  return allNodes;
}

export function titleNodesForRoot(root: OrbitNode, scope?: OrbitNode | null): OrbitNode[] {
  rebuild(root);
  if (!scope || scope.id === root.id) return allNodes.slice();
  if (scope.type === 'library') return (byLibrary.get(scope.libKey || scope.id) || []).slice();
  const out: OrbitNode[] = [];
  (function w(n: OrbitNode) {
    for (const ch of n.children || []) {
      if (isColl(ch) && ch.type === 'collection') w(ch);
      else if (ch.type === 'movie' || ch.type === 'show') out.push(ch);
    }
  })(scope);
  return out;
}

export function invalidateTitleIndex() {
  sig = '';
}

/** Sorted unique titles for a library or all libraries (indexed, no tree walk). */
export function sortedTitlesForScope(root: OrbitNode, scope?: OrbitNode | null): OrbitNode[] {
  const nodes = dedupeTitleNodes(titleNodesForRoot(root, scope));
  return nodes.slice().sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}

/** Same-genre titles without scanning the full tree via OT.allTitles. */
export function similarTitles(root: OrbitNode, node: OrbitNode, limit = 8): OrbitNode[] {
  if (!node.genre) return [];
  rebuild(root);
  let pool = allNodes;
  for (const lib of root.children || []) {
    if (lib.type !== 'library') continue;
    const inLib = (byLibrary.get(lib.libKey || lib.id) || []).some((n) => n.id === node.id);
    if (inLib) {
      pool = byLibrary.get(lib.libKey || lib.id) || [];
      break;
    }
  }
  const out: OrbitNode[] = [];
  for (const n of pool) {
    if (n.id === node.id || n.genre !== node.genre) continue;
    out.push(n);
    if (out.length >= limit) break;
  }
  return out;
}

/** Fast title/collection search — no tree walk per keystroke. */
export function searchTitles(root: OrbitNode, q: string, limit = 80): OrbitNode[] {
  rebuild(root);
  const ql = q.trim().toLowerCase();
  if (!ql) return [];
  const out: OrbitNode[] = [];
  for (const n of searchPool) {
    const hay = ((n.title || '') + ' ' + (n.genre || '')).toLowerCase();
    if (hay.includes(ql)) out.push(n);
    if (out.length >= limit) break;
  }
  return out;
}
