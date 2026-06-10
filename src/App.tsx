import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Conn,
  Lib,
  ORBIT_DATA,
  OT,
  OrbitAccount,
  Plex,
  Progress,
  TreeStore,
  demoAppState,
  emptyShell,
  hasPersistedTree,
  loadAppStateAsync,
  needsPlexImport,
  plexIsConfigured,
  resetAppStateCache,
  treeHasContent,
} from './lib';
import { isDesktopApp } from './lib/isDesktop';
import { useFeaturedHero } from './hooks/useFeaturedHero';
import { useOrbitBoot } from './hooks/useOrbitBoot';
import { nextEpisodeAfter } from './lib/nextEpisode';
import { invalidateTitleIndex, searchTitles, similarTitles, sortedTitlesForScope } from './lib/treeIndex';
import { loadSettings } from './lib/settings';
import { syncWatchStateFromPlex } from './lib/plexWatchSync';
import { newId, resultToNode } from './lib/nodeFactory';
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu';
import { ConfirmDialog } from './components/ConfirmDialog';
import { deleteOrbitLibrary } from './lib/deleteOrbitLibrary';
import { mergeCollectionsInTree, moveNodeInTree, removeNodeFromTree } from './lib/treeMutations';
import { idPath, isColl, nodeByPath, sortByTitle } from './lib/treeUtils';
import type { OrbitUser } from './lib/orbitAccount';
import type { Episode, OrbitNode, PlayPayload } from './types/orbit';
import { AddTile, CollectionCard, CollectionHeroArt, FeaturedCollectionsHero, SpotlightHero, TitleCard, type CardDnd } from './components/Cards';
import { MobileChrome } from './components/MobileChrome';
import { ModalHost } from './components/ModalHost';
import type { WizardResult } from './components/ConnectWizard';
const ConnectionsView = lazy(() => import('./components/ConnectionsView').then((m) => ({ default: m.ConnectionsView })));
const SettingsView = lazy(() => import('./components/SettingsView').then((m) => ({ default: m.SettingsView })));
import { LoginPage } from './components/LoginPage';
const DetailView = lazy(() => import('./components/DetailView').then((m) => ({ default: m.DetailView })));
const VideoPlayer = lazy(() => import('./components/VideoPlayer').then((m) => ({ default: m.VideoPlayer })));
const HomeView = lazy(() => import('./components/HomeView').then((m) => ({ default: m.HomeView })));
const AtlasView = lazy(() => import('./components/AtlasView').then((m) => ({ default: m.AtlasView })));
const OrbitMapView = lazy(() => import('./components/OrbitMapView').then((m) => ({ default: m.OrbitMapView })));
const SmartView = lazy(() => import('./components/SmartView').then((m) => ({ default: m.SmartView })));
import { ArtCtx, meta } from './components/Posters';
import { Icons, LIB_ICON } from './components/icons';
import './styles/orbit.css';
import './styles/responsive.css';

const I = Icons;
const BOOT = emptyShell();

function ViewFallback() {
  return (
    <div className="login-gate" style={{ minHeight: 240 }}>
      <div className="login-gate-orb" />
      <p>Loading view…</p>
    </div>
  );
}

