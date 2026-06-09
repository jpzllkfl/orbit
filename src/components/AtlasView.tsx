import { Fragment, useMemo, useState, type SVGProps } from 'react';
import { OT } from '../lib';
import type { OrbitNode } from '../types/orbit';
import { SmartLandscape, SmartPoster, meta } from './Posters';

const ic = {
  chev: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  folder: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  film: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  tv: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 21h8M12 3l3 3M12 3L9 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  play: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M7 5v14l12-7z" />
    </svg>
  ),
  stack: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 13l9 5 9-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  open: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};
const titleIcon = (n: OrbitNode) => (n.type === 'show' ? ic.tv : ic.film);

interface RowProps {
  node: OrbitNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  selected: string;
  onSelect: (node: OrbitNode) => void;
  onOpen: (node: OrbitNode) => void;
}

function Row({ node, depth, expanded, toggle, selected, onSelect, onOpen }: RowProps) {
  const coll = OT.isColl(node);
  const isOpen = expanded.has(node.id);
  const sel = selected === node.id;
  const { films, colls } = coll ? OT.countDeep(node) : { films: 0, colls: 0 };
  const hue = meta(coll ? OT.coverFor(node) || node : node).hue;
  return (
    <div
      className={'atl-row' + (sel ? ' sel' : '') + (coll ? ' coll' : ' title')}
      style={{ paddingLeft: 10 + depth * 20 }}
      onClick={() => {
        onSelect(node);
        if (coll) toggle(node.id);
      }}
    >
      <span className="atl-rail" aria-hidden="true"></span>
      <span className={'atl-chev' + (coll ? '' : ' empty') + (isOpen ? ' open' : '')}>
        {coll && (node.children || []).length ? ic.chev({}) : null}
      </span>
      <span className="atl-dot" style={{ ['--d' as string]: hue }}>
        {coll ? ic.folder({}) : titleIcon(node)({})}
      </span>
      <span className="atl-name">{node.title}</span>
      {coll ? (
        <span className="atl-count">
          {films}
          {colls ? <i> · {colls} sub</i> : null}
        </span>
      ) : (
        <span className="atl-meta">
          {node.year || ''}
          {node.genre ? ' · ' + node.genre : ''}
        </span>
      )}
      <button className="atl-open" title="Open in library" onClick={(e) => { e.stopPropagation(); onOpen(node); }}>
        {ic.open({})}
      </button>
    </div>
  );
}

