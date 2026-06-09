import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Lib, Plex } from '../lib';
import { hiResBackdrop, hiResPoster } from '../lib/artUrls';
import { plexArtFromNode } from '../lib/importUtils';
import { acquireImageSlot, releaseImageSlot } from '../lib/imgQueue';
import type { OrbitNode } from '../types/orbit';

const PALETTES = [
  ['#3A7BD5', '#3A6073', '#1F2A44'],
  ['#22D3EE', '#0EA5E9', '#6366F1'],
  ['#00B4D8', '#0077B6', '#03045E'],
  ['#2DD4BF', '#0E7490', '#155E75'],
  ['#5EEAD4', '#22D3EE', '#3B82F6'],
  ['#818CF8', '#6366F1', '#3730A3'],
  ['#38BDF8', '#3B82F6', '#1E3A8A'],
  ['#06B6D4', '#3B82F6', '#8B5CF6'],
  ['#14B8A6', '#0EA5E9', '#4F46E5'],
  ['#7DD3FC', '#38BDF8', '#0284C7'],
  ['#A5B4FC', '#818CF8', '#4338CA'],
  ['#34D399', '#06B6D4', '#0E7490'],
  ['#60A5FA', '#3B82F6', '#1E40AF'],
  ['#67E8F9', '#0891B2', '#155E75'],
];
const VARIANTS = ['orb', 'rings', 'horizon', 'bands', 'mesh', 'eclipse'];
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

function hash(str: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function pick<T>(arr: T[], n: number) {
  return arr[n % arr.length];
}
function shade(hex: string, pct: number) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let bl = n & 255;
  const t = pct < 0 ? 0 : 255;
  const p = Math.abs(pct) / 100;
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  bl = Math.round((t - bl) * p + bl);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}
function rnd(h: number, i: number) {
  return ((h >> (i * 3)) & 0xff) / 255;
}

export function meta(node: OrbitNode) {
  const h = hash(node.title + (node.year || '') + node.type);
  const colors = pick(PALETTES, h % PALETTES.length);
  const variant = pick(VARIANTS, (h >> 8) % VARIANTS.length);
  return { h, colors, variant, hue: colors[0] };
}

function compose(m: ReturnType<typeof meta>) {
  const [a, b, c] = m.colors;
  const h = m.h;
  let layers: string[] = [];
  switch (m.variant) {
    case 'orb': {
      const y = 64 + rnd(h, 1) * 18;
      layers = [
        `radial-gradient(120% 80% at 50% ${y}%, ${a} 0%, ${a} 9%, ${shade(a, -8)} 14%, transparent 42%)`,
        `linear-gradient(180deg, ${shade(c, -34)} 0%, ${shade(b, -10)} 52%, ${shade(a, -6)} 100%)`,
      ];
      break;
    }
    case 'eclipse':
      layers = [
        `radial-gradient(closest-side at 50% 42%, transparent 27%, ${a} 28%, ${a} 30%, transparent 31%)`,
        `radial-gradient(closest-side at 50% 42%, ${shade(b, -36)} 26%, transparent 27%)`,
        `linear-gradient(180deg, ${shade(c, -30)}, ${shade(b, -16)})`,
      ];
      break;
    case 'bands':
      layers = [`repeating-linear-gradient(${118 + rnd(h, 2) * 40}deg, ${a} 0 14%, ${b} 14% 30%, ${c} 30% 46%, ${shade(c, -22)} 46% 62%)`];
      break;
    case 'mesh':
      layers = [
        `radial-gradient(60% 70% at ${18 + rnd(h, 1) * 20}% 22%, ${a} 0%, transparent 60%)`,
        `radial-gradient(70% 60% at ${72 + rnd(h, 2) * 18}% 78%, ${b} 0%, transparent 62%)`,
        `radial-gradient(50% 50% at 50% 50%, ${c} 0%, transparent 70%)`,
        `linear-gradient(160deg, ${shade(c, -38)}, ${shade(b, -22)})`,
      ];
      break;
    default:
      layers = [`linear-gradient(160deg, ${a}, ${b}, ${c})`];
  }
  return layers.join(', ');
}

const ovStyle: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'screen' };
const chipStyle: CSSProperties = {
  position: 'absolute',
  left: 11,
  top: 11,
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '0.16em',
  color: 'rgba(255,255,255,0.92)',
  background: 'rgba(0,0,0,0.28)',
  backdropFilter: 'blur(6px)',
  padding: '4px 9px',
  borderRadius: 99,
  border: '1px solid rgba(255,255,255,0.22)',
};

function Overlay({ m }: { m: ReturnType<typeof meta> }) {
  if (m.variant === 'rings') {
    const cx = 50;
    const cy = 46 + rnd(m.h, 3) * 8;
    return (
      <svg viewBox="0 0 100 150" preserveAspectRatio="none" style={ovStyle}>
        {[12, 21, 31, 42, 54].map((r, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={i === 2 ? 0.7 : 0.35} opacity={0.7 - i * 0.1} />
        ))}
        <circle cx={cx} cy={cy} r="5" fill="rgba(255,255,255,0.85)" />
      </svg>
    );
  }
  if (m.variant === 'horizon') {
    const hzn = 58;
    const lines: ReactNode[] = [];
    for (let i = -6; i <= 6; i++) {
      const x = 50 + i * 9;
      lines.push(<line key={'v' + i} x1={x} y1={hzn} x2={50 + i * 30} y2="150" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />);
    }
    for (let j = 1; j <= 6; j++) {
      const y = hzn + j * j * 2.4;
      lines.push(<line key={'h' + j} x1="0" y1={y} x2="100" y2={y} stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />);
    }
    return (
      <svg viewBox="0 0 100 150" preserveAspectRatio="none" style={ovStyle}>
        <circle cx="50" cy={hzn - 8} r="13" fill="rgba(255,255,255,0.9)" opacity="0.9" />
        {lines}
      </svg>
    );
  }
  return null;
}