export default function App() {
  const [tree, setTree] = useState<OrbitNode>(BOOT.tree);
  const [path, setPath] = useState<string[]>(BOOT.path);
  const [bootMsg, setBootMsg] = useState('Loading Orbit…');
  const [libraryReady, setLibraryReady] = useState(false);
  const liveTreeRef = useRef(false);
  const [view, setView] = useState<'grid' | 'connections' | 'settings' | 'atlas' | 'map' | 'smart'>(() => {
    const h = (location.hash || '').replace('#', '');
    return ['atlas', 'map', 'smart'].includes(h) ? (h as 'atlas' | 'map' | 'smart') : 'grid';
  });
  const [player, setPlayer] = useState<PlayPayload | null>(null);
  const [detail, setDetail] = useState<OrbitNode | null>(null);
  const [curating, setCurating] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [libVisible, setLibVisible] = useState(() => loadSettings().library.initialGridBatch);
  const [libNavEdit, setLibNavEdit] = useState(false);
  const [libDragId, setLibDragId] = useState<string | null>(null);
  const [libDropId, setLibDropId] = useState<string | null>(null);
  const [libDeleteTarget, setLibDeleteTarget] = useState<OrbitNode | null>(null);
  const [libDeleteBusy, setLibDeleteBusy] = useState(false);
  const [collVisible, setCollVisible] = useState(24);
  const libMoreRef = useRef<HTMLDivElement>(null);
  const collMoreRef = useRef<HTMLDivElement>(null);
  const [libTab, setLibTab] = useState('recommended');
  const [showCollsInLib, setShowCollsInLib] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [plexBootSyncing, setPlexBootSyncing] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [connVer, setConnVer] = useState(0);
  const [ver, setVer] = useState(0);
  const [artFor, setArtFor] = useState<OrbitNode | null>(null);
  const [artFocus, setArtFocus] = useState<'both' | 'backdrop' | 'poster'>('both');
  const [bgPickerFor, setBgPickerFor] = useState<OrbitNode | null>(null);
  const [modalFor, setModalFor] = useState<{ coll: OrbitNode; kind?: 'movie' | 'show' | 'collection' } | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState<OrbitNode | null>(null);
  const [mergeDest, setMergeDest] = useState<OrbitNode | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: OrbitNode } | null>(null);
  const [addToCollFor, setAddToCollFor] = useState<OrbitNode | null>(null);
  const archive = ORBIT_DATA.ARCHIVE;
  const [drag, setDrag] = useState<OrbitNode | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1024px)').matches : false,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [orbitUser, setOrbitUser] = useState<OrbitUser | null>(() => OrbitAccount.user);
  const [authReady, setAuthReady] = useState(false);
  const [guestMode, setGuestMode] = useState(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem('orbit.guest.v1') === '1',
  );
  const mainRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [mobSearchOpen, setMobSearchOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)');
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [view, path, detail, player, showWizard]);

  useEffect(() => {
    Lib.loadKey();
    const conn = Conn.load();
    if (conn?.tmdbKey && !Lib.key) Lib.setKey(conn.tmdbKey);
  }, []);

  useEffect(() => Lib.onChange(() => setVer((v) => v + 1)), []);

  // Refresh home watch rows from Plex hubs (fast — one API call vs per-show sync).
  useEffect(() => {
    if (!Conn.live || !Plex.connected || !liveTreeRef.current) return;
    let alive = true;
    const t = window.setTimeout(() => {
      import('./lib/plexHubs').then(({ loadPlexContinueWatching }) =>
        loadPlexContinueWatching(tree).then(() => {
          if (alive) setVer((v) => v + 1);
        }),
      );
    }, 2000);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [connVer, libraryReady]);

  // Deep watch-state sync (slower — walks every show). Web only; hubs cover Continue Watching.
  useEffect(() => {
    if (isDesktopApp() || !Conn.live || !Plex.connected || !liveTreeRef.current) return;
    let alive = true;
    const t = window.setTimeout(() => {
      syncWatchStateFromPlex(tree).then(() => {
        if (alive) setVer((v) => v + 1);
      });
    }, 12000);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [connVer]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), 280);
    return () => window.clearTimeout(t);
  }, [query]);

  async function reloadFromStorage() {
    Lib.loadKey();
    Plex.reloadFromStorage();
    Lib.reloadFromStorage();
    if (OrbitAccount.signedIn) {
      try {
        await OrbitAccount.pullSync();
      } catch {
        /* offline */
      }
    }
    resetAppStateCache(false);
    const hasTree = !!(Conn.load()?.connected && Conn.load()?.live && TreeStore.load());
    liveTreeRef.current = hasTree || hasPersistedTree();
    let fresh = await loadAppStateAsync();
    if (OrbitAccount.signedIn) {
      try {
        const { syncOmsTreeFromHome, treeHasOmsContent } = await import('./lib/omsSync');
        if (!treeHasOmsContent(fresh.tree)) {
          const omsMerged = await syncOmsTreeFromHome(fresh.tree);
          if (omsMerged) fresh = { tree: omsMerged, path: [omsMerged.id] };
        }
      } catch {
        /* offline */
      }
    }
    setTree(fresh.tree);
    setPath(fresh.path);
    setLibraryReady(liveTreeRef.current || guestMode || treeHasContent(fresh.tree));
    setConnVer((v) => v + 1);
    setVer((v) => v + 1);
    if (Conn.load()?.connected) setShowWizard(false);
  }

  useOrbitBoot({
    bootAttempt,
    liveTreeRef,
    setTree,
    setPath,
    setBootMsg,
    setLibraryReady,
    setPlexBootSyncing,
    setBootError,
    setAuthReady,
    setOrbitUser,
    setGuestMode,
  });

  useEffect(() => OrbitAccount.onChange(() => setOrbitUser(OrbitAccount.user)), []);

  useEffect(() => {
    const onLoginHash = () => {
      if (location.hash === '#login' && !OrbitAccount.signedIn) {
        sessionStorage.removeItem('orbit.guest.v1');
        setGuestMode(false);
      }
    };
    onLoginHash();
    window.addEventListener('hashchange', onLoginHash);
    return () => window.removeEventListener('hashchange', onLoginHash);
  }, []);

  useEffect(() => {
    if (!OrbitAccount.signedIn || !OrbitAccount.syncReady) return;
    const t = window.setTimeout(() => {
      OrbitAccount.pushSync().catch(() => {});
    }, 60000);
    return () => window.clearTimeout(t);
  }, [connVer]);

  useEffect(() => {
    if (!OrbitAccount.signedIn) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !OrbitAccount.shouldRefreshSync()) return;
      setBootAttempt((a) => a + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [OrbitAccount.signedIn]);
  useEffect(() => {
    if (!curating) {
      setDrag(null);
      setDropTarget(null);
    }
  }, [curating]);

  useEffect(() => {
    if (!authReady || plexBootSyncing) return;
    // Plex setup is optional — open it from Connections only when you want it.
  }, [authReady, plexBootSyncing]);

  function persistTree(t: OrbitNode) {
    if (Conn.live && liveTreeRef.current && treeHasContent(t)) TreeStore.save(t);
    invalidateTitleIndex();
  }

  useEffect(() => {
    const onHash = () => {
      const h = (location.hash || '').replace('#', '');
      if (['atlas', 'map', 'smart'].includes(h)) setView(h as 'atlas' | 'map' | 'smart');
      else if (view !== 'connections') setView('grid');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [view]);

  useEffect(() => {
    const want = ['atlas', 'map', 'smart'].includes(view) ? '#' + view : '';
    if (location.hash !== want) history.replaceState(null, '', location.pathname + location.search + want);
  }, [view]);

  const current = nodeByPath(tree, path) || tree;
  const crumbs = useMemo(() => path.map((_, i) => nodeByPath(tree, path.slice(0, i + 1))).filter(Boolean) as OrbitNode[], [tree, path]);
  const glow = meta(current).hue;

  const isLibrary = current.type === 'library';
  const atRoot = path.length === 1;

  useEffect(() => {
    if (curating && path.length === 1) mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [curating, path.length]);

  const children = current.children || [];
  const subColls = children.filter(isColl);

  const featuredColls = useMemo(() => {
    if (!isLibrary || !subColls.length) return [];
    let s = (current.id.length * 47 + Math.floor(Date.now() / 86400000)) >>> 0;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const pool = subColls.slice();
    for (let k = pool.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      [pool[k], pool[j]] = [pool[j], pool[k]];
    }
    return pool.slice(0, Math.min(10, pool.length));
  }, [current.id, isLibrary, children.length, ver]);

  const libAllTitles = useMemo(() => {
    if (!libraryReady || !isLibrary) return null;
    return sortedTitlesForScope(tree, current);
  }, [current.id, tree, isLibrary, libraryReady]);

  const LIBS = useMemo(() => (tree.children || []).filter((n) => n.type === 'library'), [tree, connVer]);
  const { featured, featLabel, gFeatured, gFeatLabel } = useFeaturedHero(tree, LIBS, {
    libraryReady,
    isLibrary,
    current,
    connVer,
    ver,
  });

  useEffect(() => {
    setLibVisible(loadSettings().library.initialGridBatch);
    setCollVisible(24);
  }, [current.id, libTab]);

  useEffect(() => {
    if (libTab !== 'library' || !libAllTitles?.length) return;
    const el = libMoreRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setLibVisible((n) => Math.min(n + 96, libAllTitles.length));
      },
      { rootMargin: '500px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [libTab, libAllTitles, libVisible, current.id]);

  useEffect(() => {
    if (libTab !== 'collections' || !subColls.length) return;
    const el = collMoreRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setCollVisible((n) => Math.min(n + 32, subColls.length));
      },
      { rootMargin: '500px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [libTab, subColls.length, collVisible, current.id]);

  const titles = isLibrary ? libAllTitles : children.filter((c) => !isColl(c));
  const looseInLib = children.filter((c) => !isColl(c));

  useEffect(() => {
    setLibTab(loadSettings().library.defaultTab);
  }, [current.id]);

  const deferredQuery = useDeferredValue(debouncedQuery);
  const results = useMemo(
    () => (deferredQuery.trim() ? searchTitles(tree, deferredQuery.trim()) : null),
    [tree, deferredQuery],
  );

  const libCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (!libraryReady || isDesktopApp()) return m;
    for (const lb of LIBS) m.set(lb.id, OT.countDeep(lb).films);
    return m;
  }, [LIBS, libraryReady]);
  const activeLibId = path.length >= 2 && !query.trim() ? path[1] : null;
  const connected = Conn.connected || Lib.connected || Plex.connected;

  async function onOmsImport(merged: OrbitNode) {
    await TreeStore.saveImmediate(merged);
    setTree(merged);
    setPath([merged.id]);
    const hasContent = (merged.children || []).some((c) => c.type === 'library');
    liveTreeRef.current = hasContent;
    setLibraryReady(hasContent);
    invalidateTitleIndex();
    resetAppStateCache(false);
    setConnVer((v) => v + 1);
    setVer((v) => v + 1);
  }

  function onWizardComplete(result: WizardResult) {
    if (result.tree) {
      if (!result.demo) {
        TreeStore.save(result.tree);
        const stored = TreeStore.load() || result.tree;
        setTree(stored);
        setPath([stored.id]);
        liveTreeRef.current = treeHasContent(stored);
        setLibraryReady(treeHasContent(stored));
        invalidateTitleIndex();
        resetAppStateCache(false);
        if (OrbitAccount.signedIn && treeHasContent(stored)) {
          OrbitAccount.pushSync().catch(() => {});
        }
      } else {
        setTree(result.tree);
        setPath([result.tree.id]);
        setLibraryReady(true);
      }
    }
    setShowWizard(false);
    setView('grid');
    setConnVer((v) => v + 1);
    setVer((v) => v + 1);
    mainRef.current?.scrollTo(0, 0);
    if (!result.demo && result.tree && Plex.connected) {
      syncWatchStateFromPlex(result.tree).then(() => setVer((v) => v + 1));
    }
  }

  async function onDisconnect() {
    TreeStore.clear();
    resetAppStateCache();
    liveTreeRef.current = false;
    const fresh = await loadAppStateAsync();
    setTree(fresh.tree);
    setPath(fresh.path);
    setConnVer((v) => v + 1);
    setVer((v) => v + 1);
  }

  function toggleCurate() {
    setCurating((c) => !c);
  }

  function pickView(v: typeof view) {
    setDrawerOpen(false);
    setMobSearchOpen(false);
    setLibNavEdit(false);
    setView(v);
    setQuery('');
    mainRef.current?.scrollTo(0, 0);
  }

  function toggleDrawer() {
    setDrawerOpen((o) => !o);
    setMobSearchOpen(false);
  }

  function openConnections() {
    pickView('connections');
  }

  function openSettings() {
    pickView('settings');
  }

  function reorderSidebarLibs(dragId: string, beforeId: string | null) {
    mutate((t) => {
      const ch = [...(t.children || [])];
      const from = ch.findIndex((n) => n.id === dragId);
      if (from < 0) return;
      const [item] = ch.splice(from, 1);
      if (!beforeId) ch.push(item);
      else {
        const to = ch.findIndex((n) => n.id === beforeId);
        if (to < 0) ch.push(item);
        else ch.splice(to, 0, item);
      }
      t.children = ch;
    });
  }

  function addAtRoot(node: OrbitNode) {
    setTree((t) => {
      const next = { ...t, children: [...(t.children || []), node] };
      persistTree(next);
      return next;
    });
    setVer((v) => v + 1);
  }

  function pickLib(node: OrbitNode) {
    setView('grid');
    setQuery('');
    setPath([tree.id, node.id]);
    setDrawerOpen(false);
    mainRef.current?.scrollTo(0, 0);
  }

  function goHome() {
    setView('grid');
    setQuery('');
    setPath([tree.id]);
    setDrawerOpen(false);
    setMobSearchOpen(false);
    mainRef.current?.scrollTo(0, 0);
  }

  function go(node: OrbitNode) {
    setPath((p) => [...p, node.id]);
    mainRef.current?.scrollTo(0, 0);
  }

  function jump(i: number) {
    setPath((p) => p.slice(0, i + 1));
    mainRef.current?.scrollTo(0, 0);
  }

  function mutate(fn: (t: OrbitNode) => void) {
    const t = structuredClone(tree);
    fn(t);
    setTree(t);
    persistTree(t);
    setVer((v) => v + 1);
  }

  function removeNode(id: string) {
    mutate((t) => removeNodeFromTree(t, id));
  }

  async function confirmDeleteSidebarLibrary() {
    const lb = libDeleteTarget;
    if (!lb) return;
    setLibDeleteBusy(true);
    try {
      const merged = await deleteOrbitLibrary({
        tree,
        sidebarNodeId: lb.id,
        omsLibraryId: lb.omsLibraryId,
        libraryName: lb.title,
      });
      await TreeStore.saveImmediate(merged);
      setTree(merged);
      resetAppStateCache(false);
      invalidateTitleIndex();
      setVer((v) => v + 1);
      setConnVer((v) => v + 1);
      if (path.includes(lb.id)) {
        setPath([merged.id]);
      }
      setLibDeleteTarget(null);
      setLibNavEdit(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not delete library');
    } finally {
      setLibDeleteBusy(false);
    }
  }

  function addToCurrent(node: OrbitNode) {
    mutate((t) => {
      const c = nodeByPath(t, path);
      if (c) c.children = [node, ...(c.children || [])];
    });
  }

  async function addFranchise(cr: { tmdbId: number; title: string; overview?: string }) {
    const parts = await Lib.collectionParts(cr.tmdbId);
    const kids = parts.map((p) => {
      const n = resultToNode(p);
      Lib.seed(n, p);
      return n;
    });
    const coll: OrbitNode = {
      id: newId('c'),
      type: 'collection',
      title: cr.title.replace(/\s*Collection$/i, ''),
      blurb: cr.overview || '',
      children: kids,
    };
    addToCurrent(coll);
    return kids.length;
  }

  function moveNode(id: string, targetId: string, beforeId: string | null) {
    mutate((t) => moveNodeInTree(t, id, targetId, beforeId));
  }

  function mergeCollections(sourceId: string, destId: string) {
    const source = OT.findById(tree, sourceId);
    const dest = OT.findById(tree, destId);
    if (!source || !dest || sourceId === destId) return;
    if (
      !window.confirm(
        `Merge "${source.title}" into "${dest.title}"?\n\nAll titles and sub-collections from "${source.title}" will move into "${dest.title}", and "${source.title}" will be removed.`,
      )
    ) {
      return;
    }
    mutate((t) => mergeCollectionsInTree(t, sourceId, destId));
    const srcOv = Lib.getOverride(sourceId);
    const destOv = Lib.getOverride(destId);
    if (srcOv?.poster && !destOv?.poster) Lib.setOverride(destId, { poster: srcOv.poster });
    if (srcOv?.backdrop && !destOv?.backdrop) Lib.setOverride(destId, { backdrop: srcOv.backdrop });
    Lib.clearOverride(sourceId);
    setMergeOpen(false);
    setMergeSource(null);
    setMergeDest(null);
    setVer((v) => v + 1);
  }

  function openMerge(source?: OrbitNode, dest?: OrbitNode) {
    setMergeSource(source || null);
    setMergeDest(dest || null);
    setMergeOpen(true);
  }

  function openTitleMenu(node: OrbitNode, pos: { x: number; y: number }) {
    setCtxMenu({ x: pos.x, y: pos.y, node });
  }

  function openCollectionMenu(node: OrbitNode, pos: { x: number; y: number }) {
    setCtxMenu({ x: pos.x, y: pos.y, node });
  }

  function addTitleToCollection(titleId: string, collectionId: string) {
    moveNode(titleId, collectionId, null);
    setAddToCollFor(null);
    setVer((v) => v + 1);
  }

  function buildCtxItems(node: OrbitNode): ContextMenuItem[] {
    const par = OT.findParent(tree, node.id);
    const inCollection = par?.type === 'collection';
    const isTitle = node.type === 'movie' || node.type === 'show';

    if (isTitle) {
      return [
        { label: 'Open', icon: I.film({}), onClick: () => { setCtxMenu(null); openTitle(node); } },
        { label: 'Play', icon: I.play({}), onClick: () => { setCtxMenu(null); playTitle(node); } },
        { label: 'Edit artwork', icon: I.image({}), onClick: () => { setCtxMenu(null); openEditArt(node); } },
        {
          label: 'Add to collection…',
          icon: I.folder({}),
          onClick: () => {
            setCtxMenu(null);
            setAddToCollFor(node);
          },
        },
        ...(inCollection
          ? [{
              label: 'Remove from collection',
              icon: I.x({}),
              danger: true,
              onClick: () => {
                setCtxMenu(null);
                removeNode(node.id);
              },
            }]
          : []),
      ];
    }

    if (node.type === 'collection') {
      return [
        { label: 'Open', icon: I.folder({}), onClick: () => { setCtxMenu(null); openTitle(node); } },
        { label: 'Edit poster', icon: I.image({}), onClick: () => { setCtxMenu(null); editCollArt(node); } },
        { label: 'Merge this away…', icon: I.stack({}), onClick: () => { setCtxMenu(null); openMerge(node); } },
        { label: 'Merge another into this…', icon: I.stack({}), onClick: () => { setCtxMenu(null); openMerge(undefined, node); } },
        ...(par && par.id !== tree.id
          ? [{
              label: 'Remove',
              icon: I.x({}),
              danger: true,
              onClick: () => {
                setCtxMenu(null);
                removeNode(node.id);
              },
            }]
          : []),
      ];
    }

    return [];
  }

  const canMergeHere =
    (isLibrary && libTab === 'collections' && subColls.length >= 2) ||
    (!isLibrary && current.type === 'collection' && (subColls.length >= 2 || OT.allCollections(tree, false).length >= 2));

  function handleDrop(target: OrbitNode) {
    if (!drag || drag.id === target.id) {
      setDrag(null);
      setDropTarget(null);
      return;
    }
    if (drag.type === 'collection' && target.type === 'collection') {
      mergeCollections(drag.id, target.id);
    } else if (!isColl(drag) && isColl(target)) {
      moveNode(drag.id, target.id, null);
    } else {
      moveNode(drag.id, current.id, target.id);
    }
    setDrag(null);
    setDropTarget(null);
  }

  function cardDnd(node: OrbitNode): CardDnd | null {
    if (!curating) return null;
    const dragging = !!(drag && drag.id === node.id);
    const over = dropTarget === node.id && drag && drag.id !== node.id;
    const mergeTarget = over && drag && drag.type === 'collection' && node.type === 'collection' && drag.id !== node.id;
    const nest = over && drag && !isColl(drag) && isColl(node);
    return {
      cls:
        (dragging ? 'dragging ' : '') +
        (over ? (mergeTarget ? 'merge-target ' : nest ? 'nest-target ' : 'drop-pos ') : ''),
      props: {
        draggable: true,
        onDragStart: (e) => {
          setDrag(node);
          try {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', node.id);
          } catch {
            /* ignore */
          }
        },
        onDragEnd: () => {
          setDrag(null);
          setDropTarget(null);
        },
        onDragEnter: (e) => {
          e.preventDefault();
          if (drag && drag.id !== node.id) setDropTarget(node.id);
        },
        onDragOver: (e) => e.preventDefault(),
        onDrop: (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDrop(node);
        },
      },
    };
  }

  const gridDrop = curating
    ? {
        onDragOver: (e: React.DragEvent) => e.preventDefault(),
        onDrop: () => {
          if (drag) {
            moveNode(drag.id, current.id, null);
            setDrag(null);
            setDropTarget(null);
          }
        },
      }
    : {};

  function openEditArt(node: OrbitNode, focus: 'both' | 'backdrop' | 'poster' = 'both') {
    setArtFocus(focus);
    setArtFor(node);
  }

  function editCollArt(node: OrbitNode) {
    openEditArt(node, 'poster');
  }

  function openTitle(node: OrbitNode) {
    if (isColl(node)) goToNode(node);
    else setDetail(node);
  }

  function goToNode(node: OrbitNode) {
    setView('grid');
    setQuery('');
    setPath(idPath(tree, node.id));
    mainRef.current?.scrollTo(0, 0);
  }

  function playTitle(node: OrbitNode, episode?: Episode | null) {
    const full = OT.findById(tree, node.id) || node;
    if (full.type === 'show' && !episode) {
      const cw = Progress.list().find((r) => r.node.id === full.id && r.episode);
      if (cw?.episode) {
        setPlayer({ node: full, episode: cw.episode as Episode });
        return;
      }
    }
    setPlayer({ node: full, episode: episode || null });
  }

  const handlePlayNext = useCallback(async () => {
    if (!player?.node || player.node.type !== 'show' || !player.episode) return;
    const next = await nextEpisodeAfter(player.node, player.episode);
    if (next) setPlayer({ node: player.node, episode: next });
  }, [player]);

  useEffect(() => {
    document.documentElement.style.setProperty('--glow', glow);
  }, [glow]);

  const libIcon = (key?: string) => {
    const name = (LIB_ICON[key || ''] || 'film') as keyof typeof Icons;
    return I[name]({});
  };

  const showLoginGate = authReady && !orbitUser && !guestMode;

  function clearLoginHash() {
    if (location.hash === '#login') history.replaceState(null, '', location.pathname + location.search);
  }

  if (!authReady || plexBootSyncing) {
    return (
      <div className="login-gate">
        <div className="login-gate-orb" />
        <p>{bootMsg}</p>
      </div>
    );
  }

  if (needsPlexImport(tree) && !plexBootSyncing && !bootError && orbitUser && Conn.connected) {
    return (
      <div className="login-gate">
        <div className="login-gate-orb" />
        <p style={{ maxWidth: 420, textAlign: 'center', lineHeight: 1.5 }}>
          Your Plex libraries are connected but titles haven&apos;t imported yet.
        </p>
        <button
          type="button"
          className="cw-primary"
          style={{ marginTop: 20 }}
          onClick={() => setBootAttempt((n) => n + 1)}
        >
          Import from Plex
        </button>
        <button
          type="button"
          className="cw-ghost"
          style={{ marginTop: 12 }}
          onClick={() => {
            Conn.clear();
            Plex.disconnect();
            setBootAttempt((n) => n + 1);
          }}
        >
          Continue without Plex
        </button>
      </div>
    );
  }

  if (bootError && !treeHasContent(tree) && plexIsConfigured(Conn.load())) {
    return (
      <div className="login-gate">
        <div className="login-gate-orb" />
        <p style={{ maxWidth: 420, textAlign: 'center', lineHeight: 1.5 }}>{bootError}</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            className="cw-primary"
            onClick={() => {
              setBootError(null);
              setBootAttempt((n) => n + 1);
            }}
          >
            Retry sync
          </button>
          <button
            type="button"
            className="cw-ghost"
            onClick={() => {
              setBootError(null);
              setShowWizard(true);
            }}
          >
            Open setup wizard
          </button>
        </div>
      </div>
    );
  }

  if (showLoginGate) {
    return (
      <LoginPage
        onSuccess={async () => {
          sessionStorage.removeItem('orbit.guest.v1');
          setGuestMode(false);
          setOrbitUser(OrbitAccount.user);
          clearLoginHash();
          setBootAttempt((n) => n + 1);
        }}
        onGuest={() => {
          sessionStorage.setItem('orbit.guest.v1', '1');
          setGuestMode(true);
          const demo = demoAppState();
          setTree(demo.tree);
          setPath(demo.path);
          setLibraryReady(true);
          clearLoginHash();
        }}
      />
    );
  }

  return (
    <ArtCtx.Provider value={ver + connVer}>
      <div
        className={
          'app' +
          (compact ? ' compact' : '') +
          (drawerOpen ? ' drawer-open' : '') +
          (compact && view === 'grid' && !query.trim() && libraryReady && LIBS.length > 0 && (atRoot || isLibrary) ? ' has-mob-libs' : '') +
          (compact && mobSearchOpen ? ' mob-search-open' : '')
        }
        style={{ ['--glow' as string]: glow }}
      >
        <div className="ambient"></div>

        {compact && (
          <MobileChrome
            drawerOpen={drawerOpen}
            toggleDrawer={toggleDrawer}
            mobSearchOpen={mobSearchOpen}
            setMobSearchOpen={setMobSearchOpen}
            query={query}
            setQuery={setQuery}
            searchRef={searchRef}
            atRoot={atRoot}
            view={view}
            crumbs={crumbs}
            libraryReady={libraryReady}
            libs={LIBS}
            activeLibId={activeLibId}
            isLibrary={isLibrary}
            pickLib={pickLib}
            goHome={goHome}
            pickView={pickView}
            openSettings={openSettings}
          />
        )}

        <aside className={'sidebar' + (compact ? ' drawer' : '')}>
          <div className="brand">
            <div className="brand-orb" title="ORBIT"></div>
            <div className="brand-name disp">Orbit</div>
          </div>

          <div className="nav-group">
            <div className="nav-label">Views</div>
            <button type="button" className={'nav-item' + (atRoot && !query.trim() && view === 'grid' ? ' active' : '')} onClick={goHome}>
              {I.home({})}
              <span>Home</span>
            </button>
            <button type="button" className={'nav-item' + (view === 'atlas' ? ' active' : '')} onClick={() => pickView('atlas')}>
              {I.tree({})}
              <span>Atlas</span>
            </button>
            <button type="button" className={'nav-item' + (view === 'map' ? ' active' : '')} onClick={() => pickView('map')}>
              {I.orbit({})}
              <span>Orbit Map</span>
            </button>
            <button type="button" className={'nav-item' + (view === 'smart' ? ' active' : '')} onClick={() => pickView('smart')}>
              {I.wand({})}
              <span>Smart</span>
            </button>
          </div>

          <div className={'nav-group' + (libNavEdit ? ' lib-nav-edit' : '')}>
            <div className="nav-label-row">
              <div className="nav-label">Libraries</div>
              {LIBS.length > 0 && (
                <button
                  type="button"
                  className={'nav-edit-btn' + (libNavEdit ? ' on' : '')}
                  onClick={() => {
                    setLibNavEdit((e) => !e);
                    setLibDragId(null);
                    setLibDropId(null);
                  }}
                >
                  {libNavEdit ? 'Done' : 'Edit'}
                </button>
              )}
            </div>
            {libNavEdit && <div className="nav-edit-hint">Drag to reorder · trash to delete</div>}
            {LIBS.map((lb) => (
              <div
                key={lb.id}
                className={
                  'nav-item-row' +
                  (libDropId === lb.id && libDragId && libDragId !== lb.id ? ' drop-target' : '') +
                  (libDragId === lb.id ? ' dragging' : '')
                }
              >
                <button
                  type="button"
                  className={'nav-item' + (activeLibId === lb.id && !libNavEdit ? ' active' : '')}
                  draggable={libNavEdit}
                  onClick={() => !libNavEdit && pickLib(lb)}
                  onDragStart={(e) => {
                    if (!libNavEdit) return;
                    setLibDragId(lb.id);
                    try {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', lb.id);
                    } catch {
                      /* ignore */
                    }
                  }}
                  onDragEnd={() => {
                    setLibDragId(null);
                    setLibDropId(null);
                  }}
                  onDragOver={(e) => {
                    if (!libNavEdit || !libDragId || libDragId === lb.id) return;
                    e.preventDefault();
                    setLibDropId(lb.id);
                  }}
                  onDrop={(e) => {
                    if (!libNavEdit || !libDragId || libDragId === lb.id) return;
                    e.preventDefault();
                    reorderSidebarLibs(libDragId, lb.id);
                    setLibDragId(null);
                    setLibDropId(null);
                  }}
                >
                  {libNavEdit && <span className="nav-drag-grip">{I.stack({})}</span>}
                  {libIcon(lb.libKey)}
                  <span className="nav-lib-title">{lb.title}</span>
                  {!libNavEdit && <span className="nav-count">{libCounts.get(lb.id) ?? '…'}</span>}
                </button>
                {libNavEdit && (
                  <button
                    type="button"
                    className="nav-lib-del"
                    title={`Delete ${lb.title}`}
                    aria-label={`Delete ${lb.title}`}
                    onClick={() => setLibDeleteTarget(lb)}
                  >
                    {I.trash({})}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="nav-spacer"></div>
          <div className="nav-div"></div>
          <div className="nav-group" style={{ marginTop: 0 }}>
            <button type="button" className={'nav-item' + (view === 'settings' ? ' active' : '')} onClick={openSettings}>
              {I.gear({})}
              <span>Settings</span>
            </button>
            <button type="button" className={'nav-item' + (view === 'connections' ? ' active' : '')} onClick={openConnections}>
              {I.server({})}
              <span>Connections</span>
              <span className={'conn-dot' + (connected ? ' on' : '')}></span>
            </button>
            <button type="button" className={'nav-item' + (curating ? ' active' : '')} onClick={toggleCurate}>
              {I.spark({})}
              <span>{curating ? 'Curating…' : 'Curate'}</span>
            </button>
            {guestMode && (
              <button
                className="nav-item"
                onClick={() => {
                  sessionStorage.removeItem('orbit.guest.v1');
                  setGuestMode(false);
                }}
              >
                {I.spark({})}
                <span>Sign in</span>
              </button>
            )}
          </div>
        </aside>

        <main className={'main' + (curating ? ' curating' : '') + (view !== 'grid' ? ' altview view-' + view : '')} ref={mainRef}>
          {['atlas', 'map', 'smart'].includes(view) && (
            <div className="view-tabbar">
              <button className={view === 'atlas' ? 'on' : ''} onClick={() => pickView('atlas')}>
                {I.tree({})}Atlas
              </button>
              <button className={view === 'map' ? 'on' : ''} onClick={() => pickView('map')}>
                {I.orbit({})}Orbit Map
              </button>
              <button className={view === 'smart' ? 'on' : ''} onClick={() => pickView('smart')}>
                {I.wand({})}Smart
              </button>
              <div style={{ flex: 1 }}></div>
              <button className={'curate-btn' + (curating ? ' on' : '')} onClick={toggleCurate}>
                {I.spark({})}
                {curating ? 'Done' : 'Curate'}
              </button>
              <button className="view-back" onClick={() => pickView('grid')}>
                {I.grid({})}Back to grid
              </button>
            </div>
          )}
          {libraryReady && view === 'atlas' && (
            <Suspense fallback={<ViewFallback />}>
              <AtlasView tree={tree} currentPath={path} goToNode={goToNode} openTitle={openTitle} />
            </Suspense>
          )}
          {libraryReady && view === 'map' && (
            <Suspense fallback={<ViewFallback />}>
              <OrbitMapView tree={tree} startId={current.id} goToNode={goToNode} openTitle={openTitle} />
            </Suspense>
          )}
          {libraryReady && view === 'smart' && (
            <Suspense fallback={<ViewFallback />}>
              <SmartView
                tree={tree}
                onCreate={(node) => {
                  addAtRoot(node);
                  goToNode(node);
                }}
                openTitle={openTitle}
              />
            </Suspense>
          )}
          {view === 'connections' ? (
            <Suspense fallback={<ViewFallback />}>
              <ConnectionsView
                tree={tree}
                onOpenWizard={() => setShowWizard(true)}
                onDisconnect={onDisconnect}
                onBump={() => setVer((v) => v + 1)}
                onAccountChange={reloadFromStorage}
                onOmsImport={onOmsImport}
              />
            </Suspense>
          ) : view === 'settings' ? (
            <Suspense fallback={<ViewFallback />}>
              <SettingsView libraries={LIBS} onOpenConnections={openConnections} />
            </Suspense>
          ) : (
          <div className="main-inner">
            {!atRoot && isColl(current) && current.type !== 'library' && !results && <CollectionHeroArt key={current.id} node={current} />}

            <div className={'topbar' + (compact ? ' topbar-compact' : '')}>
              {!compact && (
              <div className="crumbs">
                {crumbs.map((c, i) => (
                  <span key={c.id} style={{ display: 'contents' }}>
                    {i > 0 && <span className="crumb-sep">›</span>}
                    <button className={'crumb' + (i === crumbs.length - 1 ? ' cur' : '')} onClick={() => jump(i)}>
                      {i === 0 ? 'Home' : c.title}
                    </button>
                  </span>
                ))}
              </div>
              )}
              <div className="topbar-spacer"></div>
              {!compact && (
              <div className="search">
                {I.search({})}
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles…" />
              </div>
              )}
              {!compact && (
              <button className={'curate-btn' + (curating ? ' on' : '')} onClick={toggleCurate}>
                {I.spark({})}
                {curating ? 'Done' : 'Curate'}
              </button>
              )}
            </div>

            {results ? (
              <div className="rise">
                <div className="section-head" style={{ marginTop: 18 }}>
                  <h2>Results</h2>
                  <span className="count">
                    {results.length} match{results.length !== 1 ? 'es' : ''} for “{query}”
                  </span>
                </div>
                {results.length ? (
                  <div className="grid titles">
                    {results.map((n) =>
                      isColl(n) ? (
                        <CollectionCard
                          key={n.id}
                          node={n}
                          onOpen={(c) => {
                            setQuery('');
                            setPath(idPath(tree, c.id));
                          }}
                          onEditArt={editCollArt}
                          onMenu={openCollectionMenu}
                        />
                      ) : (
                        <TitleCard key={n.id} node={n} onOpen={openTitle} onEditArt={openEditArt} onMenu={openTitleMenu} />
                      ),
                    )}
                  </div>
                ) : (
                  <div className="empty">Nothing matches that yet.</div>
                )}
              </div>
            ) : atRoot ? (
              <>
                {!curating && gFeatured.length > 0 && (
                  <SpotlightHero
                    node={gFeatured[0]}
                    titles={gFeatured}
                    eyebrow={'Across your libraries · ' + gFeatLabel}
                    onPlay={(t) => playTitle(t)}
                    onInfo={openTitle}
                  />
                )}
                {curating && (
                  <section className="section rise">
                    <div className="section-head">
                      <h2>Libraries</h2>
                      <span className="count">{LIBS.length}</span>
                    </div>
                    <p className="curate-hint">Drag libraries to reorder — applies on Home and in the sidebar.</p>
                    <div className="grid colls" {...gridDrop}>
                      {LIBS.map((n) => (
                        <CollectionCard
                          key={n.id}
                          node={n}
                          onOpen={pickLib}
                          curating
                          dnd={cardDnd(n)}
                          onEditArt={editCollArt}
                        />
                      ))}
                    </div>
                  </section>
                )}
                {libraryReady && (
                  <Suspense fallback={<ViewFallback />}>
                    <HomeView
                      tree={tree}
                      libs={LIBS}
                      curating={curating}
                      cwVer={ver + (player ? 1 : 0)}
                      onOpen={openTitle}
                      onPlay={setPlayer}
                      onEditArt={openEditArt}
                      onEditCollArt={editCollArt}
                      onTitleMenu={openTitleMenu}
                      onCollMenu={openCollectionMenu}
                    />
                  </Suspense>
                )}
              </>
            ) : (
              <>
                {isLibrary && libTab === 'collections' && featuredColls.length > 0 && (
                  <FeaturedCollectionsHero library={current} collections={featuredColls} onOpen={go} />
                )}
                {isLibrary && libTab !== 'collections' && featured.length > 0 && (
                  <SpotlightHero
                    node={featured[0]}
                    titles={featured}
                    label={featLabel}
                    onPlay={(t) => playTitle(t)}
                    onInfo={openTitle}
                  />
                )}
                {!isLibrary && (
                  <div className="hero rise">
                    <div className="hero-eyebrow">
                      <span className="dot"></span>
                      {subColls.length ? 'Collection · System' : 'Collection'}
                    </div>
                    <h1 className="hero-title">{current.title}</h1>
                    <p className="hero-blurb">{current.blurb || 'A curated collection.'}</p>
                    <div className="hero-meta">
                      {(() => {
                        const c = OT.countDeep(current);
                        return [
                          c.colls ? (
                            <span className="chip" key="c">
                              {I.stack({})}
                              <span>
                                {c.colls} collection{c.colls > 1 ? 's' : ''}
                              </span>
                            </span>
                          ) : null,
                          <span className="chip solid" key="f">
                            {I.film({})}
                            <span>
                              {c.films} title{c.films !== 1 ? 's' : ''}
                            </span>
                          </span>,
                        ];
                      })()}
                      {!connected && (
                        <button className="chip" style={{ cursor: 'pointer', color: 'var(--cool)' }} onClick={() => setShowWizard(true)}>
                          {I.globe({})}
                          <span>Sign in with Plex</span>
                        </button>
                      )}
                      {!isLibrary && current.type === 'collection' && canMergeHere && (
                        <button className="chip" style={{ cursor: 'pointer' }} onClick={() => openMerge(undefined, current)}>
                          {I.stack({})}
                          <span>Merge into this collection</span>
                        </button>
                      )}
                      {!isLibrary && current.type === 'collection' && canMergeHere && (
                        <button className="chip" style={{ cursor: 'pointer' }} onClick={() => openMerge(current)}>
                          {I.stack({})}
                          <span>Merge this away</span>
                        </button>
                      )}
                      {curating && isColl(current) && (
                        <>
                          <button className="chip" style={{ cursor: 'pointer' }} onClick={() => setBgPickerFor(current)}>
                            {I.image({})}
                            <span>Collection artwork</span>
                          </button>
                          <span className="chip" style={{ borderStyle: 'dashed', color: 'var(--muted)' }}>
                            {I.spark({})}
                            <span>Drag to reorder · drop a collection onto another to merge · drop titles into collections</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {isLibrary ? (
                  <>
                    <div className="lib-tabs">
                      {[
                        ['recommended', 'Recommended'],
                        ['library', 'Library'],
                        ['collections', 'Collections'],
                      ].map(([k, l]) => (
                        <button key={k} className={libTab === k ? 'on' : ''} onClick={() => setLibTab(k)}>
                          {l}
                        </button>
                      ))}
                    </div>

                    {libTab === 'recommended' && libraryReady && (
                      <Suspense fallback={<ViewFallback />}>
                        <HomeView
                          scope={current}
                          storeKey={'orbit.home.rows.' + (current.libKey || current.id)}
                          bare
                          tree={tree}
                          libs={LIBS}
                          curating={curating}
                          cwVer={ver + (player ? 1 : 0)}
                          onOpen={openTitle}
                          onPlay={setPlayer}
                          onEditArt={openEditArt}
                          onEditCollArt={editCollArt}
                          onTitleMenu={openTitleMenu}
                          onCollMenu={openCollectionMenu}
                        />
                      </Suspense>
                    )}

                    {libTab === 'library' && (
                      <>
                        <div className="lib-controls">
                          <button className={'lib-toggle' + (showCollsInLib ? ' on' : '')} onClick={() => setShowCollsInLib((s) => !s)} role="switch" aria-checked={showCollsInLib}>
                            <span className="lib-toggle-sw"></span>Show collections
                          </button>
                        </div>
                        {showCollsInLib ? (
                          <section className="section rise">
                            <div className="section-head">
                              <h2>By Title</h2>
                              <span className="count">{subColls.length + looseInLib.length}</span>
                              {curating && (
                                <button className="add-row" onClick={() => setModalFor({ coll: current, kind: 'collection' })}>
                                  {I.plus({})}New collection
                                </button>
                              )}
                            </div>
                            <div className="grid titles" {...(curating ? gridDrop : {})}>
                              {(curating ? children : [...subColls, ...looseInLib].sort(sortByTitle)).map((n) =>
                                isColl(n) ? (
                                  <CollectionCard
                                    key={n.id}
                                    node={n}
                                    onOpen={go}
                                    curating={curating}
                                    dnd={cardDnd(n)}
                                    onEditArt={editCollArt}
                                    onMenu={openCollectionMenu}
                                    onMerge={curating ? openMerge : undefined}
                                    onRemove={curating ? (x) => removeNode(x.id) : undefined}
                                  />
                                ) : (
                                  <TitleCard
                                    key={n.id}
                                    node={n}
                                    onOpen={openTitle}
                                    curating={curating}
                                    dnd={cardDnd(n)}
                                    onEditArt={openEditArt}
                                    onMenu={openTitleMenu}
                                    onRemove={curating ? (x) => removeNode(x.id) : undefined}
                                  />
                                ),
                              )}
                              {curating && <AddTile label="Add title" ratio="2 / 3" onClick={() => setModalFor({ coll: current })} />}
                            </div>
                          </section>
                        ) : (
                          <section className="section rise">
                            <div className="section-head">
                              <h2>All {current.title}</h2>
                              <span className="count">{(libAllTitles || []).length}</span>
                            </div>
                            <div className="grid titles">
                              {(libAllTitles || []).slice(0, libVisible).map((n) => (
                                <TitleCard key={n.id} node={n} onOpen={openTitle} onEditArt={openEditArt} onMenu={openTitleMenu} />
                              ))}
                            </div>
                            {libAllTitles && libVisible < libAllTitles.length && (
                              <div ref={libMoreRef} className="lib-more-sentinel" aria-hidden="true" />
                            )}
                          </section>
                        )}
                      </>
                    )}

                    {libTab === 'collections' && (
                      <section className="section rise">
                        <div className="section-head">
                          <h2>Collections</h2>
                          <span className="count">{subColls.length}</span>
                          {subColls.length >= 2 && (
                            <button className="add-row" onClick={() => openMerge()}>
                              {I.stack({})}Merge collections
                            </button>
                          )}
                          {curating && (
                            <button className="add-row" onClick={() => setModalFor({ coll: current, kind: 'collection' })}>
                              {I.plus({})}New collection
                            </button>
                          )}
                        </div>
                        {subColls.length || curating ? (
                          <div className="grid colls" {...(curating ? gridDrop : {})}>
                            {(curating ? children.filter(isColl) : subColls).slice(0, curating ? undefined : collVisible).map((n) => (
                              <CollectionCard
                                key={n.id}
                                node={n}
                                onOpen={go}
                                curating={curating}
                                dnd={curating ? cardDnd(n) : null}
                                onEditArt={editCollArt}
                                onMenu={openCollectionMenu}
                                onMerge={openMerge}
                                onRemove={curating ? (x) => removeNode(x.id) : undefined}
                              />
                            ))}
                            {!curating && collVisible < subColls.length && (
                              <div ref={collMoreRef} className="lib-more-sentinel" aria-hidden="true" />
                            )}
                            {curating && (
                              <AddTile label="New collection" ratio="3 / 2" onClick={() => setModalFor({ coll: current, kind: 'collection' })} />
                            )}
                          </div>
                        ) : (
                          <div className="empty">No collections in this library yet.</div>
                        )}
                      </section>
                    )}
                  </>
                ) : curating ? (
                  <section className="section rise">
                    <div className="section-head">
                      <h2>Arrange this collection</h2>
                      <span className="count">{children.length}</span>
                      <button className="add-row" onClick={() => setModalFor({ coll: current, kind: 'collection' })}>
                        {I.plus({})}New sub-collection
                      </button>
                      <button className="add-row" onClick={() => setModalFor({ coll: current })}>
                        {I.plus({})}Add title
                      </button>
                      {children.filter((n) => n.type === 'collection').length >= 2 && (
                        <button className="add-row" onClick={() => openMerge()}>
                          {I.stack({})}Merge collections
                        </button>
                      )}
                    </div>
                    <div className="grid titles" {...gridDrop}>
                      {children.map((n) =>
                        isColl(n) ? (
                          <CollectionCard
                            key={n.id}
                            node={n}
                            onOpen={go}
                            curating
                            dnd={cardDnd(n)}
                            onEditArt={editCollArt}
                            onMenu={openCollectionMenu}
                            onMerge={n.type === 'collection' ? openMerge : undefined}
                            onRemove={(x) => removeNode(x.id)}
                          />
                        ) : (
                          <TitleCard
                            key={n.id}
                            node={n}
                            onOpen={openTitle}
                            curating
                            dnd={cardDnd(n)}
                            onEditArt={openEditArt}
                            onMenu={openTitleMenu}
                            onRemove={(x) => removeNode(x.id)}
                          />
                        ),
                      )}
                      <AddTile label="Add title" ratio="2 / 3" onClick={() => setModalFor({ coll: current })} />
                      <AddTile label="New collection" ratio="3 / 2" onClick={() => setModalFor({ coll: current, kind: 'collection' })} />
                    </div>
                  </section>
                ) : (
                  <>
                    {subColls.length > 0 && (
                      <section className="section rise" style={{ animationDelay: '.05s' }}>
                        <div className="section-head">
                          <h2>Inside this system</h2>
                          <span className="count">{subColls.length}</span>
                        </div>
                        <div className="grid colls">
                          {subColls.map((n) => (
                            <CollectionCard key={n.id} node={n} onOpen={go} onEditArt={editCollArt} onMenu={openCollectionMenu} />
                          ))}
                        </div>
                      </section>
                    )}

                    {(titles?.length || 0) > 0 && (
                      <section className="section rise" style={{ animationDelay: '.1s' }}>
                        <div className="section-head">
                          <h2>{subColls.length ? 'Loose titles' : 'Titles'}</h2>
                          <span className="count">{titles?.length || 0}</span>
                        </div>
                        <div className="grid titles">
                          {(titles || []).map((n) => (
                            <TitleCard key={n.id} node={n} onOpen={openTitle} onEditArt={openEditArt} onMenu={openTitleMenu} />
                          ))}
                        </div>
                      </section>
                    )}

                    {!subColls.length && !titles?.length && <div className="empty">This collection is empty. Hit Curate to start adding.</div>}
                  </>
                )}
              </>
            )}
          </div>
          )}
        </main>

        {ctxMenu && (
          <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={buildCtxItems(ctxMenu.node)} onClose={() => setCtxMenu(null)} />
        )}

        <ModalHost
          tree={tree}
          archive={archive}
          connected={connected}
          addToCollFor={addToCollFor}
          mergeOpen={mergeOpen}
          mergeSource={mergeSource}
          mergeDest={mergeDest}
          modalFor={modalFor}
          showWizard={showWizard}
          artFor={artFor}
          artFocus={artFocus}
          bgPickerFor={bgPickerFor}
          onCloseAddToColl={() => setAddToCollFor(null)}
          onAddToColl={(targetId) => addToCollFor && addTitleToCollection(addToCollFor.id, targetId)}
          onCloseMerge={() => {
            setMergeOpen(false);
            setMergeSource(null);
            setMergeDest(null);
          }}
          onMerge={mergeCollections}
          onCloseModal={() => setModalFor(null)}
          onOpenConnect={() => {
            setModalFor(null);
            setShowWizard(true);
          }}
          onCreate={(node) => addToCurrent(node)}
          onAddTitle={(r) => {
            const n = resultToNode(r);
            Lib.seed(n, r);
            addToCurrent(n);
          }}
          onAddFranchise={addFranchise}
          onAddArchive={(node) => addToCurrent(structuredClone({ ...node, id: newId('a') }))}
          onCloseWizard={() => {
            try {
              sessionStorage.removeItem('orbit.wizard.step.v1');
            } catch {
              /* ignore */
            }
            setShowWizard(false);
          }}
          onWizardComplete={onWizardComplete}
          onCloseArt={() => setArtFor(null)}
          onArtSaved={() => setVer((v) => v + 1)}
          onCloseBackdrop={() => setBgPickerFor(null)}
          onBackdropSaved={() => setVer((v) => v + 1)}
        />

        {detail && (() => {
          const par = OT.findParent(tree, detail.id);
          const parentTitle = par && par.id !== tree.id ? par.title : '';
          const parentNode = par && par.id !== tree.id ? par : null;
          const similar = similarTitles(tree, detail);
          return (
            <Suspense fallback={null}>
            <DetailView
              node={detail}
              similar={similar}
              parentTitle={parentTitle}
              parentNode={parentNode}
              onClose={() => setDetail(null)}
              onPlay={(node, ep) => playTitle(node, ep)}
              onEditArt={(focus) => openEditArt(detail, focus)}
              onOpenNode={(n) => {
                if (isColl(n)) {
                  setDetail(null);
                  goToNode(n);
                } else setDetail(n);
              }}
            />
            </Suspense>
          );
        })()}

        {player && (
          <Suspense fallback={null}>
            <VideoPlayer
              node={player.node}
              episode={player.episode}
              onClose={() => setPlayer(null)}
              onPlayNext={handlePlayNext}
            />
          </Suspense>
        )}

        {!player && (
          <button
            type="button"
            className={'curate-fab' + (curating ? ' on' : '')}
            onClick={toggleCurate}
            aria-pressed={curating}
            title={curating ? 'Exit curate mode' : 'Curate library'}
          >
            {I.spark({})}
            <span>{curating ? 'Done' : 'Curate'}</span>
          </button>
        )}

      </div>

      <ConfirmDialog
        open={!!libDeleteTarget}
        title={libDeleteTarget ? `Delete "${libDeleteTarget.title}"?` : 'Delete library?'}
        message="Removes this library from the sidebar. Orbit Media Server libraries are deleted on the server too. Your files on disk are safe."
        confirmLabel="Delete library"
        busy={libDeleteBusy}
        onCancel={() => !libDeleteBusy && setLibDeleteTarget(null)}
        onConfirm={() => void confirmDeleteSidebarLibrary()}
      />
    </ArtCtx.Provider>
  );
}
