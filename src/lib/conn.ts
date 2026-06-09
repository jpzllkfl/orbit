export interface ConnAccount {
  kind: 'plex' | 'token' | 'demo';
  user: string;
  handle?: string;
}

export interface ConnServer {
  id: string;
  name: string;
  platform: string;
  version: string;
  type: 'direct' | 'relay';
  latency: number;
  place: string;
  /** Full Plex resource — used to reconnect without the wizard. */
  raw?: {
    token: string;
    connections?: Array<{ uri: string; local: boolean; relay: boolean }>;
  };
}

export interface ConnState {
  connected: boolean;
  live?: boolean;
  account?: ConnAccount;
  server?: ConnServer;
  /** Plex section keys (live) or demo library ids */
  libraries?: string[];
  items?: number;
  syncedAt?: number;
  /** TMDB key backup — primary store is orbit.tmdb.key */
  tmdbKey?: string;
}

const LS = 'orbit.conn.v1';

export const Conn = {
  load(): ConnState | null {
    try {
      return JSON.parse(localStorage.getItem(LS) || 'null');
    } catch {
      return null;
    }
  },
  save(c: ConnState) {
    try {
      localStorage.setItem(LS, JSON.stringify(c));
    } catch {
      /* quota */
    }
  },
  clear() {
    try {
      localStorage.removeItem(LS);
    } catch {
      /* ignore */
    }
  },
  /** True when a live Plex library was synced (not demo). */
  get live() {
    const c = Conn.load();
    return !!(c && c.connected && c.live);
  },
  get connected() {
    const c = Conn.load();
    return !!(c && c.connected);
  },
};
