import { memo, useContext, useEffect, useRef, useState } from 'react';
import { Lib, OT, Plex } from '../lib';
import { plexArtFromNode } from '../lib/importUtils';
import { asyncHeroBackdrop, syncHeroBackdrop } from '../lib/heroArt';
import { hiResBackdrop } from '../lib/artUrls';
import type { OrbitNode } from '../types/orbit';
import { ArtCtx, ArtView, SmartPoster } from './Posters';
import { Icons } from './icons';

const I = Icons;

export function useCardMenu(node: OrbitNode, onMenu?: (node: OrbitNode, pos: { x: number; y: number }) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onContextMenu: (e: React.MouseEvent) => {
      if (!onMenu) return;
      e.preventDefault();
      e.stopPropagation();
      onMenu(node, { x: e.clientX, y: e.clientY });
    },
    onTouchStart: (e: React.TouchEvent) => {
      if (!onMenu || e.touches.length !== 1) return;
      const t = e.touches[0];
      clear();
      timer.current = setTimeout(() => onMenu(node, { x: t.clientX, y: t.clientY }), 480);
    },
    onTouchEnd: clear,
    onTouchMove: clear,
  };
}

export type CardDnd = {
  cls: string;
  props: React.HTMLAttributes<HTMLButtonElement> & { draggable?: boolean };
};

export function AddTile({ label, onClick, ratio = '2 / 3' }: { label: string; onClick: () => void; ratio?: string }) {
  return (
    <button className="add-tile card" style={{ aspectRatio: ratio }} onClick={onClick}>
      {I.plus({})}
      <span className="lbl">{label}</span>
    </button>
  );
}

export const TitleCard = memo(function TitleCard({
  node,
  onOpen,
  onRemove,
  curating,
  dnd,
  onEditArt,
  onMenu,
  selected,
  onSel,
}: {
  node: OrbitNode;
  onOpen: (n: OrbitNode) => void;
  onRemove?: (n: OrbitNode) => void;
  curating?: boolean;
  dnd?: CardDnd | null;
  onEditArt?: (n: OrbitNode) => void;
  onMenu?: (node: OrbitNode, pos: { x: number; y: number }) => void;
  selected?: boolean;
  onSel?: (n: OrbitNode) => void;
}) {
  const menu = useCardMenu(node, onMenu);
  return (
    <button
      className={'card ' + (dnd?.cls || '') + (selected ? ' selected' : '')}
      {...(dnd?.props || {})}
      {...menu}
      onClick={() => (curating && onSel ? onSel(node) : onOpen(node))}
    >
      <div className="frame" style={{ aspectRatio: '2 / 3' }}>
        <SmartPoster node={node} />
        <div className="play">
          <span>{I.play({})}</span>
        </div>
      </div>
      {curating && <div className={'sel-check' + (selected ? ' on' : '')}>{selected ? I.check({}) : null}</div>}
      {curating && onRemove && (
        <div className="rm-badge show" title="Remove" onClick={(e) => { e.stopPropagation(); onRemove(node); }}>
          {I.x({})}
        </div>
      )}
      {onEditArt && (
        <div
          className={'art-badge' + (curating ? ' show' : '')}
          title="Change artwork"
          onClick={(e) => {
            e.stopPropagation();
            onEditArt(node);
          }}
        >
          {I.image({})}
        </div>
      )}
      <div className="card-foot">
        <div className="t">{node.title}</div>
        <div className="sub">
          {node.type === 'show' ? (
            <span>
              {node.seasons} season{node.seasons && node.seasons > 1 ? 's' : ''}
            </span>
          ) : node.runtime ? (
            <span>{node.runtime}m</span>
          ) : null}
          {node.genre && <span className={node.type === 'movie' && node.runtime ? 'dotsep' : ''}>{node.genre}</span>}
        </div>
      </div>
    </button>
  );
});

const collArtCache: Record<string, string | null> = {};

function plexThumbForNode(n: OrbitNode | null | undefined) {
  if (!n?.plexKey || !Plex.connected) return null;
  return Plex.imgUrl('/library/metadata/' + n.plexKey + '/thumb', 'card');
}

