import { useCallback, useEffect, useState } from 'react';
import { Lib } from '../lib';
import { fetchOmsTree, replaceOmsInTree } from '../lib/importLibraryFromOms';
import { syncOmsAfterChange } from '../lib/omsSync';
import { displayMediaPath } from '../lib/omsPaths';
import { resetOrbitInstance } from '../lib/orbitReset';
import { isUsingRemoteHome } from '../lib/orbitServer';
import { OrbitMedia } from '../lib/orbitMedia';
import type { MediaLibrary } from '../types/media';
import type { OrbitNode } from '../types/orbit';
import { FolderBrowserModal } from './FolderBrowserModal';
import { Icons } from './icons';

const ic = { ...Icons, refresh: Icons.spark };

function canNativeFolderPick() {
  return typeof window !== 'undefined' && typeof window.orbitNative?.pickFolder === 'function';
}

type WizardStep = 'type' | 'folder';

function AddLibraryWizard({
  onClose,
  onDone,
  existingLibrary,
}: {
  onClose: () => void;
  onDone: (libraryId: string) => Promise<void>;
  existingLibrary?: MediaLibrary | null;
}) {
  const [step, setStep] = useState<WizardStep>(existingLibrary ? 'folder' : 'type');
  const [type, setType] = useState<'movie' | 'tv'>(existingLibrary?.type || 'movie');
  const [folderPath, setFolderPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const libName = existingLibrary?.name || (type === 'movie' ? 'Movies' : 'TV Shows');

  async function submit(path: string) {
    if (!path.trim()) return;
    setBusy(true);
    setError('');
    try {
      let libraryId: string;
      if (existingLibrary) {
        const r = await OrbitMedia.addFolder(existingLibrary.id, path.trim());
        libraryId = r.library.id;
      } else {
        const r = await OrbitMedia.addLibrary({
          name: libName,
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
      if (picked) await submit(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open folder picker');
    }
  }

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
            <p className="oms-wizard-lead">Select library type</p>
            <div className="oms-type-cards">
              <button
                type="button"
                className={'oms-type-card' + (type === 'movie' ? ' selected' : '')}
                onClick={() => setType('movie')}
              >
                <span className="oms-type-card-ic">{ic.film({})}</span>
                <span className="oms-type-card-title">Movies</span>
                <span className="oms-type-card-sub">Add movie folders from any drive</span>
              </button>
              <button
                type="button"
                className={'oms-type-card' + (type === 'tv' ? ' selected' : '')}
                onClick={() => setType('tv')}
              >
                <span className="oms-type-card-ic">{ic.tv({})}</span>
                <span className="oms-type-card-title">TV Shows</span>
                <span className="oms-type-card-sub">Add show folders from any drive</span>
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
              Browse to a folder for <strong>{libName}</strong>. You can add more drives later to the same library.
            </p>
            {!isUsingRemoteHome() && canNativeFolderPick() && (
              <button type="button" className="conns-btn sm oms-native-pick" disabled={busy} onClick={pickNativeFolder}>
                {ic.folder({})} Pick folder (e.g. T: drive)
              </button>
            )}
            <FolderBrowserModal
              embedded
              onClose={onClose}
              onSelect={(p) => {
                setFolderPath(p);
                submit(p);
              }}
            />
            {folderPath && error && <p className="conns-err">{error}</p>}
            {error && !folderPath && <p className="conns-err">{error}</p>}
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
      </div>
    </div>
  );
}

export function MediaServerPanel({
  tree,
  onImported,
}: {
  tree: OrbitNode;
  onImported?: (merged: OrbitNode) => void;
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

  async function syncToSidebar() {
    const result = await fetchOmsTree();
    if (!result.tree) return;
    const merged = replaceOmsInTree(tree, result.tree);
    onImported?.(merged);
  }

  async function afterAddLibrary(libraryId: string) {
    setScanningId(libraryId);
    setImportMsg('Scanning and syncing…');
    try {
      await OrbitMedia.scanLibrary(libraryId);
      const libs = await OrbitMedia.listLibraries();
      setLibraries(libs);
      const lib = libs.find((l) => l.id === libraryId);
      await syncOmsAfterChange();
      await syncToSidebar();
      setImportMsg(`"${lib?.name || 'Library'}" updated — check the sidebar.`);
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
      await syncToSidebar();
      await syncOmsAfterChange();
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
      await syncOmsAfterChange();
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
      await syncOmsAfterChange();
      if (status && status.items > 0) await syncToSidebar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove folder');
    } finally {
      setBusy(false);
    }
  }

  async function removeLibrary(id: string) {
    if (!confirm('Delete this entire library and all its folders?')) return;
    setBusy(true);
    try {
      await OrbitMedia.removeLibrary(id);
      await reload();
      await syncOmsAfterChange();
      await syncToSidebar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove library');
    } finally {
      setBusy(false);
    }
  }

  async function wipeAllLibraries() {
    if (!confirm('Reset everything? Clears all libraries, folders, and indexed files.')) return;
    if (!confirm('Really start completely fresh?')) return;
    setBusy(true);
    setImportMsg('Resetting…');
    try {
      const freshTree = await resetOrbitInstance();
      onImported?.(freshTree);
      await reload();
      setImportMsg('Reset complete. Add a Movies or TV library above.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
      setImportMsg('');
    } finally {
      setBusy(false);
    }
  }

  async function matchTmdb() {
    if (!Lib.connected) {
      setError('TMDB is not available. Set ORBIT_TMDB_API_KEY in Docker.');
      return;
    }
    setBusy(true);
    try {
      const result = await OrbitMedia.matchTmdb(Lib.key || undefined);
      setImportMsg(`TMDB matched ${result.matched} titles.`);
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
        Like Plex: one <strong>Movies</strong> library with many folders (T: movies, remote_L, etc.). Same for TV Shows.
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
                    onClick={() => removeLibrary(lib.id)}
                    aria-label={`Delete ${lib.name}`}
                  >
                    {ic.x({})}
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
        <AddLibraryWizard onClose={() => setWizardOpen(false)} onDone={afterAddLibrary} />
      )}
      {addFolderTo && (
        <AddLibraryWizard
          existingLibrary={addFolderTo}
          onClose={() => setAddFolderTo(null)}
          onDone={afterAddLibrary}
        />
      )}
    </div>
  );
}
