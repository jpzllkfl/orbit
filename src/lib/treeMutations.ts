import OT from './helpers.js';
import type { OrbitNode } from '../types/orbit';
import { isColl } from './treeUtils';

export function findById(root: OrbitNode, id: string): OrbitNode | null {
  let r: OrbitNode | null = null;
  (function walk(n: OrbitNode) {
    if (n.id === id) {
      r = n;
      return;
    }
    for (const c of n.children || []) walk(c);
  })(root);
  return r;
}

export function isDescendant(root: OrbitNode, ancId: string, id: string): boolean {
  const a = findById(root, ancId);
  if (!a) return false;
  let found = false;
  (function walk(n: OrbitNode) {
    if (n.id === id) found = true;
    for (const c of n.children || []) walk(c);
  })(a);
  return found;
}

export function removeNodeFromTree(root: OrbitNode, id: string) {
  const par = OT.findParent(root, id);
  if (par?.children) par.children = par.children.filter((c) => c.id !== id);
}

/** Move all children from source into dest, then remove source. Both must be collections. */
export function mergeCollectionsInTree(root: OrbitNode, sourceId: string, destId: string) {
  if (sourceId === destId) return false;
  const source = findById(root, sourceId);
  const dest = findById(root, destId);
  if (!source || !dest) return false;
  if (source.type !== 'collection' || dest.type !== 'collection') return false;
  if (isDescendant(root, sourceId, destId)) return false;
  if (!dest.children) dest.children = [];
  if (source.children?.length) dest.children.push(...source.children);
  removeNodeFromTree(root, sourceId);
  return true;
}

export function moveNodeInTree(root: OrbitNode, id: string, targetId: string, beforeId: string | null) {
  if (id === targetId) return;
  const node = findById(root, id);
  if (!node) return;
  if (isColl(node) && isDescendant(root, id, targetId)) return;
  const par = OT.findParent(root, id);
  if (!par) return;
  par.children = (par.children || []).filter((c) => c.id !== id);
  const tgt = findById(root, targetId) || root;
  if (!tgt.children) tgt.children = [];
  if (beforeId) {
    const i = tgt.children.findIndex((c) => c.id === beforeId);
    tgt.children.splice(i < 0 ? tgt.children.length : i, 0, node);
  } else {
    tgt.children.push(node);
  }
}
