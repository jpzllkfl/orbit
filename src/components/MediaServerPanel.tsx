import { useCallback, useEffect, useState } from 'react';
import { Lib } from '../lib';
import { apiUrl } from '../lib/orbitServer';
import { deleteOrbitLibrary } from '../lib/deleteOrbitLibrary';
import {
  fetchOmsTree,
  removeOmsLibraryFromTree,
  replaceOmsInTree,
  stripOmsFromTree,
} from '../lib/importLibraryFromOms';
import { resetAppStateCache } from '../lib/appState';
import { syncOmsAfterChange } from '../lib/omsSync';
import { displayMediaPath } from '../lib/omsPaths';
import { resetOrbitInstance } from '../lib/orbitReset';
import { TreeStore } from '../lib/treeStore';
import { OrbitMedia } from '../lib/orbitMedia';
import type { MediaLibrary } from '../types/media';
import type { OrbitNode } from '../types/orbit';
import { ConfirmDialog } from './ConfirmDialog';
import { FolderBrowserModal } from './FolderBrowserModal';
import { Icons } from './icons';

const ic = { ...Icons, refresh: Icons.spark };

function canNativeFolderPick() {
  return typeof window !== 'undefined' && typeof window.orbitNative?.pickFolder === 'function';
}

function folderLeafName(p: string) {
  return p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || '';
}

type WizardStep = 'type' | 'folder' | 'name';

