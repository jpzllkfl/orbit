import { useCallback, useEffect, useState } from 'react';
import { fetchOmsTree, mergeOmsIntoTree } from '../lib/importLibraryFromOms';
import { OrbitMedia } from '../lib/orbitMedia';
import type { MediaLibrary, MediaServerStatus } from '../types/media';
import type { OrbitNode } from '../types/orbit';
import { FolderBrowserModal } from './FolderBrowserModal';
import { Icons } from './icons';

const ic = { ...Icons, refresh: Icons.spark };

function canNativeFolderPick() {
  return typeof window !== 'undefined' && typeof window.orbitNative?.pickFolder === 'function';
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
  const [name, setName] = useState('');
  const [type, setType] = useState<'movie' | 'tv'>('movie');
  const [rootPath, setRootPath] = useState('/media/movies');
  const [browseOpen, setBrowseOpen] = useState(false);
  const [importMsg, setImportMsg] = useState('');

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

  async function addLibrary() {
    setBusy(true);
    setError('');
    try {
      await OrbitMedia.addLibrary({ name: name.trim() || (type === 'movie' ? 'Movies' : 'TV Shows'), type, rootPath: rootPath.trim() });
      setName('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add library');
    } finally {
      setBusy(false);
    }
  }

  async function removeLibrary(id: string) {
    if (!confirm('Remove this library from Orbit? Scanned items will be deleted.')) return;
    setBusy(true);
    try {
      await OrbitMedia.removeLibrary(id);
      await reload();
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
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanningId(null);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  async function pickFolder() {
    if (canNativeFolderPick()) {
      try {
        const picked = await window.orbitNative!.pickFolder!();
        if (picked) {
          setRootPath(picked);
          if (!name.trim()) {
            const leaf = picked.replace(/[/\\]+$/, '').split(/[/\\]/).pop();
            if (leaf) setName(leaf);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not open folder picker');
      }
      return;
    }
    setBrowseOpen(true);
  }

  return (
    <div className="conns-card wide oms-card">
      <div className="conns-card-h">
        <span className="conns-pill oms">{ic.orbit({})}Orbit Media Server</span>
        <span className={'conns-state' + (status?.ok ? ' on' : '')}>{status?.ok ? 'Beta' : 'Offline'}</span>
      </div>
      <p className="conns-p">
        Connect folders on this server directly to Orbit — no Plex required. Add library paths, scan files, and build your
        own media index here. Plex libraries can stay connected during the transition.
      </p>
      {status?.ok && (
        <div className="oms-import-bar" style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <p className="conns-sub" style={{ margin: 0, flex: 1 }}>
            {status.libraries} librar{status.libraries === 1 ? 'y' : 'ies'} · {status.items.toLocaleString()} indexed file
            {status.items === 1 ? '' : 's'}
          </p>
          {status.items > 0 && (
            <button type="button" className="conns-btn primary sm" disabled={busy} onClick={importToOrbit}>
              {ic.spark({})} Import to Orbit library
            </button>
          )}
        </div>
      )}
      {importMsg && <p className="conns-sub" style={{ color: 'var(--cool)', marginBottom: 12 }}>{importMsg}</p>}

      <div className="oms-add">
        <div className="oms-row">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Movies" />
          </label>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as 'movie' | 'tv')}>
              <option value="movie">Movies</option>
              <option value="tv">TV Shows</option>
            </select>
          </label>
        </div>
        <label className="oms-path">
          Folder path
          <input
            value={rootPath}
            onChange={(e) => setRootPath(e.target.value)}
            placeholder="/media/movies"
            spellCheck={false}
          />
        </label>
        <div className="oms-add-actions">
          <button type="button" className="conns-btn primary oms-browse-btn" onClick={pickFolder}>
            {ic.folder({})} Browse for folder…
          </button>
          <button className="conns-btn oms-add-btn" disabled={busy || !rootPath.trim()} onClick={addLibrary}>
            {ic.plus({})}Add library
          </button>
        </div>
        <p className="conns-sub oms-hint">
          Click <strong>Browse for folder</strong> to pick a path on the Orbit server. In Docker, mount drives in{' '}
          <code>docker-compose.yml</code> first (e.g. <code>T:/movies:/media/movies</code>).
        </p>
      </div>

      {browseOpen && (
        <FolderBrowserModal
          onClose={() => setBrowseOpen(false)}
          onSelect={(p) => {
            setRootPath(p);
            setBrowseOpen(false);
            if (!name.trim()) {
              const leaf = p.replace(/[/\\]+$/, '').split(/[/\\]/).pop();
              if (leaf) setName(leaf);
            }
          }}
        />
      )}

      {error && <p className="conns-err">{error}</p>}

      {libraries.length > 0 && (
        <div className="oms-libs">
          {libraries.map((lib) => (
            <div key={lib.id} className={'oms-lib' + (lib.pathExists ? '' : ' missing')}>
              <div className="oms-lib-main">
                <span className="oms-lib-type">{lib.type === 'movie' ? 'Movies' : 'TV'}</span>
                <span className="oms-lib-name">{lib.name}</span>
                <span className="oms-lib-path" title={lib.rootPath}>
                  {lib.rootPath}
                </span>
              </div>
              <div className="oms-lib-meta">
                <span>{lib.itemCount} items</span>
                {lib.lastScanMessage && <span title={lib.lastScanStatus || ''}>{lib.lastScanMessage}</span>}
                {!lib.pathExists && <span className="oms-warn">Path not found</span>}
              </div>
              <div className="oms-lib-actions">
                <button
                  className="conns-btn sm"
                  disabled={!!scanningId || !lib.pathExists}
                  onClick={() => scanLibrary(lib.id)}
                >
                  {scanningId === lib.id ? (
                    'Scanning…'
                  ) : (
                    <>
                      {ic.refresh({})} Scan
                    </>
                  )}
                </button>
                <button className="conns-btn danger sm" disabled={busy} onClick={() => removeLibrary(lib.id)}>
                  {ic.x({})}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
