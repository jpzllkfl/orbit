import type { OrbitNode } from '../types/orbit';
import { orbitApiFetch } from './orbitApi';
import { apiUrl } from './orbitServer';

export type OmsImportResult = {
  tree: OrbitNode | null;
  titleCount?: number;
  libraryCount?: number;
  error?: string;
};

export async function fetchOmsTree(): Promise<OmsImportResult> {
  const res = await orbitApiFetch('/api/media/import-tree');
  const json = (await res.json().catch(() => ({}))) as OmsImportResult & { error?: string };
  if (!res.ok) {
    return { tree: null, error: json.error || 'Could not load Orbit Media Server libraries.' };
  }
  if (!json.tree) {
    return { tree: null, error: json.error || 'No scanned libraries found.' };
  }
  return json;
}

/** Merge OMS library nodes into an existing Plex-backed tree (skips duplicate lib titles). */
export function mergeOmsIntoTree(existing: OrbitNode, omsRoot: OrbitNode): OrbitNode {
  const existingNames = new Set(
    (existing.children || []).filter((c) => c.type === 'library').map((c) => c.title.toLowerCase()),
  );
  const toAdd: OrbitNode[] = [];
  for (const lib of omsRoot.children || []) {
    if (lib.type !== 'library') continue;
    let title = lib.title;
    if (existingNames.has(title.toLowerCase())) {
      title = `${title} (OMS)`;
    }
    toAdd.push({ ...lib, title, libKey: lib.libKey || title.toLowerCase().replace(/[^a-z0-9]/g, '') });
  }
  if (!toAdd.length) return existing;
  return {
    ...existing,
    children: [...(existing.children || []), ...toAdd],
  };
}

/** Replace OMS library nodes in tree (keeps Plex / manual libs). */
export function replaceOmsInTree(existing: OrbitNode, omsRoot: OrbitNode): OrbitNode {
  const keep = (existing.children || []).filter((c) => {
    if (c.type !== 'library') return true;
    if (c.omsLibraryId) return false;
    if (c.title?.endsWith(' (OMS)')) return false;
    if (String(c.blurb || '').includes('Orbit Media Server')) return false;
    return true;
  });
  const omsLibs = (omsRoot.children || []).filter((c) => c.type === 'library');
  return { ...existing, children: [...keep, ...omsLibs] };
}

export function stripOmsFromTree(existing: OrbitNode): OrbitNode {
  return replaceOmsInTree(existing, { id: 'oms-empty', type: 'collection', title: '', children: [] });
}

export function omsStreamUrl(itemId: string): string {
  return apiUrl('/api/media/stream/' + encodeURIComponent(itemId));
}

export function omsTranscodeUrl(itemId: string): string {
  return apiUrl('/api/media/transcode/' + encodeURIComponent(itemId) + '/stream.m3u8');
}

export function nodeHasOmsPlayback(node: OrbitNode): boolean {
  return !!(node.omsItemId || node.omsPath);
}
