import type { OrbitNode } from '../types/orbit';

export interface ArtOverride {
  poster?: string | null;
  backdrop?: string | null;
}

export interface ResolvedArt {
  poster?: string | null;
  backdrop?: string | null;
  overview?: string;
  rating?: number | null;
  tmdbId?: number;
  popularity?: number;
  empty?: boolean;
}

export interface SearchResult {
  type: 'movie' | 'show';
  title: string;
  year?: number | null;
  genre?: string;
  poster?: string | null;
  backdrop?: string | null;
  overview?: string;
  tmdbId?: number;
  popularity?: number;
}

export interface OrbitLib {
  resolve(node: OrbitNode): Promise<ResolvedArt | null>;
  resolveTmdb(node: OrbitNode): Promise<ResolvedArt | null>;
  resolveLogo(node: OrbitNode): Promise<string | null>;
  trending(kind: 'movie' | 'show'): Promise<Array<{ title: string; year?: string; type: string; popularity?: number }>>;
  getCached(node: OrbitNode): ResolvedArt | null;
  seed(node: OrbitNode, art: Partial<ResolvedArt>): void;
  setKey(k: string): void;
  loadKey(): string;
  reloadFromStorage(): void;
  onChange(fn: () => void): () => void;
  clearCache(): void;
  imgUrl(path: string, size?: string): string | null;
  searchTitles(q: string): Promise<SearchResult[]>;
  searchCollections(q: string): Promise<Array<{ tmdbId: number; title: string; poster?: string | null }>>;
  collectionParts(id: number): Promise<SearchResult[]>;
  fetchImages(node: OrbitNode): Promise<{ posters: string[]; backdrops: string[] } | null>;
  fetchCollectionImages(node: OrbitNode): Promise<{ posters: string[]; backdrops: string[] } | null>;
  tpdbSearchUrl(node: OrbitNode): Promise<string | null>;
  resolveArtUrl(url: string): Promise<string[]>;
  refreshServerTmdb(): Promise<void>;
  ensureTmdbReady(): Promise<void>;
  readonly serverTmdb: boolean;
  fetchDetails(node: OrbitNode): Promise<{
    overview?: string;
    tagline?: string;
    status?: string | null;
    genres?: string[];
    voteAverage?: number | null;
    runtime?: number | null;
    seasons?: number | null;
    episodes?: number | null;
    director?: string | null;
    creators?: string[];
    cast?: Array<{ name: string; character?: string; photo?: string | null }>;
    network?: string | null;
    studio?: string | null;
    tmdbId?: number;
  } | null>;
  fetchShowSeasons(node: OrbitNode): Promise<
    Array<{ season: number; title: string; poster: string | null; episodes: number }>
  >;
  fetchSeasonEpisodes(node: OrbitNode, season: number): Promise<
    Array<{ n: number; season: number; title: string; synopsis: string; runtime: number | null; still: string | null }>
  >;
  getOverride(id: string): ArtOverride | null;
  setOverride(id: string, art: ArtOverride): void;
  clearOverride(id: string): void;
  readonly connected: boolean;
  readonly key: string;
}

export interface OrbitHelpers {
  isColl(n: OrbitNode | null | undefined): boolean;
  countDeep(coll: OrbitNode): { films: number; colls: number };
  countShallow(coll: OrbitNode): { films: number; colls: number };
  coverFor(coll: OrbitNode): OrbitNode | null;
  sampleTitles(coll: OrbitNode, max: number): OrbitNode[];
  findParent(root: OrbitNode, id: string, parent?: OrbitNode | null): OrbitNode | null;
  findById(root: OrbitNode, id: string): OrbitNode | null;
  idPath(root: OrbitNode, id: string): string[];
  depthOf(root: OrbitNode, id: string): number;
  isKid(n: OrbitNode): boolean;
  titleCat(n: OrbitNode): string;
  allTitles(root: OrbitNode): Array<{ node: OrbitNode; trail: string[] }>;
  allCollections(root: OrbitNode, includeRoot: boolean): Array<{ node: OrbitNode; depth: number }>;
}

