import { useEffect, useState, type SVGProps } from 'react';
import { Conn, Lib, OT, Plex } from '../lib';
import { countTitles } from '../lib/importUtils';
import type { ConnAccount, ConnServer } from '../lib/conn';
import type { OrbitNode } from '../types/orbit';
import { Icons, LIB_ICON } from './icons';

const ic = {
  ...Icons,
  plex: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M5 2h6.5L17 12l-5.5 10H5l5.5-10z" />
    </svg>
  ),
  back: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chev: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  bolt: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M13 2L4 14h6l-1 8 9-12h-6z" />
    </svg>
  ),
  refresh: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M4 12a8 8 0 0 1 13.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16M4 20v-4h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

type PlexResource = Awaited<ReturnType<typeof Plex.resources>>[number];
type ServerChoice = ConnServer & { raw: PlexResource };

export interface WizardResult {
  tree?: OrbitNode;
  demo?: boolean;
  items: number;
  account: ConnAccount;
  server?: ConnServer;
  sectionKeys?: string[];
}

const STEPS = [
  { id: 'account', label: 'Account' },
  { id: 'server', label: 'Server' },
  { id: 'libraries', label: 'Libraries' },
  { id: 'artwork', label: 'Artwork' },
  { id: 'sync', label: 'Sync' },
];

const WIZ_STEP_LS = 'orbit.wizard.step.v1';

function readWizardStep() {
  try {
    const s = sessionStorage.getItem(WIZ_STEP_LS);
    return s && STEPS.some((x) => x.id === s) ? s : 'account';
  } catch {
    return 'account';
  }
}

function writeWizardStep(step: string) {
  try {
    sessionStorage.setItem(WIZ_STEP_LS, step);
  } catch {
    /* ignore */
  }
}

function clearWizardStep() {
  try {
    sessionStorage.removeItem(WIZ_STEP_LS);
  } catch {
    /* ignore */
  }
}

function mapServer(s: PlexResource, i: number): ServerChoice {
  const uri = Plex.bestConnection(s);
  const c = s.connections.find((x) => x.uri === uri) || s.connections[0];
  return {
    id: 'srv_' + i + '_' + s.name.replace(/\W/g, ''),
    name: s.name,
    platform: s.platform || 'Plex Media Server',
    version: s.version || s.product || '',
    type: c?.relay ? 'relay' : 'direct',
    latency: c?.local ? 2 : c?.relay ? 40 : 18,
    place: c?.local ? 'LAN' : c?.relay ? 'Relay' : 'Remote',
    raw: s,
  };
}

const libIcon = (k?: string) => {
  const name = (LIB_ICON[k || ''] || 'film') as keyof typeof ic;
  return ic[name]({});
};