function AddLibraryWizard({
  onClose,
  onDone,
  existingLibrary,
  existingLibraries,
}: {
  onClose: () => void;
  onDone: (libraryId: string) => Promise<void>;
  existingLibrary?: MediaLibrary | null;
  existingLibraries?: MediaLibrary[];
}) {
  const [step, setStep] = useState<WizardStep>(existingLibrary ? 'folder' : 'type');
  const [type, setType] = useState<'movie' | 'tv'>(existingLibrary?.type || 'movie');
  const [folderPath, setFolderPath] = useState('');
  const [name, setName] = useState(existingLibrary?.name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const matchingLib = existingLibraries?.find(
    (l) => l.name.trim().toLowerCase() === name.trim().toLowerCase() && l.type === type,
  );

  async function submit(path: string, libraryName: string) {
    if (!path.trim()) return;
    const trimmedName = libraryName.trim();
    if (!trimmedName) {
      setError('Library name is required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let libraryId: string;
      if (existingLibrary) {
        const r = await OrbitMedia.addFolder(existingLibrary.id, path.trim());
        libraryId = r.library.id;
      } else {
        const r = await OrbitMedia.addLibrary({
          name: trimmedName,
          type,
          folderPath: path.trim(),
        });
        libraryId = r.library.id;
      }
      await onDone(libraryId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add folder');
    } finally {
      setBusy(false);
    }
  }

  async function pickNativeFolder() {
    if (!canNativeFolderPick()) return;
    try {
      const picked = await window.orbitNative!.pickFolder!();
      if (!picked) return;
      if (existingLibrary) {
        await submit(picked, existingLibrary.name);
      } else {
        setFolderPath(picked);
        setName(folderLeafName(picked));
        setStep('name');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open folder picker');
    }
  }

  function onFolderPicked(p: string) {
    setFolderPath(p);
    if (existingLibrary) {
      submit(p, existingLibrary.name);
    } else {
      setName(folderLeafName(p));
      setStep('name');
    }
  }

  const typeLabel = type === 'movie' ? 'Movie' : 'TV Show';

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal oms-wizard-modal" onClick={(e) => e.stopPropagation()}>
        <div className="oms-wizard-head">
          <h3>{existingLibrary ? `Add folder to ${existingLibrary.name}` : 'Add Library'}</h3>
          <button type="button" className="oms-wizard-close" onClick={onClose} aria-label="Close">
            {ic.x({})}
          </button>
        </div>

        {step === 'type' && !existingLibrary && (
          <div className="oms-wizard-step">
            <p className="oms-wizard-lead">
              What kind of files are in this folder? This controls how Orbit scans them — not what the library is
              called.
            </p>
            <div className="oms-type-cards">
              <button
                type="button"
                className={'oms-type-card' + (type === 'movie' ? ' selected' : '')}
                onClick={() => setType('movie')}
              >
                <span className="oms-type-card-ic">{ic.film({})}</span>
                <span className="oms-type-card-title">Movie</span>
                <span className="oms-type-card-sub">One file = one title</span>
              </button>
              <button
                type="button"
                className={'oms-type-card' + (type === 'tv' ? ' selected' : '')}
                onClick={() => setType('tv')}
              >
                <span className="oms-type-card-ic">{ic.tv({})}</span>
                <span className="oms-type-card-title">TV Show</span>
                <span className="oms-type-card-sub">Episodes & seasons</span>
              </button>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={() => setStep('folder')}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'folder' && (
          <div className="oms-wizard-step">
            <p className="oms-wizard-lead">
              Choose a folder for {typeLabel} scanning. You can add more folders to the same library later.
            </p>
            {canNativeFolderPick() ? (
              <div className="oms-native-pick-block">
                <button
                  type="button"
                  className="conns-btn primary oms-native-pick"
                  disabled={busy}
                  onClick={pickNativeFolder}
                >
                  {ic.folder({})} Pick folder on this PC
                </button>
                <p className="conns-sub oms-hint">
                  Opens File Explorer — choose a drive or folder (e.g. C:\Movies, T:\TV).
                </p>
                <p className="oms-wizard-or">or browse server folders below</p>
              </div>
            ) : (
              <p className="conns-sub oms-hint oms-web-limit">
                Import from this PC (C:\, T:\, etc.) requires{' '}
                <strong>Orbit Desktop</strong>. In the browser you can only browse folders on the Orbit server.
              </p>
            )}
            <FolderBrowserModal
              embedded
              onClose={onClose}
              onSelect={onFolderPicked}
            />
            {error && <p className="conns-err">{error}</p>}
            <div className="modal-actions">
              {!existingLibrary && (
                <button type="button" className="btn ghost" onClick={() => setStep('type')} disabled={busy}>
                  Back
                </button>
              )}
              {existingLibrary && (
                <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'name' && !existingLibrary && (
          <div className="oms-wizard-step">
            <p className="oms-wizard-lead">Name this library — e.g. Anime, Movies, Kids Movies.</p>
            <label className="oms-wizard-name-field">
              Library name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Anime"
                autoFocus
              />
            </label>
            <p className="conns-sub oms-wizard-path">
              Folder: <code>{displayMediaPath(folderPath)}</code>
            </p>
            <p className="conns-sub oms-wizard-path">
              Scan as: <strong>{typeLabel}</strong>
            </p>
            {matchingLib && (
              <p className="conns-sub oms-msg">
                Adds this folder to your existing <strong>{matchingLib.name}</strong> library.
              </p>
            )}
            {error && <p className="conns-err">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setStep('folder')} disabled={busy}>
                Back
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || !name.trim() || !folderPath.trim()}
                onClick={() => submit(folderPath, name)}
              >
                {busy ? 'Adding…' : matchingLib ? 'Add folder' : 'Add Library'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function MediaServerPanel({
  tree,
  onImported,
}: {
  tree: OrbitNode;
  onImported?: (merged: OrbitNode) => void | Promise<void>;
}) {
  const [status, setStatus] = useState<import('../types/media').MediaServerStatus | null>(null);
  const [libraries, setLibraries] = useState<MediaLibrary[]>([]);
  const [busy, setBusy] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [addFolderTo, setAddFolderTo] = useState<MediaLibrary | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteLib, setConfirmDeleteLib] = useState<MediaLibrary | null>(null);

  const reload = useCallback(async () => {
    try {
      const [st, libs] = await Promise.all([OrbitMedia.status(), OrbitMedia.listLibraries()]);
      setStatus(st);
      setLibraries(libs);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Orbit Media Server unavailable');
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function syncToSidebar(removedLibraryId?: string, removedLibraryName?: string) {
    const base = TreeStore.load() ?? tree;
    const result = await fetchOmsTree();
    let merged: OrbitNode;
    if (result.tree) {
      merged = replaceOmsInTree(base, result.tree);
    } else if (removedLibraryId || removedLibraryName) {
      merged = removeOmsLibraryFromTree(base, removedLibraryId, removedLibraryName);
    } else {
      merged = stripOmsFromTree(base);
    }
    await onImported?.(merged);
    await syncOmsAfterChange();
  }

  async function tmdbReady() {
    if (Lib.connected) return true;
    try {
      await Lib.ensureTmdbReady?.();
      if (Lib.serverTmdb) return true;
      const res = await fetch(apiUrl('/api/tmdb/status'));
      const json = (await res.json()) as { available?: boolean; key?: string };
      return !!json.available || json.key === 'set';
    } catch {
      return false;
    }
  }

  async function matchAndSync(libraryId?: string) {
    if (!(await tmdbReady())) return 0;
    setImportMsg('Matching posters and titles from TMDB…');
    const result = await OrbitMedia.matchTmdb(Lib.key || undefined, libraryId);
    await syncToSidebar();
    return result.matched;
  }

  async function afterAddLibrary(libraryId: string) {
    setScanningId(libraryId);
    setImportMsg('Scanning files…');
    try {
      await OrbitMedia.scanLibrary(libraryId);
      const libs = await OrbitMedia.listLibraries();
      setLibraries(libs);
      const lib = libs.find((l) => l.id === libraryId);
      let matched = 0;
      if (await tmdbReady()) {
        matched = await matchAndSync(libraryId);
      } else {
        await syncToSidebar();
      }
      setImportMsg(
        matched > 0
          ? `"${lib?.name || 'Library'}" ready — ${matched} titles matched with posters.`
          : `"${lib?.name || 'Library'}" scanned — matching metadata…`,
      );
      const st = await OrbitMedia.status();
      setStatus(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanningId(null);
    }
  }

  async function scanLibrary(id: string) {
    setScanningId(id);
    setError('');
    try {
      await OrbitMedia.scanLibrary(id);
      await reload();
      if (await tmdbReady()) {
        const matched = await matchAndSync(id);
        setImportMsg(matched > 0 ? `Matched ${matched} titles from TMDB.` : 'Scan done. Few titles matched — check filenames or TMDB key.');
      } else {
        await syncToSidebar();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanningId(null);
    }
  }

  async function scanAllLibraries() {
    setBusy(true);
    setError('');
    try {
      await OrbitMedia.scanAllLibraries();
      await reload();
      await syncToSidebar();
      setImportMsg('All libraries scanned.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setBusy(false);
    }
  }

  async function removeFolder(lib: MediaLibrary, folderId: string) {
    if (!confirm('Remove this folder from the library?')) return;
    setBusy(true);
    try {
      await OrbitMedia.removeFolder(lib.id, folderId);
      await reload();
      if (status && status.items > 0) await syncToSidebar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove folder');
    } finally {
      setBusy(false);
    }
  }

  async function executeDeleteLibrary() {
    const lib = confirmDeleteLib;
    if (!lib) return;
    setBusy(true);
    setError('');
    try {
      const merged = await deleteOrbitLibrary({
        tree: TreeStore.load() ?? tree,
        omsLibraryId: lib.id,
        libraryName: lib.name,
      });
      await onImported?.(merged);
      await reload();
      setImportMsg(`"${lib.name}" removed from the sidebar.`);
      setConfirmDeleteLib(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete library');
    } finally {
      setBusy(false);
    }
  }

  async function wipeAllLibraries() {
    if (
      !confirm(
        'Delete EVERYTHING? All libraries, all 3,000+ titles in the sidebar, Plex settings, and cloud sync. Your video files on disk are safe.',
      )
    ) {
      return;
    }
    if (!confirm('Last chance — wipe the sidebar and start completely empty?')) return;
    setBusy(true);
    setError('');
    setImportMsg('Deleting…');
    try {
      const freshTree = await resetOrbitInstance();
      resetAppStateCache(false);
      await onImported?.(freshTree);
      await reload();
      setImportMsg('Everything cleared. Reloading…');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
      setImportMsg('');
    } finally {
      setBusy(false);
    }
  }

  async function matchTmdb() {
    if (!(await tmdbReady())) {
      setError('TMDB is not responding — restart Orbit and try again.');
      return;
    }
    setBusy(true);
    setImportMsg('Matching from TMDB…');
    try {
      const result = await OrbitMedia.matchTmdb(Lib.key || undefined);
      setImportMsg(`TMDB matched ${result.matched} titles — posters and details should fill in.`);
      await syncToSidebar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'TMDB match failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="conns-card wide oms-card">
      <div className="conns-card-h">
        <span className="conns-pill oms">{ic.orbit({})}Orbit Media Server</span>
        <span className={'conns-state' + (status?.ok ? ' on' : '')}>{status?.ok ? 'Beta' : 'Offline'}</span>
      </div>
      <p className="conns-sub" style={{ marginBottom: 12 }}>
        Pick <strong>Movie</strong> or <strong>TV Show</strong> for how files are scanned. You name each library
        (Anime, Movies, Kids TV, etc.) and can add more folders to the same name later.
      </p>
      <p className="conns-sub oms-msg" style={{ marginBottom: 12 }}>
        Posters, cast, and plot are filled automatically from <strong>TMDB</strong> after each scan. Use{' '}
        <strong>Match TMDB</strong> to refresh metadata anytime.
      </p>

      {status?.ok && (
        <div className="oms-toolbar">
          <button type="button" className="conns-btn primary" disabled={busy} onClick={() => setWizardOpen(true)}>
            {ic.plus({})} Add Library
          </button>
          <button
            type="button"
            className="conns-btn"
            disabled={busy || libraries.length === 0}
            onClick={scanAllLibraries}
          >
            {ic.refresh({})} Scan Library Files
          </button>
        </div>
      )}

      {importMsg && <p className="conns-sub oms-msg">{importMsg}</p>}
      {error && <p className="conns-err">{error}</p>}

      {libraries.length === 0 && status?.ok ? (
        <div className="oms-empty">
          <p>No libraries yet.</p>
          <button type="button" className="conns-btn primary" disabled={busy} onClick={() => setWizardOpen(true)}>
            {ic.plus({})} Add Library
          </button>
        </div>
      ) : (
        <div className="oms-lib-list">
          {libraries.map((lib) => (
            <div key={lib.id} className="oms-lib-plex">
              <div className="oms-lib-row">
                <span className="oms-lib-row-ic">{lib.type === 'movie' ? ic.film({}) : ic.tv({})}</span>
                <div className="oms-lib-row-body">
                  <span className="oms-lib-row-name">{lib.name}</span>
                  <span className="oms-lib-row-meta">
                    {(lib.folderCount || 0)} folder{(lib.folderCount || 0) === 1 ? '' : 's'} · {lib.itemCount} items
                    {lib.lastScanMessage && <span> · {lib.lastScanMessage}</span>}
                  </span>
                </div>
                <div className="oms-lib-row-actions">
                  <button
                    type="button"
                    className="conns-btn sm"
                    disabled={!!scanningId || busy}
                    onClick={() => setExpandedId(expandedId === lib.id ? null : lib.id)}
                  >
                    {expandedId === lib.id ? 'Hide' : 'Folders'}
                  </button>
                  <button
                    type="button"
                    className="conns-btn sm"
                    disabled={!!scanningId || !lib.pathExists}
                    onClick={() => scanLibrary(lib.id)}
                  >
                    {scanningId === lib.id ? 'Scanning…' : 'Scan'}
                  </button>
                  <button
                    type="button"
                    className="conns-btn danger sm"
                    disabled={busy}
                    onClick={() => setConfirmDeleteLib(lib)}
                    aria-label={`Delete ${lib.name}`}
                    title="Delete library"
                  >
                    {ic.trash({})}
                  </button>
                </div>
              </div>
              {expandedId === lib.id && (
                <div className="oms-lib-folders">
                  {(lib.folders || []).map((f) => (
                    <div key={f.id} className="oms-lib-folder-row">
                      <span className="oms-lib-folder-path" title={f.path}>
                        {displayMediaPath(f.path)}
                      </span>
                      <button
                        type="button"
                        className="conns-btn danger sm"
                        disabled={busy}
                        onClick={() => removeFolder(lib, f.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="conns-btn sm oms-add-folder-btn"
                    disabled={busy}
                    onClick={() => setAddFolderTo(lib)}
                  >
                    {ic.plus({})} Add folder to {lib.name}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {status?.ok && status.items > 0 && (
        <div className="oms-import-bar">
          <button type="button" className="conns-btn sm" disabled={busy} onClick={matchTmdb}>
            {ic.image({})} Match TMDB
          </button>
        </div>
      )}

      {status?.ok && (
        <details className="oms-advanced">
          <summary>Advanced</summary>
          <div className="oms-advanced-body">
            <button type="button" className="conns-btn danger sm" disabled={busy} onClick={wipeAllLibraries}>
              Reset everything (start fresh)
            </button>
          </div>
        </details>
      )}

      {wizardOpen && (
        <AddLibraryWizard
          onClose={() => setWizardOpen(false)}
          onDone={afterAddLibrary}
          existingLibraries={libraries}
        />
      )}
      {addFolderTo && (
        <AddLibraryWizard
          existingLibrary={addFolderTo}
          existingLibraries={libraries}
          onClose={() => setAddFolderTo(null)}
          onDone={afterAddLibrary}
        />
      )}

      <ConfirmDialog
        open={!!confirmDeleteLib}
        title={`Delete "${confirmDeleteLib?.name || 'library'}"?`}
        message="Removes this library from Orbit Media Server and the sidebar. Your video files on disk are not deleted."
        confirmLabel="Delete library"
        busy={busy}
        onCancel={() => !busy && setConfirmDeleteLib(null)}
        onConfirm={() => void executeDeleteLibrary()}
      />
    </div>
  );
}
