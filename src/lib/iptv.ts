import { loadLiveTvConfig, resolvedIptvPlaylistUrl } from './liveTvConfig';

export type IptvChannel = {
  id: string;
  name: string;
  logo?: string;
  group?: string;
  url: string;
};

function parseExtinf(line: string): { name: string; logo?: string; group?: string } {
  const groupMatch = line.match(/group-title="([^"]*)"/i);
  const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
  const comma = line.lastIndexOf(',');
  const name = comma >= 0 ? line.slice(comma + 1).trim() : 'Channel';
  return {
    name,
    logo: logoMatch?.[1],
    group: groupMatch?.[1] || undefined,
  };
}

/** Parse M3U playlist text into channels. */
export function parseM3u(text: string): IptvChannel[] {
  const lines = text.split(/\r?\n/);
  const out: IptvChannel[] = [];
  let pending: ReturnType<typeof parseExtinf> | null = null;
  let idx = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      pending = parseExtinf(line);
      continue;
    }
    if (line.startsWith('#')) continue;
    if (!pending) continue;
    const id = 'ch_' + idx++;
    out.push({
      id,
      name: pending.name || `Channel ${idx}`,
      logo: pending.logo,
      group: pending.group,
      url: line,
    });
    pending = null;
  }
  return out;
}

export async function fetchM3uPlaylist(url: string): Promise<IptvChannel[]> {
  const target = '/api/livetv/m3u?url=' + encodeURIComponent(url);
  const res = await fetch(target);
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Could not load playlist (${res.status})`);
  }
  const text = await res.text();
  const channels = parseM3u(text);
  if (!channels.length) throw new Error('Playlist has no channels.');
  return channels;
}

export async function loadIptvChannels(cfg = loadLiveTvConfig()): Promise<IptvChannel[]> {
  const url = resolvedIptvPlaylistUrl(cfg);
  if (!url) throw new Error('Add an IPTV or ErsatzTV URL in Connections');
  return fetchM3uPlaylist(url);
}

/** Rewrite channel stream URL through Orbit when cross-origin. */
export function iptvPlaybackUrl(channelUrl: string): string {
  if (!channelUrl) return channelUrl;
  try {
    const u = new URL(channelUrl, window.location.origin);
    if (u.origin === window.location.origin) return channelUrl;
  } catch {
    /* use proxy */
  }
  return '/api/livetv/stream?url=' + encodeURIComponent(channelUrl);
}

export const iptvStreamUrl = iptvPlaybackUrl;
