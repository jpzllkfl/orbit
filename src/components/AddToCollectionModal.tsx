import { useMemo, useState } from 'react';
import { OT } from '../lib';
import type { OrbitNode } from '../types/orbit';
import { Icons } from './icons';

const I = Icons;

export function AddToCollectionModal({
  tree,
  title,
  onClose,
  onAdd,
}: {
  tree: OrbitNode;
  title: OrbitNode;
  onClose: () => void;
  onAdd: (targetId: string) => void;
}) {
  const parent = OT.findParent(tree, title.id);
  const [q, setQ] = useState('');

  const targets = useMemo(() => {
    const libs = (tree.children || []).filter((n) => n.type === 'library');
    const colls = OT.allCollections(tree, false)
      .map((x) => x.node)
      .filter((n) => n.type === 'collection');
    return [...libs, ...colls];
  }, [tree]);

  const ql = q.trim().toLowerCase();
  const filtered = ql ? targets.filter((n) => (n.title || '').toLowerCase().includes(ql)) : targets;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add to collection</h3>
        <div className="sub">
          Move <strong>{title.title}</strong> into a collection or library. It will be removed from its current location.
        </div>

        <div className="search-field">
          {I.search({})}
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search collections…" />
        </div>

        <div className="merge-list" style={{ maxHeight: 320 }}>
          {filtered.map((n) => {
            const { films, colls } = OT.countDeep(n);
            const here = parent?.id === n.id;
            return (
              <button
                key={n.id}
                type="button"
                className={'merge-row' + (here ? ' on' : '')}
                onClick={() => onAdd(n.id)}
              >
                <span className="merge-row-ic">{n.type === 'library' ? I.lib({}) : I.folder({})}</span>
                <span className="merge-row-body">
                  <span className="merge-row-title">{n.title}</span>
                  <span className="merge-row-sub">
                    {n.type === 'library' ? 'Library' : 'Collection'}
                    {' · '}
                    {films} title{films !== 1 ? 's' : ''}
                    {colls ? ` · ${colls} sub` : ''}
                    {here ? ' · current' : ''}
                  </span>
                </span>
                {here && <span className="merge-row-mark">{I.check({})}</span>}
              </button>
            );
          })}
          {!filtered.length && <div className="empty" style={{ padding: '16px 0' }}>No collections match.</div>}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
