import { useMemo, useState, type ReactNode } from 'react';
import { OT } from '../lib';
import type { OrbitNode } from '../types/orbit';
import { SmartPoster } from './Posters';

const ic = {
  wand: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M5 19l9-9M14 6l1.4-1.4M19 11l1.4-.4M6 4l.7 2L9 6.7 6.7 7.4 6 10l-.7-2.6L3 6.7l2.3-.7L6 4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  film: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
};

const newId = (p: string) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
const decadeOf = (y?: number) => (y ? Math.floor(y / 10) * 10 : null);

export interface SmartViewProps {
  tree: OrbitNode;
  onCreate: (coll: OrbitNode) => void;
  openTitle: (node: OrbitNode) => void;
}

export function SmartView({ tree, onCreate, openTitle }: SmartViewProps) {
  const allTitles = useMemo(() => OT.allTitles(tree).map((x) => x.node), [tree]);
  const genres = useMemo(() => Array.from(new Set(allTitles.map((n) => n.genre).filter(Boolean) as string[])).sort(), [allTitles]);
  const decades = useMemo(
    () =>
      Array.from(new Set(allTitles.map((n) => decadeOf(n.year)).filter((d): d is number => d != null))).sort((a, b) => a - b),
    [allTitles],
  );

  const [name, setName] = useState('');
  const [type, setType] = useState<'any' | 'movie' | 'show'>('any');
  const [kids, setKids] = useState<'any' | 'kids' | 'grown'>('any');
  const [genreSet, setGenreSet] = useState(() => new Set<string>());
  const [decadeSet, setDecadeSet] = useState(() => new Set<number>());
  const [q, setQ] = useState('');
  const [touched, setTouched] = useState(false);

  const toggleGenre = (v: string) => {
    setTouched(true);
    setGenreSet((s) => {
      const n = new Set(s);
      n.has(v) ? n.delete(v) : n.add(v);
      return n;
    });
  };
  const toggleDecade = (v: number) => {
    setTouched(true);
    setDecadeSet((s) => {
      const n = new Set(s);
      n.has(v) ? n.delete(v) : n.add(v);
      return n;
    });
  };

  const matches = useMemo(
    () =>
      allTitles.filter((n) => {
        if (type !== 'any' && n.type !== type) return false;
        if (kids === 'kids' && !OT.isKid(n)) return false;
        if (kids === 'grown' && OT.isKid(n)) return false;
        if (genreSet.size && (n.genre == null || !genreSet.has(n.genre))) return false;
        if (decadeSet.size) {
          const d = decadeOf(n.year);
          if (d == null || !decadeSet.has(d)) return false;
        }
        if (q.trim() && !(n.title || '').toLowerCase().includes(q.trim().toLowerCase())) return false;
        return true;
      }),
    [allTitles, type, kids, genreSet, decadeSet, q],
  );

  const unique = useMemo(() => {
    const seen = new Set<string>();
    const out: OrbitNode[] = [];
    for (const n of matches) {
      const k = n.title + n.year;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(n);
      }
    }
    return out;
  }, [matches]);

  function reset() {
    setType('any');
    setKids('any');
    setGenreSet(new Set());
    setDecadeSet(new Set());
    setQ('');
    setTouched(true);
  }

  const presets = [
    {
      label: 'After Dark — Horror',
      apply: () => {
        reset();
        setType('any');
        setGenreSet(new Set(['Horror', 'Thriller']));
        setName('After Dark');
      },
    },
    {
      label: 'Sci-Fi after 2010',
      apply: () => {
        reset();
        setGenreSet(new Set(['Sci-Fi']));
        setDecadeSet(new Set([2010, 2020]));
        setName('Modern Sci-Fi');
      },
    },
    {
      label: 'Animated worlds',
      apply: () => {
        reset();
        setGenreSet(new Set(['Animation']));
        setName('Animated Worlds');
      },
    },
    {
      label: 'Series only',
      apply: () => {
        reset();
        setType('show');
        setName('All Series');
      },
    },
  ];

  function summarize() {
    const parts: string[] = [];
    if (type === 'movie') parts.push('films');
    else if (type === 'show') parts.push('series');
    else parts.push('titles');
    if (genreSet.size) parts.push('in ' + Array.from(genreSet).join(' / '));
    if (kids === 'kids') parts.push('for kids');
    if (kids === 'grown') parts.push('non-kids');
    if (decadeSet.size)
      parts.push(
        'from the ' +
          Array.from(decadeSet)
            .sort((a, b) => a - b)
            .map((d) => d + 's')
            .join(', '),
      );
    if (q.trim()) parts.push('matching "' + q.trim() + '"');
    return parts.join(' ');
  }

  function create() {
    const children = unique.map((n) => structuredClone({ ...n, id: newId('sm') }));
    const coll: OrbitNode = {
      id: newId('c'),
      type: 'collection',
      smart: true,
      title: name.trim() || 'Smart Collection',
      blurb: 'Smart collection — all ' + summarize() + '.',
      children,
    };
    onCreate(coll);
  }

  const SegBtn = ({ v, cur, set, children }: { v: string; cur: string; set: (v: string) => void; children: ReactNode }) => (
    <button
      className={cur === v ? 'on' : ''}
      onClick={() => {
        setTouched(true);
        set(v);
      }}
    >
      {children}
    </button>
  );

  return (
    <div className="smart rise">
      <div className="sm-panel">
        <div className="sm-head">
          <div className="sm-ey">
            {ic.wand({})}Smart Collections
          </div>
          <h2 className="disp">Describe it. Orbit gathers it.</h2>
          <p>Set a few rules and Orbit pulls every matching title from across your whole library into one living collection.</p>
        </div>

        <div className="sm-presets">
          {presets.map((p) => (
            <button key={p.label} onClick={p.apply}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="sm-field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. After Dark" />
        </div>

        <div className="sm-rule">
          <label>Format</label>
          <div className="sm-seg">
            <SegBtn v="any" cur={type} set={setType as (v: string) => void}>
              Any
            </SegBtn>
            <SegBtn v="movie" cur={type} set={setType as (v: string) => void}>
              Films
            </SegBtn>
            <SegBtn v="show" cur={type} set={setType as (v: string) => void}>
              Series
            </SegBtn>
          </div>
        </div>

        <div className="sm-rule">
          <label>Audience</label>
          <div className="sm-seg">
            <SegBtn v="any" cur={kids} set={setKids as (v: string) => void}>
              Any
            </SegBtn>
            <SegBtn v="kids" cur={kids} set={setKids as (v: string) => void}>
              Kids
            </SegBtn>
            <SegBtn v="grown" cur={kids} set={setKids as (v: string) => void}>
              Grown-ups
            </SegBtn>
          </div>
        </div>

        <div className="sm-rule col">
          <label>
            Genre <i>{genreSet.size ? `· ${genreSet.size} selected` : '· any'}</i>
          </label>
          <div className="sm-chips">
            {genres.map((g) => (
              <button key={g} className={'sm-chip' + (genreSet.has(g) ? ' on' : '')} onClick={() => toggleGenre(g)}>
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="sm-rule col">
          <label>
            Decade <i>{decadeSet.size ? `· ${decadeSet.size} selected` : '· any'}</i>
          </label>
          <div className="sm-chips">
            {decades.map((d) => (
              <button key={d} className={'sm-chip' + (decadeSet.has(d) ? ' on' : '')} onClick={() => toggleDecade(d)}>
                {d}s
              </button>
            ))}
          </div>
        </div>

        <div className="sm-field">
          <label>Title contains</label>
          <input
            value={q}
            onChange={(e) => {
              setTouched(true);
              setQ(e.target.value);
            }}
            placeholder="optional keyword…"
          />
        </div>

        {touched && (
          <button className="sm-reset" onClick={reset}>
            Reset rules
          </button>
        )}
      </div>

      <div className="sm-preview">
        <div className="sm-preview-head">
          <div>
            <div className="sm-count disp">
              {unique.length}
              <i> match{unique.length !== 1 ? 'es' : ''}</i>
            </div>
            <div className="sm-summary">All {summarize()}</div>
          </div>
          <button className="sm-create" disabled={!unique.length} onClick={create}>
            {ic.wand({})}Create collection
          </button>
        </div>
        {unique.length ? (
          <div className="sm-grid">
            {unique.map((n) => (
              <button key={n.id} className="sm-card" onClick={() => openTitle(n)} title={n.title}>
                <div className="sm-card-art" style={{ position: 'relative' }}>
                  <SmartPoster node={n} showTitle={false} />
                </div>
                <div className="sm-card-t">{n.title}</div>
                <div className="sm-card-m">{[n.year, n.genre].filter(Boolean).join(' · ')}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="sm-empty">
            {ic.film({})}
            <div>No titles match these rules yet.</div>
            <span>Loosen a filter to pull more in.</span>
          </div>
        )}
      </div>
    </div>
  );
}
