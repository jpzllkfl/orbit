import { useEffect, useState } from 'react';
import { Conn, Lib, OT, OrbitAccount, Plex } from '../lib';
import { isDesktopApp } from '../lib/isDesktop';
import {
  loadLiveTvConfig,
  saveLiveTvConfig,
  type LiveTvSource,
} from '../lib/liveTvConfig';
import {
  disconnectYoutubeTv,
  fetchYoutubeTvStatus,
  pollYoutubeTvConnect,
  startYoutubeTvConnect,
} from '../lib/youtubeTv';
import { loadSettings, patchSettings } from '../lib/settings';
import { plexMetadataOnly } from '../lib/plexMetadataMode';
import { getHomeServer, isUsingRemoteHome, setHomeServer } from '../lib/orbitServer';
import type { OrbitNode } from '../types/orbit';
import type { UpdateStatus } from '../types/native';
import { OrbitAccountModal } from './OrbitAccountModal';
import { MediaServerPanel } from './MediaServerPanel';
import { Icons, LIB_ICON } from './icons';

const ic = {
  ...Icons,
  plex: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M5 2h6.5L17 12l-5.5 10H5l5.5-10z" />
    </svg>
  ),
  tv: Icons.tv,
  refresh: Icons.spark,
};

export function ConnectionsView({
  tree,
  onOpenWizard,
  onDisconnect,
  onBump,
  onAccountChange,
  onOmsImport,
  onSyncPlexMetadata,
}: {
  tree: OrbitNode;
  onOpenWizard: () => void;
  onDisconnect?: () => void;
  onBump?: () => void;
  onAccountChange?: () => void;
  onOmsImport?: (merged: OrbitNode) => void | Promise<void>;
  onSyncPlexMetadata?: () => void | Promise<void>;
}) {
  const conn = Conn.load();
  const libs = (tree.children || []).filter((n) => n.type === 'library');
  const totalItems = libs.reduce((a, l) => a + OT.countDeep(l).films, 0);
  const [tmdbKey, setTmdbKey] = useState(() => Lib.key || '');
  const [orbitUser, setOrbitUser] = useState(() => OrbitAccount.user);
  const [accountModal, setAccountModal] = useState<'login' | 'register' | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [plexMetaBusy, setPlexMetaBusy] = useState(false);
  const [plexMetaOnly, setPlexMetaOnly] = useState(() => plexMetadataOnly());
  const [lastCloudSync, setLastCloudSync] = useState<number | null>(null);
  const [homeUrl, setHomeUrl] = useState(() => getHomeServer());
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [liveTvCfg, setLiveTvCfg] = useState(loadLiveTvConfig);
  const [liveSource, setLiveSource] = useState<LiveTvSource>(() => liveTvCfg.source);
  const [yttvConnected, setYttvConnected] = useState(false);
  const [yttvBusy, setYttvBusy] = useState(false);
  const [yttvMsg, setYttvMsg] = useState<string | null>(null);
  const [yttvPending, setYttvPending] = useState<{ url: string; code: string } | null>(null);
  const syncedLabel = conn?.syncedAt
    ? new Date(conn.syncedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'not yet';
  const server = conn?.server;
  const plexLinked = !!(conn?.connected && server && Plex.connected);
  const plexStale = !!(conn?.connected && server && !Plex.connected);

  function signOut() {
    Conn.clear();
    Plex.disconnect();
    if (OrbitAccount.signedIn) {
      const bundle: Record<string, string> = {};
      try {
        bundle['orbit.conn.v1'] = JSON.stringify({ connected: false });
      } catch {
        /* ignore */
      }
      OrbitAccount.pushSyncReplace(bundle).catch(() => {});
    }
    onDisconnect?.();
  }

  useEffect(() => {
    if (!OrbitAccount.signedIn) return;
    void fetchYoutubeTvStatus().then((s) => setYttvConnected(s.connected));
  }, [orbitUser]);

  useEffect(() => {
    setTmdbKey(Lib.key || conn?.tmdbKey || '');
  }, []);

  useEffect(() => OrbitAccount.onChange(() => setOrbitUser(OrbitAccount.user)), []);

  useEffect(() => {
    if (!OrbitAccount.signedIn) {
      setYttvConnected(false);
      return;
    }
    void fetchYoutubeTvStatus()
      .then((st) => setYttvConnected(st.connected))
      .catch(() => setYttvConnected(false));
  }, [orbitUser?.id]);

  useEffect(() => {
    if (!isDesktopApp() || !window.orbitNative?.getInfo) return;
    window.orbitNative.getInfo().then((info) => {
      if (info.appVersion) setAppVersion(info.appVersion);
    });
    window.orbitNative.getUpdateStatus?.().then((s) => setUpdateStatus(s));
    return window.orbitNative.onUpdateStatus?.((s) => setUpdateStatus(s));
  }, []);

  async function checkDesktopUpdate() {
    if (!window.orbitNative?.checkForUpdates) return;
    setUpdateBusy(true);
    try {
      const s = await window.orbitNative.checkForUpdates();
      setUpdateStatus(s);
    } finally {
      setUpdateBusy(false);
    }
  }

  function installDesktopUpdate() {
    window.orbitNative?.installUpdate?.();
  }

  async function signOutOrbit() {
    await OrbitAccount.logout();
    setOrbitUser(null);
    onAccountChange?.();
  }

  async function syncNow() {
    if (!OrbitAccount.signedIn) return;
    setSyncBusy(true);
    try {
      await OrbitAccount.pullSync();
      await OrbitAccount.pushSyncNow();
      setLastCloudSync(Date.now());
      onBump?.();
      onAccountChange?.();
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
        <MediaServerPanel tree={tree} onImported={onOmsImport} />

        {isDesktopApp() && (
          <div className="conns-card wide">
            <div className="conns-card-h">
              <span className="conns-pill">{ic.refresh({})}Desktop updates</span>
              <span className={'conns-state' + (updateStatus?.state === 'ready' ? ' on' : '')}>
                {appVersion ? `v${appVersion}` : 'Desktop'}
              </span>
            </div>
            <p className="conns-sub">
              Orbit checks GitHub for new desktop builds automatically. After this one-time install, updates download
              in the background — restart when prompted.
            </p>
            {updateStatus?.message && (
              <p className="conns-sub oms-msg" style={{ marginTop: 8 }}>
                {updateStatus.message}
              </p>
            )}
            <div className="conns-actions" style={{ marginTop: 10 }}>
              <button className="conns-btn sm" disabled={updateBusy} onClick={checkDesktopUpdate}>
                {updateBusy ? 'Checking…' : 'Check for updates'}
              </button>
              {updateStatus?.state === 'ready' && (
                <button className="conns-btn primary sm" onClick={installDesktopUpdate}>
                  Restart &amp; install update
                </button>
              )}
            </div>
          </div>
        )}

        <div className="conns-card wide orbit-acct-card">
          <div className="conns-card-h">
            <span className="conns-pill">{ic.orbit({})}Orbit account</span>
            <span className={'conns-state' + (orbitUser ? ' on' : '')}>{orbitUser ? 'Signed in' : 'Not signed in'}</span>
          </div>
          <p className="conns-p">
            {orbitUser
              ? 'Your library, media folders, artwork, and settings sync through your Orbit account — like Plex, one home server, any device.'
              : 'Create a free Orbit account so your media libraries and curation follow you on web and desktop.'}
          </p>
          {(isDesktopApp() || isUsingRemoteHome()) && (
            <label className="oms-path" style={{ marginTop: 12, display: 'block' }}>
              Orbit home server
              <input
                value={homeUrl}
                onChange={(e) => setHomeUrl(e.target.value)}
                placeholder="https://orbit.broken-eye.com"
                spellCheck={false}
              />
            </label>
          )}
          {(isDesktopApp() || isUsingRemoteHome()) && (
            <div className="conns-actions" style={{ marginTop: 8 }}>
              <button
                className="conns-btn sm"
                onClick={() => {
                  setHomeServer(homeUrl);
                  if (OrbitAccount.signedIn) OrbitAccount.pushSync().catch(() => {});
                  onBump?.();
                }}
              >
                Save home server
              </button>
            </div>
          )}
          {isDesktopApp() && (
            <p className="conns-sub" style={{ marginTop: 8 }}>
              Desktop scans folders on this PC (local media server) and syncs your library layout to your account. Sign
              in with the same email on web and iPad, then tap <strong>Sync now</strong>.
            </p>
          )}
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
            <>
              <p className="conns-sub" style={{ marginTop: 10 }}>
                Link Plex to pull posters, theme music, titles, and collection artwork onto your Orbit Media Server
                libraries. Your files and direct play stay on OMS.
              </p>
              <button type="button" className="conns-btn primary sm" style={{ marginTop: 10 }} onClick={onOpenWizard}>
                {ic.plex({ style: { width: 16, height: 16 } })}
                Connect Plex for artwork
              </button>
            </>
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
              {plexStale && (
                <p className="conns-sub oms-msg" style={{ marginTop: 12 }}>
                  Plex account is saved but the server link expired. Use <strong>Re-run setup</strong> or sign out and
                  connect again to refresh posters and themes.
                </p>
              )}
              {(plexLinked || plexStale) && (
                <div style={{ marginTop: 12 }}>
                  <label className="settings-row check" style={{ marginBottom: 10 }}>
                    <span>
                      <strong>Plex for artwork &amp; metadata only</strong>
                      <small>
                        Orbit Media Server keeps your libraries and direct play. Plex supplies posters, themes, titles,
                        and collection art — not your file list.
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={plexMetaOnly}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setPlexMetaOnly(on);
                        patchSettings({ connections: { ...loadSettings().connections, plexMetadataOnly: on } });
                      }}
                    />
                  </label>
                  {plexMetaOnly ? (
                    <p className="conns-p">
                      Plex is linked for posters, themes, and collection artwork. Libraries come from Orbit Media Server.
                    </p>
                  ) : (
                    <p className="conns-p">Plex can import full libraries into the sidebar (legacy mode).</p>
                  )}
                  <div className="conns-actions" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="conns-btn sm"
                      disabled={plexMetaBusy || !plexLinked}
                      onClick={() => {
                        setPlexMetaBusy(true);
                        Promise.resolve(onSyncPlexMetadata?.()).finally(() => {
                          setPlexMetaBusy(false);
                          onBump?.();
                        });
                      }}
                    >
                      {plexMetaBusy ? 'Syncing…' : 'Sync Plex artwork'}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="conns-empty">No Plex server linked. Orbit Media Server works without Plex.</div>
          )}
        </div>

        <div className="conns-card wide">
          <div className="conns-card-h">
            <span className="conns-pill">{ic.tv({})}YouTube TV</span>
            <span className={'conns-state' + (yttvConnected ? ' on' : '')}>
              {yttvConnected ? 'Connected' : 'Not connected'}
            </span>
          </div>
          <p className="conns-sub">
            Sign in with your Google account that has an active YouTube TV subscription. Orbit loads your live
            channel lineup and plays streams directly — no ErsatzTV or Plex tuner required.
          </p>
          {yttvMsg && (
            <p className="conns-sub oms-msg" style={{ marginTop: 8 }}>
              {yttvMsg}
            </p>
          )}
          <div className="conns-actions" style={{ marginTop: 12 }}>
            {!yttvConnected ? (
              <button
                className="conns-btn primary sm"
                disabled={yttvBusy || !orbitUser}
                onClick={async () => {
                  if (!orbitUser) {
                    setYttvMsg('Sign in to your Orbit account first.');
                    return;
                  }
                  setYttvBusy(true);
                  setYttvMsg(null);
                  setYttvPending(null);
                  try {
                    const start = await startYoutubeTvConnect();
                    if (start.status === 'connected' || start.already) {
                      setYttvConnected(true);
                      setYttvMsg('YouTube TV connected. Open Live TV in the sidebar.');
                      saveLiveTvConfig({ source: 'youtubetv' });
                      setLiveSource('youtubetv');
                      return;
                    }
                    if (start.verificationUrl && start.userCode) {
                      setYttvPending({ url: start.verificationUrl, code: start.userCode });
                      setYttvMsg('Enter the code at the Google page, then wait…');
                      const deadline = Date.now() + 180000;
                      while (Date.now() < deadline) {
                        await new Promise((r) => window.setTimeout(r, 2500));
                        const st = await pollYoutubeTvConnect();
                        if (st.status === 'connected') {
                          setYttvConnected(true);
                          setYttvPending(null);
                          setYttvMsg('YouTube TV connected. Open Live TV in the sidebar.');
                          saveLiveTvConfig({ source: 'youtubetv' });
                          setLiveSource('youtubetv');
                          if (OrbitAccount.signedIn) await OrbitAccount.pushSyncNow();
                          onBump?.();
                          return;
                        }
                        if (st.status === 'error') throw new Error(st.error || 'Sign-in failed');
                      }
                      throw new Error('Sign-in timed out. Try again.');
                    }
                  } catch (e) {
                    setYttvMsg(e instanceof Error ? e.message : 'Connect failed');
                  } finally {
                    setYttvBusy(false);
                  }
                }}
              >
                {yttvBusy ? 'Waiting for Google…' : 'Connect YouTube TV'}
              </button>
            ) : (
              <button
                className="conns-btn sm"
                disabled={yttvBusy}
                onClick={async () => {
                  setYttvBusy(true);
                  try {
                    await disconnectYoutubeTv();
                    setYttvConnected(false);
                    setYttvPending(null);
                    setYttvMsg('Disconnected.');
                    if (OrbitAccount.signedIn) await OrbitAccount.pushSyncNow();
                    onBump?.();
                  } finally {
                    setYttvBusy(false);
                  }
                }}
              >
                Disconnect
              </button>
            )}
          </div>
          {yttvPending && (
            <div className="yttv-pending" style={{ marginTop: 14 }}>
              <p className="conns-sub">
                Go to{' '}
                <a href={yttvPending.url} target="_blank" rel="noreferrer">
                  {yttvPending.url}
                </a>{' '}
                and enter code:
              </p>
              <p className="yttv-code">{yttvPending.code}</p>
            </div>
          )}

          <details className="conns-advanced" style={{ marginTop: 16 }}>
            <summary className="conns-sub" style={{ cursor: 'pointer' }}>
              Advanced: Plex Live TV fallback
            </summary>
            <div className="livetv-conns-source" style={{ marginTop: 12 }}>
              <div className="livetv-source-toggle">
                <button
                  type="button"
                  className={liveSource === 'youtubetv' ? 'on' : ''}
                  onClick={() => {
                    setLiveSource('youtubetv');
                    setLiveTvCfg(saveLiveTvConfig({ source: 'youtubetv' }));
                  }}
                >
                  YouTube TV
                </button>
                <button
                  type="button"
                  className={liveSource === 'plex' ? 'on' : ''}
                  disabled={!Plex.connected}
                  onClick={() => {
                    setLiveSource('plex');
                    setLiveTvCfg(saveLiveTvConfig({ source: 'plex' }));
                  }}
                >
                  Plex Live TV
                </button>
              </div>
            </div>
            <div className="conns-actions" style={{ marginTop: 10 }}>
              <button
                className="conns-btn sm"
                onClick={() => {
                  saveLiveTvConfig({ source: liveSource });
                  onBump?.();
                  setYttvMsg('Live TV source saved.');
                }}
              >
                Save source preference
              </button>
            </div>
          </details>
        </div>

        <div className="conns-card">
          <div className="conns-card-h">
            <span className="conns-pill">{ic.image({})}Artwork · TMDB</span>
            <span className={'conns-state' + (Lib.connected ? ' on' : '')}>{Lib.connected ? 'Live' : 'Set server key'}</span>
          </div>
          <p className="conns-p">
            {Lib.connected
              ? 'Built into Orbit — posters, backdrops, cast, and synopses work automatically (movies & shows).'
              : 'TMDB is built into Orbit — posters and metadata load automatically after library scans.'}
          </p>
          <div className="conns-field">
            <input
              value={tmdbKey}
              onChange={(e) => setTmdbKey(e.target.value)}
              onBlur={() => { if (tmdbKey.trim()) Lib.setKey(tmdbKey.trim()); }}
              placeholder="Optional personal TMDB override"
            />
          </div>
          <div className="conns-actions">
            {Lib.key && (
              <button className="conns-btn danger sm" onClick={disconnectTmdb}>
                Clear override
              </button>
            )}
            <button className="conns-btn primary sm" disabled={!tmdbKey.trim()} onClick={saveTmdb}>
              {Lib.key ? 'Save override' : 'Save override'}
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