export function ArtView({ node }: { node: OrbitNode }) {
  const m = meta(node);
  return (
    <div style={{ position: 'absolute', inset: 0, background: compose(m) }}>
      <Overlay m={m} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: GRAIN, opacity: 0.1, mixBlendMode: 'overlay' }} />
    </div>
  );
}

export function Poster({ node, showTitle = true }: { node: OrbitNode; showTitle?: boolean }) {
  const m = meta(node);
  const typeLabel = node.type === 'show' ? 'SERIES' : node.type === 'movie' ? 'FILM' : 'SYSTEM';
  return (
    <div style={{ position: 'absolute', inset: 0, background: compose(m) }}>
      <Overlay m={m} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: GRAIN, opacity: 0.1, mixBlendMode: 'overlay' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 100% at 50% 0%, transparent 50%, rgba(0,0,0,0.35) 100%)' }} />
      <div style={chipStyle}>{typeLabel}</div>
      {showTitle && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '34px 14px 14px', background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.55))' }}>
          <div className="disp" style={{ color: '#fff', fontWeight: 600, fontSize: 17, lineHeight: 1.08, letterSpacing: '-0.01em', textShadow: '0 1px 14px rgba(0,0,0,0.5)' }}>{node.title}</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11.5, marginTop: 4, display: 'flex', gap: 5, textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>
            {node.year ? <span>{node.year}</span> : null}
            {node.genre ? <span>· {node.genre}</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}

export const ArtCtx = createContext(0);

function plexThumbArt(node: OrbitNode, card = false) {
  if (!node.plexKey || !Plex.connected) return null;
  const poster = Plex.imgUrl('/library/metadata/' + node.plexKey + '/thumb', card ? 'card' : 'poster');
  const backdrop = Plex.imgUrl('/library/metadata/' + node.plexKey + '/art', 'backdrop');
  return poster ? { poster, backdrop: backdrop || poster } : null;
}

function gridArtForNode(node: OrbitNode) {
  const plex = plexThumbArt(node, true);
  if (plex) return plex;
  return Lib.getCached(node);
}

function artForNode(node: OrbitNode, cardPoster = false) {
  if (cardPoster) return gridArtForNode(node);
  return plexArtFromNode(node) || plexThumbArt(node) || Lib.getCached(node);
}

export function useArt(node: OrbitNode, overrideId?: string, enabled = true, cardPoster = false) {
  useContext(ArtCtx); // overrides bump context; getOverride read below stays fresh on parent re-render
  const [art, setArt] = useState<ReturnType<typeof artForNode>>(() => (enabled ? artForNode(node, cardPoster) : null));
  useEffect(() => {
    if (!enabled) {
      setArt(null);
      return;
    }
    let alive = true;
    const plex = cardPoster ? plexThumbArt(node, true) : plexArtFromNode(node) || plexThumbArt(node, false);
    if (plex) {
      setArt(plex);
      return;
    }
    const cached = Lib.getCached(node);
    if (cached) {
      setArt(cached);
      return;
    }
    if (Plex.connected && node.plexKey) return;
    Lib.resolve(node).then((r) => {
      if (alive) setArt(r || null);
    });
    return () => {
      alive = false;
    };
  }, [node?.id, node?.title, node?.poster, node?.backdrop, enabled, cardPoster]);
  const ov = Lib.getOverride(overrideId || node?.id);
  if (ov && (ov.poster || ov.backdrop)) return { ...(art || {}), ...ov };
  return art;
}

export function SmartPoster({ node, showTitle = true }: { node: OrbitNode; showTitle?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const slotHeld = useRef(false);
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
      { rootMargin: '160px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [node.id]);
  const art = useArt(node, undefined, visible, true);
  const poster = art?.poster;
  useEffect(() => {
    setSrc(null);
    setLoaded(false);
    if (slotHeld.current) {
      releaseImageSlot();
      slotHeld.current = false;
    }
    if (!visible || !poster) return;
    let cancelled = false;
    acquireImageSlot().then(() => {
      if (cancelled) {
        releaseImageSlot();
        return;
      }
      slotHeld.current = true;
      setSrc(hiResPoster(poster) || poster);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, poster, node.id]);
  const typeLabel = node.type === 'show' ? 'SERIES' : 'FILM';
  const finishLoad = () => {
    setLoaded(true);
    if (slotHeld.current) {
      releaseImageSlot();
      slotHeld.current = false;
    }
  };
  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, background: '#0b0e14' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: loaded ? 0 : 1, transition: 'opacity .15s' }}>
        <ArtView node={node} />
      </div>
      {src && (
        <img
          src={src}
          alt=""
          decoding="async"
          fetchPriority="low"
          onLoad={finishLoad}
          onError={finishLoad}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity .12s' }}
        />
      )}
      {showTitle && <div style={chipStyle}>{typeLabel}</div>}
    </div>
  );
}

export function SmartLandscape({ node, overrideId }: { node: OrbitNode; overrideId?: string }) {
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
      { rootMargin: '120px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [node.id]);
  const art = useArt(node, overrideId, visible);
  const [loaded, setLoaded] = useState(false);
  const rawUrl = art?.backdrop || art?.poster;
  const url = rawUrl ? hiResBackdrop(rawUrl) || rawUrl : null;
  useEffect(() => {
    setLoaded(false);
  }, [node?.id, art?.backdrop, art?.poster]);
  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, background: '#0b0e14' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: url && loaded ? 0 : 1, transition: 'opacity .35s' }}>
        <ArtView node={node} />
      </div>
      {url && (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity .35s' }}
        />
      )}
    </div>
  );
}
