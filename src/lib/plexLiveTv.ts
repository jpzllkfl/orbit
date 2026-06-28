import Plex from './plex.js';

export type PlexLiveChannel = {
  id: string;
  dvrKey: string;
  title: string;
  thumb?: string | null;
  group?: string;
};

export type PlexLiveTuneResult = {
  streamUrl: string;
  title: string;
};

export type PlexDvr = { key: string; title: string };
export type PlexLiveSession = { sessionKey: string; streamUrl: string | null; channelTitle?: string };

function plexClientId(): string {
  try {
    return localStorage.getItem('orbit.plex.clientId') || 'orbit';
  } catch {
    return 'orbit';
  }
}

function parseChannelsFromDvrXml(text: string, dvrKey: string): PlexLiveChannel[] {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const channels = [...doc.querySelectorAll('Channel')];
  return channels.map((el) => {
    const id =
      el.getAttribute('id') ||
      el.getAttribute('scrobbleKey') ||
      el.getAttribute('ratingKey') ||
      el.getAttribute('vcn') ||
      '';
    return {
      id: String(id),
      dvrKey,
      title: el.getAttribute('title') || 'Channel',
      thumb: el.getAttribute('thumb'),
      group: el.getAttribute('tag') || el.getAttribute('parentTitle') || undefined,
    };
  }).filter((c) => c.id);
}

