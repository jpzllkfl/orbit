/**
 * Default Orbit Media Server libraries for TrueNAS \\192.168.1.177\media (T:).
 * Host folder names must match the dataset exactly (case-sensitive on Linux).
 * Container paths are what you enter in Orbit UI and what docker-compose mounts.
 */
export const DEFAULT_OMS_LIBRARIES = [
  { name: 'Anime', type: 'tv', hostDir: 'Anime', mount: '/media/anime' },
  { name: 'Comedy', type: 'movie', hostDir: 'Comedy', mount: '/media/comedy' },
  { name: 'Documentaries', type: 'movie', hostDir: 'Documentaries', mount: '/media/documentaries' },
  { name: 'Kids Movies', type: 'movie', hostDir: 'Kids Movies', mount: '/media/kids-movies' },
  { name: 'Kids TV', type: 'tv', hostDir: 'Kids TV', mount: '/media/kids-tv' },
  { name: 'Movies', type: 'movie', hostDir: 'movies', mount: '/media/movies' },
  { name: 'TV', type: 'tv', hostDir: 'tv', mount: '/media/tv' },
  { name: 'Remote', type: 'movie', hostDir: 'remote', mount: '/media/remote' },
  { name: 'Remote D', type: 'movie', hostDir: 'remote_d', mount: '/media/remote-d' },
  { name: 'Remote E', type: 'movie', hostDir: 'remote_E', mount: '/media/remote-e' },
  { name: 'Remote I', type: 'movie', hostDir: 'remote_I', mount: '/media/remote-i' },
  { name: 'Remote J', type: 'movie', hostDir: 'remote_J', mount: '/media/remote-j' },
  { name: 'Remote L', type: 'movie', hostDir: 'remote_L', mount: '/media/remote-l' },
];

/** Docker-compose volume lines for Dockge (host root = /mnt/broken_eye/media on this NAS). */
export function composeVolumeLines(hostRoot = '/mnt/broken_eye/media') {
  const root = hostRoot.replace(/\/+$/, '');
  return DEFAULT_OMS_LIBRARIES.map(
    (lib) => `- "${root}/${lib.hostDir}:${lib.mount}:ro"`,
  );
}
