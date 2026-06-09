import { useCallback, useEffect, useState } from 'react';
import { OrbitMedia } from '../lib/orbitMedia';
import type { BrowseEntry, BrowseRoot } from '../types/media';
import { Icons } from './icons';

const ic = Icons;

export function FolderBrowserModal({
  onSelect,
  onClose,
}: {
  onSelect: (path: string) => void;
  onClose: () => void;
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

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal oms-browse-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Choose a folder</h3>
        <p className="sub">
          Browse folders on the machine where Orbit is running. In Docker, only mounted paths (e.g.{' '}
          <code>/media/movies</code>) appear here.
        </p>

        {!path ? (
          <div className="oms-browse-roots">
            <div className="oms-browse-label">Start locations</div>
            {roots.map((r) => (
              <button
                key={r.path}
                type="button"
                className="oms-browse-row"
                disabled={!r.exists || !r.readable}
                onClick={() => openRoot(r)}
              >
                <span className="oms-browse-ic">{ic.folder({})}</span>
                <span className="oms-browse-name">{r.label}</span>
                {!r.exists && <span className="oms-warn">Not found</span>}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="oms-browse-bar">
              {parent && (
                <button type="button" className="conns-btn sm" onClick={() => load(parent)}>
                  {ic.chevL({})} Up
                </button>
              )}
              <button type="button" className="conns-btn sm ghost" onClick={() => load(null)}>
                All roots
              </button>
              <code className="oms-browse-path">{path}</code>
            </div>
            <div className="oms-browse-list">
              {loading ? (
                <p className="conns-sub">Loading…</p>
              ) : entries.length ? (
                entries.map((e) => (
                  <button key={e.path} type="button" className="oms-browse-row" onClick={() => openDir(e)}>
                    <span className="oms-browse-ic">{ic.folder({})}</span>
                    <span className="oms-browse-name">{e.name}</span>
                    {ic.chevR({})}
                  </button>
                ))
              ) : (
                <p className="conns-sub">No subfolders — you can still select this folder.</p>
              )}
            </div>
          </>
        )}

        {error && <p className="conns-err">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
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
      </div>
    </div>
  );
}
