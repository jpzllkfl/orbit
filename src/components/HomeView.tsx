import { useEffect, useMemo, useRef, useState } from 'react';
import { OT, Plex, Progress } from '../lib';
import { loadPlexContinueWatching, loadPlexOnDeck } from '../lib/plexHubs';
import { titleNodesForRoot } from '../lib/treeIndex';
import type { HomeRow, OrbitNode, PlayPayload, ProgressRecord } from '../types/orbit';
import { CollectionCard, CollectionPoster, useCardMenu } from './Cards';
import { SmartLandscape, SmartPoster } from './Posters';
import { Icons } from './icons';

const ic = Icons;

function shuffle<T>(arr: T[], seed?: number) {
  const a = arr.slice();
  let s = (seed || 1) >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const dedupe = (arr: OrbitNode[]) => {
  const seen = new Set<string>();
  const out: OrbitNode[] = [];
  for (const n of arr) {
    const k = n.title + '|' + (n.year || '');
    if (!seen.has(k)) {
      seen.add(k);
      out.push(n);
    }
  }
  return out;
};

function defaultRowsGlobal(): HomeRow[] {
  return [
    { id: 'r_recent_mov', title: 'Recently Added in Movies', kind: 'recent', ref: 'movies', seed: 0 },
    { id: 'r_collections', title: 'Collections', kind: 'collections', seed: 3 },
    { id: 'r_trending_tv', title: 'Trending Shows', kind: 'library', ref: 'tv', seed: 5 },
    { id: 'r_picked', title: 'Picked for You', kind: 'random', seed: 11 },
    { id: 'r_kids', title: 'For the Kids', kind: 'library', ref: 'kids', seed: 2 },
  ];
}

function defaultRowsScoped(scope: OrbitNode): HomeRow[] {
  const genres = Array.from(new Set(OT.allTitles(scope).map((x) => x.node.genre).filter(Boolean))) as string[];
  const grows = genres.slice(0, 2).map((g, i) => ({
    id: 'r_g_' + g.replace(/\W/g, ''),
    title: g,
    kind: 'genre',
    ref: g,
    seed: 10 + i,
  }));
  const hasColls = OT.allCollections(scope, false).length > 0;
  return [
    { id: 'r_recent', title: 'Recently Added', kind: 'recent', seed: 0 },
    ...(hasColls ? [{ id: 'r_colls', title: 'Collections', kind: 'collections', seed: 3 }] : []),
    ...grows,
    { id: 'r_surprise', title: 'Surprise Picks', kind: 'random', seed: 21 },
  ];
}

function migrateHomeRows(rows: HomeRow[]): HomeRow[] {
  return rows.map((r) => {
    if (r.kind === 'random' && /^recently added/i.test(r.title || '')) return { ...r, kind: 'recent', seed: 0 };
    if (r.id === 'r_recent' && r.kind === 'random') return { ...r, kind: 'recent', seed: 0 };
    if (r.id === 'r_recent_mov' && r.kind === 'library') return { ...r, kind: 'recent', ref: r.ref || 'movies', seed: 0 };
    return r;
  });
}

function loadRows(key: string, def: () => HomeRow[]) {
  try {
    const r = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(r) ? migrateHomeRows(r) : def();
  } catch {
    return def();
  }
}

function saveRows(key: string, r: HomeRow[]) {
  try {
    localStorage.setItem(key, JSON.stringify(r));
  } catch {
    /* ignore quota errors */
  }
}

function CollRowCard({
  node,
  films,
  colls,
  onOpen,
  onEditArt,
  onCollMenu,
  curating,
}: {
  node: OrbitNode;
  films: number;
  colls: number;
  onOpen: (n: OrbitNode) => void;
  onEditArt?: (n: OrbitNode) => void;
  onCollMenu?: (node: OrbitNode, pos: { x: number; y: number }) => void;
  curating?: boolean;
}) {
  const menu = useCardMenu(node, onCollMenu);
  return (
    <button className="h-card h-coll-card" onClick={() => onOpen(node)} title={node.title} {...menu}>
      <div className="h-art">
        <CollectionPoster node={node} />
        <span className="h-coll-chip">{ic.folder({})}</span>
        {onEditArt && (
          <div
            className={'art-badge' + (curating ? ' show' : '')}
            title="Change poster"
            onClick={(e) => {
              e.stopPropagation();
              onEditArt(node);
            }}
          >
            {ic.image({})}
          </div>
        )}
      </div>
      <div className="h-t">{node.title}</div>
      <div className="h-s">
        {films} title{films !== 1 ? 's' : ''}
        {colls ? ` · ${colls} nested` : ''}
      </div>
    </button>
  );
}

function PosterCard({
  node,
  sub,
  onOpen,
  collection,
  rec,
  onPlay,
  onEditArt,
  onTitleMenu,
  onCollMenu,
  curating,
  wideColl,
}: {
  node: OrbitNode;
  sub?: string;
  onOpen: (n: OrbitNode) => void;
  collection?: boolean;
  rec?: ProgressRecord;
  onPlay?: () => void;
  onEditArt?: (n: OrbitNode) => void;
  onTitleMenu?: (node: OrbitNode, pos: { x: number; y: number }) => void;
  onCollMenu?: (node: OrbitNode, pos: { x: number; y: number }) => void;
  curating?: boolean;
  wideColl?: boolean;
}) {
  if (collection) {
    if (wideColl) {
      const { films, colls } = OT.countDeep(node);
      return (
        <CollRowCard
          node={node}
          films={films}
          colls={colls}
          onOpen={onOpen}
          onEditArt={onEditArt}
          onCollMenu={onCollMenu}
          curating={curating}
        />
      );
    }
    return (
      <CollectionCard
        node={node}
        onOpen={onOpen}
        onEditArt={onEditArt}
        onMenu={onCollMenu}
        curating={curating}
        variant="grid"
      />
    );
  }

  const menu = useCardMenu(node, onTitleMenu);
  return (
    <button
      className="h-card"
      onClick={() => (rec ? onPlay?.() : onOpen(node))}
      title={node.title}
      {...menu}
    >
      <div className="h-art">
        <SmartPoster node={node} showTitle={false} />
        {onEditArt && (
          <div
            className={'art-badge' + (curating ? ' show' : '')}
            title="Change artwork"
            onClick={(e) => {
              e.stopPropagation();
              onEditArt(node);
            }}
          >
            {ic.image({})}
          </div>
        )}
        <span className="h-play">{ic.play({})}</span>
        {rec && (
          <span className="h-prog">
            <i style={{ width: Math.round((rec.pct || 0) * 100) + '%' }}></i>
          </span>
        )}
      </div>
      <div className="h-t">{node.title}</div>
      {sub && <div className="h-s">{sub}</div>}
    </button>
  );
}

function LibCard({
  node,
  onOpen,
  onEditArt,
  curating,
}: {
  node: OrbitNode;
  onOpen: (n: OrbitNode) => void;
  onEditArt?: (n: OrbitNode) => void;
  curating?: boolean;
}) {
  const { films, colls } = OT.countDeep(node);
  return (
    <button className="h-libcard" onClick={() => onOpen(node)} title={node.title}>
      <div className="h-lib-art">
        <SmartLandscape node={OT.coverFor(node) || node} overrideId={node.id} />
        {onEditArt && (
          <div
            className={'art-badge' + (curating ? ' show' : '')}
            title="Change artwork"
            onClick={(e) => {
              e.stopPropagation();
              onEditArt(node);
            }}
          >
            {ic.image({})}
          </div>
        )}
        <div className="h-lib-scrim"></div>
        <div className="h-lib-meta">
          <div className="disp">{node.title}</div>
          <div>
            {films} titles · {colls} collections
          </div>
        </div>
      </div>
    </button>
  );
}

function Row({
  row,
  items,
  editing,
  onOpen,
  onPlay,
  onRemove,
  onMove,
  onRandomize,
  onEditArt,
  onEditCollArt,
  onTitleMenu,
  onCollMenu,
  curating,
}: {
  row: HomeRow;
  items: OrbitNode[] | ProgressRecord[];
  editing: boolean;
  onOpen: (n: OrbitNode) => void;
  onPlay: (p: PlayPayload) => void;
  onRemove: () => void;
  onMove: (d: number) => void;
  onRandomize: () => void;
  onEditArt?: (n: OrbitNode) => void;
  onEditCollArt?: (n: OrbitNode) => void;
  onTitleMenu?: (node: OrbitNode, pos: { x: number; y: number }) => void;
  onCollMenu?: (node: OrbitNode, pos: { x: number; y: number }) => void;
  curating?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  if (!items.length && !editing) return null;
  const canRandom = ['random', 'library', 'genre', 'collections'].includes(row.kind);
  return (
    <section className="h-rowsec">
      <div className="h-rowhead">
        <h2>{row.title}</h2>
        <div className="h-rowctl">
          {editing ? (
            <>
              {canRandom && (
                <button onClick={onRandomize} title="Randomize">
                  {ic.dice({})}
                </button>
              )}
              <button onClick={() => onMove(-1)} title="Move up">
                {ic.up({})}
              </button>
              <button onClick={() => onMove(1)} title="Move down">
                {ic.down({})}
              </button>
              <button className="danger" onClick={onRemove} title="Remove row">
                {ic.x({})}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => scroll(-1)}>{ic.chevL({})}</button>
              <button onClick={() => scroll(1)}>{ic.chevR({})}</button>
            </>
          )}
        </div>
      </div>
      <div className={'h-row' + (row.kind === 'libraries' ? ' libs' : '') + (row.kind === 'collections' ? ' colls' : '')} ref={scroller}>
        {items.map((it, i) => {
          if (row.kind === 'continue') {
            const rec = it as ProgressRecord;
            return (
              <PosterCard
                key={rec.key}
                node={rec.node}
                rec={rec}
                sub={rec.episode ? `S${rec.episode.season} · E${rec.episode.n}` : String(rec.node.year || '')}
                onPlay={() => onPlay({ node: rec.node, episode: rec.episode })}
                onOpen={onOpen}
                onTitleMenu={onTitleMenu}
              />
            );
          }
          if (row.kind === 'libraries') {
            return (
              <LibCard
                key={(it as OrbitNode).id}
                node={it as OrbitNode}
                onOpen={onOpen}
                onEditArt={onEditCollArt}
                curating={curating}
              />
            );
          }
          const node = it as OrbitNode;
          const coll = node.type === 'collection' || node.type === 'library';
          return (
            <PosterCard
              key={node.id + '_' + i}
              node={node}
              collection={coll}
              wideColl={row.kind === 'collections'}
              sub={[node.year, node.type === 'show' ? 'Series' : node.genre].filter(Boolean).join(' · ')}
              onOpen={onOpen}
              onEditArt={coll ? onEditCollArt : onEditArt}
              onTitleMenu={onTitleMenu}
              onCollMenu={onCollMenu}
              curating={curating}
            />
          );
        })}
      </div>
    </section>
  );
}

function AddRowModal({
  scope,
  tree,
  libs,
  scoped,
  onClose,
  onAdd,
}: {
  scope: OrbitNode | null;
  tree: OrbitNode;
  libs: OrbitNode[];
  scoped: boolean;
  onClose: () => void;
  onAdd: (row: HomeRow) => void;
}) {
  const root = scope || tree;
  const colls = useMemo(() => OT.allCollections(root, false).map((x) => x.node), [root]);
  const genres = useMemo(
    () => Array.from(new Set(OT.allTitles(root).map((x) => x.node.genre).filter(Boolean))).sort() as string[],
    [root],
  );
  const sources = scoped
    ? [
        ['recent', 'Recently Added'],
        ['random', 'Random Mix'],
        ['genre', 'Genre'],
        ['collection', 'Collection'],
        ['collections', 'All Collections'],
        ['continue', 'Continue'],
      ]
    : [
        ['recent', 'Recently Added'],
        ['library', 'Library'],
        ['collection', 'Collection'],
        ['genre', 'Genre'],
        ['collections', 'All Collections'],
        ['random', 'Random Mix'],
        ['continue', 'Continue'],
      ];
  const [kind, setKind] = useState(sources[0][0]);
  const [ref, setRef] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (kind === 'library') {
      setRef(libs[0]?.libKey || '');
      setTitle('From ' + (libs[0]?.title || ''));
    } else if (kind === 'collection') {
      setRef(colls[0]?.id || '');
      setTitle(colls[0]?.title || 'Collection');
    } else if (kind === 'genre') {
      setRef(genres[0] || '');
      setTitle((genres[0] || '') + ' Picks');
    } else if (kind === 'collections') setTitle('Collections');
    else if (kind === 'recent') {
      if (!scoped && !ref) setRef(libs[0]?.libKey || '');
      const lib = libs.find((l) => l.libKey === ref);
      setTitle(lib ? `Recently Added in ${lib.title}` : 'Recently Added');
    } else if (kind === 'random') setTitle('Surprise Mix');
    else if (kind === 'continue') setTitle('Continue Watching');
  }, [kind, libs, colls, genres]);

  function add() {
    onAdd({
      id: 'r_' + Math.random().toString(36).slice(2, 8),
      title: title.trim() || 'My Row',
      kind,
      ref,
      seed: Math.floor(Math.random() * 9999),
    });
    onClose();
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add a row</h3>
        <div className="sub">
          Mix anything into a row —{' '}
          {scoped
            ? 'a collection, a genre, or a random surprise from this library.'
            : 'a whole library, one collection, a genre, your collections, or a random surprise.'}
        </div>
        <div className="field">
          <label>Source</label>
          <div className="hr-seg">
            {sources.map(([k, l]) => (
              <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {kind === 'library' && (
          <div className="field">
            <label>Which library</label>
            <select
              value={ref}
              onChange={(e) => {
                setRef(e.target.value);
                setTitle('From ' + (libs.find((l) => l.libKey === e.target.value)?.title || ''));
              }}
            >
              {libs.map((l) => (
                <option key={l.libKey} value={l.libKey}>
                  {l.title}
                </option>
              ))}
            </select>
          </div>
        )}
        {kind === 'recent' && !scoped && (
          <div className="field">
            <label>Which library</label>
            <select
              value={ref}
              onChange={(e) => {
                setRef(e.target.value);
                const lib = libs.find((l) => l.libKey === e.target.value);
                setTitle(lib ? `Recently Added in ${lib.title}` : 'Recently Added');
              }}
            >
              <option value="">All libraries</option>
              {libs.map((l) => (
                <option key={l.libKey} value={l.libKey}>
                  {l.title}
                </option>
              ))}
            </select>
          </div>
        )}
        {kind === 'collection' && (
          <div className="field">
            <label>Which collection</label>
            <select
              value={ref}
              onChange={(e) => {
                setRef(e.target.value);
                setTitle(colls.find((c) => c.id === e.target.value)?.title || 'Collection');
              }}
            >
              {colls.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}
        {kind === 'genre' && (
          <div className="field">
            <label>Which genre</label>
            <select
              value={ref}
              onChange={(e) => {
                setRef(e.target.value);
                setTitle(e.target.value + ' Picks');
              }}
            >
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label>Row title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Row title" />
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={add}>
            Add row
          </button>
        </div>
      </div>
    </div>
  );
}

export interface HomeViewProps {
  tree: OrbitNode;
  libs: OrbitNode[];
  scope?: OrbitNode;
  storeKey?: string;
  bare?: boolean;
  onOpen: (n: OrbitNode) => void;
  onPlay: (p: PlayPayload) => void;
  onEditArt?: (n: OrbitNode) => void;
  onEditCollArt?: (n: OrbitNode) => void;
  onTitleMenu?: (node: OrbitNode, pos: { x: number; y: number }) => void;
  onCollMenu?: (node: OrbitNode, pos: { x: number; y: number }) => void;
  curating?: boolean;
  cwVer?: number;
}

export function HomeView({
  tree,
  libs,
  scope,
  storeKey,
  bare,
  onOpen,
  onPlay,
  onEditArt,
  onEditCollArt,
  onTitleMenu,
  onCollMenu,
  curating = false,
  cwVer = 0,
}: HomeViewProps) {
  const root = scope || tree;
  const isGlobal = !scope || scope.id === tree.id;
  const key = storeKey || 'orbit.home.rows.v1';
  const def = () => (isGlobal ? defaultRowsGlobal() : defaultRowsScoped(root));
  const [rows, setRows] = useState(() => loadRows(key, def));
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const rowEditing = editing || curating;

  useEffect(() => {
    setRows(loadRows(key, def));
    setEditing(false);
  }, [key]);

  useEffect(() => {
    saveRows(key, rows);
  }, [rows, key]);

  const allTitles = useMemo(() => dedupe(titleNodesForRoot(tree, isGlobal ? null : root)), [root.id, tree, cwVer, isGlobal]);
  const allColls = useMemo(() => OT.allCollections(root, false).map((x) => x.node), [root.id, tree, cwVer]);
  const scopeIds = useMemo(() => new Set(allTitles.map((n) => n.id)), [allTitles]);
  const [plexCw, setPlexCw] = useState<ProgressRecord[]>([]);
  const [plexDeck, setPlexDeck] = useState<ProgressRecord[]>([]);

  useEffect(() => {
    if (!Plex.connected || !isGlobal) {
      setPlexCw([]);
      setPlexDeck([]);
      return;
    }
    let alive = true;
    Promise.all([loadPlexContinueWatching(tree), loadPlexOnDeck(tree)]).then(([cw, deck]) => {
      if (!alive) return;
      setPlexCw(cw);
      setPlexDeck(deck);
    });
    return () => {
      alive = false;
    };
  }, [tree, cwVer, isGlobal]);

  const cw = useMemo(() => {
    const list =
      Plex.connected && plexCw.length
        ? plexCw
        : Progress.list().map((rec) => {
            const full = OT.findById(tree, rec.node.id);
            return full ? { ...rec, node: full } : rec;
          });
    return list.filter((r) => (isGlobal ? true : scopeIds.has(r.node.id)));
  }, [plexCw, scopeIds, cwVer, isGlobal, tree]);

  function itemsFor(row: HomeRow): OrbitNode[] | ProgressRecord[] {
    switch (row.kind) {
      case 'continue':
        return cw;
      case 'libraries':
        return libs;
      case 'collections':
        return shuffle(allColls, row.seed).slice(0, 20);
      case 'random':
        return shuffle(allTitles, row.seed).slice(0, 20);
      case 'recent': {
        const lib = row.ref ? libs.find((l) => l.libKey === row.ref) : null;
        const pool = dedupe(titleNodesForRoot(tree, lib || (isGlobal ? null : root)));
        const dated = pool.filter((n) => n.addedAt);
        if (dated.length) {
          return dated.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, 20);
        }
        return pool.slice(0, 20);
      }
      case 'genre':
        return shuffle(
          allTitles.filter((n) => n.genre === row.ref),
          row.seed,
        ).slice(0, 20);
      case 'library': {
        const lib = libs.find((l) => l.libKey === row.ref);
        if (!lib) return [];
        return shuffle(dedupe(titleNodesForRoot(tree, lib)), row.seed).slice(0, 20);
      }
      case 'collection': {
        const c = OT.findById(tree, row.ref || '');
        if (!c) return [];
        return dedupe(titleNodesForRoot(tree, c)).slice(0, 20);
      }
      default:
        return [];
    }
  }

  const rowItems = useMemo(() => rows.map((row) => ({ row, items: itemsFor(row) })), [rows, allTitles, allColls, libs, cw, tree]);

  const move = (i: number, d: number) =>
    setRows((rs) => {
      const a = rs.slice();
      const j = i + d;
      if (j < 0 || j >= a.length) return rs;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  const remove = (i: number) => setRows((rs) => rs.filter((_, k) => k !== i));
  const randomize = (i: number) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, seed: Math.floor(Math.random() * 99999) } : r)));

  return (
    <div className={'home' + (bare ? ' bare' : '') + (curating ? ' curating' : '')}>
      {bare ? (
        <div className="home-bar">
          {!curating && (
            <button className={'home-edit' + (editing ? ' on' : '')} onClick={() => setEditing((e) => !e)}>
              {ic.edit({})}
              {editing ? 'Done' : 'Edit rows'}
            </button>
          )}
          <button className="home-add" onClick={() => setAdding(true)}>
            {ic.plus({})}Add row
          </button>
        </div>
      ) : (
        <div className="home-top">
          <div>
            <div className="home-ey">Home</div>
            <h1 className="disp">Everything in orbit</h1>
          </div>
          <div className="home-actions">
            {!curating && (
              <button className={'home-edit' + (editing ? ' on' : '')} onClick={() => setEditing((e) => !e)}>
                {ic.edit({})}
                {editing ? 'Done' : 'Edit home'}
              </button>
            )}
            <button className="home-add" onClick={() => setAdding(true)}>
              {ic.plus({})}Add row
            </button>
          </div>
        </div>
      )}

      {curating && (
        <p className="curate-hint home-curate-hint">
          Tap the image icon on any card to edit artwork · use row controls to reorder or remove rows
          {isGlobal ? ' · drag libraries at the top to reorder Movies, TV, etc.' : ''}
        </p>
      )}

      {cw.length > 0 && (
        <Row
          row={{ id: 'cw', title: 'Continue Watching', kind: 'continue' }}
          items={cw}
          editing={false}
          onOpen={onOpen}
          onPlay={onPlay}
          onRemove={() => {}}
          onMove={() => {}}
          onRandomize={() => {}}
          onEditArt={onEditArt}
          onEditCollArt={onEditCollArt}
          onTitleMenu={onTitleMenu}
          onCollMenu={onCollMenu}
        />
      )}
      {plexDeck.length > 0 && isGlobal && !curating && (
        <Row
          row={{ id: 'deck', title: 'On Deck', kind: 'continue' }}
          items={plexDeck}
          editing={false}
          onOpen={onOpen}
          onPlay={onPlay}
          onRemove={() => {}}
          onMove={() => {}}
          onRandomize={() => {}}
          onEditArt={onEditArt}
          onEditCollArt={onEditCollArt}
          onTitleMenu={onTitleMenu}
          onCollMenu={onCollMenu}
        />
      )}
      {isGlobal && !curating && (
        <Row
          row={{ id: 'libs', title: 'Your Libraries', kind: 'libraries' }}
          items={libs}
          editing={false}
          onOpen={onOpen}
          onPlay={onPlay}
          onRemove={() => {}}
          onMove={() => {}}
          onRandomize={() => {}}
          onEditArt={onEditArt}
          onEditCollArt={onEditCollArt}
          onTitleMenu={onTitleMenu}
          onCollMenu={onCollMenu}
          curating={curating}
        />
      )}

      {rowItems.map(({ row, items }, i) => (
        <Row
          key={row.id}
          row={row}
          items={items}
          editing={rowEditing}
          onOpen={onOpen}
          onPlay={onPlay}
          onRemove={() => remove(i)}
          onMove={(d) => move(i, d)}
          onRandomize={() => randomize(i)}
          onEditArt={onEditArt}
          onEditCollArt={onEditCollArt}
          onTitleMenu={onTitleMenu}
          onCollMenu={onCollMenu}
          curating={curating}
        />
      ))}

      {rowEditing && (
        <button className="home-addrow" onClick={() => setAdding(true)}>
          {ic.plus({})}Add another row
        </button>
      )}
      {adding && (
        <AddRowModal
          scope={isGlobal ? null : root}
          scoped={!isGlobal}
          tree={tree}
          libs={libs}
          onClose={() => setAdding(false)}
          onAdd={(r) => setRows((rs) => [...rs, r])}
        />
      )}
    </div>
  );
}
