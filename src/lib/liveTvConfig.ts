import Plex from './plex.js';

export type LiveTvSource = 'youtubetv' | 'plex';

export type LiveTvConfig = {
  source: LiveTvSource;
};

export const LIVE_TV_LS = 'orbit.livetv.v1';

const DEFAULT: LiveTvConfig = {
  source: 'youtubetv',
};

export function loadLiveTvConfig(): LiveTvConfig {
  try {
    const raw = localStorage.getItem(LIVE_TV_LS);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<LiveTvConfig & { source?: string }>;
    const source = parsed.source === 'plex' ? 'plex' : 'youtubetv';
    return { source };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveLiveTvConfig(patch: Partial<LiveTvConfig>): LiveTvConfig {
  const next = { ...loadLiveTvConfig(), ...patch };
  localStorage.setItem(LIVE_TV_LS, JSON.stringify(next));
  return next;
}

export function liveTvSourceAvailable(source: LiveTvSource): boolean {
  if (source === 'plex') return Plex.connected;
  return true;
}
