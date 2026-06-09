import { Fragment, useEffect, useMemo, useState, type SVGProps } from 'react';
import { OT } from '../lib';
import type { OrbitNode } from '../types/orbit';
import { SmartPoster, meta } from './Posters';

const ic = {
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
  up: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M12 19V6M6 12l6-6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  open: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  motion: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
      <ellipse cx="12" cy="12" rx="9" ry="4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
};

interface PlanetProps {
  node: OrbitNode;
  angle: number;
  radius: number;
  dur: number;
  paused: boolean;
  onEnter: (node: OrbitNode) => void;
  onHover?: (node: OrbitNode | null) => void;
}

function Planet({ node, angle, radius, dur, paused, onEnter, onHover }: PlanetProps) {
  const { films, colls } = OT.countDeep(node);
  const hue = meta(OT.coverFor(node) || node).hue;
  const size = Math.max(56, Math.min(96, 50 + films * 2.5));
  const subs = Math.min(colls, 5);
  return (
    <div
      className="om-item"
      style={{ transform: `rotate(${angle}deg) translateX(${radius}px) rotate(${-angle}deg) translate(-50%, -50%)` }}
    >
      <div className="om-spin" style={{ animationDuration: dur + 's', animationPlayState: paused ? 'paused' : 'running' }}>
        <button
          className="om-planet"
          style={{ width: size, height: size, ['--d' as string]: hue }}
          onClick={() => onEnter(node)}
          onMouseEnter={() => onHover?.(node)}
          onMouseLeave={() => onHover?.(null)}
        >
          <span className="om-planet-core"></span>
          <span className="om-planet-count">{films}</span>
          {Array.from({ length: subs }).map((_, i) => (
            <span key={i} className="om-sat" style={{ transform: `rotate(${(i / subs) * 360}deg) translateX(${size / 2 + 9}px)` }}></span>
          ))}
        </button>
        <div className="om-label coll">
          {node.title}
          <i>
            {films} title{films !== 1 ? 's' : ''}
            {colls ? ` · ${colls} sub` : ''}
          </i>
        </div>
      </div>
    </div>
  );
}

interface MoonProps {
  node: OrbitNode;
  angle: number;
  radius: number;
  dur: number;
  paused: boolean;
  onPlay: (node: OrbitNode) => void;
  onHover?: (node: OrbitNode | null) => void;
}

function Moon({ node, angle, radius, dur, paused, onPlay, onHover }: MoonProps) {
  return (
    <div
      className="om-item"
      style={{ transform: `rotate(${angle}deg) translateX(${radius}px) rotate(${-angle}deg) translate(-50%, -50%)` }}
    >
      <div className="om-spin" style={{ animationDuration: dur + 's', animationPlayState: paused ? 'paused' : 'running' }}>
        <button
          className="om-moon"
          onClick={() => onPlay(node)}
          onMouseEnter={() => onHover?.(node)}
          onMouseLeave={() => onHover?.(null)}
        >
          <div className="om-moon-art" style={{ position: 'relative' }}>
            <SmartPoster node={node} showTitle={false} />
          </div>
          <span className="om-moon-play">{ic.play({})}</span>
        </button>
        <div className="om-label">{node.title}</div>
      </div>
    </div>
  );
}

export interface OrbitMapViewProps {
  tree: OrbitNode;
  startId: string;
  goToNode: (node: OrbitNode) => void;
  openTitle: (node: OrbitNode) => void;
}

