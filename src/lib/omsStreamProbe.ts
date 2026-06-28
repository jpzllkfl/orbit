import { shouldUseMediaRelay } from './omsStreamUrls';

function sessionToken(): string {
  try {
    return localStorage.getItem('orbit.session.v1') || '';
  } catch {
    return '';
  }
}

function authHeaders(): Record<string, string> {
  const token = sessionToken();
  return token ? { Authorization: 'Bearer ' + token } : {};
}

/** Probe an OMS stream URL before attaching to <video>. Returns an error message or null if OK. */
export async function probeOmsStreamUrl(url: string, timeoutMs = 55000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: {
        ...authHeaders(),
        ...(url.includes('.m3u8') ? {} : { Range: 'bytes=0-1' }),
      },
    });
    if (res.ok || res.status === 206) {
      if (url.includes('.m3u8')) {
        const text = await res.text();
        if (text.includes('#EXTM3U')) return null;
        return 'Desktop returned an invalid transcode playlist.';
      }
      return null;
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return j.error || `Playback unavailable (${res.status})`;
    }
    return `Playback unavailable (${res.status})`;
  } catch (e) {
    if (shouldUseMediaRelay()) {
      return 'Could not reach your Plex PC. Open Orbit Desktop, sign in, tap Sync now, and leave it running.';
    }
    return e instanceof Error && e.name === 'AbortError'
      ? 'Stream timed out starting on your Plex PC. Is ffmpeg installed? (winget install ffmpeg)'
      : 'Could not reach Orbit Media Server.';
  } finally {
    window.clearTimeout(t);
  }
}

export function pickOmsPlaybackUrl(
  info: { url: string; fallbackUrl: string | null },
  opts: { webRelay: boolean; allowDirect: boolean },
): { url: string; mode: 'direct' | 'transcode' } {
  if (opts.webRelay && info.fallbackUrl) {
    return { url: info.fallbackUrl, mode: 'transcode' };
  }
  if (opts.allowDirect) {
    return { url: info.url, mode: 'direct' };
  }
  if (info.fallbackUrl) {
    return { url: info.fallbackUrl, mode: 'transcode' };
  }
  return { url: info.url, mode: 'direct' };
}
