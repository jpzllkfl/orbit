import { useEffect, useState } from 'react';
import { Conn, Lib, Plex } from '../lib';
import { isDesktopApp } from '../lib/isDesktop';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  patchSettings,
  saveSettings,
  type HeroConfig,
  type HeroSource,
  type OrbitSettings,
  type PlaybackQuality,
} from '../lib/settings';
import type { OrbitNode } from '../types/orbit';
import { Icons } from './icons';

const I = Icons;

type NetworkInfo = {
  port: number;
  lan: string[];
  hostname: string;
};

const HERO_SOURCES: { id: HeroSource; label: string }[] = [
  { id: 'random', label: 'Random shuffle' },
  { id: 'trending_movies', label: 'Trending movies' },
  { id: 'trending_shows', label: 'Trending TV shows' },
  { id: 'trending_all', label: 'Trending movies & TV' },
  { id: 'libraries', label: 'Pick from libraries' },
];

function HeroSettingsBlock({
  title,
  hint,
  config,
  libraries,
  onChange,
}: {
  title: string;
  hint: string;
  config: HeroConfig;
  libraries: OrbitNode[];
  onChange: (next: HeroConfig) => void;
}) {
  function toggleLib(id: string) {
    const ids = config.libraryIds.includes(id) ? config.libraryIds.filter((x) => x !== id) : [...config.libraryIds, id];
    onChange({ ...config, libraryIds: ids });
  }

  return (
    <div className="settings-hero-block">
      <div className="settings-hero-title">{title}</div>
      <p className="settings-hero-hint">{hint}</p>
      <label className="settings-row">
        <span>
          <strong>Source</strong>
          <small>What fills the scrolling hero at the top</small>
        </span>
        <select value={config.source} onChange={(e) => onChange({ ...config, source: e.target.value as HeroSource })}>
          {HERO_SOURCES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {config.source === 'libraries' && (
        <div className="settings-lib-picks">
          <div className="settings-lib-picks-label">Libraries {config.libraryIds.length ? `(${config.libraryIds.length} selected)` : '(all if none selected)'}</div>
          <div className="settings-lib-picks-grid">
            {libraries.map((lb) => (
              <label key={lb.id} className={'settings-lib-pick' + (config.libraryIds.includes(lb.id) ? ' on' : '')}>
                <input type="checkbox" checked={config.libraryIds.includes(lb.id)} onChange={() => toggleLib(lb.id)} />
                <span>{lb.title}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <label className="settings-row">
        <span>
          <strong>Number of titles</strong>
          <small>How many rotate in the carousel</small>
        </span>
        <select value={String(config.count)} onChange={(e) => onChange({ ...config, count: Number(e.target.value) })}>
          <option value="5">5</option>
          <option value="8">8</option>
          <option value="10">10</option>
          <option value="12">12</option>
          <option value="16">16</option>
        </select>
      </label>
      <button type="button" className="settings-btn" onClick={() => onChange({ ...config, seed: config.seed + 1 })}>
        {I.spark({})}Shuffle again
      </button>
    </div>
  );
}

export function SettingsView({
  libraries = [],
  onOpenConnections,
}: {
  libraries?: OrbitNode[];
  onOpenConnections?: () => void;
}) {
  const [settings, setSettings] = useState<OrbitSettings>(() => loadSettings());
  const [net, setNet] = useState<NetworkInfo | null>(null);
  const conn = Conn.load();

  useEffect(() => onSettingsChangeLocal(), []);
  function onSettingsChangeLocal() {
    setSettings(loadSettings());
  }

  useEffect(() => {
    let alive = true;
    fetch('/api/network')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j) setNet(j);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function update(patch: Partial<OrbitSettings>) {
    patchSettings(patch);
    setSettings(loadSettings());
  }

  function resetAll() {
    saveSettings(structuredClone(DEFAULT_SETTINGS));
    setSettings(loadSettings());
  }

  function clearPosterCache() {
    Lib.clearCache();
  }

  const port = net?.port || Number(location.port) || 8090;
  const lanUrls = (net?.lan || []).map((ip) => `http://${ip}:${port}`);
  const localUrl = `${location.protocol}//${location.hostname}:${port}`;

  return (
    <div className="conns rise settings-page">
      <div className="conns-head">
        <div>
          <div className="conns-ey">Settings</div>
          <h2 className="disp">Playback, library &amp; access</h2>
        </div>
        <button type="button" className="conns-setup" onClick={resetAll}>
          {I.spark({})}Reset defaults
        </button>
      </div>

      <div className="conns-grid settings-grid">
        <section className="conns-card wide">
          <div className="conns-card-h">
            <span className="conns-pill">{I.play({})}Playback</span>
          </div>
          <div className="settings-rows">
            <label className="settings-row">
              <span>
                <strong>Streaming quality</strong>
                <small>Max transcode resolution when Plex transcodes (Auto uses transcode in browser)</small>
              </span>
              <select
                value={settings.playback.quality}
                onChange={(e) => update({ playback: { ...settings.playback, quality: e.target.value as PlaybackQuality } })}
              >
                <option value="auto">Auto</option>
                <option value="2160">4K (2160p)</option>
                <option value="1080">1080p</option>
                <option value="720">720p</option>
                <option value="480">480p</option>
              </select>
            </label>
            <label className="settings-row check">
              <span>
                <strong>Prefer direct play</strong>
                <small>Use Plex direct streams when possible (best quality, less server load)</small>
              </span>
              <input
                type="checkbox"
                checked={settings.playback.preferDirectPlay}
                onChange={(e) => update({ playback: { ...settings.playback, preferDirectPlay: e.target.checked } })}
              />
            </label>
            <label className="settings-row check">
              <span>
                <strong>Auto-play next episode</strong>
                <small>Continue to the next episode when one finishes</small>
              </span>
              <input
                type="checkbox"
                checked={settings.playback.autoPlayNext}
                onChange={(e) => update({ playback: { ...settings.playback, autoPlayNext: e.target.checked } })}
              />
            </label>
            <label className="settings-row check">
              <span>
                <strong>Resume playback</strong>
                <small>Pick up where you left off on movies and shows</small>
              </span>
              <input
                type="checkbox"
                checked={settings.playback.resumePlayback}
                onChange={(e) => update({ playback: { ...settings.playback, resumePlayback: e.target.checked } })}
              />
            </label>
          </div>
        </section>

        <section className="conns-card">
          <div className="conns-card-h">
            <span className="conns-pill">{I.image({})}Appearance</span>
          </div>
          <div className="settings-rows">
            <label className="settings-row check">
              <span>
                <strong>Fast posters</strong>
                <small>Smaller Plex thumbs + lazy load (recommended for large libraries)</small>
              </span>
              <input
                type="checkbox"
                checked={settings.appearance.fastPosters}
                onChange={(e) => update({ appearance: { ...settings.appearance, fastPosters: e.target.checked } })}
              />
            </label>
            <label className="settings-row check">
              <span>
                <strong>Reduce motion</strong>
                <small>Less animation on hovers and transitions</small>
              </span>
              <input
                type="checkbox"
                checked={settings.appearance.reduceMotion}
                onChange={(e) => update({ appearance: { ...settings.appearance, reduceMotion: e.target.checked } })}
              />
            </label>
            <button type="button" className="settings-btn" onClick={clearPosterCache}>
              Clear poster metadata cache
            </button>
          </div>
        </section>

        <section className="conns-card wide">
          <div className="conns-card-h">
            <span className="conns-pill">{I.image({})}Hero carousel</span>
          </div>
          <HeroSettingsBlock
            title="Home screen"
            hint="The big scrolling backdrop on Home across all libraries."
            config={settings.hero.home}
            libraries={libraries}
            onChange={(home) => update({ hero: { ...settings.hero, home } })}
          />
          <HeroSettingsBlock
            title="Inside a library"
            hint="The hero when you open Movies, TV, or another library."
            config={settings.hero.library}
            libraries={libraries}
            onChange={(library) => update({ hero: { ...settings.hero, library } })}
          />
        </section>

        <section className="conns-card">
          <div className="conns-card-h">
            <span className="conns-pill">{I.lib({})}Library</span>
          </div>
          <div className="settings-rows">
            <label className="settings-row">
              <span>
                <strong>Default library tab</strong>
                <small>When opening a library</small>
              </span>
              <select
                value={settings.library.defaultTab}
                onChange={(e) =>
                  update({
                    library: { ...settings.library, defaultTab: e.target.value as OrbitSettings['library']['defaultTab'] },
                  })
                }
              >
                <option value="recommended">Recommended</option>
                <option value="library">All titles</option>
                <option value="collections">Collections</option>
              </select>
            </label>
            <label className="settings-row">
              <span>
                <strong>Initial grid size</strong>
                <small>Posters loaded per batch when browsing</small>
              </span>
              <select
                value={String(settings.library.initialGridBatch)}
                onChange={(e) => update({ library: { ...settings.library, initialGridBatch: Number(e.target.value) } })}
              >
                <option value="24">24</option>
                <option value="36">36</option>
                <option value="48">48</option>
                <option value="72">72</option>
              </select>
            </label>
            <label className="settings-row check">
              <span>
                <strong>Auto collections</strong>
                <small>Group library titles into decade and genre collections automatically</small>
              </span>
              <input
                type="checkbox"
                checked={settings.library.autoCollections}
                onChange={(e) => update({ library: { ...settings.library, autoCollections: e.target.checked } })}
              />
            </label>
            <label className="settings-row check">
              <span>
                <strong>Instant posters</strong>
                <small>Show saved poster URLs immediately — no lazy-load wait when metadata is already known</small>
              </span>
              <input
                type="checkbox"
                checked={settings.library.instantPosters}
                onChange={(e) => update({ library: { ...settings.library, instantPosters: e.target.checked } })}
              />
            </label>
          </div>
        </section>

        <section className="conns-card wide">
          <div className="conns-card-h">
            <span className="conns-pill">{I.server({})}Remote access</span>
            <span className={'conns-state' + (conn?.connected ? ' on' : '')}>{conn?.connected ? 'Plex linked' : 'Not connected'}</span>
          </div>
          <p className="conns-p">
            Orbit runs as a web app on your PC. Other devices on your network open Orbit in a browser — Plex stays on your server; Orbit is the player UI.
          </p>
          <div className="settings-url-block">
            <div className="settings-url-label">This device</div>
            <code className="settings-url">{localUrl}</code>
          </div>
          {lanUrls.length > 0 && (
            <div className="settings-url-block">
              <div className="settings-url-label">Same Wi‑Fi (iPad, iPhone, laptop)</div>
              {lanUrls.map((u) => (
                <code key={u} className="settings-url">
                  {u}
                </code>
              ))}
            </div>
          )}
          <div className="settings-callout">
            <h4>Access from outside your home</h4>
            <ol>
              <li>
                <strong>Tailscale</strong> (easiest) — install Tailscale on your PC and phone/tablet. Use your PC&apos;s Tailscale IP with port {port}.
              </li>
              <li>
                <strong>VPN to home</strong> — connect to your router VPN, then use a LAN address above.
              </li>
              <li>
                <strong>Port forward</strong> — forward TCP {port} on your router to this PC. Use your public IP or DDNS. Use HTTPS via a reverse proxy (Caddy/nginx) for production.
              </li>
            </ol>
          </div>
          <div className="settings-callout">
            <h4>Apple TV &amp; living room</h4>
            <ul>
              <li>
                <strong>Today:</strong> Open Orbit in the browser on iPad/iPhone and <strong>AirPlay</strong> to Apple TV, or use a laptop connected to the TV.
              </li>
              <li>
                <strong>tvOS browser apps</strong> (e.g. Browsehere) can load your Orbit URL on the same network — performance varies.
              </li>
              <li>
                <strong>Coming next:</strong> A native tvOS / iOS client would give the Infuse-like experience with direct HLS and top-shelf integration.
              </li>
            </ul>
          </div>
          {isDesktopApp() && (
            <p className="conns-p muted">
              Desktop: after restart, Orbit listens on all interfaces (<code>0.0.0.0:{port}</code>). On your phone, open{' '}
              <code>http://&lt;PC-Tailscale-IP&gt;:{port}</code> in Safari — not the Electron app. Allow Windows Firewall for
              Electron on private networks if the page won&apos;t load.
            </p>
          )}
          {onOpenConnections && (
            <button type="button" className="settings-btn primary" onClick={onOpenConnections}>
              Manage Plex &amp; account connections
            </button>
          )}
        </section>

        <section className="conns-card wide">
          <div className="conns-card-h">
            <span className="conns-pill">{I.doc({})}About</span>
          </div>
          <p className="conns-p">
            Orbit Desktop · Plex proxy {Plex.connected ? 'active' : 'offline'} · {isDesktopApp() ? 'Electron' : 'Web'} build
          </p>
        </section>
      </div>
    </div>
  );
}
