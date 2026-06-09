import { useMemo, useState } from 'react';
import { OT } from '../lib';
import type { OrbitNode } from '../types/orbit';
import { Icons } from './icons';

const I = Icons;

function isValidDest(root: OrbitNode, sourceId: string, node: OrbitNode) {
  if (node.id === sourceId) return false;
  if (node.type !== 'collection') return false;
  const path = OT.idPath(root, node.id);
  return !path.includes(sourceId);
}

export function MergeCollectionsModal({
  tree,
  source: initialSource,
  dest: initialDest,
  onClose,
  onMerge,
}: {
  tree: OrbitNode;
  source?: OrbitNode | null;
  dest?: OrbitNode | null;
  onClose: () => void;
  onMerge: (sourceId: string, destId: string) => void;
}) {
  const all = useMemo(
    () => OT.allCollections(tree, false).map((x) => x.node).filter((n) => n.type === 'collection'),
    [tree],
  );
  const [sourceId, setSourceId] = useState(initialSource?.id || '');
  const [destId, setDestId] = useState(initialDest?.id || '');
  const [q, setQ] = useState('');

  const ql = q.trim().toLowerCase();
  const filterByQuery = (nodes: OrbitNode[]) =>
    ql ? nodes.filter((n) => (n.title || '').toLowerCase().includes(ql)) : nodes;

  const source = all.find((n) => n.id === sourceId) || null;
  const dest = all.find((n) => n.id === destId) || null;
  const sourceOptions = filterByQuery(
    dest ? all.filter((n) => isValidDest(tree, n.id, dest) && n.id !== dest.id) : all,
  );
  const destOptions = source
    ? filterByQuery(all.filter((n) => isValidDest(tree, source.id, n)))
    : filterByQuery(all);

  function merge() {
    if (!source || !dest || source.id === dest.id) return;
    onMerge(source.id, dest.id);
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>Merge collections</h3>
        <div className="sub">
          Combine split collections into one — e.g. three Spider-Man sets become a single collection. Pick what to merge away, then where it goes. Everything from the first moves into the second; the first is removed.
        </div>

        <div className="search-field">
          {I.search({})}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={initialDest ? `Search collections to merge into “${initialDest.title}”…` : 'Search collections…'}
          />
        </div>

        <div className="merge-pick">
          <div className="merge-col">
            <div className="result-head">Merge away (removed)</div>
            <div className="merge-list">
              {sourceOptions.map((n) => {
                const on = sourceId === n.id;
                const { films, colls } = OT.countDeep(n);
                return (
                  <button
                    key={n.id}
                    className={'merge-row' + (on ? ' on' : '')}
                    onClick={() => {
                      setSourceId(n.id);
                      if (destId === n.id) setDestId('');
                    }}
                  >
                    <span className="merge-row-ic">{I.folder({})}</span>
                    <span className="merge-row-body">
                      <span className="merge-row-title">{n.title}</span>
                      <span className="merge-row-sub">
                        {films} title{films !== 1 ? 's' : ''}
                        {colls ? ` · ${colls} sub` : ''}
                      </span>
                    </span>
                    {on && <span className="merge-row-mark">{I.check({})}</span>}
                  </button>
                );
              })}
              {!sourceOptions.length && <div className="empty" style={{ padding: '16px 0' }}>No collections match.</div>}
            </div>
          </div>

          <div className="merge-arrow" aria-hidden>
            {I.chevR({ style: { width: 18, height: 18, transform: 'rotate(90deg)' } })}
          </div>

          <div className="merge-col">
            <div className="result-head">Into (keeps everything)</div>
            <div className="merge-list">
              {!source && !initialDest && (
                <div className="empty" style={{ padding: '16px 0' }}>Pick a collection to merge away first, or open merge from a collection you want to keep.</div>
              )}
              {!source &&
                initialDest &&
                destOptions.map((n) => {
                  const { films, colls } = OT.countDeep(n);
                  return (
                    <button key={n.id} className="merge-row on" disabled>
                      <span className="merge-row-ic">{I.stack({})}</span>
                      <span className="merge-row-body">
                        <span className="merge-row-title">{n.title}</span>
                        <span className="merge-row-sub">
                          {films} title{films !== 1 ? 's' : ''}
                          {colls ? ` · ${colls} sub` : ''} · selected
                        </span>
                      </span>
                      <span className="merge-row-mark">{I.check({})}</span>
                    </button>
                  );
                })}
              {source &&
                destOptions.map((n) => {
                  const on = destId === n.id;
                  const { films, colls } = OT.countDeep(n);
                  return (
                    <button key={n.id} className={'merge-row' + (on ? ' on' : '')} onClick={() => setDestId(n.id)}>
                      <span className="merge-row-ic">{I.stack({})}</span>
                      <span className="merge-row-body">
                        <span className="merge-row-title">{n.title}</span>
                        <span className="merge-row-sub">
                          {films} title{films !== 1 ? 's' : ''}
                          {colls ? ` · ${colls} sub` : ''}
                        </span>
                      </span>
                      {on && <span className="merge-row-mark">{I.check({})}</span>}
                    </button>
                  );
                })}
              {source && !destOptions.length && <div className="empty" style={{ padding: '16px 0' }}>No valid target for this merge.</div>}
            </div>
          </div>
        </div>

        {source && dest && (
          <div className="merge-preview">
            {I.stack({})}
            <span>
              <strong>{source.title}</strong> → <strong>{dest.title}</strong>
            </span>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!source || !dest || source.id === dest.id} onClick={merge}>
            Merge collections
          </button>
        </div>
      </div>
    </div>
  );
}
