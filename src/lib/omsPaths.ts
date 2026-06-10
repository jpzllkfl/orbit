/** TrueNAS host path shown in UI (Docker maps these to /media/*). */
export const TRUENAS_MEDIA_ROOT = 'broken_eye/media';

const MOUNT_TO_HOST: Record<string, string> = {
  '/media/anime': 'Anime',
  '/media/comedy': 'Comedy',
  '/media/documentaries': 'Documentaries',
  '/media/kids-movies': 'Kids Movies',
  '/media/kids-tv': 'Kids TV',
  '/media/movies': 'movies',
  '/media/tv': 'tv',
  '/media/remote': 'remote',
  '/media/remote-d': 'remote_d',
  '/media/remote-e': 'remote_E',
  '/media/remote-i': 'remote_I',
  '/media/remote-j': 'remote_J',
  '/media/remote-l': 'remote_L',
};

/** User-facing path (TrueNAS share layout, not Docker mount). */
export function displayMediaPath(containerPath: string): string {
  const hostDir = MOUNT_TO_HOST[containerPath];
  if (hostDir) return `${TRUENAS_MEDIA_ROOT}/${hostDir}`;
  if (containerPath === '/media') return TRUENAS_MEDIA_ROOT;
  if (containerPath.startsWith('/media/')) {
    const leaf = containerPath.replace(/^\/media\//, '');
    return `${TRUENAS_MEDIA_ROOT}/${leaf}`;
  }
  return containerPath;
}
