import { Conn } from './conn.ts';
import { countTitles, plexIsConfigured, treeHasContent } from './importUtils.ts';
import Plex from './plex.js';
import { TreeStore } from './treeStore.ts';
import type { OrbitNode } from '../types/orbit';

type BuiltTree = OrbitNode & { _sectionKeys?: string[] };

type StreamEvent =
  | { type: 'progress'; message: string; libs: number; titles: number; tree?: OrbitNode }
  | { type: 'done'; tree: OrbitNode; sectionKeys?: string[] }
  | { type: 'error'; error: string };

export type ImportProgress = {
  onStatus?: (msg: string) => void;
  onPartial?: (tree: OrbitNode) => void;
};

async function importViaServer(base: string, token: string, keys?: string[]) {
  const res = await fetch('/api/plex/import-tree', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base, token, keys }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    tree?: OrbitNode;
    sectionKeys?: string[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error || 'Server import failed');
  if (!json.tree) throw new Error(json.error || 'No tree returned');
  return { tree: json.tree, sectionKeys: json.sectionKeys };
}

async function importViaServerStream(
  base: string,
  token: string,
  keys: string[] | undefined,
  progress?: ImportProgress,
) {
  const res = await fetch('/api/plex/import-tree/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base, token, keys }),
  });
  if (!res.ok || !res.body) {
    return importViaServer(base, token, keys);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let finalTree: OrbitNode | null = null;
  let sectionKeys: string[] | undefined = keys;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() || '';
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      try {
        const ev = JSON.parse(line.slice(6)) as StreamEvent;
        if (ev.type === 'progress') {
          progress?.onStatus?.(ev.message);
          if (ev.tree) progress?.onPartial?.(ev.tree);
        } else if (ev.type === 'done') {
          finalTree = ev.tree;
          sectionKeys = ev.sectionKeys || sectionKeys;
        } else if (ev.type === 'error') {
          throw new Error(ev.error);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e;
      }
    }
  }

  if (!finalTree) return importViaServer(base, token, keys);
  return { tree: finalTree, sectionKeys };
}

export type PlexImportResult = {
  tree: OrbitNode | null;
  error?: string;
};

/** All movie/TV section keys from Plex (not the cached subset). */
export async function allPlexSectionKeys(): Promise<string[] | undefined> {
  if (!Plex.connected) return undefined;
  try {
    const secs = await Plex.sections();
    const keys = secs.map((s) => String(s.key));
    return keys.length ? keys : undefined;
  } catch {
    return undefined;
  }
}

/** True when Plex has more libraries than the saved tree (e.g. after a partial sync). */
export async function needsLibraryRepair(tree: OrbitNode): Promise<boolean> {
  if (!treeHasContent(tree) || !plexIsConfigured(Conn.load())) return false;
  const keys = await allPlexSectionKeys();
  if (!keys?.length) return false;
  const imported = (tree.children || []).filter((c) => c.type === 'library').length;
  return keys.length > imported;
}

/** Pull the full library tree from Plex using saved connection settings. */
export async function importLibraryFromPlex(
  progress?: ImportProgress | ((msg: string) => void),
): Promise<PlexImportResult> {
  const cb: ImportProgress =
    typeof progress === 'function' ? { onStatus: progress } : progress || {};
  const conn = Conn.load();
  if (!plexIsConfigured(conn)) {
    return { tree: null, error: 'Plex is not configured yet.' };
  }

  cb.onStatus?.('Connecting to Plex…');
  let plexOk = false;
  try {
    plexOk = await Plex.restoreFromConnState(conn);
  } catch {
    plexOk = false;
  }
  if (!plexOk) {
    return {
      tree: null,
      error: `Could not reach your Plex server${conn?.server?.name ? ` (${conn.server.name})` : ''}. Make sure it is online.`,
    };
  }

  cb.onStatus?.('Syncing from Plex…');
  try {
    const keys = (await allPlexSectionKeys()) || (conn!.libraries?.length ? conn!.libraries : undefined);
    let live: OrbitNode;
    let sectionKeys = keys;

    if (Plex.conn?.url && Plex.conn?.token) {
      try {
        const out = await importViaServerStream(Plex.conn.url, Plex.conn.token, keys, cb);
        live = out.tree;
        sectionKeys = out.sectionKeys || keys;
      } catch {
        const out = await importViaServer(Plex.conn.url, Plex.conn.token, keys);
        live = out.tree;
        sectionKeys = out.sectionKeys || keys;
      }
    } else {
      const built = (await Plex.buildTree(keys)) as BuiltTree;
      sectionKeys = built._sectionKeys || keys;
      delete built._sectionKeys;
      live = built;
    }

    if (!treeHasContent(live)) {
      const libs = live.children?.length ?? 0;
      return {
        tree: null,
        error:
          libs > 0
            ? 'Plex libraries loaded but contained no titles. Check that your libraries are shared with this account.'
            : 'Plex connected but no libraries were found. Open the setup wizard to reconnect.',
      };
    }
    TreeStore.save(live);
    Conn.save({
      ...conn!,
      libraries: sectionKeys || conn!.libraries,
      items: countTitles(live),
      syncedAt: Date.now(),
    });
    return { tree: TreeStore.load() || live };
  } catch (e) {
    return { tree: null, error: e instanceof Error ? e.message : 'Library sync failed' };
  }
}

export function needsPlexImport(tree: OrbitNode) {
  return plexIsConfigured(Conn.load()) && !treeHasContent(tree);
}

export function importTitleCount(tree: OrbitNode | null) {
  return tree ? countTitles(tree) : 0;
}