async function plexRaw(path: string, method = 'GET'): Promise<string> {
  const conn = Plex.conn;
  if (!conn?.url || !conn.token) throw new Error('Connect Plex in Connections first.');
  if (Plex.useProxy) {
    const res = await fetch('/api/plex/proxy' + path, {
      method,
      headers: {
        Accept: 'application/json',
        'X-Orbit-Plex-Base': conn.url,
        'X-Orbit-Plex-Token': conn.token,
        'X-Plex-Client-Identifier': plexClientId(),
        'X-Plex-Product': 'Orbit',
        'X-Plex-Version': '1.0',
        'X-Plex-Platform': 'Web',
        'X-Plex-Device': 'Orbit',
        'X-Plex-Provides': 'client,player',
        'X-Plex-Client-Capabilities':
          'protocols=http-video,http-live-streaming,http-mp4-streaming;videoDecoders=h264{profile:high&resolution:1080};audioDecoders=aac{channels:6}',
      },
    });
    if (!res.ok) throw new Error('Plex Live TV request failed (' + res.status + ')');
    return res.text();
  }
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(conn.url + path + sep + 'X-Plex-Token=' + encodeURIComponent(conn.token), {
    method,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Plex Live TV request failed (' + res.status + ')');
  return res.text();
}

function asList<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export async function listPlexLiveChannels(): Promise<PlexLiveChannel[]> {
  if (!Plex.connected) return [];
  const body = await plexRaw('/livetv/dvrs');
  const trimmed = body.trim();
  if (trimmed.startsWith('{')) {
    try {
      const j = JSON.parse(body) as {
        MediaContainer?: { DVR?: Array<{ key?: string; Device?: Array<{ Channel?: unknown }> }> };
      };
      const dvrs = asList(j.MediaContainer?.DVR);
      const out: PlexLiveChannel[] = [];
      for (const dvr of dvrs) {
        const dvrKey = String(dvr.key || '').replace(/\D/g, '') || String(dvr.key || '');
        for (const dev of asList(dvr.Device)) {
          for (const ch of asList((dev as { Channel?: unknown }).Channel)) {
            const c = ch as Record<string, string>;
            const id = c.id || c.scrobbleKey || c.ratingKey || c.vcn;
            if (!id) continue;
            out.push({
              id: String(id),
              dvrKey,
              title: c.title || 'Channel',
              thumb: c.thumb ? Plex.imgUrl(c.thumb) : null,
              group: c.tag || c.parentTitle,
            });
          }
        }
      }
      if (out.length) return out;
    } catch {
      /* fall through to XML */
    }
  }
  const doc = new DOMParser().parseFromString(body, 'text/xml');
  const dvrs = [...doc.querySelectorAll('DVR')];
  const out: PlexLiveChannel[] = [];
  for (const dvr of dvrs) {
    const dvrKey = (dvr.getAttribute('key') || '').replace(/^\/livetv\/dvrs\//, '') || dvr.getAttribute('key') || '';
    out.push(...parseChannelsFromDvrXml(body, dvrKey));
  }
  if (!out.length) {
    const key = doc.querySelector('DVR')?.getAttribute('key') || '';
    const dvrKey = key.replace(/^\/livetv\/dvrs\//, '') || key;
    if (dvrKey) out.push(...parseChannelsFromDvrXml(body, dvrKey));
  }
  return out;
}

function sessionStreamPath(session: Record<string, unknown>): string | null {
  const meta = asList((session as { Metadata?: unknown }).Metadata)[0] as Record<string, unknown> | undefined;
  if (!meta) return null;
  const media = asList(meta.Media)[0] as Record<string, unknown> | undefined;
  const part = asList(media?.Part)[0] as Record<string, unknown> | undefined;
  const streams = asList(part?.Stream as unknown);
  const streamKey = (streams[0] as Record<string, unknown> | undefined)?.key;
  const key = part?.key || streamKey;
  return typeof key === 'string' ? key : null;
}

async function waitForLiveSession(maxMs = 12000): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const text = await plexRaw('/livetv/sessions');
    if (text.trim().startsWith('{')) {
      const j = JSON.parse(text) as { MediaContainer?: { Metadata?: unknown } };
      const path = sessionStreamPath(j.MediaContainer || {});
      if (path) return path;
    } else {
      const doc = new DOMParser().parseFromString(text, 'text/xml');
      const part = doc.querySelector('Part');
      const key = part?.getAttribute('key');
      if (key) return key;
    }
    await new Promise((r) => window.setTimeout(r, 400));
  }
  return null;
}

export async function tunePlexLiveChannel(ch: PlexLiveChannel): Promise<PlexLiveTuneResult> {
  await Plex.startPlaybackSession();
  await plexRaw(`/livetv/dvrs/${encodeURIComponent(ch.dvrKey)}/channels/${encodeURIComponent(ch.id)}/tune`, 'POST');
  const partKey = await waitForLiveSession();
  if (!partKey) throw new Error('Plex did not start a live stream. Is Live TV & DVR set up on your server?');

  const session = Plex.getPlaybackSession();
  const q = new URLSearchParams({
    path: partKey.startsWith('/') ? partKey : '/' + partKey,
    session,
    protocol: 'hls',
    directPlay: '0',
    directStream: '1',
    directStreamAudio: '0',
    fastSeek: '1',
    mediaIndex: '0',
    partIndex: '0',
    autoAdjustQuality: '0',
    subtitles: 'none',
    copyts: '1',
    'X-Plex-Token': Plex.conn!.token,
    'X-Plex-Client-Identifier': plexClientId(),
    'X-Plex-Platform': 'Web',
    'X-Plex-Device': 'Orbit',
    'X-Plex-Provides': 'client,player',
  });
  const plexPath = '/video/:/transcode/universal/start.m3u8?' + q.toString();
  const streamUrl = Plex.proxyStreamUrl(plexPath) || Plex.imgUrl(plexPath);
  if (!streamUrl) throw new Error('Could not build live stream URL.');
  return { streamUrl, title: ch.title };
}

export async function listDvrs(): Promise<PlexDvr[]> {
  if (!Plex.connected) return [];
  const body = await plexRaw('/livetv/dvrs');
  if (body.trim().startsWith('{')) {
    try {
      const j = JSON.parse(body) as { MediaContainer?: { DVR?: Array<{ key?: string; title?: string }> } };
      return asList(j.MediaContainer?.DVR).map((d) => ({
        key: String(d.key || '').replace(/^\/livetv\/dvrs\//, '') || String(d.key || ''),
        title: String(d.title || 'Live TV'),
      })).filter((d) => d.key);
    } catch {
      /* xml fallback */
    }
  }
  const doc = new DOMParser().parseFromString(body, 'text/xml');
  return [...doc.querySelectorAll('DVR')].map((el) => ({
    key: (el.getAttribute('key') || '').replace(/^\/livetv\/dvrs\//, '') || el.getAttribute('key') || '',
    title: el.getAttribute('title') || 'Live TV',
  })).filter((d) => d.key);
}

export async function listChannels(dvrKey: string): Promise<PlexLiveChannel[]> {
  const all = await listPlexLiveChannels();
  return all.filter((c) => !dvrKey || c.dvrKey === dvrKey);
}

export async function tuneChannel(dvrKey: string, channelId: string): Promise<void> {
  const ch = (await listPlexLiveChannels()).find((c) => c.dvrKey === dvrKey && c.id === channelId);
  if (!ch) throw new Error('Channel not found');
  await tunePlexLiveChannel(ch);
}

export async function getLiveSession(): Promise<PlexLiveSession | null> {
  const text = await plexRaw('/livetv/sessions');
  if (text.trim().startsWith('{')) {
    const j = JSON.parse(text) as { MediaContainer?: Record<string, unknown> };
    const path = sessionStreamPath(j.MediaContainer || {});
    if (!path) return null;
    return { sessionKey: path, streamUrl: path };
  }
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const key = doc.querySelector('Part')?.getAttribute('key');
  return key ? { sessionKey: key, streamUrl: key } : null;
}

export function resolveLiveStreamUrl(session: PlexLiveSession | null): string | null {
  if (!session?.streamUrl) return null;
  const plexPath = session.streamUrl.includes('.m3u8')
    ? session.streamUrl
    : '/video/:/transcode/universal/start.m3u8?path=' + encodeURIComponent(session.streamUrl);
  return Plex.proxyStreamUrl(plexPath) || Plex.imgUrl(plexPath);
}

export async function tuneAndPlay(dvrKey: string, channelId: string): Promise<PlexLiveTuneResult> {
  const ch = (await listPlexLiveChannels()).find((c) => c.dvrKey === dvrKey && c.id === channelId);
  if (!ch) throw new Error('Channel not found');
  return tunePlexLiveChannel(ch);
}
