export type MediaLibraryType = 'movie' | 'tv';

export interface MediaLibrary {
  id: string;
  name: string;
  type: MediaLibraryType;
  rootPath: string;
  createdAt: number;
  updatedAt: number;
  lastScanAt: number | null;
  lastScanStatus: string | null;
  lastScanMessage: string | null;
  itemCount: number;
  pathExists: boolean;
}

export interface MediaItem {
  id: string;
  type: 'movie' | 'show' | 'episode';
  title: string;
  year: number | null;
  season: number | null;
  episode: number | null;
  showTitle: string | null;
  fileName: string;
  filePath: string;
}

export interface MediaServerStatus {
  ok: boolean;
  service: string;
  version: number;
  libraries: number;
  items: number;
  dbPath?: string;
}
