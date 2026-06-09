const PLEX_BACKDROP = 'width=3840&height=2160&minSize=1&upscale=1';
const PLEX_BACKDROP_FAST = 'width=1280&height=720&minSize=1&upscale=1';
const PLEX_POSTER = 'width=800&height=1200&minSize=1&upscale=1';
const PLEX_CARD = 'width=300&height=450&minSize=1&upscale=1';

function fastPostersOn() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('orbit-fast-posters');
}

function appendQuery(url: string, params: string) {
  if (url.includes(params.split('=')[0] + '=')) return url;
  return url + (url.includes('?') ? '&' : '?') + params;
}

function upgradePlexPath(path: string, params: string) {
  if (!path || path.includes('width=')) return path;
  return appendQuery(path, params);
}

/** Upgrade Plex proxy or direct server art URLs to full backdrop resolution. */
export function hiResBackdrop(url: string | null | undefined): string | null {
  if (!url) return null;
  const fast = fastPostersOn();
  if (url.includes('image.tmdb.org')) {
    return url.replace(/\/w\d+\//, fast ? '/w780/' : '/w1920/');
  }
  const backdropParams = fast ? PLEX_BACKDROP_FAST : PLEX_BACKDROP;
  if (url.includes('/api/plex/media')) {
    try {
      const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      const path = u.searchParams.get('path');
      if (path) {
        u.searchParams.set('path', upgradePlexPath(path, backdropParams));
        return u.pathname + '?' + u.searchParams.toString();
      }
    } catch {
      /* fall through */
    }
  }
  if (url.includes('/thumb/') || url.includes('/art/') || url.includes('/photo/')) {
    return appendQuery(url, backdropParams);
  }
  return url;
}

/** Upgrade poster URLs for sharp display on large cards. */
export function hiResPoster(url: string | null | undefined): string | null {
  if (!url) return null;
  const fast = fastPostersOn();
  if (url.includes('image.tmdb.org')) {
    return url.replace(/\/w\d+\//, fast ? '/w342/' : '/w780/');
  }
  const posterParams = fast ? PLEX_CARD : PLEX_POSTER;
  if (url.includes('/api/plex/media')) {
    try {
      const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      const path = u.searchParams.get('path');
      if (path) {
        u.searchParams.set('path', upgradePlexPath(path, posterParams));
        return u.pathname + '?' + u.searchParams.toString();
      }
    } catch {
      /* fall through */
    }
  }
  if (url.includes('/thumb/') || url.includes('/art/') || url.includes('/photo/')) {
    return appendQuery(url, posterParams);
  }
  return url;
}
