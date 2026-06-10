import { useCallback, useEffect, useState } from 'react';
import { Lib } from '../lib';
import { fetchOmsTree, mergeOmsIntoTree } from '../lib/importLibraryFromOms';
import { syncOmsAfterChange } from '../lib/omsSync';
import { isUsingRemoteHome } from '../lib/orbitServer';
import { OrbitMedia } from '../lib/orbitMedia';
import type { MediaLibrary, MediaServerStatus } from '../types/media';
import type { OrbitNode } from '../types/orbit';
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
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [step, setStep] = useState<WizardStep>('type');
  const [type, setType] = useState<'movie' | 'tv'>('movie');
  const [rootPath, setRootPath] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!rootPath.trim()) return;
    setBusy(true);
    setError('');
    try {
      const defaultName = type === 'movie' ? 'Movies' : 'TV Shows';
      await OrbitMedia.addLibrary({
        name: name.trim() || folderLeafName(rootPath) || defaultName,
        type,
        rootPath: rootPath.trim(),
      });
      await onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add library');
    } finally {
      setBusy(false);
    }
  }

  async function pickNativeFolder() {
    if (!canNativeFolderPick()) return;
    try {
      const picked = await window.orbitNative!.pickFolder!();
      if (picked) {
        setRootPath(picked);
        if (!name.trim()) setName(folderLeafName(picked));
        setStep('name');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open folder picker');
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal oms-wizard-modal" onClick={(e) => e.stopPropagation()}>
        <div className="oms-wizard-head">
          <h3>Add Library</h3>
          <button type="button" className="oms-wizard-close" onClick={onClose} aria-label="Close">
            {ic.x({})}
          </button>
        </div>

        {step === 'type' && (
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
                <span className="oms-type-card-sub">Movie files in folders</span>
              </button>
              <button
                type="button"
                className={'oms-type-card' + (type === 'tv' ? ' selected' : '')}
                onClick={() => setType('tv')}
              >
                <span className="oms-type-card-ic">{ic.tv({})}</span>
                <span className="oms-type-card-title">TV Shows</span>
                <span className="oms-type-card-sub">Show folders with seasons</span>
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
              Add folders for your {type === 'movie' ? 'Movies' : 'TV Shows'} library
            </p>
            {!isUsingRemoteHome() && canNativeFolderPick() && (
              <button type="button" className="conns-btn sm oms-native-pick" onClick={pickNativeFolder}>
                {ic.folder({})} Pick folder on this PC
              </button>
            )}
            <FolderBrowserModal
              embedded
              onClose={() => setStep('type')}
              onSelect={(p) => {
                setRootPath(p);
                if (!name.trim()) setName(folderLeafName(p));
                setStep('name');
              }}
            />
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setStep('type')}>
                Back
              </button>
            </div>
          </div>
        )}

        {step === 'name' && (
          <div className="oms-wizard-step">
            <p className="oms-wizard-lead">Name your library</p>
            <label className="oms-wizard-name-field">
              Library name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === 'movie' ? 'Movies' : 'TV Shows'}
                autoFocus
              />
            </label>
            <p className="conns-sub oms-wizard-path">
              Folder: <code>{rootPath}</code>
            </p>
            {error && <p className="conns-err">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setStep('folder')} disabled={busy}>
                Back
              </button>
              <button type="button" className="btn primary" disabled={busy || !rootPath.trim()} onClick={submit}>
                {busy ? 'Adding…' : 'Add Library'}
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
  onImported?: (merged: OrbitNode) => void;
}) {
  const [status, setStatus] = useState<MediaServerStatus | null>(null);
  const [libraries, setLibraries] = useState<MediaLibrary[]>([]);
  const [busy, setBusy] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  async function afterLibraryChange() {
    await reload();
    await syncOmsAfterChange();
  }

  async function removeLibrary(id: string) {
    if (!confirm('Remove this library? Scanned items will be deleted.')) return;
    setBusy(true);
    try {
      await OrbitMedia.removeLibrary(id);
      await afterLibraryChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove library');
    } finally {
      setBusy(false);
    }
  }

  async function scanLibrary(id: string) {
    setScanningId(id);
    setError('');
    try {
      await OrbitMedia.scanLibrary(id);
      await afterLibraryChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanningId(null);
    }
  }

  async function scanAllLibraries() {
    setBusy(true);
    setError('');
    setImportMsg('');
    try {
      await OrbitMedia.scanAllLibraries();
      await afterLibraryChange();
      setImportMsg('Scan complete. Import to Orbit library to refresh your home rows.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setBusy(false);
    }
  }

  async function changeLibraryType(id: string, newType: 'movie' | 'tv') {
    const lib = libraries.find((l) => l.id === id);
    if (!lib || lib.type === newType) return;
    if (
      !confirm(
        `Change "${lib.name}" to ${newType === 'movie' ? 'Movies' : 'TV Shows'} and rescan?`,
      )
    ) {
      await reload();
      return;
    }
    setScanningId(id);
    setError('');
    try {
      await OrbitMedia.updateLibrary(id, { type: newType });
      await OrbitMedia.scanLibrary(id);
      await afterLibraryChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update library type');
      await reload();
    } finally {
      setScanningId(null);
    }
  }

  async function wipeAllLibraries() {
    if (
      !confirm(
        'Delete ALL Orbit Media Server libraries and indexed files? This cannot be undone. Your actual video files on disk are not deleted.',
      )
    ) {
      return;
    }
    if (!confirm('Really wipe everything and start fresh?')) return;
    setBusy(true);
    setError('');
    setImportMsg('');
    try {
      await OrbitMedia.wipeLibraries();
      await afterLibraryChange();
      setImportMsg('All media libraries cleared. Add libraries to get started.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wipe failed');
    } finally {
      setBusy(false);
    }
  }

  async function setupTrueNasLibraries() {
    setBusy(true);
    setError('');
    setImportMsg('Syncing default TrueNAS paths…');
    try {
      const seed = await OrbitMedia.seedLibraries();
      const added = seed.added?.length ?? 0;
      const updated = seed.updated?.length ?? 0;
      setImportMsg(`Synced: ${added} added, ${updated} updated.`);
      await afterLibraryChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setBusy(false);
    }
  }

  async function matchTmdb() {
    if (!Lib.connected) {
      setError('TMDB is not available on this Orbit server. Set ORBIT_TMDB_API_KEY in Docker.');
      return;
    }
    setBusy(true);
    setError('');
    setImportMsg('');
    try {
      const result = await OrbitMedia.matchTmdb(Lib.key || undefined);
      setImportMsg(`TMDB matched ${result.matched} title${result.matched === 1 ? '' : 's'}. Re-import to refresh artwork.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'TMDB match failed');
    } finally {
      setBusy(false);
    }
  }

  async function importToOrbit() {
    setBusy(true);
    setError('');
    setImportMsg('');
    try {
      const result = await fetchOmsTree();
      if (!result.tree) throw new Error(result.error || 'Nothing to import');
      const merged = mergeOmsIntoTree(tree, result.tree);
      onImported?.(merged);
      setImportMsg(
        `Added ${result.libraryCount ?? 0} librar${result.libraryCount === 1 ? 'y' : 'ies'} · ${result.titleCount ?? 0} titles to Orbit.`,
      );
      await syncOmsAfterChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
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

      {status?.ok && (
        <>
          <div className="oms-toolbar">
            <button
              type="button"
              className="conns-btn primary"
              disabled={busy}
              onClick={() => setWizardOpen(true)}
            >
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

          {status.libraries > 0 && (
            <p className="conns-sub oms-stats">
              {status.libraries} librar{status.libraries === 1 ? 'y' : 'ies'} · {status.items.toLocaleString()} indexed
              file{status.items === 1 ? '' : 's'}
            </p>
          )}
        </>
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
        libraries.length > 0 && (
          <div className="oms-lib-list">
            {libraries.map((lib) => (
              <div key={lib.id} className={'oms-lib-row' + (lib.pathExists ? '' : ' missing')}>
                <span className="oms-lib-row-ic" title={lib.type === 'movie' ? 'Movies' : 'TV Shows'}>
                  {lib.type === 'movie' ? ic.film({}) : ic.tv({})}
                </span>
                <div className="oms-lib-row-body">
                  <div className="oms-lib-row-top">
                    <span className="oms-lib-row-name">{lib.name}</span>
                    <select
                      className="oms-lib-row-type"
                      value={lib.type}
                      disabled={!!scanningId || busy}
                      onChange={(e) => changeLibraryType(lib.id, e.target.value as 'movie' | 'tv')}
                      aria-label={`${lib.name} library type`}
                    >
                      <option value="movie">Movies</option>
                      <option value="tv">TV Shows</option>
                    </select>
                  </div>
                  <span className="oms-lib-row-path" title={lib.rootPath}>
                    {lib.rootPath}
                  </span>
                  <span className="oms-lib-row-meta">
                    {lib.itemCount} items
                    {!lib.pathExists && <span className="oms-warn"> · Path not found</span>}
                    {lib.lastScanMessage && <span> · {lib.lastScanMessage}</span>}
                  </span>
                </div>
                <div className="oms-lib-row-actions">
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
                    aria-label={`Remove ${lib.name}`}
                  >
                    {ic.x({})}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {status?.ok && status.items > 0 && (
        <div className="oms-import-bar">
          <button type="button" className="conns-btn sm" disabled={busy} onClick={matchTmdb}>
            {ic.image({})} Match TMDB
          </button>
          <button type="button" className="conns-btn primary sm" disabled={busy} onClick={importToOrbit}>
            {ic.spark({})} Import to Orbit library
          </button>
        </div>
      )}

      {status?.ok && (
        <details className="oms-advanced" open={advancedOpen} onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}>
          <summary>Advanced</summary>
          <div className="oms-advanced-body">
            <p className="conns-sub">
              Auto-add TrueNAS mount paths from server config. Use only if you want bulk setup instead of adding folders
              manually.
            </p>
            <button type="button" className="conns-btn sm" disabled={busy} onClick={setupTrueNasLibraries}>
              Sync TrueNAS library paths
            </button>
            <button type="button" className="conns-btn danger sm" disabled={busy} onClick={wipeAllLibraries}>
              Wipe all media data
            </button>
          </div>
        </details>
      )}

      {wizardOpen && (
        <AddLibraryWizard
          onClose={() => setWizardOpen(false)}
          onAdded={afterLibraryChange}
        />
      )}
    </div>
  );
}