function collectionCoverArt(node: OrbitNode) {
  const ov = Lib.getOverride(node.id);
  if (ov?.poster) return ov.poster;
  if (node.poster) return node.poster;
  if (collArtCache[node.id]) return collArtCache[node.id];
  const cover = OT.coverFor(node);
  const fromCover = plexThumbForNode(cover) || plexArtFromNode(cover)?.poster;
  if (fromCover) collArtCache[node.id] = fromCover;
  if (node.plexKey) {
    const fromColl = Plex.imgUrl('/library/metadata/' + node.plexKey + '/composite', 'card');
    if (fromColl) return fromColl;
  }
  return fromCover || null;
}

export function CollectionPoster({ node }: { node: OrbitNode }) {
  const cover = OT.coverFor(node) || node;
  const [poster, setPoster] = useState<string | null>(() => collectionCoverArt(node));
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [node.id]);

  useEffect(() => {
    if (!visible) return;
    const p = collectionCoverArt(node);
    if (p) setPoster(p);
  }, [node.id, visible, node.poster]);

  if (poster) {
    return (
      <div ref={wrapRef} style={{ position: 'absolute', inset: 0, background: '#0b0e14' }}>
        <img src={poster} alt="" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0 }}>
      {visible ? <SmartPoster node={cover} showTitle={false} /> : <ArtView node={cover} />}
    </div>
  );
}

