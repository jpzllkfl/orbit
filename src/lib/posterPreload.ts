import Lib from './library.js';
import { hiResPoster } from './artUrls';
import type { OrbitNode } from '../types/orbit';

const warmed = new Set<string>();

/** Warm browser cache for poster URLs already known on nodes. */
export function preloadKnownPosters(nodes: OrbitNode[], limit = 64) {
  if (typeof Image === 'undefined') return;
  let n = 0;
  for (const node of nodes) {
    if (n >= limit) break;
    const ov = Lib.getOverride(node.id);
    const raw = ov?.poster || node.poster || Lib.getCached(node)?.poster;
    if (!raw) continue;
    const url = hiResPoster(raw) || raw;
    if (warmed.has(url)) continue;
    warmed.add(url);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    n++;
  }
}
