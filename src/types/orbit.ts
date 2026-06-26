export type NodeType = 'library' | 'collection' | 'movie' | 'show';

export interface Episode {
  n: number;
  season: number;
  title?: string;
  synopsis?: string;
  runtime?: number;
  showTitle?: string;
  still?: string | null;
  omsItemId?: string;
}

export interface OrbitNode {
  id: string;
  type: NodeType;
  smart?: boolean;
  /** Auto-generated decade/genre collection from OMS library. */
  auto?: boolean;
  title: string;
  year?: number;
  genre?: string;
  runtime?: number;
  rating?: string | null;
  seasons?: number;
  epsPerSeason?: number;
  tagline?: string;
  blurb?: string;
  libKey?: string;
  children?: OrbitNode[];
  tmdbId?: number;
  poster?: string;
  backdrop?: string;
  plexKey?: string;
  partKey?: string | null;
  /** Orbit Media Server file id (direct play). */
  omsItemId?: string;
  omsPath?: string;
  omsLibraryId?: string;
  omsShowTitle?: string;
  duration?: number | null;
  videoCodec?: string;
  audioCodec?: string;
  resolution?: string;
  container?: string;
  theme?: string | null;
  viewCount?: number;
  viewOffset?: number;
  lastViewedAt?: number | null;
  addedAt?: number | null;
}

export interface HomeRow {
  id: string;
  title: string;
  kind: string;
  ref?: string;
  seed?: number;
}

export interface ProgressRecord {
  key: string;
  node: OrbitNode;
  episode?: { season: number; n: number; title?: string; omsItemId?: string } | null;
  t?: number;
  d?: number;
  pct?: number;
  updatedAt?: number;
}

export interface PlayPayload {
  node: OrbitNode;
  episode?: { season: number; n: number; title?: string; omsItemId?: string } | null;
}