export function OrbitMapView({ tree, startId, goToNode, openTitle }: OrbitMapViewProps) {
  const [focusId, setFocusId] = useState(startId || tree.id);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [hover, setHover] = useState<OrbitNode | null>(null);
  const [, setWarp] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  const focus = useMemo(() => OT.findById(tree, focusId) || tree, [tree, focusId]);
  const trail = useMemo(
    () =>
      OT.idPath(tree, focus.id)
        .map((id) => OT.findById(tree, id))
        .filter((t): t is OrbitNode => Boolean(t)),
    [tree, focus],
  );
  const kids = focus.children || [];
  const planets = kids.filter(OT.isColl);
  const moons = kids.filter((c) => !OT.isColl(c));

  function enter(node: OrbitNode) {
    setWarp((w) => w + 1);
    setFocusId(node.id);
  }
  function ascend() {
    const p = OT.findParent(tree, focus.id);
    if (p) {
      setWarp((w) => w + 1);
      setFocusId(p.id);
    }
  }
  const atRoot = focus.id === tree.id;

  const focusHue = meta(OT.coverFor(focus) || focus).hue;
  const { films: totFilms, colls: totColls } = OT.countDeep(focus);

  const moonR = 152;
  const planetR = 256;
  const moonsDur = reduced ? 0 : 64;
  const planetsDur = reduced ? 0 : 104;
  const isPaused = paused || reduced;

  return (
    <div className="om-wrap rise">
      <div className="om-top">
        <div className="om-bc">
          <span className="om-ey">Orbit Map</span>
          {trail.map((t, i) => (
            <Fragment key={t.id}>
              <i className="sep">›</i>
              <button className={i === trail.length - 1 ? 'cur' : ''} onClick={() => enter(t)}>
                {i === 0 ? 'Universe' : t.title}
              </button>
            </Fragment>
          ))}
        </div>
        <div className="om-actions">
          <button
            className={'om-toggle' + (isPaused ? '' : ' on')}
            disabled={reduced}
            onClick={() => setPaused((p) => !p)}
            title="Toggle orbital motion"
          >
            {ic.motion({})}
            {reduced ? 'Motion off' : paused ? 'Paused' : 'Orbiting'}
          </button>
          {!atRoot && (
            <button className="om-toggle" onClick={() => goToNode(focus)}>
              {ic.open({})}Open in grid
            </button>
          )}
        </div>
      </div>

      <div className="om-stage">
        <div className="om-starfield"></div>
        {moons.length > 0 && <div className="om-guide" style={{ width: moonR * 2, height: moonR * 2 }}></div>}
        {planets.length > 0 && <div className="om-guide faint" style={{ width: planetR * 2, height: planetR * 2 }}></div>}

        {moons.length > 0 && (
          <div className="om-ring" style={{ animationDuration: moonsDur + 's', animationPlayState: isPaused ? 'paused' : 'running' }}>
            {moons.map((n, i) => (
              <Moon
                key={n.id}
                node={n}
                angle={(i / moons.length) * 360}
                radius={moonR}
                dur={moonsDur}
                paused={isPaused}
                onPlay={openTitle}
                onHover={setHover}
              />
            ))}
          </div>
        )}
        {planets.length > 0 && (
          <div className="om-ring" style={{ animationDuration: planetsDur + 's', animationPlayState: isPaused ? 'paused' : 'running' }}>
            {planets.map((n, i) => (
              <Planet
                key={n.id}
                node={n}
                angle={(i / planets.length) * 360}
                radius={planetR}
                dur={planetsDur}
                paused={isPaused}
                onEnter={enter}
                onHover={setHover}
              />
            ))}
          </div>
        )}

        <button
          className={'om-star' + (atRoot ? ' root' : '')}
          style={{ ['--d' as string]: focusHue }}
          onClick={ascend}
          disabled={atRoot}
          title={atRoot ? 'The universe' : 'Fly up a level'}
        >
          <span className="om-star-glow"></span>
          <span className="om-star-core"></span>
          {!atRoot && <span className="om-star-up">{ic.up({})}</span>}
        </button>
        <div className="om-center-label">
          <div className="disp">{atRoot ? 'ORBIT' : focus.title}</div>
          <div className="om-center-sub">
            {totColls ? `${totColls} collections · ` : ''}
            {totFilms} title{totFilms !== 1 ? 's' : ''}
            {atRoot ? '' : ' · click star to ascend'}
          </div>
        </div>

        {hover && (
          <div className="om-readout">
            {OT.isColl(hover) ? ic.stack({}) : ic.play({})}
            <span>{hover.title}</span>
            <i>{OT.isColl(hover) ? 'Fly inside' : 'Play'}</i>
          </div>
        )}
      </div>

      <div className="om-hint">Planets are collections — click to fly inside. Moons are titles — click to play. The star flies you up a level.</div>
    </div>
  );
}
