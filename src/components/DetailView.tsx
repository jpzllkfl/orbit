import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type SVGProps } from 'react';
import { Lib, Meta, Plex, Progress } from '../lib';
import { OrbitMedia } from '../lib/orbitMedia';
import type { Episode, OrbitNode } from '../types/orbit';
import { ArtView, SmartLandscape, SmartPoster, useArt } from './Posters';

interface TitleMeta {
  overview?: string;
  director?: string;
  creator?: string;
  studio?: string;
  cast?: string[];
}

interface MediaInfo {
  res: string;
  is4k: boolean;
  codec: string;
  audio: string;
  container: string;
  size: string;
  bitrate: string;
  hdr?: string | null;
  perEp?: boolean;
}

const ic = {
  play: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M7 5v14l12-7z" />
    </svg>
  ),
  plus: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  check: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M5 12.5l4.5 4.5L19 6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  back: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  star: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 2l2.9 6.3 6.8.7-5 4.6 1.4 6.7L12 17.8 5.9 21.6l1.4-6.7-5-4.6 6.8-.7z" />
    </svg>
  ),
  chev: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  clock: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  download: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M12 4v10m0 0l4-4m-4 4l-4-4M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  eye: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  ),
  stack: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 13l9 5 9-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  image: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="9" cy="10" r="1.8" fill="currentColor" />
      <path d="M3 16l5-4 4 3 3-2 6 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  music: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M9 18V5l10-2v13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="18" r="3" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17" cy="16" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  ),
};

function nameHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return 200 + (h % 70);
}
function initials(name: string) {
  const p = name.replace(/[^A-Za-z .]/g, '').split(' ').filter(Boolean);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
function runLabel(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function CastCard({ name, role, photo }: { name: string; role?: string; photo?: string | null }) {
  const hue = nameHue(name);
  return (
    <div className="cast-card">
      <div className="cast-av" style={photo ? undefined : { background: `linear-gradient(150deg, hsl(${hue} 55% 55%), hsl(${hue + 30} 45% 35%))` }}>
        {photo ? <img src={photo} alt="" /> : initials(name)}
      </div>
      <div className="cast-name">{name}</div>
      <div className="cast-role">{role || 'Cast'}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dt-dl-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function MoreCard({ node, onOpen }: { node: OrbitNode; onOpen: (n: OrbitNode) => void }) {
  return (
    <button className="dt-more-card" onClick={() => onOpen(node)} title={node.title}>
      <div className="dt-more-art">
        <SmartPoster node={node} showTitle={false} />
      </div>
      <div className="dt-more-t">{node.title}</div>
      <div className="dt-more-m">{[node.year, node.type === 'show' ? 'Series' : node.genre].filter(Boolean).join(' · ')}</div>
    </button>
  );
}

type CastMember = { name: string; character?: string; photo?: string | null };

type TmdbDetails = {
  overview?: string;
  tagline?: string;
  genres?: string[];
  voteAverage?: number;
  runtime?: number;
  seasons?: number;
  episodes?: number;
  director?: string | null;
  creators?: string[];
  cast?: CastMember[];
  network?: string | null;
  studio?: string | null;
  status?: string | null;
};

type PlexLeaf = {
  ratingKey: string;
  season: number;
  episode: number;
  title: string;
  summary: string;
  still: string | null;
  duration: number;
};

function leafToEpisode(leaf: PlexLeaf): Episode {
  return {
    n: leaf.episode,
    season: leaf.season,
    title: leaf.title || 'Episode ' + leaf.episode,
    synopsis: leaf.summary || '',
    runtime: leaf.duration ? Math.round(leaf.duration / 60000) : undefined,
    still: leaf.still,
  };
}

export function DetailView({
  node,
  similar,
  parentTitle,
  parentNode,
  onClose,
  onPlay,
  onEditArt,
  onOpenNode,
}: {
  node: OrbitNode;
  similar?: OrbitNode[];
  parentTitle?: string;
  parentNode?: OrbitNode | null;
  onClose: () => void;
  onPlay: (node: OrbitNode, episode?: Episode | null) => void;
  onEditArt?: (focus: 'both' | 'backdrop') => void;
  onOpenNode: (n: OrbitNode) => void;
}) {
  const art = useArt(node);
  const md = (Meta.get(node) || {}) as TitleMeta;
  const [tmdb, setTmdb] = useState<TmdbDetails | null>(null);
  const [plexMeta, setPlexMeta] = useState<TmdbDetails | null>(null);
  const mi = useMemo((): MediaInfo => {
    const base = Meta.mediaInfo(node) as unknown as MediaInfo;
    if (node.resolution) {
      const is4k = node.resolution.includes('4') || node.resolution === '4k';
      return {
        ...base,
        res: node.resolution,
        is4k,
        codec: node.videoCodec || base.codec,
        audio: node.audioCodec || base.audio,
        container: String(node.container || base.container).toUpperCase(),
      };
    }
    return base;
  }, [node]);
  const isShow = node.type === 'show';
  const scrollRef = useRef<HTMLDivElement>(null);
  const themeAudio = useRef<HTMLAudioElement | null>(null);
  const themeFade = useRef<ReturnType<typeof setInterval> | null>(null);
  const [season, setSeason] = useState(1);
  const [seasonRows, setSeasonRows] = useState<Array<{ season: number; title: string; poster: string | null; episodes: number }>>([]);
  const [plexLeaves, setPlexLeaves] = useState<PlexLeaf[] | null>(null);
  const [seasonEps, setSeasonEps] = useState<Episode[] | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [watched, setWatched] = useState(() => Progress.isWatched(node.id));
  const [themeOn, setThemeOn] = useState(true);
  const [hasTheme, setHasTheme] = useState(false);
  const themeOnRef = useRef(themeOn);
  themeOnRef.current = themeOn;

  useEffect(() => {
    setWatched(Progress.isWatched(node.id));
  }, [node.id]);

  function stopTheme() {
    if (themeFade.current) clearInterval(themeFade.current);
    themeFade.current = null;
    const a = themeAudio.current;
    if (a) {
      a.pause();
      a.src = '';
    }
    themeAudio.current = null;
    setHasTheme(false);
  }

  function toggleWatched() {
    setWatched((w) => {
      const n = !w;
      Progress.setWatched(node.id, n);
      if (node.plexKey && Plex.connected) {
        (n ? Plex.scrobble(node.plexKey) : Plex.unscrobble(node.plexKey)).catch(() => {});
      }
      return n;
    });
  }

  useEffect(() => {
    let alive = true;
    stopTheme();
    const audio = new Audio();
    audio.loop = true;
    audio.volume = 0;
    themeAudio.current = audio;

    (async () => {
      let url = node.theme ? Plex.themeUrl(node.theme) : null;
      if (!url && node.plexKey && Plex.connected) url = await Plex.getThemeUrl(node.plexKey);
      if (!alive || !url) return;
      setHasTheme(true);
      audio.src = url;
      try {
        await audio.play();
        let v = 0;
        themeFade.current = setInterval(() => {
          if (!themeAudio.current) return;
          v = Math.min(0.38, v + 0.015);
          themeAudio.current.volume = themeOnRef.current ? v : 0;
          if (v >= 0.38 && themeFade.current) {
            clearInterval(themeFade.current);
            themeFade.current = null;
          }
        }, 60);
      } catch {
        /* autoplay blocked until user interacts */
      }
    })();

    return () => {
      alive = false;
      stopTheme();
    };
  }, [node.id, node.plexKey, node.theme]);

  useEffect(() => {
    const a = themeAudio.current;
    if (!a || !hasTheme) return;
    if (themeOn) {
      a.play().catch(() => {});
      a.volume = 0.38;
    } else {
      a.volume = 0;
    }
  }, [themeOn, hasTheme]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setSeason(1);
  }, [node.id]);

  useEffect(() => {
    let alive = true;
    setSeasonRows([]);
    if (!isShow) return;
    (async () => {
      let rows: Array<{ season: number; title: string; poster: string | null; episodes: number }> = [];
      if (node.omsLibraryId && node.omsShowTitle) {
        try {
          const oms = await OrbitMedia.showSeasons(node.omsLibraryId, node.omsShowTitle);
          if (oms.length) rows = oms.map((s) => ({ ...s, poster: null }));
        } catch {
          /* fallback */
        }
      }
      if (!rows.length && node.plexKey && Plex.connected) {
        try {
          const ps = await Plex.fetchSeasons(node.plexKey);
          if (ps.length) rows = ps;
        } catch {
          /* use TMDB or fallback */
        }
      }
      if (!rows.length && Lib.connected) {
        const ts = await Lib.fetchShowSeasons(node);
        if (ts.length) rows = ts;
      }
      if (!alive) return;
      if (!rows.length) {
        rows = Array.from({ length: node.seasons || 1 }, (_, i) => ({
          season: i + 1,
          title: 'Season ' + (i + 1),
          poster: null,
          episodes: Meta.seasonCount(node, i + 1),
        }));
      } else {
        rows = rows.map((r) => ({
          ...r,
          episodes: r.episodes || Meta.seasonCount(node, r.season),
        }));
      }
      setSeasonRows(rows);
    })();
    return () => {
      alive = false;
    };
  }, [node.id, node.plexKey, node.omsLibraryId, node.omsShowTitle, node.seasons, isShow]);

  useEffect(() => {
    if (!isShow) {
      setPlexLeaves(null);
      return;
    }
    let alive = true;
    setPlexLeaves(null);
    if (!node.plexKey || !Plex.connected) return;
    Plex.fetchShowLeaves(node.plexKey)
      .then((leaves) => {
        if (alive) setPlexLeaves(leaves);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [node.id, node.plexKey, isShow]);

  useEffect(() => {
    if (!isShow) {
      setSeasonEps(null);
      return;
    }
    let alive = true;
    setSeasonEps(null);

    const fromPlex = plexLeaves?.filter((l) => l.season === season).map(leafToEpisode);
    if (fromPlex?.length) {
      setSeasonEps(fromPlex);
      return () => {
        alive = false;
      };
    }

    if (node.plexKey && Plex.connected && plexLeaves === null) {
      return () => {
        alive = false;
      };
    }

    if (node.omsLibraryId && node.omsShowTitle) {
      OrbitMedia.showEpisodes(node.omsLibraryId, node.omsShowTitle, season)
        .then((rows) => {
          if (!alive || !rows.length) return;
          setSeasonEps(
            rows.map((r) => ({
              n: r.episode,
              season: r.season,
              title: r.title,
              omsItemId: r.id,
            })),
          );
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }

    if (Lib.connected) {
      Lib.fetchSeasonEpisodes(node, season).then((rows) => {
        if (!alive || !rows.length) return;
        setSeasonEps(
          rows.map((r) => ({
            n: r.n,
            season: r.season,
            title: r.title,
            synopsis: r.synopsis,
            runtime: r.runtime ?? undefined,
            still: r.still,
          }))
        );
      });
    }

    return () => {
      alive = false;
    };
  }, [node.id, season, plexLeaves, isShow, node.plexKey, node.omsLibraryId, node.omsShowTitle]);

  useEffect(() => {
    let alive = true;
    setTmdb(null);
    const run = () => {
      Lib.fetchDetails(node).then((d) => {
        if (alive && d) setTmdb(d as TmdbDetails);
      });
    };
    const handle =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(run, { timeout: 1800 })
        : window.setTimeout(run, 150);
    return () => {
      alive = false;
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(handle as number);
      else window.clearTimeout(handle as number);
    };
  }, [node.id]);

  useEffect(() => {
    let alive = true;
    setPlexMeta(null);
    if (!node.plexKey || !Plex.connected) return;
    const run = () => {
      Plex.fetchDetails(node.plexKey!).then((d) => {
        if (alive && d) setPlexMeta(d as TmdbDetails);
      });
    };
    const handle =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(run, { timeout: 1200 })
        : window.setTimeout(run, 80);
    return () => {
      alive = false;
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(handle as number);
      else window.clearTimeout(handle as number);
    };
  }, [node.id, node.plexKey]);

  const artMeta = art as { overview?: string; rating?: number | null; score?: string } | null;
  const meta = tmdb || plexMeta;
  const overview =
    tmdb?.overview ||
    plexMeta?.overview ||
    md.overview ||
    artMeta?.overview ||
    node.blurb ||
    (Plex.connected || Lib.connected
      ? 'No synopsis available for this title yet.'
      : 'A title in your library — connect Plex or TMDB in Connections for a full synopsis.');
  const tagline = tmdb?.tagline || plexMeta?.tagline;
  const rating =
    node.rating ||
    (meta?.voteAverage != null ? String(meta.voteAverage) : artMeta?.rating != null ? String(artMeta.rating) : null);
  const score =
    meta?.voteAverage?.toFixed(1) ||
    artMeta?.score ||
    (((node.title.length * 7 + (node.year || 0)) % 16) / 10 + 7.3).toFixed(1);
  const genreList = meta?.genres?.length ? meta.genres : node.genre ? [node.genre] : [];
  const castList: CastMember[] = tmdb?.cast?.length
    ? tmdb.cast
    : plexMeta?.cast?.length
      ? plexMeta.cast
      : (md.cast || []).map((name) => ({ name, character: '', photo: null }));
  const director = tmdb?.director || plexMeta?.director || md.director;
  const creator = (tmdb?.creators && tmdb.creators[0]) || (plexMeta?.creators && plexMeta.creators[0]) || md.creator;
  const studio = tmdb?.studio || tmdb?.network || plexMeta?.studio || plexMeta?.network || md.studio;
  const eps = useMemo(() => {
    if (!isShow) return [];
    if (seasonEps?.length) return seasonEps;
    return Meta.episodes(node, season);
  }, [isShow, seasonEps, node, season]);

  const rec = Progress.get(node, null);
  const resumePct = !isShow && rec?.pct ? Math.min(98, rec.pct * 100) : 0;
  const firstEp = eps[0] as Episode | undefined;

  const resumeEp = useMemo(() => {
    if (!isShow) return null;
    const epsAll = plexLeaves?.length
      ? plexLeaves.map(leafToEpisode)
      : Array.from({ length: node.seasons || 1 }).flatMap((_, si) => {
          const s = si + 1;
          return Meta.episodes(node, s).map((ep) => ({ ...ep, season: s }));
        });
    const inProgress = epsAll.find((ep) => {
      const r = Progress.get(node, ep);
      return r && r.pct && r.pct > 0.01 && r.pct < 0.97;
    });
    if (inProgress) return { ...inProgress, showTitle: node.title };
    const unwatched = epsAll.find((ep) => !Progress.get(node, ep));
    return unwatched ? { ...unwatched, showTitle: node.title } : firstEp ? { ...firstEp, showTitle: node.title } : null;
  }, [isShow, node, firstEp, plexLeaves]);

  const showSeasons = tmdb?.seasons || plexMeta?.seasons || node.seasons;
  const movieRuntime = meta?.runtime || node.runtime || (node.duration ? Math.round(node.duration / 60000) : null);
  const facts = isShow
    ? [
        node.year,
        showSeasons ? `${showSeasons} season${showSeasons > 1 ? 's' : ''}` : null,
        tmdb?.episodes ? `${tmdb.episodes} episodes` : null,
        rating,
      ]
    : [node.year, movieRuntime ? runLabel(movieRuntime) : null, rating];

  function startPlay() {
    stopTheme();
    if (!isShow) {
      onPlay(node, null);
      return;
    }
    if (resumeEp) {
      onPlay(node, resumeEp);
      return;
    }
    if (node.omsLibraryId && node.omsShowTitle && seasonEps?.[0]) {
      onPlay(node, { ...seasonEps[0], showTitle: node.title });
      return;
    }
    if (node.plexKey && Plex.connected) {
      Plex.pickShowEpisode(node, null).then((ep) => {
        if (ep) onPlay(node, ep as Episode);
      });
    }
  }

  const pageBackdrop = art?.backdrop || null;

  return (
    <div className={'detail' + (isShow && pageBackdrop ? ' show-detail' : '')} ref={scrollRef} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 220)}>
      {isShow && pageBackdrop && (
        <div className="dt-page-bg" aria-hidden>
          <img src={pageBackdrop} alt="" />
          <div className="dt-page-bg-scrim" />
        </div>
      )}
      <div className="dt-hero">
        <div className="dt-backdrop">
          {isShow && pageBackdrop ? null : art?.backdrop ? (
            <img src={art.backdrop} alt="" />
          ) : (
            <div className="dt-art">
              <ArtView node={node} />
            </div>
          )}
        </div>
        <div className={'dt-scrim' + (isShow && pageBackdrop ? ' dt-scrim-show' : '')}></div>
        <div className="dt-hero-content">
          <div className="dt-poster">
            <SmartPoster node={node} showTitle={false} />
            {watched && <span className="dt-poster-seen">{ic.check({})}</span>}
          </div>
          <div className="dt-hero-text">
            <div className="dt-kicker">
              {parentTitle ? parentTitle + ' · ' : ''}
              {isShow ? 'Series' : 'Film'}
              {mi.is4k ? ' · ' + (mi.hdr || '4K') : ''}
            </div>
            <h1 className="dt-title disp">{node.title}</h1>
            {tagline && <div className="dt-tagline">“{tagline}”</div>}
            <div className="dt-facts">
              <span className="dt-score">
                {ic.star({})}
                {score}
              </span>
              {facts.filter(Boolean).map((f, i) => (
                <Fragment key={i}>
                  <span className="dt-dot">·</span>
                  <span>{f}</span>
                </Fragment>
              ))}
              <span className="dt-resbadge">{mi.res}</span>
            </div>
            {resumePct > 0 && (
              <div className="dt-resume">
                <div className="dt-resume-bar">
                  <span style={{ width: resumePct + '%' }}></span>
                </div>
                <span className="dt-resume-t">{Math.round(resumePct)}% watched</span>
              </div>
            )}
            <div className="dt-actions">
              <button className="dt-play" onClick={startPlay}>
                {ic.play({})}
                {resumePct > 0
                  ? 'Resume'
                  : isShow && resumeEp
                    ? `Play S${resumeEp.season} · E${resumeEp.n}`
                    : isShow
                      ? 'Play'
                      : 'Play'}
              </button>
              <button className={'dt-iconbtn' + (watched ? ' on' : '')} onClick={toggleWatched} title={watched ? 'Watched' : 'Mark as watched'}>
                {watched ? ic.check({}) : ic.eye({})}
              </button>
              {hasTheme && (
                <button
                  className={'dt-iconbtn' + (themeOn ? ' on' : '')}
                  onClick={() => setThemeOn((t) => !t)}
                  title={themeOn ? 'Mute theme' : 'Play theme'}
                >
                  {ic.music({})}
                </button>
              )}
              {onEditArt && (
                <button className="dt-iconbtn" onClick={() => onEditArt('both')} title="Change poster">
                  {ic.image({})}
                </button>
              )}
              {onEditArt && (
                <button className="dt-iconbtn" onClick={() => onEditArt('backdrop')} title="Change backdrop">
                  {ic.stack({})}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={'dt-topbar' + (scrolled ? ' solid' : '')}>
        <button className="dt-back" onClick={onClose}>
          {ic.back({})}
          <span>Back</span>
        </button>
        <div className="dt-topbar-title">{node.title}</div>
        <div style={{ flex: 1 }}></div>
        <button className="dt-topbar-play" onClick={startPlay}>
          {ic.play({})}Play
        </button>
      </div>

      <div className="dt-body">
        <div className="dt-cols">
          <div className="dt-col-main">
            <p className="dt-overview">{overview}</p>
            <div className="dt-genres">
              {genreList.map((g) => (
                <span key={g} className="dt-genre">
                  {g}
                </span>
              ))}
              {parentNode && (
                <button className="dt-genre link" onClick={() => onOpenNode(parentNode)}>
                  {ic.stack({ style: { width: 14, height: 14 } })}Part of {parentTitle}
                </button>
              )}
            </div>
            {(director || creator || studio || tmdb?.status) && (
              <div className="dt-crew">
                {director && (
                  <div>
                    <span>Director</span>
                    {director}
                  </div>
                )}
                {creator && (
                  <div>
                    <span>Creator</span>
                    {creator}
                  </div>
                )}
                {studio && (
                  <div>
                    <span>{isShow ? 'Network' : 'Studio'}</span>
                    {studio}
                  </div>
                )}
                {tmdb?.status && (
                  <div>
                    <span>Status</span>
                    {tmdb.status}
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="dt-panel">
            <div className="dt-panel-h">Media</div>
            <div className="dt-media-badges">
              <span className={'dt-mb' + (mi.is4k ? ' hot' : '')}>{mi.res}</span>
              {mi.hdr && <span className="dt-mb hot">{mi.hdr}</span>}
              <span className="dt-mb">{mi.codec}</span>
            </div>
            <dl className="dt-dl">
              <Row label="Audio">{mi.audio}</Row>
              <Row label="Bitrate">{mi.bitrate}</Row>
              <Row label="Container">{mi.container}</Row>
              <Row label="Size">{mi.size}{mi.perEp ? ' / ep' : ''}</Row>
              <Row label="Playback">
                <span className="dt-direct">
                  {ic.check({ style: { width: 13, height: 13 } })}Direct Play
                </span>
              </Row>
            </dl>
            <div className="dt-panel-h" style={{ marginTop: 18 }}>
              Details
            </div>
            <dl className="dt-dl">
              <Row label="Year">{node.year}</Row>
              <Row label={isShow ? 'Seasons' : 'Runtime'}>{isShow ? node.seasons : runLabel(node.runtime || 110)}</Row>
              <Row label="Rating">{rating || '—'}</Row>
              <Row label="Genre">{node.genre}</Row>
              {md.studio && <Row label="Studio">{md.studio}</Row>}
            </dl>
          </aside>
        </div>

        {isShow && seasonRows.length > 0 && (
          <div className="dt-section dt-seasons">
            <div className="dt-section-head">
              <h3>Seasons</h3>
            </div>
            <div className="dt-seasons-row">
              {seasonRows.map((s) => (
                <button
                  key={s.season}
                  type="button"
                  className={'dt-season-card' + (season === s.season ? ' on' : '')}
                  onClick={() => setSeason(s.season)}
                >
                  <div className="dt-season-art">
                    {s.poster ? (
                      <img src={s.poster} alt="" />
                    ) : art?.poster ? (
                      <img src={art.poster} alt="" />
                    ) : (
                      <ArtView node={node} />
                    )}
                  </div>
                  <div className="dt-season-name">{s.title}</div>
                  <div className="dt-season-eps">
                    {s.episodes} episode{s.episodes === 1 ? '' : 's'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {isShow && (
          <div className="dt-section">
            <div className="dt-section-head">
              <h3>Episodes</h3>
              <div className="dt-season-sel">
                <select value={season} onChange={(e) => setSeason(+e.target.value)}>
                  {Array.from({ length: node.seasons || 1 }).map((_, i) => (
                    <option key={i} value={i + 1}>
                      Season {i + 1} · {Meta.seasonCount(node, i + 1)} eps
                    </option>
                  ))}
                </select>
                {ic.chev({})}
              </div>
            </div>
            <div className="dt-eps">
              {eps.map((ep: Episode) => (
                <button
                  key={ep.n}
                  className="dt-ep"
                  onClick={() => {
                    stopTheme();
                    onPlay(node, { ...ep, showTitle: node.title });
                  }}
                >
                  <div className="dt-ep-thumb">
                    {ep.still ? (
                      <img src={ep.still} alt="" />
                    ) : (
                      <SmartLandscape node={node} overrideId={node.id + '_s' + season + 'e' + ep.n} />
                    )}
                    <span className="dt-ep-n">{ep.n}</span>
                    <span className="dt-ep-play">{ic.play({})}</span>
                  </div>
                  <div className="dt-ep-meta">
                    <div className="dt-ep-title">{ep.title}</div>
                    {ep.synopsis && <div className="dt-ep-syn">{ep.synopsis}</div>}
                    <div className="dt-ep-sub">
                      {ic.clock({ style: { width: 13, height: 13 } })}
                      {ep.runtime ? ep.runtime + 'm · ' : ''}S{season} E{ep.n}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {castList.length > 0 && (
          <div className="dt-section">
            <div className="dt-section-head">
              <h3>Cast</h3>
              {!Lib.connected && !castList.some((c) => c.photo) && (
                <span className="count">Connect TMDB for cast photos</span>
              )}
            </div>
            <div className="dt-cast row">
              {(director || creator) && (
                <CastCard name={director || creator || ''} role={director ? 'Director' : 'Creator'} />
              )}
              {castList.map((c) => (
                <CastCard key={c.name + (c.character || '')} name={c.name} role={c.character || 'Cast'} photo={c.photo} />
              ))}
            </div>
          </div>
        )}

        {similar && similar.length > 0 && (
          <div className="dt-section">
            <div className="dt-section-head">
              <h3>More like this</h3>
            </div>
            <div className="dt-more row">
              {similar.map((n) => (
                <MoreCard key={n.id} node={n} onOpen={onOpenNode} />
              ))}
            </div>
          </div>
        )}
        <div style={{ height: 48 }}></div>
      </div>
    </div>
  );
}
