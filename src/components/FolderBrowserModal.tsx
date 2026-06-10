import { useCallback, useEffect, useState } from 'react';
import { displayMediaPath } from '../lib/omsPaths';
import { OrbitMedia } from '../lib/orbitMedia';
import type { BrowseEntry, BrowseRoot } from '../types/media';
import { Icons } from './icons';

const ic = Icons;

export function FolderBrowserModal({
  onSelect,
  onClose,
  embedded = false,
}: {
  onSelect: (path: string) => void;
  onClose: () => void;
  embedded?: boolean;
}) {
  const [path, setPath] = useState<string | null>(null);
  const [parent, setParent] = useState<string | null>(null);
  const [roots, setRoots] = useState<BrowseRoot[]>([]);
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (target?: string | null) => {
    setLoading(true);
    setError('');
    try {
      const data = await OrbitMedia.browse(target || undefined);
      setPath(data.path);
      setParent(data.parent);
      setEntries(data.entries);
      if (data.roots?.length) setRoots(data.roots);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open folder');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(null);
  }, [load]);

  function openDir(entry: BrowseEntry) {
    load(entry.path);
  }

  function openRoot(root: BrowseRoot) {
    load(root.path);
  }

  const pathLabel = path ? displayMediaPath(path) : '';

  const body = (
    <>
      {!embedded && <h3>Choose a folder</h3>}
      <p className="oms-browse-hint">
        Pick a folder on your TrueNAS share (<code>\\192.168.1.177\media</code>). Names below match{' '}
        <code>broken_eye/media/…</code> on the server.
      </p>

      {!path ? (
        <div className="oms-browse-roots">
          <div className="oms-browse-label">Your media folders</div>
          {loading ? (
            <p className="conns-sub">Loading folders…</p>
          ) : roots.length ? (
            roots.map((r) => (
              <button
                key={r.path}
                type="button"
                className="oms-browse-row"
                disabled={!r.exists || !r.readable}
                onClick={() => openRoot(r)}
              >
                <span className="oms-browse-ic">{ic.folder({})}</span>
                <span className="oms-browse-name">{r.label}</span>
                <span className="oms-browse-chev">{ic.chevR({})}</span>
              </button>
            ))
          ) : (
            <p className="conns-sub">No media folders found. Check Docker volume mounts in Dockge.</p>
          )}
        </div>
      ) : (
        <>
          <div className="oms-browse-bar">
            {parent && (
              <button type="button" className="conns-btn sm" onClick={() => load(parent)}>
                <span className="oms-browse-bar-ic">{ic.chevL({})}</span> Up
              </button>
            )}
            <button type="button" className="conns-btn sm ghost" onClick={() => load(null)}>
              All folders
            </button>
            <code className="oms-browse-path" title={path}>
              {pathLabel}
            </code>
          </div>
          <div className="oms-browse-list">
            {loading ? (
              <p className="conns-sub">Loading…</p>
            ) : entries.length ? (
              entries.map((e) => (
                <button key={e.path} type="button" className="oms-browse-row" onClick={() => openDir(e)}>
                  <span className="oms-browse-ic">{ic.folder({})}</span>
                  <span className="oms-browse-name">{e.name}</span>
                  <span className="oms-browse-chev">{ic.chevR({})}</span>
                </button>
              ))
            ) : (
              <p className="conns-sub">No subfolders — select this folder if your files are here.</p>
            )}
          </div>
        </>
      )}

      {error && <p className="conns-err">{error}</p>}

      <div className={embedded ? 'oms-browse-actions embedded' : 'modal-actions'}>
        {!embedded && (
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="btn primary"
          disabled={!path || loading}
          onClick={() => {
            if (path) onSelect(path);
          }}
        >
          Select this folder
        </button>
      </div>
    </>
  );

  if (embedded) {
    return <div className="oms-browse-embedded">{body}</div>;
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal oms-browse-modal" onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>
  );
}
