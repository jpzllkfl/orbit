/** TrueNAS host path shown in UI (Docker maps these to /media/share/*). */
export const TRUENAS_MEDIA_ROOT = 'broken_eye/media';

const MOUNT_TO_HOST: Record<string, string> = {
  '/media/share/anime': 'Anime',
  '/media/share/comedy': 'Comedy',
  '/media/share/documentaries': 'Documentaries',
  '/media/share/kids-movies': 'Kids Movies',
  '/media/share/kids-tv': 'Kids TV',
  '/media/share/movies': 'movies',
  '/media/share/tv': 'tv',
  '/media/share/remote': 'remote',
  '/media/share/remote_d': 'remote_d',
  '/media/share/remote-d': 'remote_d',
  '/media/share/remote-e': 'remote_E',
  '/media/share/remote_E': 'remote_E',
  '/media/share/remote-i': 'remote_I',
  '/media/share/remote_I': 'remote_I',
  '/media/share/remote-j': 'remote_J',
  '/media/share/remote_J': 'remote_J',
  '/media/share/remote-l': 'remote_L',
  '/media/share/remote_L': 'remote_L',
  '/media/anime': 'Anime',
  '/media/comedy': 'Comedy',
  '/media/movies': 'movies',
  '/media/tv': 'tv',
  '/media/remote-l': 'remote_L',
  '/media/remote_L': 'remote_L',
};

export function displayMediaPath(containerPath: string): string {
  const hostDir = MOUNT_TO_HOST[containerPath];
  if (hostDir) return `${TRUENAS_MEDIA_ROOT}/${hostDir}`;
  if (containerPath === '/media/share' || containerPath === '/media') return TRUENAS_MEDIA_ROOT;
  if (containerPath.startsWith('/media/share/')) {
    const leaf = containerPath.replace(/^\/media\/share\//, '');
    return `${TRUENAS_MEDIA_ROOT}/${leaf}`;
  }
  if (containerPath.startsWith('/media/')) {
    const leaf = containerPath.replace(/^\/media\//, '');
    return `${TRUENAS_MEDIA_ROOT}/${leaf}`;
  }
  return containerPath;
}
