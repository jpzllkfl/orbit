import Plex from './plex.js';

export type LiveTvSource = 'plex' | 'iptv';

export type LiveTvConfig = {
  source: LiveTvSource;
  /** Full M3U playlist URL (ErsatzTV or custom). */
  iptvUrl: string;
  /** ErsatzTV base origin, e.g. http://192.168.1.177:8409 */
  ersatzOrigin: string;
};

export const LIVE_TV_LS = 'orbit.livetv.v1';

const DEFAULT: LiveTvConfig = {
  source: 'plex',
  iptvUrl: '',
  ersatzOrigin: '',
};

export function loadLiveTvConfig(): LiveTvConfig {
  try {
    const raw = localStorage.getItem(LIVE_TV_LS);
    if (!raw) return { ...DEFAULT, source: Plex.connected ? 'plex' : 'iptv' };
    const parsed = JSON.parse(raw) as Partial<LiveTvConfig>;
    return {
      source: parsed.source === 'iptv' ? 'iptv' : 'plex',
      iptvUrl: String(parsed.iptvUrl || ''),
      ersatzOrigin: String(parsed.ersatzOrigin || '').replace(/\/+$/, ''),
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveLiveTvConfig(patch: Partial<LiveTvConfig>): LiveTvConfig {
  const next = { ...loadLiveTvConfig(), ...patch };
  localStorage.setItem(LIVE_TV_LS, JSON.stringify(next));
  return next;
}

export function ersatzM3uUrl(origin: string): string {
  const base = (origin || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  return `${base}/iptv/channels.m3u?mode=segmenter`;
}

/** Effective M3U URL from saved config. */
export function resolvedIptvPlaylistUrl(cfg = loadLiveTvConfig()): string {
  if (cfg.iptvUrl.trim()) return cfg.iptvUrl.trim();
  return ersatzM3uUrl(cfg.ersatzOrigin);
}

export function resolvedIptvUrl(cfg = loadLiveTvConfig()): string {
  return resolvedIptvPlaylistUrl(cfg);
}

export function liveTvSourceAvailable(source: LiveTvSource, cfg = loadLiveTvConfig()): boolean {
  if (source === 'plex') return Plex.connected;
  return !!resolvedIptvPlaylistUrl(cfg);
}