export function ConnectWizard({
  demoTree,
  onClose,
  onComplete,
}: {
  demoTree: OrbitNode;
  onClose: () => void;
  onComplete: (result: WizardResult) => void;
}) {
  const demoLibs = (demoTree.children || []).filter((n) => n.type === 'library');

  const [step, setStepRaw] = useState(readWizardStep);
  const setStep = (s: string) => {
    setStepRaw(s);
    writeWizardStep(s);
  };
  const [mode, setMode] = useState<'live' | 'demo'>('live');
  const [acct, setAcct] = useState<ConnAccount | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [authing, setAuthing] = useState(false);
  const [authError, setAuthError] = useState('');
  const [manual, setManual] = useState(false);
  const [url, setUrl] = useState((Plex.conn && Plex.conn.url) || '');
  const [token, setToken] = useState((Plex.conn && Plex.conn.token) || '');
  const [servers, setServers] = useState<ServerChoice[]>([]);
  const [server, setServer] = useState<ServerChoice | null>(null);
  const [testing, setTesting] = useState(false);
  const [plexSections, setPlexSections] = useState<Array<{ key: string; title: string; type: string }>>([]);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const [tmdbKey, setTmdbKey] = useState(() => Lib.key || '');

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  useEffect(() => {
    setTmdbKey(Lib.key || '');
  }, []);

  useEffect(() => {
    const trimmed = tmdbKey.trim();
    if (!trimmed) return;
    const t = setTimeout(() => Lib.setKey(trimmed), 350);
    return () => clearTimeout(t);
  }, [tmdbKey]);

  async function pickServer(s: ServerChoice) {
    setServer(s);
    setTesting(true);
    setAuthError('');
    try {
      await Plex.connectServer(s.raw);
      const secs = await Plex.sections();
      setPlexSections(secs);
      setChosen(new Set(secs.map((x) => x.key)));
      setMode('live');
      setStep('libraries');
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Could not reach this server');
    } finally {
      setTesting(false);
    }
  }

  async function loadServers() {
    const list = await Plex.resources();
    const mapped = list.map(mapServer);
    setServers(mapped);
    if (mapped.length === 0) {
      setAuthError('No Plex Media Servers found on your account.');
      setAuthing(false);
      return;
    }
    if (mapped.length === 1) {
      setAuthing(false);
      await pickServer(mapped[0]);
      return;
    }
    setAuthing(false);
    setStep('server');
  }

  async function signInPlex() {
    setAuthing(true);
    setAuthError('');
    setPin(null);
    try {
      await Plex.signIn({ onCode: (code) => setPin(code) });
      setAcct({ kind: 'plex', user: 'Your Plex account', handle: 'Signed in' });
      await loadServers();
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Sign-in failed');
      setAuthing(false);
    }
  }

  async function connectManual() {
    if (!url.trim() || !token.trim()) return;
    setAuthError('');
    setTesting(true);
    Plex.setConn(url, token);
    try {
      const secs = await Plex.sections();
      setAcct({ kind: 'token', user: 'Server token', handle: url.replace(/^https?:\/\//, '') });
      setServer({
        id: 'manual',
        name: 'My Plex Server',
        platform: 'Direct',
        version: 'live',
        type: 'direct',
        latency: 9,
        place: 'Token',
        raw: { name: 'Manual', product: '', version: '', platform: '', token, connections: [{ uri: url, local: false, relay: false }] },
      });
      setPlexSections(secs);
      setChosen(new Set(secs.map((x) => x.key)));
      setMode('live');
      setStep('libraries');
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setTesting(false);
    }
  }

  function useDemo() {
    setAcct({ kind: 'demo', user: 'Demo', handle: 'demo library' });
    setMode('demo');
    setChosen(new Set(demoLibs.map((l) => l.id)));
    setStep('libraries');
  }

  function toggleKey(id: string) {
    setChosen((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function finishArtwork() {
    if (tmdbKey.trim()) Lib.setKey(tmdbKey.trim());
    setStep('sync');
  }

  function completeSync(result: WizardResult) {
    clearWizardStep();
    Conn.save({
      connected: true,
      live: !result.demo,
      account: result.account,
      server: result.server,
      libraries: result.sectionKeys || Array.from(chosen),
      items: result.items,
      syncedAt: Date.now(),
      tmdbKey: Lib.key || tmdbKey.trim() || undefined,
    });
    onComplete(result);
  }

  const libraryRows =
    mode === 'live'
      ? plexSections.map((s) => ({ id: s.key, title: s.title, sub: s.type === 'show' ? 'TV Shows' : 'Movies', libKey: s.type === 'show' ? 'tv' : 'movies' }))
      : demoLibs.map((l) => {
          const c = OT.countDeep(l);
          return { id: l.id, title: l.title, sub: `${c.films} items · ${c.colls} collections`, libKey: l.libKey };
        });

  return (
    <div className="cw">
      <div className="cw-aside">
        <div className="cw-brand">
          <div className="brand-orb"></div>
          <span className="disp">Orbit</span>
        </div>
        <div className="cw-steps">
          {STEPS.map((s, i) => (
            <div key={s.id} className={'cw-step' + (i === stepIndex ? ' on' : '') + (i < stepIndex ? ' done' : '')}>
              <span className="cw-step-dot">{i < stepIndex ? ic.check({}) : i + 1}</span>
              <span className="cw-step-l">{s.label}</span>
            </div>
          ))}
        </div>
        <div className="cw-aside-foot">
          Sign in with Plex — no server URL or token needed.
          <br />
          Orbit discovers your server and imports your libraries.
        </div>
      </div>

      <div className="cw-main">
        <button className="cw-close" onClick={onClose} title="Close">
          {ic.x({})}
        </button>

        {step === 'account' && (
          <div className="cw-panel rise">
            {!authing ? (
              <>
                <div className="cw-mark plex">{ic.plex({})}</div>
                <h2 className="disp">Connect your Plex account</h2>
                <p>Sign in once — Orbit finds your server and imports Movies, TV, collections, and everything you’ve organized.</p>
                {authError && <div className="plex-error">{authError}</div>}
                <button type="button" className="cw-primary plex" onClick={signInPlex}>
                  {ic.plex({ style: { width: 18, height: 18 } })}
                  Sign in with Plex
                </button>
                <button type="button" className="cw-ghost" onClick={useDemo}>
                  Explore with the demo library
                </button>
                <button type="button" className="cw-link" onClick={() => setManual((m) => !m)}>
                  {manual ? 'Hide advanced' : 'Advanced: connect with server URL + token'}
                </button>
                {manual && (
                  <div className="cw-manual">
                    <label>Server address</label>
                    <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…plex.direct:32400" />
                    <label>X-Plex-Token</label>
                    <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="your token" />
                    <button className="cw-primary" disabled={!url.trim() || !token.trim() || testing} onClick={connectManual}>
                      {testing ? 'Connecting…' : 'Connect server'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="cw-pin rise">
                <div className="cw-mark plex">{ic.plex({})}</div>
                <h2 className="disp">Link this device</h2>
                <p>
                  Go to <strong>app.plex.tv/auth</strong> (opened in a new window) or <strong>plex.tv/link</strong> and enter:
                </p>
                {pin && (
                  <div className="cw-code">
                    {pin.split('').map((ch, i) => (
                      <span key={i}>{ch}</span>
                    ))}
                  </div>
                )}
                <div className="cw-waiting">
                  <span className="cw-spin"></span>
                  Waiting for authorization…
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'server' && (
          <div className="cw-panel rise">
            <div className="cw-mark">{ic.server({})}</div>
            <h2 className="disp">Choose a server</h2>
            <p>{testing ? 'Connecting…' : `Signed in · ${servers.length} server${servers.length !== 1 ? 's' : ''} found.`}</p>
            {authError && <div className="plex-error">{authError}</div>}
            <div className="cw-servers">
              {servers.map((s) => (
                <button key={s.id} className={'cw-srv' + (server?.id === s.id ? ' on' : '')} disabled={testing} onClick={() => pickServer(s)}>
                  <div className="cw-srv-ic">{ic.server({})}</div>
                  <div className="cw-srv-meta">
                    <div className="cw-srv-name">
                      {s.name}
                      {server?.id === s.id && testing && <span className="cw-spin sm"></span>}
                    </div>
                    <div className="cw-srv-sub">
                      {s.platform} · Plex {s.version}
                    </div>
                  </div>
                  <div className="cw-srv-tags">
                    <span className={'cw-tag ' + (s.type === 'direct' ? 'good' : 'warn')}>
                      {s.type === 'direct' ? ic.bolt({ style: { width: 12, height: 12 } }) : null}
                      {s.type === 'direct' ? 'Direct' : 'Relay'}
                    </span>
                    <span className="cw-srv-lat">
                      {s.latency} ms · {s.place}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <button className="cw-back" onClick={() => setStep('account')}>
              {ic.back({})}Back
            </button>
          </div>
        )}

        {step === 'libraries' && (
          <div className="cw-panel rise">
            <div className="cw-mark">{ic.film({})}</div>
            <h2 className="disp">Libraries to sync</h2>
            <p>
              {mode === 'live'
                ? `Choose Plex libraries from ${server?.name || 'your server'}.`
                : `Demo libraries — sign in with Plex to import your real server.`}
            </p>
            <div className="cw-libsel">
              <button
                className="cw-selall"
                onClick={() => setChosen(chosen.size === libraryRows.length ? new Set() : new Set(libraryRows.map((l) => l.id)))}
              >
                {chosen.size === libraryRows.length ? 'Clear all' : 'Select all'}
              </button>
              {libraryRows.map((l) => {
                const on = chosen.has(l.id);
                return (
                  <button key={l.id} className={'cw-lib' + (on ? ' on' : '')} onClick={() => toggleKey(l.id)}>
                    <span className="cw-lib-ic">{libIcon(l.libKey)}</span>
                    <span className="cw-lib-meta">
                      <span className="cw-lib-name">{l.title}</span>
                      <span className="cw-lib-sub">{l.sub}</span>
                    </span>
                    <span className={'cw-check' + (on ? ' on' : '')}>{on ? ic.check({}) : null}</span>
                  </button>
                );
              })}
            </div>
            <div className="cw-row">
              <button className="cw-back" onClick={() => setStep(mode === 'live' && servers.length > 1 ? 'server' : 'account')}>
                {ic.back({})}Back
              </button>
              <button className="cw-primary" disabled={!chosen.size} onClick={() => setStep('artwork')}>
                Continue · {chosen.size} {chosen.size === 1 ? 'library' : 'libraries'}
                {ic.chev({ style: { width: 16, height: 16 } })}
              </button>
            </div>
          </div>
        )}

        {step === 'artwork' && (
          <div className="cw-panel rise">
            <div className="cw-mark">{ic.image({})}</div>
            <h2 className="disp">Richer artwork</h2>
            <p>
              Optional: add a free <strong>TMDB</strong> key for extra posters and synopses. Plex artwork is used either way.
            </p>
            {Lib.connected ? (
              <div className="cw-tmdb-ok">
                {ic.check({ style: { width: 16, height: 16 } })}TMDB connected.
              </div>
            ) : (
              <div className="cw-manual">
                <label>
                  TMDB API key <span className="cw-opt">optional</span>
                </label>
                <input value={tmdbKey} onChange={(e) => setTmdbKey(e.target.value)} placeholder="v3 key or v4 token" />
                <a className="cw-link a" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
                  Get a free key →
                </a>
              </div>
            )}
            <div className="cw-row">
              <button className="cw-back" onClick={() => setStep('libraries')}>
                {ic.back({})}Back
              </button>
              <div className="cw-row-r">
                <button className="cw-ghost sm" onClick={() => finishArtwork()}>
                  Skip
                </button>
                <button className="cw-primary" onClick={() => finishArtwork()}>
                  {tmdbKey.trim() && !Lib.connected ? 'Connect & sync' : 'Sync now'}
                  {ic.chev({ style: { width: 16, height: 16 } })}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'sync' && (
          <SyncStep
            mode={mode}
            sectionKeys={mode === 'live' ? Array.from(chosen) : undefined}
            demoLibs={demoLibs.filter((l) => chosen.has(l.id))}
            server={server}
            account={acct!}
            onDone={completeSync}
          />
        )}
      </div>
    </div>
  );
}

function SyncStep({
  mode,
  sectionKeys,
  demoLibs,
  server,
  account,
  onDone,
}: {
  mode: 'live' | 'demo';
  sectionKeys?: string[];
  demoLibs: OrbitNode[];
  server: ServerChoice | null;
  account: ConnAccount;
  onDone: (r: WizardResult) => void;
}) {
  const [phase, setPhase] = useState<'working' | 'done' | 'error'>('working');
  const [msg, setMsg] = useState('Connecting to your server…');
  const [progress, setProgress] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const totals = demoLibs.map((l) => OT.countDeep(l).films);
  const grand = totals.reduce((a, b) => a + b, 0) || 1;
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (mode !== 'live' || !sectionKeys) return;
    let alive = true;
    (async () => {
      try {
        setMsg('Reading your Plex libraries…');
        setProgress(20);
        const tree = await Plex.buildTree(sectionKeys);
        if (!alive) return;
        setProgress(85);
        setMsg('Finishing up…');
        const items = countTitles(tree);
        if (!alive) return;
        setProgress(100);
        setPhase('done');
        setMsg(`${items.toLocaleString()} items ready.`);
        setTimeout(
          () =>
            onDone({
              tree,
              items,
              account,
              server: server || undefined,
              sectionKeys,
            }),
          900,
        );
      } catch (e) {
        if (!alive) return;
        setPhase('error');
        setMsg(e instanceof Error ? e.message : 'Import failed');
      }
    })();
    return () => {
      alive = false;
    };
  }, [mode, sectionKeys, account, server, onDone, attempt]);

  useEffect(() => {
    if (mode !== 'demo') return;
    if (idx >= demoLibs.length) {
      setPhase('done');
      const id = setTimeout(
        () =>
          onDone({
            demo: true,
            items: grand,
            account,
            server: server || undefined,
          }),
        850,
      );
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setIdx((i) => i + 1), 850);
    return () => clearTimeout(id);
  }, [mode, idx, demoLibs.length, grand, account, server, onDone]);

  const scanned = mode === 'demo' ? (phase === 'done' ? grand : totals.slice(0, idx).reduce((a, b) => a + b, 0)) : progress;

  if (mode === 'live') {
    return (
      <div className="cw-panel cw-sync rise">
        <div className={'cw-mark' + (phase === 'done' ? ' ok' : phase === 'error' ? '' : ' spin-mark')}>
          {phase === 'done' ? ic.check({}) : phase === 'error' ? ic.x({}) : ic.refresh({})}
        </div>
        <h2 className="disp">{phase === 'done' ? 'You’re all set' : phase === 'error' ? 'Sync failed' : 'Importing your library'}</h2>
        <p>{msg}</p>
        {phase !== 'error' && (
          <div className="cw-sr-bar" style={{ marginTop: 24, maxWidth: 420 }}>
            <span style={{ width: progress + '%' }}></span>
          </div>
        )}
        {phase === 'error' && (
          <button
            type="button"
            className="cw-primary"
            style={{ marginTop: 20 }}
            onClick={() => {
              setPhase('working');
              setProgress(0);
              setMsg('Connecting to your server…');
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="cw-panel cw-sync rise">
      <div className={'cw-mark' + (phase === 'done' ? ' ok' : ' spin-mark')}>{phase === 'done' ? ic.check({}) : ic.refresh({})}</div>
      <h2 className="disp">{phase === 'done' ? 'You’re all set' : 'Syncing demo library'}</h2>
      <p>
        {phase === 'done'
          ? `${grand.toLocaleString()} demo items across ${demoLibs.length} libraries.`
          : `${scanned.toLocaleString()} of ${grand.toLocaleString()} items`}
      </p>
      <div className="cw-synclist">
        {demoLibs.map((l, i) => {
          const state = i < idx || phase === 'done' ? 'done' : i === idx ? 'active' : 'wait';
          return (
            <div key={l.id} className={'cw-syncrow ' + state}>
              <span className="cw-sr-ic">{state === 'done' ? ic.check({}) : libIcon(l.libKey)}</span>
              <div className="cw-sr-body">
                <div className="cw-sr-top">
                  <span>{l.title}</span>
                  <span className="cw-sr-status">{state === 'done' ? 'Synced' : state === 'active' ? 'Scanning' : 'Queued'}</span>
                </div>
                <div className="cw-sr-bar">
                  <span style={{ width: state === 'done' || state === 'active' ? '100%' : '0%' }}></span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
