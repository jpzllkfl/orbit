import type { MediaItem, MediaLibrary, MediaServerStatus } from '../types/media';

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
};
