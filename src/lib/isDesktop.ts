export function isDesktopApp() {
  return !!(typeof window !== 'undefined' && window.orbitNative?.available);
}

/** Skip expensive TMDB / Plex fan-out on large libraries (desktop + web). */
export function isHeavyLibrary(titleCount: number) {
  return titleCount > 80 || isDesktopApp();
}
