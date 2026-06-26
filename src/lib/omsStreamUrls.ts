import { isDesktopApp } from './isDesktop';
import { authApiUrl, DESKTOP_MEDIA_LS, getOmsPlaybackOrigin, mediaApiUrl, normalizeOrigin } from './orbitServer';

function isPrivateHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h.startsWith('192.168.') ||
      h.startsWith('10.') ||
      h.endsWith('.local')
    );
  } catch {
    return false;
  }
}

function sessionToken(): string {
  try {
    return localStorage.getItem('orbit.session.v1') || '';
  } catch {
    return '';
  }
}

function streamAuthSuffix(): string {
  const token = sessionToken();
  return token ? `?orbit_token=${encodeURIComponent(token)}` : '';
}

/** Web/iPad: stream via cloud relay when files live on the desktop Plex PC. */
export function shouldUseMediaRelay(): boolean {
  if (isDesktopApp()) return false;
  if (typeof window === 'undefined') return false;
  const page = window.location.origin;
  try {
    const remote = localStorage.getItem(DESKTOP_MEDIA_LS);
    if (!remote) return false;
    const norm = normalizeOrigin(remote);
    if (!sessionToken()) return false;
    if (getOmsPlaybackOrigin() === page) return false;
    if (page.startsWith('https://') && norm.startsWith('http://')) return true;
    if (isPrivateHost(norm) && !isPrivateHost(page)) return true;
  } catch {
    return false;
  }
  return false;
}

export function omsStreamUrlForItem(itemId: string): string {
  if (shouldUseMediaRelay()) {
    return authApiUrl('/api/media/relay/stream/' + encodeURIComponent(itemId) + streamAuthSuffix());
  }
  return mediaApiUrl('/api/media/stream/' + encodeURIComponent(itemId));
}

export function omsTranscodeUrlForItem(itemId: string): string {
  if (shouldUseMediaRelay()) {
    return (
      authApiUrl('/api/media/relay/transcode/' + encodeURIComponent(itemId) + '/stream.m3u8') +
      streamAuthSuffix()
    );
  }
  return mediaApiUrl('/api/media/transcode/' + encodeURIComponent(itemId) + '/stream.m3u8');
}
