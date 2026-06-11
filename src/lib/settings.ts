export type PlaybackQuality = 'auto' | '2160' | '1080' | '720' | '480';

export type HeroSource = 'random' | 'trending_movies' | 'trending_shows' | 'trending_all' | 'libraries';

export type HeroConfig = {
  source: HeroSource;
  /** Library node ids / libKeys when source is libraries */
  libraryIds: string[];
  count: number;
  seed: number;
};

export type OrbitSettings = {
  playback: {
    quality: PlaybackQuality;
    preferDirectPlay: boolean;
    autoPlayNext: boolean;
    resumePlayback: boolean;
  };
  appearance: {
    reduceMotion: boolean;
    fastPosters: boolean;
  };
  library: {
    defaultTab: 'recommended' | 'library' | 'collections';
    initialGridBatch: number;
    autoCollections: boolean;
    instantPosters: boolean;
  };
  hero: {
    home: HeroConfig;
    library: HeroConfig;
  };
};

export const DEFAULT_HERO: HeroConfig = {
  source: 'random',
  libraryIds: [],
  count: 8,
  seed: 11,
};

const LS = 'orbit.settings.v1';

export const DEFAULT_SETTINGS: OrbitSettings = {
  playback: {
    quality: 'auto',
    preferDirectPlay: true,
    autoPlayNext: true,
    resumePlayback: true,
  },
  appearance: {
    reduceMotion: false,
    fastPosters: true,
  },
  library: {
    defaultTab: 'recommended',
    initialGridBatch: 36,
    autoCollections: false,
    instantPosters: true,
  },
  hero: {
    home: { ...DEFAULT_HERO, source: 'trending_all', count: 10, seed: 3 },
    library: { ...DEFAULT_HERO, source: 'random', count: 8, seed: 7 },
  },
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

function mergeSettings(raw: Partial<OrbitSettings> | null): OrbitSettings {
  const base = structuredClone(DEFAULT_SETTINGS);
  if (!raw) return base;
  if (raw.playback) Object.assign(base.playback, raw.playback);
  if (raw.appearance) Object.assign(base.appearance, raw.appearance);
  if (raw.library) Object.assign(base.library, raw.library);
  if (raw.hero) {
    if (raw.hero.home) base.hero.home = { ...base.hero.home, ...raw.hero.home };
    if (raw.hero.library) base.hero.library = { ...base.hero.library, ...raw.hero.library };
  }
  return base;
}

let cached: OrbitSettings | null = null;

export function loadSettings(): OrbitSettings {
  if (cached) return cached;
  try {
    const raw = JSON.parse(localStorage.getItem(LS) || 'null') as Partial<OrbitSettings> | null;
    cached = mergeSettings(raw);
  } catch {
    cached = structuredClone(DEFAULT_SETTINGS);
  }
  return cached;
}

export function saveSettings(next: OrbitSettings) {
  cached = mergeSettings(next);
  try {
    localStorage.setItem(LS, JSON.stringify(cached));
  } catch {
    /* ignore */
  }
  notify();
  applyAppearance(cached);
}

export function patchSettings(patch: Partial<OrbitSettings>) {
  const cur = loadSettings();
  saveSettings(
    mergeSettings({
      ...cur,
      ...patch,
      playback: { ...cur.playback, ...patch.playback },
      appearance: { ...cur.appearance, ...patch.appearance },
      library: { ...cur.library, ...patch.library },
      hero: {
        home: { ...cur.hero.home, ...patch.hero?.home },
        library: { ...cur.hero.library, ...patch.hero?.library },
      },
    }),
  );
}

export function onSettingsChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applyAppearance(s = loadSettings()) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('orbit-reduce-motion', !!s.appearance.reduceMotion);
  document.documentElement.classList.toggle('orbit-fast-posters', !!s.appearance.fastPosters);
}
