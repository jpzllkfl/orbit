import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  OrbitAccount,
  Conn,
  Plex,
  Lib,
  TreeStore,
  demoAppState,
  emptyShell,
  importLibraryFromPlex,
  loadAppStateAsync,
  needsPlexImport,
  needsLibraryRepair,
  resetAppStateCache,
  treeHasContent,
  treeHasLibraries,
  plexIsConfigured,
} from '../lib';
import { FRESH_RESET_KEY } from '../lib/orbitReset';
import { publishDesktopMediaOrigin, syncOmsTreeFromHome } from '../lib/omsSync';
import { withTimeout } from '../lib/withTimeout';
import { isDesktopApp } from '../lib/isDesktop';
import { invalidateTitleIndex } from '../lib/treeIndex';
import type { OrbitUser } from '../lib/orbitAccount';
import type { OrbitNode } from '../types/orbit';

export function useOrbitBoot(opts: {
  bootAttempt: number;
  liveTreeRef: MutableRefObject<boolean>;
  setTree: Dispatch<SetStateAction<OrbitNode>>;
  setPath: Dispatch<SetStateAction<string[]>>;
  setBootMsg: Dispatch<SetStateAction<string>>;
  setLibraryReady: Dispatch<SetStateAction<boolean>>;
  setPlexBootSyncing: Dispatch<SetStateAction<boolean>>;
  setBootError: Dispatch<SetStateAction<string | null>>;
  setAuthReady: Dispatch<SetStateAction<boolean>>;
  setOrbitUser: Dispatch<SetStateAction<OrbitUser | null>>;
  setGuestMode: Dispatch<SetStateAction<boolean>>;
}) {
  const {
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
  } = opts;

  useEffect(() => {
    let alive = true;
    setBootError(null);
    setAuthReady(false);
    (async () => {
      try {
        const freshReset =
          typeof sessionStorage !== 'undefined' && sessionStorage.getItem(FRESH_RESET_KEY) === '1';

        const user = await OrbitAccount.refreshMe();
        if (!alive) return;
        setOrbitUser(user);
        if (user) {
          sessionStorage.removeItem('orbit.guest.v1');
          setGuestMode(false);
          if (!freshReset) {
            setBootMsg('Syncing your account…');
            try {
              await withTimeout(OrbitAccount.pullSync(), 25000, 'Account sync');
              resetAppStateCache(false);
              if (isDesktopApp()) {
                await withTimeout(publishDesktopMediaOrigin(), 8000, 'Desktop origin');
                try {
                  await OrbitAccount.pushSyncNow();
                } catch {
                  /* offline */
                }
              }
            } catch {
              /* offline */
            }
          }
        }
        if (!alive) return;
        Plex.reloadFromStorage();
        Lib.reloadFromStorage();
        Lib.refreshServerTmdb?.();
        const connState = Conn.load();
        if (connState?.connected) {
          try {
            await Plex.restoreFromConnState(connState);
          } catch {
            /* Plex offline — library still loads from cache */
          }
        }
        const guest =
          typeof sessionStorage !== 'undefined' && sessionStorage.getItem('orbit.guest.v1') === '1';
        if (guest) {
          const demo = demoAppState();
          setTree(demo.tree);
          setPath(demo.path);
          setLibraryReady(true);
          return;
        }

        setBootMsg('Loading your library…');
        await new Promise<void>((r) => window.setTimeout(r, 32));
        if (!alive) return;

        let state = await loadAppStateAsync();
        if (!alive) return;

        if (freshReset) {
          const shell = emptyShell();
          shell.tree.blurb = 'Add libraries in Connections to get started.';
          await TreeStore.saveImmediate(shell.tree);
          resetAppStateCache(false);
          state = shell;
        }

        const repairLibraries =
          !freshReset && plexIsConfigured(Conn.load()) && (await needsLibraryRepair(state.tree));
        const shouldPlexImport =
          !freshReset &&
          (needsPlexImport(state.tree) || repairLibraries) &&
          plexIsConfigured(Conn.load());

        if (shouldPlexImport) {
          if (!treeHasContent(state.tree)) {
            TreeStore.clear();
            resetAppStateCache(false);
          }
          if (repairLibraries) {
            setBootMsg('Syncing missing Plex libraries…');
          }
          setPlexBootSyncing(true);
          let partialReady = false;
          const imported = await importLibraryFromPlex({
            onStatus: (msg) => {
              if (alive) setBootMsg(msg);
            },
            onPartial: (partial) => {
              if (!alive || !treeHasContent(partial)) return;
              setTree(partial);
              setPath([partial.id]);
              invalidateTitleIndex();
              liveTreeRef.current = true;
              setLibraryReady(true);
              if (!partialReady) {
                partialReady = true;
                setPlexBootSyncing(false);
                setAuthReady(true);
              }
            },
          });
          if (!alive) return;
          setPlexBootSyncing(false);
          if (imported.tree) {
            state = { tree: imported.tree, path: [imported.tree.id] };
            resetAppStateCache(false);
            setBootError(null);
            if (user) {
              try {
                await OrbitAccount.pushSync();
              } catch {
                /* offline */
              }
            }
          } else if (imported.error) {
            setBootError(imported.error);
          }
        } else if (!treeHasLibraries(state.tree) && user) {
          setBootMsg('Repairing library cache…');
          TreeStore.clear();
          resetAppStateCache(false);
          try {
            await OrbitAccount.pullSync();
          } catch {
            /* offline */
          }
          state = await loadAppStateAsync();
        }

        if (!alive) return;
        if (freshReset) {
          try {
            sessionStorage.removeItem(FRESH_RESET_KEY);
          } catch {
            /* ignore */
          }
        }
        setTree(state.tree);
        setPath(state.path);
        invalidateTitleIndex();
        const ready = treeHasContent(state.tree);
        liveTreeRef.current = ready;
        setLibraryReady(ready);

        // OMS refresh + Plex artwork run after the UI is up — never block boot on them.
        if (user && !freshReset) {
          void withTimeout(syncOmsTreeFromHome(state.tree, { force: isDesktopApp() }), 30000, 'OMS sync')
            .then((omsMerged) => {
              if (!alive || !omsMerged) return;
              setTree(omsMerged);
              setPath([omsMerged.id]);
              invalidateTitleIndex();
              liveTreeRef.current = treeHasContent(omsMerged);
              setLibraryReady(treeHasContent(omsMerged));
              resetAppStateCache(false);
            })
            .catch(() => {});
        }
      } finally {
        if (alive) setAuthReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [
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
  ]);
}
