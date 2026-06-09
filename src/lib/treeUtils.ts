import type { OrbitNode } from '../types/orbit';

export const isColl = (n: OrbitNode) => n.type === 'collection' || n.type === 'library';

export function nodeByPath(root: OrbitNode, path: string[]): OrbitNode | null {
  let n: OrbitNode | null = root;
  for (let i = 1; i < path.length; i++) {
    n = (n?.children || []).find((c) => c.id === path[i]) || null;
    if (!n) break;
  }
  return n;
}

export function idPath(root: OrbitNode, id: string): string[] {
  let res: string[] | null = null;
  (function walk(n: OrbitNode, acc: string[]) {
    if (n.id === id) {
      res = acc;
      return;
    }
    for (const ch of n.children || []) walk(ch, [...acc, ch.id]);
  })(root, [root.id]);
  return res || [root.id];
}

export function flattenSearch(root: OrbitNode, q: string): OrbitNode[] {
  const out: OrbitNode[] = [];
  const ql = q.toLowerCase();
  (function walk(n: OrbitNode) {
    for (const ch of n.children || []) {
      if ((ch.title || '').toLowerCase().includes(ql) || (ch.genre || '').toLowerCase().includes(ql)) out.push(ch);
      if (isColl(ch)) walk(ch);
    }
  })(root);
  return out;
}

export function sortByTitle(a: OrbitNode, b: OrbitNode) {
  const k = (n: OrbitNode) => (n.title || '').toLowerCase().replace(/^(the|a|an)\s+/, '');
  return k(a) < k(b) ? -1 : 1;
}
