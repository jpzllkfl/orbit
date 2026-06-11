import { useEffect, useState } from 'react';
import { Lib } from '../lib';
import { countPartsInLibrary, isTitleInLibrary } from '../lib/franchiseMatch';
import { newId } from '../lib/nodeFactory';
import type { OrbitNode } from '../types/orbit';
import { SmartPoster } from './Posters';
import { Icons } from './icons';

const I = Icons;
const IMG_COVER = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', objectFit: 'cover' as const };
const TYPE_CHIP = {
  position: 'absolute' as const,
  left: 8,
  top: 8,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.14em',
  color: '#fff',
  background: 'rgba(0,0,0,0.4)',
  padding: '3px 7px',
  borderRadius: 99,
  border: '1px solid rgba(255,255,255,0.22)',
};

type CollResult = { tmdbId: number; title: string; poster?: string | null; overview?: string };
type TitleResult = { type: string; title: string; year?: number | null; genre?: string; poster?: string | null; tmdbId?: number };

export function AddModal({
  collection,
  onClose,
  onCreate,
  onAddTitle,
  onAddFranchise,
  onAddArchive,
  archive,
  present,
  libraryTitles,
  connected,
  onOpenConnect,
  defaultKind = 'movie',
}: {
  collection: OrbitNode;
  onClose: () => void;
  onCreate: (node: OrbitNode) => void;
  onAddTitle: (r: TitleResult) => void;
  onAddFranchise: (cr: CollResult) => Promise<number>;
  onAddArchive: (node: OrbitNode) => void;
  archive: OrbitNode[];
  present: OrbitNode[];
  libraryTitles: OrbitNode[];
  connected: boolean;
  onOpenConnect: () => void;
  defaultKind?: 'movie' | 'show' | 'collection';
}) {
  const [tab, setTab] = useState(connected ? 'search' : 'manual');
  const [kind, setKind] = useState<'movie' | 'show' | 'collection'>(defaultKind);
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [genre, setGenre] = useState('Sci-Fi');
  const [justAdded, setJustAdded] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [colls, setColls] = useState<CollResult[]>([]);
  const [titles, setTitles] = useState<TitleResult[]>([]);
  const [addedIds, setAddedIds] = useState<number[]>([]);
  const [building, setBuilding] = useState<number | null>(null);
  const [franchiseCounts, setFranchiseCounts] = useState<Record<number, { matched: number; total: number }>>({});
  const presentIds = new Set([...present.map((n) => n.title), ...justAdded]);

  useEffect(() => {
    setKind(defaultKind);
  }, [defaultKind, collection.id]);

  useEffect(() => {
    if (tab !== 'search' || !connected) return;
    const term = q.trim();
    if (!term) {
      setColls([]);
      setTitles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const h = setTimeout(async () => {
      const [c, t] = await Promise.all([Lib.searchCollections(term), Lib.searchTitles(term)]);
      setColls(c);
      setTitles(t);
      setLoading(false);
    }, 350);
    return () => clearTimeout(h);
  }, [q, tab, connected]);

  useEffect(() => {
    if (!colls.length) {
      setFranchiseCounts({});
      return;
    }
    let alive = true;
    (async () => {
      const next: Record<number, { matched: number; total: number }> = {};
      await Promise.all(
        colls.slice(0, 4).map(async (cr) => {
          const parts = await Lib.collectionParts(cr.tmdbId);
          next[cr.tmdbId] = countPartsInLibrary(libraryTitles, parts);
        }),
      );
      if (alive) setFranchiseCounts(next);
    })();
    return () => {
      alive = false;
    };
  }, [colls, libraryTitles]);

  function create() {
    if (!title.trim()) return;
    let node: OrbitNode;
    if (kind === 'collection') node = { id: newId('c'), type: 'collection', title: title.trim(), blurb: '', children: [] };
    else if (kind === 'show') node = { id: newId('s'), type: 'show', title: title.trim(), year: +year || 2025, genre, seasons: 1, tagline: '' };
    else node = { id: newId('m'), type: 'movie', title: title.trim(), year: +year || 2025, genre, runtime: 110, tagline: '' };
    onCreate(node);
    onClose();
  }

  async function buildFranchise(cr: CollResult) {
    if (building) return;
    const counts = franchiseCounts[cr.tmdbId];
    if (counts && counts.matched === 0) return;
    setBuilding(cr.tmdbId);
    const added = await onAddFranchise(cr);
    setBuilding(null);
    if (added > 0) setAddedIds((a) => [...a, cr.tmdbId]);
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add to “{collection.title}”</h3>
        <div className="sub">Search your sources, drop in a whole franchise, or build something by hand.</div>
        <div className="seg">
          <button className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}>
            Search
          </button>
          <button className={tab === 'manual' ? 'on' : ''} onClick={() => setTab('manual')}>
            Create blank
          </button>
          <button className={tab === 'archive' ? 'on' : ''} onClick={() => setTab('archive')}>
            Archive
          </button>
        </div>

        {tab === 'search' &&
          (!connected ? (
            <div className="connect-cta">
              <div className="cta-orb">{I.globe({})}</div>
              <div className="cta-title">Connect to search</div>
              <div className="cta-sub">Link TMDB to search millions of films and series — and pull in entire franchises in one click.</div>
              <button className="btn primary" onClick={onOpenConnect}>
                Connect library
              </button>
            </div>
          ) : (
            <div>
              <div className="search-field">
                {I.search({})}
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder='Try "star wars", "the office", "alien"…' />
              </div>

              {loading && (
                <div className="searching">
                  {I.spark({})}Searching…
                </div>
              )}
              {!loading && !q.trim() && (
                <div className="empty" style={{ padding: '26px 0' }}>
                  Search for a title, or a whole franchise to build as a sub-collection.
                </div>
              )}

              {colls.length > 0 && <div className="result-head">Franchises · only titles already in your library</div>}
              {colls.slice(0, 4).map((cr) => {
                const added = addedIds.includes(cr.tmdbId);
                const isB = building === cr.tmdbId;
                const counts = franchiseCounts[cr.tmdbId];
                const noneOwned = counts?.matched === 0;
                const countLabel = counts
                  ? counts.matched === counts.total
                    ? `${counts.matched} in your library`
                    : `${counts.matched} of ${counts.total} in your library`
                  : 'checking library…';
                return (
                  <button
                    key={cr.tmdbId}
                    className={'franchise-row' + (added ? ' added' : '')}
                    disabled={added || !!building || noneOwned}
                    onClick={() => buildFranchise(cr)}
                  >
                    <div className="fr-thumb">
                      {cr.poster ? <img src={cr.poster} alt="" style={IMG_COVER} /> : <div className="fr-fallback">{I.folder({})}</div>}
                    </div>
                    <div className="fr-info">
                      <div className="fr-name">{cr.title}</div>
                      <div className="fr-sub">
                        Franchise
                        {added ? ' · added' : noneOwned ? ' · none in your library' : ` · ${countLabel}`}
                      </div>
                    </div>
                    <div className="fr-action">
                      {added ? 'Added ✓' : isB ? 'Building…' : noneOwned ? 'Unavailable' : '+ Build'}
                    </div>
                  </button>
                );
              })}

              {titles.length > 0 && <div className="result-head">Titles · in your library only</div>}
              {titles.length > 0 && (
                <div className="archive-grid">
                  {titles.slice(0, 18).map((r) => {
                    const added = r.tmdbId != null && addedIds.includes(r.tmdbId);
                    const owned = isTitleInLibrary(libraryTitles, r);
                    return (
                      <button
                        key={r.tmdbId}
                        className={'archive-item' + (added ? ' added' : '') + (!owned ? ' unavailable' : '')}
                        disabled={added || !owned}
                        title={owned ? undefined : 'Not in your library — add the file to a drive and scan first'}
                        onClick={() => {
                          if (!owned) return;
                          onAddTitle(r);
                          if (r.tmdbId != null) setAddedIds((a) => [...a, r.tmdbId!]);
                        }}
                      >
                        <div className="frame" style={{ position: 'relative', aspectRatio: '2/3', background: '#15110e' }}>
                          {r.poster ? (
                            <img src={r.poster} alt="" style={IMG_COVER} />
                          ) : (
                            <div className="fr-fallback" style={{ position: 'absolute', inset: 0 }}>
                              {r.type === 'show' ? I.tv({}) : I.film({})}
                            </div>
                          )}
                          <div style={TYPE_CHIP}>{r.type === 'show' ? 'SERIES' : 'FILM'}</div>
                        </div>
                        <div className="t">
                          {r.title}
                          {r.year ? ` · ${r.year}` : ''}
                          {added ? ' ✓' : !owned ? ' · not in library' : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {!loading && q.trim() && !colls.length && !titles.length && (
                <div className="empty" style={{ padding: '26px 0' }}>
                  No matches for “{q}”.
                </div>
              )}
            </div>
          ))}

        {tab === 'manual' && (
          <div>
            <div className="type-pick">
              <button className={kind === 'movie' ? 'on' : ''} onClick={() => setKind('movie')}>
                {I.film({})}Film
              </button>
              <button className={kind === 'show' ? 'on' : ''} onClick={() => setKind('show')}>
                {I.tv({})}Series
              </button>
              <button className={kind === 'collection' ? 'on' : ''} onClick={() => setKind('collection')}>
                {I.folder({})}Collection
              </button>
            </div>
            <div className="field">
              <label>{kind === 'collection' ? 'Collection name' : 'Title'}</label>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={kind === 'collection' ? 'e.g. Phase Four' : 'e.g. Children of Mars'}
                onKeyDown={(e) => e.key === 'Enter' && create()}
              />
            </div>
            {kind !== 'collection' && (
              <div className="row2">
                <div className="field">
                  <label>Year</label>
                  <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} placeholder="2025" maxLength={4} />
                </div>
                <div className="field">
                  <label>Genre</label>
                  <select value={genre} onChange={(e) => setGenre(e.target.value)}>
                    {['Sci-Fi', 'Action', 'Thriller', 'Drama', 'Horror', 'Mystery', 'Fantasy', 'Animation'].map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn primary" disabled={!title.trim()} onClick={create}>
                Add {kind === 'collection' ? 'collection' : 'title'}
              </button>
            </div>
          </div>
        )}

        {tab === 'archive' && (
          <div className="archive-grid">
            {archive.map((n) => {
              const added = presentIds.has(n.title);
              return (
                <button
                  key={n.id}
                  className={'archive-item' + (added ? ' added' : '')}
                  onClick={() => {
                    if (!added) {
                      onAddArchive(n);
                      setJustAdded((a) => [...a, n.title]);
                    }
                  }}
                >
                  <div className="frame" style={{ position: 'relative', aspectRatio: '2/3' }}>
                    <SmartPoster node={n} showTitle={false} />
                  </div>
                  <div className="t">
                    {n.title}
                    {added ? ' ✓' : ''}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {(tab === 'search' || tab === 'archive') && (
          <div className="modal-actions">
            <button className="btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