function HeroBackdropImg({ node, rep, eager = false }: { node: OrbitNode; rep?: OrbitNode; eager?: boolean }) {
  const artRev = useContext(ArtCtx);
  const subject = rep || node;
  const imgRef = useRef<HTMLImageElement>(null);
  const [url, setUrl] = useState<string | null>(() => syncHeroBackdrop(node));
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fails = useRef(0);

  useEffect(() => {
    let alive = true;
    fails.current = 0;
    setLoaded(false);
    const sync = syncHeroBackdrop(node);
    if (sync) {
      setUrl(sync);
      return;
    }
    setUrl(null);
    asyncHeroBackdrop(node).then((u) => {
      if (alive && u) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [node.id, node.plexKey, node.backdrop, node.poster, node.title, artRev]);

  useEffect(() => {
    setDisplaySrc(null);
    setLoaded(false);
    setDisplaySrc(url);
  }, [url, node.id]);

  useEffect(() => {
    setLoaded(false);
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) setLoaded(true);
  }, [displaySrc]);

  const finishLoad = () => setLoaded(true);

  const onError = () => {
    fails.current += 1;
    if (fails.current === 1 && node.plexKey && Plex.connected) {
      const art = Plex.imgUrl('/library/metadata/' + node.plexKey + '/art', 'backdrop');
      const thumb = Plex.imgUrl('/library/metadata/' + node.plexKey + '/thumb', 'backdrop');
      const fallback = art || thumb;
      if (fallback) {
        setUrl(hiResBackdrop(fallback));
        return;
      }
    }
    if (fails.current <= 2) {
      Lib.resolveTmdb(node)
        .then((r) => {
          const u = r && hiResBackdrop(r.backdrop || r.poster);
          if (u) setUrl(u);
        })
        .catch(() => {});
    }
  };

  return (
    <>
      <div className="spot-bg-fallback">
        <ArtView node={subject} />
      </div>
      {displaySrc && (
        <div className="spot-bg-fit">
          <img
            ref={imgRef}
            src={displaySrc}
            alt=""
            loading={eager ? 'eager' : 'lazy'}
            decoding={eager ? 'sync' : 'async'}
            fetchPriority={eager ? 'high' : 'auto'}
            className={'spot-bg-img' + (loaded ? ' loaded' : '')}
            onLoad={finishLoad}
            onError={() => {
              finishLoad();
              onError();
            }}
          />
        </div>
      )}
    </>
  );
}

function CollectionBackdrop({ node }: { node: OrbitNode }) {
  const rep = OT.coverFor(node) || node;
  return <HeroBackdropImg node={node} rep={rep} />;
}

export const CollectionCard = memo(function CollectionCard({
  node,
  onOpen,
  onRemove,
  onMerge,
  curating,
  dnd,
  onEditArt,
  onMenu,
  variant = 'grid',
}: {
  node: OrbitNode;
  onOpen: (n: OrbitNode) => void;
  onRemove?: (n: OrbitNode) => void;
  onMerge?: (n: OrbitNode) => void;
  curating?: boolean;
  dnd?: CardDnd | null;
  onEditArt?: (n: OrbitNode) => void;
  onMenu?: (node: OrbitNode, pos: { x: number; y: number }) => void;
  variant?: 'grid' | 'scroll';
}) {
  const wide = variant === 'scroll';
  const menu = useCardMenu(node, onMenu);
  return (
    <button
      className={'card coll-card ' + (wide ? 'scroll ' : 'portrait ') + (dnd?.cls || '')}
      title={node.title}
      {...(dnd?.props || {})}
      {...menu}
      onClick={() => onOpen(node)}
    >
      {wide ? (
        <div className="frame coll-frame" style={{ aspectRatio: '16 / 9' }}>
          <div className="coll-bd-layer">
            <CollectionBackdrop node={node} />
          </div>
          <div className="coll-poster-layer wide">
            <CollectionPoster node={node} />
          </div>
          <div className="play">
            <span>{I.folder({})}</span>
          </div>
        </div>
      ) : (
        <div className="frame" style={{ aspectRatio: '2 / 3' }}>
          <CollectionPoster node={node} />
          <div className="play">
            <span>{I.folder({})}</span>
          </div>
        </div>
      )}
      {curating && onMerge && node.type === 'collection' && (
        <div className="merge-badge show" title="Merge into another collection" onClick={(e) => { e.stopPropagation(); onMerge(node); }}>
          {I.stack({})}
        </div>
      )}
      {curating && onRemove && (
        <div className="rm-badge show" title="Remove" onClick={(e) => { e.stopPropagation(); onRemove(node); }}>
          {I.x({})}
        </div>
      )}
      {onEditArt && (
        <div
          className={'art-badge' + (curating ? ' show' : '')}
          title="Change poster"
          onClick={(e) => {
            e.stopPropagation();
            onEditArt(node);
          }}
        >
          {I.image({})}
        </div>
      )}
    </button>
  );
});

export function CollectionHeroArt({ node }: { node: OrbitNode }) {
  const rep = OT.coverFor(node) || node;
  return (
    <div className="coll-bd" aria-hidden="true">
      <div className="coll-bd-img">
        <HeroBackdropImg node={node} rep={rep} />
      </div>
      <div className="coll-bd-scrim"></div>
    </div>
  );
}

function SpotArt({ node }: { node: OrbitNode }) {
  return (
    <div className="spot-bg" key={node.id}>
      <HeroBackdropImg node={node} eager />
      <div className="spot-scrim"></div>
    </div>
  );
}

function CollectionSpotArt({ node }: { node: OrbitNode }) {
  return (
    <div className="spot-bg" key={node.id}>
      <div className="coll-bd-layer">
        <CollectionBackdrop node={node} />
      </div>
      <div className="spot-scrim"></div>
    </div>
  );
}

export function FeaturedCollectionsHero({
  library,
  collections,
  onOpen,
}: {
  library: OrbitNode;
  collections: OrbitNode[];
  onOpen: (n: OrbitNode) => void;
}) {
  const items = collections.length ? collections : [];
  const resetKey = library.id + ':' + items.length;
  const { i, setI, setPaused, prev, next, touchHandlers } = useSpotCarousel(items.length, resetKey);

  if (!items.length) return null;

  const cur = items[i];
  const { films, colls } = OT.countDeep(cur);

  const chev = (d: string) => (
    <svg viewBox="0 0 24 24" fill="none">
      <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div
      className="spot spot-coll"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      {...touchHandlers}
    >
      <CollectionSpotArt node={cur} />
      <div className="spot-content spot-coll-content">
        <div className="spot-ey">
          <span className="dot"></span>
          {library.title} · Featured collections
        </div>
        <div className="spot-coll-poster" key={cur.id}>
          <CollectionPoster node={cur} />
        </div>
        <div className="spot-meta">
          {films} title{films !== 1 ? 's' : ''}
          {colls ? ` · ${colls} sub-collection${colls > 1 ? 's' : ''}` : ''}
        </div>
        <div className="spot-actions">
          <button type="button" className="spot-play" onClick={() => onOpen(cur)}>
            {I.folder({})}Open collection
          </button>
        </div>
      </div>
      {items.length > 1 && (
        <div className="spot-toolbar">
          <button type="button" className="spot-nav left" onClick={prev} aria-label="Previous collection">
            {chev('M15 6l-6 6 6 6')}
          </button>
          <div className="spot-dots">
            {items.map((_, k) => (
              <button key={k} type="button" className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={'Collection ' + (k + 1)} />
            ))}
          </div>
          <button type="button" className="spot-nav right" onClick={next} aria-label="Next collection">
            {chev('M9 6l6 6-6 6')}
          </button>
        </div>
      )}
    </div>
  );
}

function useSpotCarousel(count: number, resetKey: string) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    setI(0);
  }, [resetKey, count]);

  useEffect(() => {
    if (paused || count < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % count), 6500);
    return () => clearInterval(id);
  }, [paused, count, resetKey]);

  const prev = () => setI((x) => (x - 1 + count) % count);
  const next = () => setI((x) => (x + 1) % count);

  const touchHandlers =
    count < 2
      ? {}
      : {
          onTouchStart: (e: React.TouchEvent) => {
            touchX.current = e.touches[0]?.clientX ?? null;
          },
          onTouchEnd: (e: React.TouchEvent) => {
            if (touchX.current == null) return;
            const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) < 44) return;
            if (dx < 0) next();
            else prev();
          },
        };

  return { i, setI, paused, setPaused, prev, next, touchHandlers };
}

