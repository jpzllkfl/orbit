import { useEffect, useState } from 'react';
import { buildHeroFeatured } from '../lib/heroFeatured';
import { loadSettings, onSettingsChange } from '../lib/settings';
import type { OrbitNode } from '../types/orbit';

export function useFeaturedHero(
  tree: OrbitNode,
  libs: OrbitNode[],
  opts: {
    libraryReady: boolean;
    isLibrary: boolean;
    current: OrbitNode;
    connVer: number;
    ver: number;
  },
) {
  const [featured, setFeatured] = useState<OrbitNode[]>([]);
  const [featLabel, setFeatLabel] = useState('Featured');
  const [gFeatured, setGFeatured] = useState<OrbitNode[]>([]);
  const [gFeatLabel, setGFeatLabel] = useState('Featured');
  const [settingsRev, setSettingsRev] = useState(0);

  useEffect(() => {
    const off = onSettingsChange(() => setSettingsRev((v) => v + 1));
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    if (!opts.isLibrary) {
      setFeatured([]);
      return;
    }
    let alive = true;
    const cfg = loadSettings().hero.library;
    buildHeroFeatured(tree, libs, cfg, opts.current)
      .then(({ items, label }) => {
        if (alive) {
          setFeatured(items);
          setFeatLabel(label);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [opts.current.id, opts.ver, opts.isLibrary, tree, opts.connVer, settingsRev, libs, opts.current]);

  useEffect(() => {
    if (!opts.libraryReady) return;
    let alive = true;
    const cfg = loadSettings().hero.home;
    buildHeroFeatured(tree, libs, cfg)
      .then(({ items, label }) => {
        if (alive) {
          setGFeatured(items);
          setGFeatLabel(label);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [opts.libraryReady, tree, opts.connVer, settingsRev, libs]);

  return { featured, featLabel, gFeatured, gFeatLabel };
}