export interface OrbitPlexClient {
  clientId: string;
  useProxy: boolean;
  connected: boolean;
  conn: { url: string; token: string } | null;
  account: { token: string } | null;
  setConn(url: string, token: string): void;
  setAccount(token: string): void;
  disconnect(): void;
  reloadFromStorage(): void;
  fetchCollections(): Promise<unknown[]>;
  fetchMock(): Promise<unknown[]>;
  sections(): Promise<Array<{ key: string; title: string; type: string }>>;
  buildTree(keys?: string[]): Promise<OrbitNode>;
  signIn(opts?: { onCode?: (code: string) => void }): Promise<string>;
  resources(token?: string): Promise<
    Array<{
      name: string;
      product: string;
      version: string;
      platform: string;
      token: string;
      connections: Array<{ uri: string; local: boolean; relay: boolean }>;
    }>
  >;
  bestConnection(server: { connections?: Array<{ uri: string; local: boolean; relay: boolean }> }): string;
  connectServer(server: { token: string; connections?: Array<{ uri: string; local: boolean; relay: boolean }> }): Promise<string>;
  restoreFromConnState(connState: { connected?: boolean; server?: { raw?: { token: string; connections?: Array<{ uri: string; local: boolean; relay: boolean }> } } } | null): Promise<boolean>;
  canDirectPlayInBrowser(title: OrbitNode): boolean;
  imgUrl(path: string, kind?: string): string | null;
  proxyStreamUrl(url: string): string;
  resolveStream(
    title: OrbitNode,
    quality?: string
  ): Promise<{ mode: string; url: string | null; fallbackUrl: string | null }>;
  stopPlayback(): Promise<void>;
  isLocalConnection(): boolean;
  getPlaybackSession(): string;
  startPlaybackSession(): Promise<string>;
  beginNewPlayback(): Promise<string>;
  pingTranscodeSession(session: string): Promise<void>;
  sendTimeline(
    ratingKey: string,
    opts?: { state?: string; timeMs?: number; durationMs?: number }
  ): Promise<void>;
  directPlayUrl(title: OrbitNode): string | null;
  nativeDirectUrl(title: OrbitNode): string | null;
  resolveNativeStream(title: OrbitNode): Promise<{ mode: string; url: string | null }>;
  transcodeUrl(title: OrbitNode, opts?: { maxBitrate?: number; quality?: number; session?: string; offset?: number }): string | null;
  themeUrl(path: string): string | null;
  getThemeUrl(ratingKey: string): Promise<string | null>;
  resolveShowTheme(node: OrbitNode): Promise<string | null>;
  findTitleMetadata?(
    node: OrbitNode,
  ): Promise<{
    plexKey?: string;
    poster?: string | null;
    backdrop?: string | null;
    theme?: string | null;
    tmdbId?: number | null;
    title?: string | null;
    year?: number | null;
    genre?: string | null;
  } | null>;
  buildCollectionIndex?(): Promise<
    Map<string, { title?: string; plexKey?: string; poster?: string | null; backdrop?: string | null }>
  >;
  findCollectionMetadata?(
    node: OrbitNode,
    index: Map<string, { title?: string; plexKey?: string; poster?: string | null; backdrop?: string | null }>,
  ): { title?: string; plexKey?: string; poster?: string | null; backdrop?: string | null } | null;
  fetchMetadata(ratingKey: string): Promise<OrbitNode | null>;
  fetchDetails(ratingKey: string): Promise<{
    overview?: string;
    tagline?: string;
    genres?: string[];
    voteAverage?: number | null;
    runtime?: number | null;
    seasons?: number | null;
    episodes?: number | null;
    director?: string | null;
    creators?: string[];
    cast?: Array<{ name: string; character?: string; photo?: string | null }>;
    network?: string | null;
    studio?: string | null;
    status?: string | null;
  } | null>;
  resolvePlayback(
    node: OrbitNode,
    episode?: { season: number; n: number } | null
  ): Promise<OrbitNode | null>;
  pickShowEpisode(
    node: OrbitNode,
    episode?: { season: number; n: number; title?: string } | null
  ): Promise<{ season: number; n: number; title: string } | null>;
  fetchSeasons(showKey: string): Promise<
    Array<{ season: number; title: string; poster: string | null; episodes: number }>
  >;
  fetchShowLeaves(showKey: string): Promise<
    Array<{
      ratingKey: string;
      season: number;
      episode: number;
      title: string;
      summary: string;
      still: string | null;
      viewCount: number;
      viewOffset: number;
      duration: number;
    }>
  >;
  scrobble(ratingKey: string): Promise<void>;
  unscrobble(ratingKey: string): Promise<void>;
  reportProgress(ratingKey: string, timeMs: number): Promise<void>;
  fetchSubtitleStreamUrl(ratingKey: string): Promise<string | null>;
  toTitle(it: Record<string, unknown>): OrbitNode;
  fetchHomeHub(hubKey: string, count?: number): Promise<Record<string, unknown>[]>;
  fetchContinueWatching(count?: number): Promise<Record<string, unknown>[]>;
  fetchOnDeck(count?: number): Promise<Record<string, unknown>[]>;
}

declare global {
  interface Window {
    OT: OrbitHelpers;
    OrbitLib: OrbitLib;
    OrbitPlex: OrbitPlexClient;
    OrbitProgress: {
      key(node: OrbitNode, episode: { season: number; n: number } | null): string;
      set(node: OrbitNode, episode: { season: number; n: number } | null, t: number, d: number): void;
      get(node: OrbitNode, episode: { season: number; n: number } | null): import('../types/orbit').ProgressRecord & { t?: number; pct?: number } | null;
      list(): Array<import('../types/orbit').ProgressRecord>;
      remove(key: string): void;
      clearAll(): void;
      setWatched(id: string, on: boolean): void;
      isWatched(id: string): boolean;
      applyPlexState(
        node: OrbitNode,
        episode: { season: number; n: number; title?: string } | null,
        state?: { viewOffset?: number; viewCount?: number; duration?: number },
      ): void;
    };
    OrbitMeta: {
      get(node: OrbitNode): Record<string, unknown> | null;
      episodes(show: OrbitNode, season: number): Array<{ n: number; season: number; title: string; synopsis?: string; runtime?: number }>;
      seasonCount(show: OrbitNode, season: number): number;
      mediaInfo(node: OrbitNode): Record<string, unknown>;
    };
    ORBIT_DATA: { ROOT: OrbitNode; ARCHIVE: OrbitNode[] };
  }
}
