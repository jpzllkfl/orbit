import type { BrowseResult, BrowseRoot, MediaItem, MediaLibrary, MediaLibraryFolder, MediaServerStatus } from '../types/media';
import { orbitMediaFetch } from './orbitApi';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await orbitMediaFetch('/api/media' + path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || res.statusText || 'Request failed');
  return json as T;
}

export const OrbitMedia = {
  async status(): Promise<MediaServerStatus> {
    return api<MediaServerStatus>('/status');
  },

  async listLibraries(): Promise<MediaLibrary[]> {
    const { libraries } = await api<{ libraries: MediaLibrary[] }>('/libraries');
    return libraries;
  },

  async addLibrary(opts: {
    name?: string;
    type: 'movie' | 'tv';
    rootPath?: string;
    folderPath?: string;
  }): Promise<{ library: MediaLibrary; folder: MediaLibraryFolder; created: boolean }> {
    return api('/libraries', {
      method: 'POST',
      body: JSON.stringify({
        name: opts.name,
        type: opts.type,
        folderPath: opts.folderPath || opts.rootPath,
      }),
    });
  },

  async addFolder(libraryId: string, folderPath: string): Promise<{ library: MediaLibrary; folder: MediaLibraryFolder }> {
    return api('/libraries/' + encodeURIComponent(libraryId) + '/folders', {
      method: 'POST',
      body: JSON.stringify({ folderPath }),
    });
  },

  async removeFolder(libraryId: string, folderId: string): Promise<{ ok: boolean; libraries: MediaLibrary[] }> {
    return api('/libraries/' + encodeURIComponent(libraryId) + '/folders/' + encodeURIComponent(folderId), {
      method: 'DELETE',
    });
  },

  async removeLibrary(id: string): Promise<void> {
    await api('/libraries/' + encodeURIComponent(id), { method: 'DELETE' });
  },

  async scanLibrary(id: string): Promise<{ itemCount: number; library: MediaLibrary }> {
    return api('/libraries/' + encodeURIComponent(id) + '/scan', { method: 'POST' });
  },

  async listItems(libraryId: string, limit = 50): Promise<MediaItem[]> {
    const { items } = await api<{ items: MediaItem[] }>(
      '/libraries/' + encodeURIComponent(libraryId) + '/items?limit=' + limit,
    );
    return items;
  },

  async browseRoots(): Promise<BrowseRoot[]> {
    const { roots } = await api<{ roots: BrowseRoot[] }>('/browse/roots');
    return roots;
  },

  async browse(path?: string): Promise<BrowseResult> {
    const q = path ? '?path=' + encodeURIComponent(path) : '';
    return api<BrowseResult>('/browse' + q);
  },

  async importTree(): Promise<{ tree: import('../types/orbit').OrbitNode; titleCount: number; libraryCount: number }> {
    return api('/import-tree');
  },

  async updateLibrary(id: string, opts: { name?: string; type?: 'movie' | 'tv' }): Promise<MediaLibrary> {
    const { library } = await api<{ library: MediaLibrary }>('/libraries/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify(opts),
    });
    return library;
  },

  async wipeLibraries(): Promise<{ ok: boolean; libraries: MediaLibrary[] }> {
    return api('/libraries/wipe', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
  },

  async seedLibraries(): Promise<{
    ok: boolean;
    added: unknown[];
    updated: unknown[];
    missing: unknown[];
    libraries: MediaLibrary[];
  }> {
    return api('/libraries/seed', { method: 'POST' });
  },

  async scanAllLibraries(): Promise<{ ok: boolean; results: unknown[]; libraries: MediaLibrary[] }> {
    return api('/libraries/scan-all', { method: 'POST' });
  },

  async matchTmdb(
    tmdbKey?: string,
    libraryId?: string,
    force = false,
  ): Promise<{ ok: boolean; matched: number }> {
    return api('/match', {
      method: 'POST',
      body: JSON.stringify({ tmdbKey: tmdbKey || undefined, libraryId, force }),
    });
  },

  async showSeasons(libraryId: string, showTitle: string): Promise<Array<{ season: number; title: string; episodes: number }>> {
    const q =
      '?libraryId=' +
      encodeURIComponent(libraryId) +
      '&show=' +
      encodeURIComponent(showTitle);
    const { seasons } = await api<{ seasons: Array<{ season: number; title: string; episodes: number }> }>(
      '/shows/seasons' + q,
    );
    return seasons;
  },

  async showEpisodes(
    libraryId: string,
    showTitle: string,
    season: number,
  ): Promise<Array<{ id: string; season: number; episode: number; title: string }>> {
    const q =
      '?libraryId=' +
      encodeURIComponent(libraryId) +
      '&show=' +
      encodeURIComponent(showTitle) +
      '&season=' +
      season;
    const { episodes } = await api<{ episodes: Array<{ id: string; season: number; episode: number; title: string }> }>(
      '/shows/episodes' + q,
    );
    return episodes;
  },
};
