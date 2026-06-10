export type MediaLibraryType = 'movie' | 'tv';

export interface MediaLibraryFolder {
  id: string;
  libraryId: string;
  path: string;
  createdAt: number;
  pathExists: boolean;
  readable?: boolean;
}

export interface MediaLibrary {
  id: string;
  name: string;
  type: MediaLibraryType;
  folders: MediaLibraryFolder[];
  folderCount: number;
  /** First folder path (legacy) */
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

export interface BrowseEntry {
  name: string;
  path: string;
  type: 'dir';
}

export interface BrowseRoot {
  path: string;
  name: string;
  label: string;
  exists: boolean;
  readable: boolean;
}

export interface BrowseResult {
  path: string | null;
  parent: string | null;
  roots?: BrowseRoot[];
  entries: BrowseEntry[];
}

export interface MediaServerStatus {
  ok: boolean;
  service: string;
  version: number;
  libraries: number;
  items: number;
  dbPath?: string;
}
