import type { BrowseResult, BrowseRoot, MediaItem, MediaLibrary, MediaServerStatus } from '../types/media';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api/media' + path, {
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

  async addLibrary(opts: { name: string; type: 'movie' | 'tv'; rootPath: string }): Promise<MediaLibrary> {
    const { library } = await api<{ library: MediaLibrary }>('/libraries', {
      method: 'POST',
      body: JSON.stringify(opts),
    });
    return library;
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

  async matchTmdb(tmdbKey: string, libraryId?: string): Promise<{ ok: boolean; matched: number }> {
    return api('/match', {
      method: 'POST',
      body: JSON.stringify({ tmdbKey, libraryId }),
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