function Branch(props: RowProps) {
  const { node, depth, expanded } = props;
  const isOpen = expanded.has(node.id);
  const kids = node.children || [];
  const ordered = [...kids.filter(OT.isColl), ...kids.filter((c) => !OT.isColl(c))];
  return (
    <div className="atl-branch">
      <Row {...props} />
      {OT.isColl(node) && isOpen && (
        <div className="atl-children">
          {ordered.map((ch) =>
            OT.isColl(ch) ? (
              <Branch key={ch.id} {...props} node={ch} depth={depth + 1} />
            ) : (
              <Row key={ch.id} {...props} node={ch} depth={depth + 1} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

interface DetailProps {
  node: OrbitNode | null;
  tree: OrbitNode;
  onSelect: (node: OrbitNode) => void;
  onOpen: (node: OrbitNode) => void;
  openTitle: (node: OrbitNode) => void;
}

function Detail({ node, tree, onSelect, onOpen, openTitle }: DetailProps) {
  if (!node) return <div className="atl-detail-empty">Select anything in the tree to preview it here.</div>;
  const coll = OT.isColl(node);
  const trail = OT.idPath(tree, node.id)
    .map((id) => OT.findById(tree, id))
    .filter((t): t is OrbitNode => Boolean(t));
  if (!coll) {
    return (
      <div className="atl-detail">
        <div className="atl-bc">
          {trail.map((t, i) => (
            <Fragment key={t.id}>
              <span onClick={() => onSelect(t)} className={i === trail.length - 1 ? 'cur' : ''}>
                {i === 0 ? 'Library' : t.title}
              </span>
              {i < trail.length - 1 && <i>›</i>}
            </Fragment>
          ))}
        </div>
        <div className="atl-d-poster" style={{ position: 'relative' }}>
          <SmartPoster node={node} showTitle={false} />
        </div>
        <div className="atl-d-title disp">{node.title}</div>
        <div className="atl-d-meta">
          {[node.year, node.type === 'show' ? `${node.seasons} season${(node.seasons ?? 0) > 1 ? 's' : ''}` : node.runtime ? node.runtime + ' min' : null, node.genre]
            .filter(Boolean)
            .join('  ·  ')}
        </div>
        {node.tagline ? <div className="atl-d-tag">"{node.tagline}"</div> : null}
        <button className="atl-cta" onClick={() => openTitle(node)}>
          {ic.play({})}Play
        </button>
      </div>
    );
  }
  const { films, colls } = OT.countDeep(node);
  const kids = [...(node.children || []).filter(OT.isColl), ...(node.children || []).filter((c) => !OT.isColl(c))];
  return (
    <div className="atl-detail">
      <div className="atl-bc">
        {trail.map((t, i) => (
          <Fragment key={t.id}>
            <span onClick={() => onSelect(t)} className={i === trail.length - 1 ? 'cur' : ''}>
              {i === 0 ? 'Library' : t.title}
            </span>
            {i < trail.length - 1 && <i>›</i>}
          </Fragment>
        ))}
      </div>
      <div className="atl-d-cover" style={{ position: 'relative' }}>
        <SmartLandscape node={OT.coverFor(node) || node} overrideId={node.id} />
        <span className="atl-d-badge">
          {ic.stack({})}
          {films} title{films !== 1 ? 's' : ''}
          {colls ? ` · ${colls} sub` : ''}
        </span>
      </div>
      <div className="atl-d-title disp">{node.title}</div>
      {node.blurb ? <div className="atl-d-blurb">{node.blurb}</div> : null}
      <button className="atl-cta" onClick={() => onOpen(node)}>
        {ic.open({})}Open in library
      </button>
      {kids.length > 0 && <div className="atl-d-grid-h">Inside</div>}
      <div className="atl-d-grid">
        {kids.slice(0, 12).map((ch) =>
          OT.isColl(ch) ? (
            <button key={ch.id} className="atl-mini coll" onClick={() => onSelect(ch)} title={ch.title}>
              <div className="atl-mini-cover" style={{ position: 'relative' }}>
                <SmartLandscape node={OT.coverFor(ch) || ch} overrideId={ch.id} />
                <span className="atl-mini-stack">{ic.stack({})}</span>
              </div>
              <span className="atl-mini-t">{ch.title}</span>
            </button>
          ) : (
            <button key={ch.id} className="atl-mini" onClick={() => onSelect(ch)} title={ch.title}>
              <div className="atl-mini-poster" style={{ position: 'relative' }}>
                <SmartPoster node={ch} showTitle={false} />
              </div>
              <span className="atl-mini-t">{ch.title}</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

export interface AtlasViewProps {
  tree: OrbitNode;
  currentPath: string[];
  goToNode: (node: OrbitNode) => void;
  openTitle: (node: OrbitNode) => void;
}

export function AtlasView({ tree, currentPath, goToNode, openTitle }: AtlasViewProps) {
  const [expanded, setExpanded] = useState(() => new Set(currentPath || [tree.id]));
  const [selected, setSelected] = useState(() => (currentPath && currentPath[currentPath.length - 1]) || tree.id);
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const selNode = useMemo(() => OT.findById(tree, selected) || tree, [tree, selected]);
  const onSelect = (n: OrbitNode) => {
    setSelected(n.id);
    if (OT.isColl(n)) setExpanded((s) => new Set(s).add(n.id));
  };

  const { films, colls } = OT.countDeep(tree);
  function expandAll() {
    const all = new Set<string>();
    (function w(n: OrbitNode) {
      if (OT.isColl(n)) {
        all.add(n.id);
        (n.children || []).forEach(w);
      }
    })(tree);
    setExpanded(all);
  }
  function collapseAll() {
    setExpanded(new Set([tree.id]));
  }

  return (
    <div className="atlas rise">
      <div className="atl-tree">
        <div className="atl-head">
          <div>
            <div className="atl-head-ey">Atlas</div>
            <h2 className="disp">The whole universe</h2>
            <div className="atl-head-sub">
              {colls} collections · {films} titles · every level at once
            </div>
          </div>
          <div className="atl-head-actions">
            <button onClick={expandAll}>Expand all</button>
            <button onClick={collapseAll}>Collapse</button>
          </div>
        </div>
        <div className="atl-scroll">
          {[...(tree.children || []).filter(OT.isColl), ...(tree.children || []).filter((c) => !OT.isColl(c))].map((ch) =>
            OT.isColl(ch) ? (
              <Branch
                key={ch.id}
                node={ch}
                depth={0}
                expanded={expanded}
                toggle={toggle}
                selected={selected}
                onSelect={onSelect}
                onOpen={goToNode}
              />
            ) : (
              <Row
                key={ch.id}
                node={ch}
                depth={0}
                expanded={expanded}
                toggle={toggle}
                selected={selected}
                onSelect={onSelect}
                onOpen={goToNode}
              />
            ),
          )}
        </div>
      </div>
      <aside className="atl-side">
        <Detail node={selNode} tree={tree} onSelect={onSelect} onOpen={goToNode} openTitle={openTitle} />
      </aside>
    </div>
  );
}