export function SpotlightHero({
  node,
  titles,
  label,
  eyebrow,
  onPlay,
  onInfo,
}: {
  node: OrbitNode;
  titles?: OrbitNode[];
  label?: string;
  eyebrow?: string;
  onPlay: (t: OrbitNode) => void;
  onInfo: (t: OrbitNode) => void;
}) {
  const items =
    titles?.length
      ? titles
      : node.type === 'movie' || node.type === 'show'
        ? [node]
        : [];
  const resetKey = node.id + ':' + items.length;
  const { i, setI, setPaused, prev, next, touchHandlers } = useSpotCarousel(Math.max(items.length, 1), resetKey);

  if (!items.length) return null;

  const cur = items[i] || node;
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLogo(null);
    Lib.resolveLogo(cur)
      .then((u) => {
        if (alive) setLogo(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cur.id]);

  const chev = (d: string) => (
    <svg viewBox="0 0 24 24" fill="none">
      <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const meta = [cur.year, cur.type === 'show' ? cur.seasons + ' season' + (cur.seasons && cur.seasons > 1 ? 's' : '') : cur.runtime ? cur.runtime + ' min' : null, cur.genre, cur.rating]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <div
      className="spot"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      {...touchHandlers}
    >
      <SpotArt node={cur} />
      <div className="spot-content">
        <div className="spot-ey">
          <span className="dot"></span>
          {eyebrow || node.title + ' · ' + (label || 'Featured')}
        </div>
        {logo ? (
          <img className="spot-logo" src={logo} alt={cur.title} key={'l' + cur.id} />
        ) : (
          <h1 className="spot-title disp" key={'t' + cur.id}>
            {cur.title}
          </h1>
        )}
        <div className="spot-meta">{meta}</div>
        <div className="spot-actions">
          <button type="button" className="spot-play" onClick={() => onPlay(cur)}>
            {I.play({})}Play
          </button>
          <button type="button" className="spot-more" onClick={() => onInfo(cur)}>
            {I.stack({})}More Info
          </button>
        </div>
      </div>
      {items.length > 1 && (
        <div className="spot-toolbar">
          <button type="button" className="spot-nav left" onClick={prev} aria-label="Previous featured title">
            {chev('M15 6l-6 6 6 6')}
          </button>
          <div className="spot-dots">
            {items.map((_, k) => (
              <button key={k} type="button" className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={'Featured ' + (k + 1)} />
            ))}
          </div>
          <button type="button" className="spot-nav right" onClick={next} aria-label="Next featured title">
            {chev('M9 6l6 6-6 6')}
          </button>
        </div>
      )}
    </div>
  );
}

export function ConnectModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'tmdb' | 'plex'>('tmdb');
  const [tmdbKey, setTmdbKey] = useState(() => Lib.key || '');

  useEffect(() => {
    setTmdbKey(Lib.key || '');
  }, []);

  useEffect(() => {
    const trimmed = tmdbKey.trim();
    if (!trimmed) return;
    const t = setTimeout(() => Lib.setKey(trimmed), 350);
    return () => clearTimeout(t);
  }, [tmdbKey]);
  const [url, setUrl] = useState((Plex.conn && Plex.conn.url) || '');
  const [token, setToken] = useState((Plex.conn && Plex.conn.token) || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const tmdbConnected = Lib.connected;
  const plexConnected = Plex.connected;

  async function connectPlex() {
    if (!url.trim() || !token.trim()) {
      setError('Enter both your server address and token.');
      return;
    }
    setBusy(true);
    setError('');
    Plex.setConn(url, token);
    try {
      await Plex.fetchCollections();
      setBusy(false);
      onClose();
    } catch {
      setError(
        'Could not reach your Plex server from this container. Use your https://…plex.direct:32400 address, or ensure the container can reach your LAN (see README).',
      );
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Connections</h3>
        <div className="sub">Link TMDB for artwork and your Plex server for a live library. Tokens stay in this browser only.</div>
        <div className="seg">
          <button className={tab === 'tmdb' ? 'on' : ''} onClick={() => setTab('tmdb')}>
            TMDB artwork
          </button>
          <button className={tab === 'plex' ? 'on' : ''} onClick={() => setTab('plex')}>
            Plex server
          </button>
        </div>

        {tab === 'tmdb' && (
          <>
            <div className="field">
              <label>TMDB API key or read token</label>
              <input
                autoFocus
                value={tmdbKey}
                onChange={(e) => setTmdbKey(e.target.value)}
                placeholder="v3 key or v4 token (eyJ…)"
                onKeyDown={(e) => e.key === 'Enter' && (Lib.setKey(tmdbKey), onClose())}
              />
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.55 }}>
              Free key at{' '}
              <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer" style={{ color: 'var(--cool)' }}>
                themoviedb.org/settings/api
              </a>
              {tmdbConnected && <div style={{ marginTop: 12, color: 'rgb(103, 210, 131)', fontWeight: 600 }}>● TMDB connected</div>}
            </div>
            <div className="modal-actions">
              {tmdbConnected && (
                <button className="btn danger" onClick={() => (Lib.setKey(''), Lib.clearCache(), onClose())}>
                  Disconnect
                </button>
              )}
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn primary" disabled={!tmdbKey.trim() && !tmdbConnected} onClick={() => (Lib.setKey(tmdbKey), onClose())}>
                {tmdbConnected ? 'Update' : 'Connect'}
              </button>
            </div>
          </>
        )}

        {tab === 'plex' && (
          <>
            {Plex.useProxy && (
              <div className="plex-banner" style={{ marginBottom: 16 }}>
                {I.server({})}
                <span>Plex proxy active — server calls route through this Orbit container.</span>
              </div>
            )}
            <div className="field">
              <label>Plex server address</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://192-168-1-20.abc123.plex.direct:32400" />
            </div>
            <div className="field">
              <label>X-Plex-Token</label>
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="your access token" />
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.55 }}>
              <a href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/" target="_blank" rel="noreferrer" style={{ color: 'var(--cool)' }}>
                How to find your token
              </a>
            </div>
            {error && <div className="plex-error">{error}</div>}
            {plexConnected && <div style={{ color: 'rgb(103, 210, 131)', fontWeight: 600, marginBottom: 12 }}>● Plex connected</div>}
            <div className="modal-actions">
              {plexConnected && (
                <button className="btn danger" onClick={() => (Plex.disconnect(), onClose())}>
                  Disconnect
                </button>
              )}
              <button className="btn ghost" onClick={onClose}>
                  Cancel
              </button>
              <button className="btn primary" disabled={busy} onClick={connectPlex}>
                {busy ? 'Testing…' : plexConnected ? 'Update & test' : 'Connect'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
