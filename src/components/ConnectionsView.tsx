import { useEffect, useState } from 'react';
import { Conn, Lib, OT, OrbitAccount, Plex, TreeStore } from '../lib';
import type { OrbitNode } from '../types/orbit';
import { OrbitAccountModal } from './OrbitAccountModal';
import { Icons, LIB_ICON } from './icons';

const ic = {
  ...Icons,
  plex: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M5 2h6.5L17 12l-5.5 10H5l5.5-10z" />
    </svg>
  ),
  refresh: Icons.spark,
};

export function ConnectionsView({
  tree,
  onOpenWizard,
  onDisconnect,
  onBump,
  onAccountChange,
}: {
  tree: OrbitNode;
  onOpenWizard: () => void;
  onDisconnect?: () => void;
  onBump?: () => void;
  onAccountChange?: () => void;
}) {
  const conn = Conn.load();
  const libs = (tree.children || []).filter((n) => n.type === 'library');
  const totalItems = libs.reduce((a, l) => a + OT.countDeep(l).films, 0);
  const [tmdbKey, setTmdbKey] = useState(() => Lib.key || '');
  const [orbitUser, setOrbitUser] = useState(() => OrbitAccount.user);
  const [accountModal, setAccountModal] = useState<'login' | 'register' | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [lastCloudSync, setLastCloudSync] = useState<number | null>(null);
  const syncedLabel = conn?.syncedAt
    ? new Date(conn.syncedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'not yet';
  const server = conn?.server;
  const plexLive = conn?.live && Plex.connected;

  function signOut() {
    Conn.clear();
    TreeStore.clear();
    Plex.disconnect();
    onDisconnect?.();
    onOpenWizard();
  }

  useEffect(() => {
    setTmdbKey(Lib.key || conn?.tmdbKey || '');
  }, []);

  useEffect(() => OrbitAccount.onChange(() => setOrbitUser(OrbitAccount.user)), []);

  async function signOutOrbit() {
    await OrbitAccount.logout();
    setOrbitUser(null);
    onAccountChange?.();
  }

  async function syncNow() {
    if (!OrbitAccount.signedIn) return;
    setSyncBusy(true);
    try {
      await OrbitAccount.pushSync();
      setLastCloudSync(Date.now());
    } finally {
      setSyncBusy(false);
    }
  }

  useEffect(() => {
    const trimmed = tmdbKey.trim();
    if (!trimmed || trimmed === Lib.key) return;
    const t = setTimeout(() => Lib.setKey(trimmed), 400);
    return () => clearTimeout(t);
  }, [tmdbKey]);

  function saveTmdb() {
    Lib.setKey(tmdbKey.trim());
    onBump?.();
  }

  function disconnectTmdb() {
    Lib.setKey('');
    Lib.clearCache();
    setTmdbKey('');
    onBump?.();
  }

  const libIcon = (k?: string) => {
    const name = (LIB_ICON[k || ''] || 'film') as keyof typeof ic;
    return ic[name]({});
  };

  return (
    <div className="conns rise">
      <div className="conns-head">
        <div>
          <div className="conns-ey">Connections</div>
          <h2 className="disp">Your server &amp; sources</h2>
        </div>
        <button className="conns-setup" onClick={onOpenWizard}>
          {ic.refresh({})}Re-run setup
        </button>
      </div>

      <div className="conns-grid">
        <div className="conns-card wide orbit-acct-card">
          <div className="conns-card-h">
            <span className="conns-pill">{ic.orbit({})}Orbit account</span>
            <span className={'conns-state' + (orbitUser ? ' on' : '')}>{orbitUser ? 'Signed in' : 'Not signed in'}</span>
          </div>
          <p className="conns-p">
            {orbitUser
              ? 'Your curated collections, artwork, home layout, and settings sync to this Orbit server — sign in on iPad or another browser with the same address to pick up where you left off.'
              : 'Create a free Orbit account so your curation work follows you across devices on this network.'}
          </p>
          <div className="conns-acct">
            <div className="conns-av orbit-acct-av">{(orbitUser?.displayName || 'O').slice(0, 1)}</div>
            <div>
              <div className="conns-acct-n">{orbitUser?.displayName || 'Guest on this device'}</div>
              <div className="conns-acct-s">{orbitUser?.email || 'Changes stay on this browser until you sign in'}</div>
            </div>
          </div>
          <div className="conns-actions">
            {orbitUser ? (
              <>
                <button className="conns-btn sm" disabled={syncBusy} onClick={syncNow}>
                  {syncBusy ? 'Syncing…' : 'Sync now'}
                </button>
                <button className="conns-btn danger sm" onClick={signOutOrbit}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button className="conns-btn primary sm" onClick={() => setAccountModal('login')}>
                  Sign in
                </button>
                <button className="conns-btn sm" onClick={() => setAccountModal('register')}>
                  Create account
                </button>
              </>
            )}
          </div>
          {orbitUser && lastCloudSync && (
            <p className="conns-sub" style={{ marginTop: 10 }}>
              Last uploaded {new Date(lastCloudSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        <div className="conns-card">
          <div className="conns-card-h">
            <span className="conns-pill plex">{ic.plex({})}Plex account</span>
            <span className={'conns-state' + (conn?.connected ? ' on' : '')}>{conn?.connected ? 'Connected' : 'Not connected'}</span>
          </div>
          <div className="conns-acct">
            <div className="conns-av">{(conn?.account?.user || 'O').slice(0, 1)}</div>
            <div>
              <div className="conns-acct-n">{conn?.account?.user || 'Not signed in'}</div>
              <div className="conns-acct-s">
                {conn?.account?.kind === 'demo' ? 'Demo library' : conn?.account?.handle || 'Sign in to connect your Plex server'}
              </div>
            </div>
          </div>
          {conn?.connected ? (
            <button className="conns-btn danger" onClick={signOut}>
              Sign out &amp; reconnect
            </button>
          ) : (
            <button className="conns-btn primary" onClick={onOpenWizard}>
              Sign in with Plex
            </button>
          )}
        </div>

        <div className="conns-card">
          <div className="conns-card-h">
            <span className="conns-pill">{ic.server({})}Server</span>
            {server && <span className={'conns-tag ' + (server.type === 'direct' ? 'good' : 'warn')}>{server.type === 'direct' ? 'Direct' : 'Relay'}</span>}
          </div>
          {server ? (
            <>
              <div className="conns-srv-name">{server.name}</div>
              <dl className="conns-dl">
                <div>
                  <dt>Platform</dt>
                  <dd>{server.platform}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{server.version}</dd>
                </div>
                <div>
                  <dt>Connection</dt>
                  <dd>
                    {server.latency} ms · {server.place}
                  </dd>
                </div>
                <div>
                  <dt>Libraries</dt>
                  <dd>
                    {(conn?.libraries?.length || libs.length) + ' · ' + totalItems.toLocaleString()} items
                  </dd>
                </div>
              </dl>
              {plexLive && (
                <p className="conns-p" style={{ marginTop: 8 }}>
                  Live Plex library — imported via sign-in.
                </p>
              )}
            </>
          ) : (
            <div className="conns-empty">No server connected. Sign in with Plex to import your library.</div>
          )}
        </div>

        <div className="conns-card">
          <div className="conns-card-h">
            <span className="conns-pill">{ic.image({})}Artwork · TMDB</span>
            <span className={'conns-state' + (Lib.connected ? ' on' : '')}>{Lib.connected ? 'Live' : 'Optional'}</span>
          </div>
          <p className="conns-p">
            {Lib.connected ? 'Extra posters and synopses from TMDB.' : 'Optional free key for richer artwork on top of Plex.'}
          </p>
          <div className="conns-field">
            <input
              value={tmdbKey}
              onChange={(e) => setTmdbKey(e.target.value)}
              onBlur={() => { if (tmdbKey.trim()) Lib.setKey(tmdbKey.trim()); }}
              placeholder="TMDB v3 key or v4 token"
            />
          </div>
          <div className="conns-actions">
            {Lib.connected && (
              <button className="conns-btn danger sm" onClick={disconnectTmdb}>
                Disconnect
              </button>
            )}
            <button className="conns-btn primary sm" disabled={!tmdbKey.trim()} onClick={saveTmdb}>
              {Lib.connected ? 'Update' : 'Connect'}
            </button>
          </div>
        </div>

        <div className="conns-card wide">
          <div className="conns-card-h">
            <span className="conns-pill">{ic.film({})}Libraries</span>
            <span className="conns-sub">Last synced {syncedLabel}</span>
          </div>
          <div className="conns-libs">
            {libs.map((l) => {
              const c = OT.countDeep(l);
              return (
                <div key={l.id} className="conns-lib">
                  <span className="conns-lib-ic">{libIcon(l.libKey)}</span>
                  <span className="conns-lib-n">{l.title}</span>
                  <span className="conns-lib-c">{c.films} items</span>
                  <span className="conns-lib-dot on" title="Synced"></span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {accountModal && (
        <OrbitAccountModal
          initialTab={accountModal}
          onClose={() => setAccountModal(null)}
          onSuccess={() => {
            setOrbitUser(OrbitAccount.user);
            onAccountChange?.();
          }}
        />
      )}
    </div>
  );
}
