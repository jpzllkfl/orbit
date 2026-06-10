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
  const [activeRoot, setActiveRoot] = useState<string | null>(null);
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
      if (data.roots?.length) {
        setRoots(data.roots);
        if (data.path) {
          const match = data.roots.find((r) => data.path === r.path || data.path!.startsWith(r.path + '/'));
          if (match) setActiveRoot(match.path);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open folder');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const data = await OrbitMedia.browse();
      const r = data.roots || [];
      setRoots(r);
      if (r.length === 1 && r[0].exists && r[0].readable) {
        setActiveRoot(r[0].path);
        await load(r[0].path);
      } else {
        await load(null);
      }
    })();
  }, [load]);

  function openDir(entry: BrowseEntry) {
    load(entry.path);
  }

  function openRoot(root: BrowseRoot) {
    setActiveRoot(root.path);
    load(root.path);
  }

  const pathLabel = path ? displayMediaPath(path) : '';

  const body = (
    <>
      {!embedded && <h3>Browse for media folder</h3>}
      <p className="oms-browse-hint">
        Open your share and pick a folder — same as Plex. Nothing is pre-added until you click{' '}
        <strong>Select this folder</strong>.
      </p>

      <div className="oms-browse-plex">
        <aside className="oms-browse-sidebar">
          <div className="oms-browse-label">Locations</div>
          {roots.map((r) => (
            <button
              key={r.path}
              type="button"
              className={'oms-browse-side-item' + (activeRoot === r.path ? ' active' : '')}
              disabled={!r.exists || !r.readable}
              onClick={() => openRoot(r)}
              title={r.path}
            >
              <span className="oms-browse-ic">{ic.folder({})}</span>
              <span className="oms-browse-side-name">{r.label}</span>
            </button>
          ))}
        </aside>

        <div className="oms-browse-main">
          {path ? (
            <>
              <div className="oms-browse-bar">
                {parent && (
                  <button type="button" className="conns-btn sm" onClick={() => load(parent)}>
                    <span className="oms-browse-bar-ic">{ic.chevL({})}</span> Up
                  </button>
                )}
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
                  <p className="conns-sub">No subfolders — you can select this folder.</p>
                )}
              </div>
            </>
          ) : (
            <p className="conns-sub oms-browse-pick-root">Choose a location on the left to browse folders.</p>
          )}
        </div>
      </div>

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
      <div className="modal oms-browse-modal oms-browse-modal-wide" onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>
  );
}
