/* ============ ORBIT — Plex client (real integration layer) ============
   A complete, production-shaped Plex Media Server client. Everything here makes
   REAL Plex API calls; it is wired so the app can run against a live server the
   moment Orbit is deployed somewhere that can reach it (see CLAUDE.md → "Going
   live"). In the in-browser design sandbox these cross-origin calls are blocked,
   so the setup wizard falls back to fetchMock()/the bundled demo library.

   API surface used:
   - Auth (PIN OAuth):   POST https://plex.tv/api/v2/pins  →  app.plex.tv/auth  →  poll pin
   - Discovery:          GET  https://plex.tv/api/v2/resources  (servers + connections)
   - Libraries:          GET  {server}/library/sections
   - Items:              GET  {server}/library/sections/{key}/all
   - Collections:        GET  {server}/library/sections/{key}/collections (+ /children)
   - Artwork:            {server}{thumb|art}?X-Plex-Token=…
   - Playback:           direct: {server}{Part.key}?X-Plex-Token=…
                         transcode: {server}/video/:/transcode/universal/start.m3u8?…
*/
window.OrbitPlex = (function () {
  const PRODUCT = 'Orbit';
  const VERSION = '1.0';

  // stable per-device client identifier (required by Plex on every request)
  const CID_LS = 'orbit.plex.clientId';
  let clientId = localStorage.getItem(CID_LS);
  if (!clientId) { clientId = 'orbit-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(CID_LS, clientId); }

  const CONN_LS = 'orbit.plex.conn';
  let conn = null;          // { url, token }  → a chosen server
  let account = null;       // { token }       → plex.tv account token
  try { conn = JSON.parse(localStorage.getItem(CONN_LS) || 'null'); } catch (e) { conn = null; }
  try { account = JSON.parse(localStorage.getItem('orbit.plex.account') || 'null'); } catch (e) {}

  // Route Plex traffic through Orbit's Express proxy (Docker / npm start / Vite dev).
  const USE_PROXY = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_PLEX_PROXY === '1')
    || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV);

  function tvUrl(path) {
    return USE_PROXY ? '/api/plex/tv' + path : 'https://plex.tv/api' + path;
  }

  function proxyMediaUrl(path) {
    if (!conn || !path) return null;
    return '/api/plex/media?base=' + encodeURIComponent(conn.url)
      + '&path=' + encodeURIComponent(path)
      + '&token=' + encodeURIComponent(conn.token)
      + '&clientId=' + encodeURIComponent(clientId);
  }

  function proxyConnHeaders(token) {
    return {
      ...headers(token),
      'X-Orbit-Plex-Base': conn.url,
      'X-Orbit-Plex-Token': conn.token,
    };
  }

  // Plex identity headers — sent on every plex.tv + server call
  function headers(token) {
    const h = {
      'Accept': 'application/json',
      'X-Plex-Product': PRODUCT,
      'X-Plex-Version': VERSION,
      'X-Plex-Client-Identifier': clientId,
      'X-Plex-Platform': 'Web',
      'X-Plex-Device': 'Orbit',
    };
    if (token) h['X-Plex-Token'] = token;
    return h;
  }

  function setConn(url, token) {
    conn = { url: (url || '').trim().replace(/\/+$/, ''), token: (token || '').trim() };
    localStorage.setItem(CONN_LS, JSON.stringify(conn));
  }
  function setAccount(token) { account = { token }; localStorage.setItem('orbit.plex.account', JSON.stringify(account)); }
  function disconnect() { conn = null; account = null; localStorage.removeItem(CONN_LS); localStorage.removeItem('orbit.plex.account'); }
  function reloadFromStorage() {
    try { conn = JSON.parse(localStorage.getItem(CONN_LS) || 'null'); } catch (e) { conn = null; }
    try { account = JSON.parse(localStorage.getItem('orbit.plex.account') || 'null'); } catch (e) { account = null; }
    const cid = localStorage.getItem(CID_LS);
    if (cid) clientId = cid;
  }

  /* ---------- AUTH: Plex PIN OAuth ---------- */
  // 1) create a PIN/code, 2) send user to app.plex.tv/auth#?clientID&code,
  // 3) poll the pin until it carries an authToken.
  async function createPin() {
    const res = await fetch(tvUrl('/v2/pins?strong=true'), { method: 'POST', headers: headers() });
    if (!res.ok) throw new Error('pin create failed ' + res.status);
    return res.json(); // { id, code, ... }
  }
  function authUrl(code) {
    const params = new URLSearchParams({
      clientID: clientId, code,
      'context[device][product]': PRODUCT,
      forwardUrl: location.href,
    });
    return 'https://app.plex.tv/auth#?' + params.toString();
  }
  async function pollPin(id) {
    const res = await fetch(tvUrl('/v2/pins/' + id), { headers: headers() });
    if (!res.ok) throw new Error('pin poll failed ' + res.status);
    const j = await res.json();
    return j.authToken || null;
  }
  // convenience: open auth in a popup and resolve when authorized (real deployments)
  async function openAuthWindow(url) {
    if (typeof window !== 'undefined' && window.orbitNative && window.orbitNative.openExternal) {
      await window.orbitNative.openExternal(url);
      return null;
    }
    return window.open(url, '_blank', 'width=600,height=720');
  }

  async function signIn({ onCode } = {}) {
    const pin = await createPin();
    if (onCode) onCode(pin.code);
    const win = await openAuthWindow(authUrl(pin.code));
    for (let i = 0; i < 120; i++) {                 // ~4 min @ 2s
      await new Promise((r) => setTimeout(r, 2000));
      const token = await pollPin(pin.id).catch(() => null);
      if (token) { try { win && win.close(); } catch (e) {} setAccount(token); return token; }
    }
    throw new Error('authorization timed out');
  }

  /* ---------- DISCOVERY: servers on the account ---------- */
  async function resources(token) {
    const t = token || (account && account.token);
    const res = await fetch(tvUrl('/v2/resources?includeHttps=1&includeRelay=1'), { headers: headers(t) });
    if (!res.ok) throw new Error('resources failed ' + res.status);
    const list = await res.json();
    return (list || []).filter((r) => (r.provides || '').includes('server')).map((r) => ({
      name: r.name, product: r.product, version: r.productVersion, platform: r.platform,
      token: r.accessToken,
      connections: (r.connections || []).map((c) => ({ uri: c.uri, local: c.local, relay: c.relay })),
    }));
  }
  // pick the best reachable connection (prefer local non-relay, then remote, then relay)
  function bestConnection(server) {
    const cs = server.connections || [];
    return (cs.find((c) => c.local && !c.relay) || cs.find((c) => !c.relay) || cs[0] || {}).uri || '';
  }
  // Order URLs for connectServer — when proxied, Orbit's backend must reach Plex (not the browser).
  function orderConnections(cs) {
    if (USE_PROXY) {
      return [
        ...cs.filter((c) => !c.relay && !c.local),
        ...cs.filter((c) => c.local && !c.relay),
        ...cs.filter((c) => c.relay),
      ];
    }
    return [
      ...cs.filter((c) => c.local && !c.relay),
      ...cs.filter((c) => !c.relay && !c.local),
      ...cs.filter((c) => c.relay),
    ];
  }
  function mapPlexItemEl(el) {
    return {
      ratingKey: el.getAttribute('ratingKey'),
      key: el.getAttribute('key'),
      title: el.getAttribute('title'),
      type: el.getAttribute('type'),
      year: el.getAttribute('year') ? Number(el.getAttribute('year')) : undefined,
      thumb: el.getAttribute('thumb'),
      art: el.getAttribute('art'),
      summary: el.getAttribute('summary') || '',
      duration: el.getAttribute('duration') ? Number(el.getAttribute('duration')) : undefined,
      childCount: el.getAttribute('childCount') ? Number(el.getAttribute('childCount')) : undefined,
      contentRating: el.getAttribute('contentRating'),
      theme: el.getAttribute('theme'),
      viewCount: el.getAttribute('viewCount') ? Number(el.getAttribute('viewCount')) : 0,
      viewOffset: el.getAttribute('viewOffset') ? Number(el.getAttribute('viewOffset')) : 0,
      lastViewedAt: el.getAttribute('lastViewedAt') ? Number(el.getAttribute('lastViewedAt')) : null,
      addedAt: el.getAttribute('addedAt') ? Number(el.getAttribute('addedAt')) : null,
      parentIndex: el.getAttribute('parentIndex') ? Number(el.getAttribute('parentIndex')) : undefined,
      index: el.getAttribute('index') ? Number(el.getAttribute('index')) : undefined,
      Genre: [...el.querySelectorAll('Genre')].map((g) => ({ tag: g.getAttribute('tag') })),
      Media: [...el.querySelectorAll('Media')].map((m) => ({
        videoCodec: m.getAttribute('videoCodec'),
        audioCodec: m.getAttribute('audioCodec'),
        videoResolution: m.getAttribute('videoResolution'),
        container: m.getAttribute('container'),
        Part: [...m.querySelectorAll('Part')].map((p) => ({ key: p.getAttribute('key') })),
      })),
    };
  }

  function parsePlexXml(text) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid XML from Plex');
    const mc = doc.querySelector('MediaContainer');
    if (!mc) throw new Error('Unexpected Plex response');
    const out = { MediaContainer: {} };
    const dirs = [...mc.querySelectorAll('Directory')];
    if (dirs.length) {
      out.MediaContainer.Directory = dirs.map((el) => ({
        key: el.getAttribute('key'),
        ratingKey: el.getAttribute('ratingKey'),
        title: el.getAttribute('title'),
        type: el.getAttribute('type'),
        index: el.getAttribute('index') ? Number(el.getAttribute('index')) : undefined,
        parentIndex: el.getAttribute('parentIndex') ? Number(el.getAttribute('parentIndex')) : undefined,
      }));
    }
    const items = [...mc.querySelectorAll('Metadata'), ...mc.querySelectorAll('Video')];
    if (items.length) {
      out.MediaContainer.Metadata = items.map(mapPlexItemEl);
    }
    return out;
  }
  function parsePlexBody(text) {
    const t = (text || '').trim();
    if (!t) throw new Error('Empty response from Plex server');
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        return JSON.parse(t);
      } catch {
        throw new Error('Truncated or invalid JSON from Plex (' + t.length + ' bytes). Restart Orbit and try again.');
      }
    }
    if (t.startsWith('<?xml') || t.startsWith('<')) return parsePlexXml(t);
    throw new Error('Invalid Plex response (expected JSON). Check that Orbit can reach your server.');
  }
  /** Reuse saved Orbit connection + Plex URL/token after sync or restart (no wizard). */
  async function restoreFromConnState(connState) {
    if (!connState || !connState.connected) return false;
    reloadFromStorage();
    if (conn && conn.url && conn.token) {
      try {
        await sections();
        return true;
      } catch (e) { /* try saved server */ }
    }
    const raw = connState.server && connState.server.raw;
    if (raw && (raw.connections || []).length && raw.token) {
      await connectServer(raw);
      return true;
    }
    return false;
  }

  // Connect to a discovered server — tries each connection URL until /library/sections works.
  async function connectServer(server) {
    const cs = server.connections || [];
    const list = orderConnections(cs);
    if (!list.length) throw new Error('No connection URLs for this server');
    let lastErr = null;
    for (const c of list) {
      try {
        setConn((c.uri || '').replace(/\/+$/, ''), server.token);
        await sections();
        return conn.url;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Could not reach this server from Orbit');
  }

  /* ---------- SERVER API ---------- */
  function newId(p) { return p + '_' + Math.random().toString(36).slice(2, 9); }
  async function img(path) { return imgUrl(path); }
  function imgUrl(path, kind) {
    if (!conn || !path) return null;
    let p = path;
    const fast = typeof document !== 'undefined' && document.documentElement.classList.contains('orbit-fast-posters');
    if (!path.includes('width=')) {
      const sep = path.includes('?') ? '&' : '?';
      if (kind === 'backdrop' || kind === 'art') {
        p = path + sep + (fast ? 'width=1280&height=720&minSize=1&upscale=1' : 'width=3840&height=2160&minSize=1&upscale=1');
      } else if (kind === 'card' || (fast && (kind === 'poster' || kind === 'thumb'))) {
        p = path + sep + 'width=300&height=450&minSize=1&upscale=1';
      } else if (kind === 'poster' || kind === 'thumb') {
        p = path + sep + 'width=800&height=1200&minSize=1&upscale=1';
      }
    }
    if (USE_PROXY) return proxyMediaUrl(p);
    return conn.url + p + (p.includes('?') ? '&' : '?') + 'X-Plex-Token=' + encodeURIComponent(conn.token);
  }
  async function api(path) {
    if (USE_PROXY) {
      const res = await fetch('/api/plex/proxy' + path, { headers: proxyConnHeaders(conn.token) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return parsePlexBody(await res.text());
    }
    const u = conn.url + path + (path.includes('?') ? '&' : '?') + 'X-Plex-Token=' + encodeURIComponent(conn.token);
    const res = await fetch(u, { headers: headers(conn.token) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return parsePlexBody(await res.text());
  }

  function asList(v) {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  }

  // libraries (sections) → only movie/show types map to Orbit libraries
  async function sections() {
    const root = await api('/library/sections');
    return asList(root.MediaContainer && root.MediaContainer.Directory)
      .filter((s) => s.type === 'movie' || s.type === 'show')
      .map((s) => ({ key: String(s.key), title: s.title, type: s.type }));
  }

  const PLEX_IDENT = 'com.plexapp.plugins.library';

  function mediaUrl(path) {
    if (!conn || !path) return null;
    if (USE_PROXY) return proxyMediaUrl(path);
    return conn.url + path + (path.includes('?') ? '&' : '?') + 'X-Plex-Token=' + encodeURIComponent(conn.token);
  }

  // map a Plex metadata item → Orbit title node (movies, shows, episodes)
  function toTitle(it) {
    const media = asList(it.Media)[0] || null;
    const part = media && asList(media.Part)[0];
    const kind = it.type === 'show' ? 'show' : it.type === 'episode' ? 'episode' : 'movie';
    return {
      id: newId(kind === 'show' ? 's' : 'm'),
      type: kind === 'episode' ? 'movie' : kind,
      title: it.title, year: it.year,
      genre: (asList(it.Genre)[0] && asList(it.Genre)[0].tag) || '',
      runtime: it.duration ? Math.round(it.duration / 60000) : null,
      seasons: it.childCount || null,
      rating: it.contentRating || null,
      poster: imgUrl(it.thumb), backdrop: imgUrl(it.art),
      plexKey: String(it.ratingKey),
      partKey: part ? part.key : null,
      duration: it.duration || null,
      videoCodec: media && media.videoCodec, audioCodec: media && media.audioCodec,
      resolution: media && media.videoResolution, container: media && media.container,
      theme: it.theme || null,
      viewCount: it.viewCount ? Number(it.viewCount) : 0,
      viewOffset: it.viewOffset ? Number(it.viewOffset) : 0,
      lastViewedAt: it.lastViewedAt ? Number(it.lastViewedAt) : null,
      addedAt: it.addedAt ? Number(it.addedAt) : null,
    };
  }

  async function getThemeUrl(ratingKey) {
    if (!conn || !ratingKey) return null;
    try {
      const j = await api('/library/metadata/' + ratingKey);
      const it = (j.MediaContainer && j.MediaContainer.Metadata && j.MediaContainer.Metadata[0]) || null;
      if (!it || !it.theme) return null;
      return mediaUrl(it.theme);
    } catch (e) {
      return null;
    }
  }

  function themeUrl(path) {
    return mediaUrl(path);
  }

  async function scrobble(ratingKey) {
    if (!conn || !ratingKey) return;
    await api('/:/scrobble?identifier=' + PLEX_IDENT + '&key=' + encodeURIComponent(ratingKey));
  }

  async function unscrobble(ratingKey) {
    if (!conn || !ratingKey) return;
    await api('/:/unscrobble?identifier=' + PLEX_IDENT + '&key=' + encodeURIComponent(ratingKey));
  }

  async function reportProgress(ratingKey, timeMs) {
    if (!conn || !ratingKey || timeMs < 0) return;
    await api('/:/progress?identifier=' + PLEX_IDENT + '&key=' + encodeURIComponent(ratingKey) + '&time=' + Math.floor(timeMs));
  }

  async function fetchSeasons(showKey) {
    const j = await api('/library/metadata/' + showKey + '/children');
    return ((j.MediaContainer && j.MediaContainer.Metadata) || [])
      .filter((it) => it.type === 'season' && (it.index || 0) > 0)
      .map((it) => ({
        season: it.index || 1,
        title: it.title || 'Season ' + (it.index || 1),
        poster: imgUrl(it.thumb),
        episodes: it.leafCount ? Number(it.leafCount) : (it.childCount ? Number(it.childCount) : 0),
      }))
      .sort((a, b) => a.season - b.season);
  }

  const leavesCache = new Map();

  async function fetchShowLeaves(showKey) {
    const j = await api('/library/metadata/' + showKey + '/allLeaves');
    return asList(j.MediaContainer && j.MediaContainer.Metadata).map((it) => ({
      ratingKey: String(it.ratingKey),
      season: it.parentIndex != null ? Number(it.parentIndex) : 1,
      episode: it.index != null ? Number(it.index) : 1,
      title: it.title,
      summary: it.summary || '',
      still: imgUrl(it.thumb),
      viewCount: it.viewCount ? Number(it.viewCount) : 0,
      viewOffset: it.viewOffset ? Number(it.viewOffset) : 0,
      duration: it.duration ? Number(it.duration) : 0,
    }));
  }

  async function fetchShowLeavesCached(showKey) {
    const hit = leavesCache.get(showKey);
    if (hit && Date.now() - hit.at < 300000) return hit.leaves;
    const leaves = await fetchShowLeaves(showKey);
    leavesCache.set(showKey, { at: Date.now(), leaves });
    return leaves;
  }

  async function pickShowEpisode(node, episode) {
    if (episode && (episode.season != null) && (episode.n != null)) return episode;
    if (!node?.plexKey) return null;
    const leaves = await fetchShowLeavesCached(node.plexKey);
    if (!leaves.length) return null;
    const sorted = leaves.slice().sort((a, b) => a.season - b.season || a.episode - b.episode);
    const inProg = sorted.find(
      (l) => l.viewOffset > 30000 && l.duration && l.viewOffset < l.duration - 60000,
    );
    if (inProg) {
      return { season: inProg.season, n: inProg.episode, title: inProg.title || '' };
    }
    const unwatched = sorted.find((l) => !l.viewCount);
    if (unwatched) {
      return { season: unwatched.season, n: unwatched.episode, title: unwatched.title || '' };
    }
    const first = sorted[0];
    return { season: first.season, n: first.episode, title: first.title || '' };
  }

  // Build the full Orbit tree from selected sections: each section → a library node,
  // holding its collections (with children) + loose (uncollected) items.
  let buildTreeFlight = null;
  async function buildTree(selectedKeys) {
    if (buildTreeFlight) return buildTreeFlight;
    buildTreeFlight = buildTreeInner(selectedKeys).finally(() => { buildTreeFlight = null; });
    return buildTreeFlight;
  }
  async function buildTreeInner(selectedKeys) {
    const allSecs = await sections();
    let secs = allSecs;
    if (selectedKeys && selectedKeys.length) {
      const keySet = new Set(selectedKeys.map(String));
      const picked = allSecs.filter((s) => keySet.has(String(s.key)));
      if (picked.length) secs = picked;
    }
    if (!secs.length) throw new Error('No movie or TV libraries found on your Plex server.');

    const libs = [];
    const usedKeys = [];
    for (const sec of secs) {
      try {
        const allJ = await api('/library/sections/' + sec.key + '/all');
        const all = asList(allJ.MediaContainer && allJ.MediaContainer.Metadata).map(toTitle);
        const inColl = new Set();
        const collNodes = [];
        try {
          const cj = await api('/library/sections/' + sec.key + '/collections');
          for (const col of asList(cj.MediaContainer && cj.MediaContainer.Metadata)) {
            const kj = await api('/library/metadata/' + col.ratingKey + '/children');
            const kids = asList(kj.MediaContainer && kj.MediaContainer.Metadata).map(toTitle);
            kids.forEach((k) => inColl.add(k.plexKey));
            collNodes.push({ id: newId('c'), type: 'collection', title: col.title, blurb: '', plexKey: col.ratingKey, backdrop: imgUrl(col.art), poster: imgUrl(col.thumb), children: kids });
          }
        } catch (e) { /* no collections */ }
        const loose = all.filter((t) => !inColl.has(t.plexKey));
        libs.push({ id: newId('lib'), type: 'library', title: sec.title, libKey: sec.title.toLowerCase().replace(/[^a-z0-9]/g, '') || ('lib' + sec.key), blurb: '', children: [...collNodes, ...loose] });
        usedKeys.push(sec.key);
      } catch (e) {
        /* skip unreachable section */
      }
    }
    return {
      id: 'root',
      type: 'collection',
      title: 'Your Server',
      blurb: 'Live from your Plex server.',
      children: libs,
      _sectionKeys: usedKeys,
    };
  }

  /* ---------- PLAYBACK (Infuse-style: Plex MDE decision → direct, else HLS) ---------- */
  let playbackSession = null;

  function newPlaybackSession() {
    playbackSession = clientId + '-play-' + Date.now();
    return playbackSession;
  }

  function getPlaybackSession() {
    if (!playbackSession) return newPlaybackSession();
    return playbackSession;
  }

  async function startPlaybackSession() {
    try {
      await stopPlayback();
    } catch (e) { /* ignore */ }
    return newPlaybackSession();
  }

  async function pingTranscodeSession(session) {
    if (!conn || !session) return;
    try {
      const q = new URLSearchParams({
        session: String(session),
        'X-Plex-Token': conn.token,
        'X-Plex-Client-Identifier': clientId,
      });
      await fetchRaw('/video/:/transcode/universal/ping?' + q.toString());
    } catch (e) { /* ignore */ }
  }

  async function sendTimeline(ratingKey, { state = 'playing', timeMs = 0, durationMs = 0 } = {}) {
    if (!conn || !ratingKey) return;
    try {
      const q = new URLSearchParams({
        ratingKey: String(ratingKey),
        state: String(state),
        time: String(Math.floor(timeMs)),
        duration: String(Math.floor(durationMs || 0)),
        identifier: PLEX_IDENT,
      });
      await api('/:/timeline?' + q.toString());
    } catch (e) { /* ignore */ }
  }

  function isLocalConnection() {
    if (!conn || !conn.url) return true;
    try {
      const h = new URL(conn.url).hostname;
      return h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.') || h.startsWith('10.') || h.endsWith('.local');
    } catch (e) { return true; }
  }

  // Honest browser profile — Plex MDE uses this to choose direct play vs transcode.
  function browserClientCapabilities() {
    return 'protocols=http-video,http-live-streaming,http-mp4-streaming,http-mp4-video,http-mp4-video-720p,http-streaming-video,http-streaming-video-720p,http-streaming-video-1080p,http-streaming-video-2160p;videoDecoders=h264{profile:high&resolution:2160&level:51},hevc{profile:main&resolution:2160&level:153};audioDecoders=aac{channels:6},mp3{channels:2}';
  }

  function canDirectPlayInBrowser(title) {
    if (!title || !title.partKey) return false;
    const audio = String(title.audioCodec || '').toLowerCase();
    const video = String(title.videoCodec || '').toLowerCase();
    const container = String(title.container || '').toLowerCase();
    if (!audio) return false;
    if (container && !/^(mp4|mov|m4v)$/.test(container)) return false;
    if (!/^(aac|mp3|opus)$/.test(audio)) return false;
    if (video && !/^(h264|avc1|hevc|h265)/.test(video)) return false;
    return true;
  }

  function metadataPath(title) {
    return '/library/metadata/' + title.plexKey;
  }

  function videoResolutionFor(quality) {
    const q = parseInt(quality, 10) || 720;
    if (q >= 2160) return '3840x2160';
    if (q >= 1080) return '1920x1080';
    if (q >= 720) return '1280x720';
    if (q >= 480) return '854x480';
    return '640x360';
  }

  function bitrateForQuality(quality) {
    const q = parseInt(quality, 10) || 720;
    if (q >= 2160) return 40000;
    if (q >= 1080) return 12000;
    if (q >= 720) return 4000;
    if (q >= 480) return 2000;
    return 1000;
  }

  function parseDecision(text) {
    const d = parseDecisionFull(text);
    return { code: d.code, text: d.text };
  }

  /** Plex MDE response — same fields the official client uses to pick direct play vs transcode. */
  function parseDecisionFull(text) {
    try {
      const doc = new DOMParser().parseFromString(text, 'text/xml');
      const mc = doc.querySelector('MediaContainer');
      if (!mc) return { code: 0, text: '', partKey: null };
      const meta = doc.querySelector('Metadata') || doc.querySelector('Video');
      const part = meta?.querySelector('Part');
      const media = meta?.querySelector('Media');
      return {
        code: parseInt(mc.getAttribute('generalDecisionCode') || mc.getAttribute('mdeDecisionCode') || '0', 10),
        text: mc.getAttribute('generalDecisionText') || mc.getAttribute('mdeDecisionText') || '',
        partKey: part?.getAttribute('key') || null,
        videoCodec: media?.getAttribute('videoCodec') || null,
        audioCodec: media?.getAttribute('audioCodec') || null,
      };
    } catch (e) { return { code: 0, text: '', partKey: null }; }
  }

  async function fetchRaw(path) {
    if (!conn) throw new Error('Not connected');
    if (USE_PROXY) {
      const res = await fetch('/api/plex/proxy' + path, {
        headers: {
          ...proxyConnHeaders(conn.token),
          'X-Plex-Client-Capabilities': browserClientCapabilities(),
          'X-Plex-Provides': 'client,player',
        },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }
    const sep = path.includes('?') ? '&' : '?';
    const u = conn.url + path + sep + 'X-Plex-Token=' + encodeURIComponent(conn.token);
    const res = await fetch(u, {
      headers: {
        ...headers(conn.token),
        'X-Plex-Client-Capabilities': browserClientCapabilities(),
        'X-Plex-Provides': 'client,player',
      },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }

  function buildPlaybackParams(title, opts) {
    const q = new URLSearchParams();
    const transcode = String(opts.directPlay) === '0';
    q.set('path', metadataPath(title));
    q.set('session', opts.session || getPlaybackSession());
    q.set('protocol', 'hls');
    q.set('directPlay', opts.directPlay != null ? String(opts.directPlay) : '1');
    q.set('directStream', transcode ? String(opts.directStream != null ? opts.directStream : '1') : '1');
    // Browsers need AAC in HLS — never pass through AC3/DTS (directStreamAudio=0).
    q.set('directStreamAudio', transcode ? '0' : '1');
    q.set('fastSeek', '1');
    q.set('mediaIndex', String(opts.mediaIndex || 0));
    q.set('partIndex', String(opts.partIndex || 0));
    q.set('location', isLocalConnection() ? 'lan' : 'wan');
    q.set('autoAdjustQuality', '0');
    q.set('subtitles', opts.subtitles || 'none');
    q.set('copyts', '1');
    q.set('X-Plex-Token', conn.token);
    q.set('X-Plex-Client-Identifier', clientId);
    q.set('X-Plex-Client-Capabilities', browserClientCapabilities());
    if (opts.hasMDE) q.set('hasMDE', '1');
    if (opts.maxVideoBitrate) q.set('maxVideoBitrate', String(opts.maxVideoBitrate));
    if (opts.videoResolution) {
      q.set('videoResolution', opts.videoResolution);
      q.set('videoQuality', '100');
    }
    if (opts.offset) q.set('offset', String(Math.floor(opts.offset)));
    if (transcode) {
      q.set('mediaBufferSize', '20480');
      q.set('audioBoost', '100');
    }
    return q.toString();
  }

  async function fetchPlaybackDecision(title, opts) {
    const params = buildPlaybackParams(title, { ...opts, hasMDE: true });
    const text = await fetchRaw('/video/:/transcode/universal/decision?' + params);
    return parseDecision(text);
  }

  function proxyStreamUrl(url) {
    if (!USE_PROXY || !conn || !url) return url;
    if (String(url).startsWith('/api/plex/media')) return url;
    try {
      const base = new URL(conn.url);
      const u = /^https?:\/\//i.test(url) ? new URL(url) : new URL(url, base);
      const path = u.pathname + u.search;
      const loopback = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
      const plexMedia = path.includes('/video/:/transcode/') || path.includes('/library/parts/');
      if (loopback || plexMedia || u.origin === base.origin) {
        return proxyMediaUrl(path);
      }
    } catch (e) { /* keep original */ }
    return url;
  }

  function directPlayUrl(title) {
    if (!conn || !title || !title.partKey) return null;
    if (USE_PROXY) return proxyMediaUrl(title.partKey);
    return conn.url + title.partKey + '?X-Plex-Token=' + encodeURIComponent(conn.token);
  }

  // Absolute Plex URL for native players (mpv) — no proxy, full codec support.
  function nativeDirectUrl(title) {
    if (!conn || !title || !title.partKey) return null;
    const sep = title.partKey.includes('?') ? '&' : '?';
    return conn.url + title.partKey + sep + 'X-Plex-Token=' + encodeURIComponent(conn.token);
  }

  async function resolveNativeStream(title) {
    const meta = await ensurePlayable(title);
    if (!meta || !meta.partKey) return { mode: 'none', url: null };
    return { mode: 'native', url: nativeDirectUrl(meta) };
  }

  function transcodeUrl(title, { maxBitrate = 4000, quality = 720, session, offset, subtitles = 'auto' } = {}) {
    if (!conn || !title || !title.plexKey) return null;
    const params = buildPlaybackParams(title, {
      session: session || getPlaybackSession(),
      directPlay: '0',
      subtitles,
      maxVideoBitrate: maxBitrate,
      videoResolution: videoResolutionFor(quality),
      offset: offset || 0,
    });
    const plexPath = '/video/:/transcode/universal/start.m3u8?' + params;
    if (USE_PROXY) return proxyMediaUrl(plexPath);
    return conn.url + plexPath;
  }

  async function ensurePlayable(title) {
    if (!title) return null;
    if (title.partKey && title.plexKey) return title;
    if (title.plexKey) {
      const meta = await fetchMetadata(title.plexKey);
      if (meta) return { ...title, ...meta };
    }
    return title;
  }

  async function fetchEpisodeRatingKey(showKey, season, episode) {
    try {
      const sj = await api('/library/metadata/' + showKey + '/children');
      const seasons = asList(sj.MediaContainer && sj.MediaContainer.Directory).filter((d) => d.type === 'season');
      const seasonNode = seasons.find((s) => Number(s.index) === season);
      if (!seasonNode?.ratingKey) return null;
      const ej = await api('/library/metadata/' + seasonNode.ratingKey + '/children');
      const eps = asList(ej.MediaContainer && ej.MediaContainer.Metadata);
      const epNode = eps.find((e) => Number(e.index) === episode);
      return epNode ? String(epNode.ratingKey) : null;
    } catch (e) { return null; }
  }

  /**
   * Plex-style playback: ask the Media Decision Engine, then return direct play or HLS transcode.
   * Reuses the current session — call startPlaybackSession() when opening a new title.
   */
  function playbackPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem('orbit.settings.v1') || 'null');
      return raw?.playback || { preferDirectPlay: true, quality: 'auto' };
    } catch {
      return { preferDirectPlay: true, quality: 'auto' };
    }
  }

  async function resolveStream(title, quality /* auto | 1080 | 720 | … */) {
    if (!conn || !title) return { mode: 'none', url: null, fallbackUrl: null };
    let meta = await ensurePlayable(title);
    if (!meta || !meta.plexKey) {
      return { mode: 'none', url: null, fallbackUrl: null };
    }

    const session = getPlaybackSession();
    const prefs = playbackPrefs();
    const forcedQ = quality !== 'auto' ? parseInt(quality, 10) || null : null;
    const settingsMaxQ = prefs.quality && prefs.quality !== 'auto' ? parseInt(prefs.quality, 10) || 1080 : 1080;
    const qNum = forcedQ || settingsMaxQ;
    const tryDirect = !forcedQ && prefs.preferDirectPlay !== false;
    const webPlayer = typeof window !== 'undefined' && !window.orbitNative;

    const hlsFor = (offset) => transcodeUrl(meta, {
      session,
      subtitles: 'none',
      quality: qNum,
      maxBitrate: bitrateForQuality(qNum),
      offset,
    });

    // Browser Auto: skip MDE/direct play — HLS transcode starts reliably (local, Docker, Cloudflare).
    if (quality === 'auto' && webPlayer) {
      const hls = hlsFor(0);
      const directUrl = meta.partKey && canDirectPlayInBrowser(meta) ? directPlayUrl(meta) : null;
      if (hls) return { mode: 'transcode', url: hls, fallbackUrl: directUrl };
    }
    const browserDirect = meta.partKey && canDirectPlayInBrowser(meta) ? directPlayUrl(meta) : null;

    const decisionOpts = {
      session,
      directPlay: tryDirect ? '1' : '0',
      subtitles: 'none',
      ...(forcedQ ? {
        maxVideoBitrate: bitrateForQuality(forcedQ),
        videoResolution: videoResolutionFor(forcedQ),
      } : {}),
    };

    try {
      const params = buildPlaybackParams(meta, { ...decisionOpts, hasMDE: true });
      const xml = await Promise.race([
        fetchRaw('/video/:/transcode/universal/decision?' + params),
        new Promise((_, reject) => setTimeout(() => reject(new Error('MDE timeout')), 12000)),
      ]);
      const decision = parseDecisionFull(xml);
      if (decision.partKey && !meta.partKey) meta = { ...meta, partKey: decision.partKey };
      if (decision.videoCodec) meta = { ...meta, videoCodec: decision.videoCodec };
      if (decision.audioCodec) meta = { ...meta, audioCodec: decision.audioCodec };

      const hls = hlsFor(0);
      const directUrl = meta.partKey ? directPlayUrl(meta) : null;
      const canDirect = tryDirect && (decision.code === 1001 || decision.code === 1002);
      const browserOk = meta.partKey && canDirectPlayInBrowser(meta);
      // In the web player, Auto prefers Plex HLS transcode — direct play often hangs on remux/remote files.
      const transcodeFirst = quality === 'auto' && webPlayer && !!hls;

      if (transcodeFirst) {
        return { mode: 'transcode', url: hls, fallbackUrl: browserOk ? directUrl : null };
      }

      if (canDirect && browserOk) {
        return { mode: 'direct', url: directUrl, fallbackUrl: hls || null };
      }

      return hls
        ? { mode: 'transcode', url: hls, fallbackUrl: browserOk ? directUrl : null }
        : { mode: 'none', url: null, fallbackUrl: null };
    } catch (e) {
      const hls = hlsFor(0);
      return hls
        ? { mode: 'transcode', url: hls, fallbackUrl: browserDirect }
        : { mode: 'none', url: null, fallbackUrl: null };
    }
  }

  async function stopPlayback() {
    if (!conn) return;
    try {
      const q = new URLSearchParams({
        session: getPlaybackSession(),
        'X-Plex-Token': conn.token,
        'X-Plex-Client-Identifier': clientId,
      });
      await fetchRaw('/video/:/transcode/universal/stop?' + q.toString());
    } catch (e) { /* ignore */ }
  }
  async function fetchMetadata(ratingKey) {
    if (!conn || !ratingKey) return null;
    try {
      const j = await api('/library/metadata/' + ratingKey);
      const it = asList(j.MediaContainer && j.MediaContainer.Metadata)[0] || null;
      return it ? toTitle(it) : null;
    } catch (e) { return null; }
  }

  async function fetchSubtitleStreamUrl(ratingKey) {
    if (!conn || !ratingKey) return null;
    try {
      const j = await api('/library/metadata/' + ratingKey);
      const it = (j.MediaContainer && j.MediaContainer.Metadata && j.MediaContainer.Metadata[0]) || null;
      if (!it) return null;
      const media = asList(it.Media)[0];
      const part = media && asList(media.Part)[0];
      const streams = part ? asList(part.Stream) : [];
      const sub = streams.find((s) => String(s.streamType) === '3' && s.key);
      if (!sub?.key) return null;
      return imgUrl(sub.key, 'poster');
    } catch (e) {
      return null;
    }
  }

  // Full synopsis + cast/crew from Plex (works without TMDB).
  async function fetchDetails(ratingKey) {
    if (!conn || !ratingKey) return null;
    try {
      const j = await api('/library/metadata/' + ratingKey);
      const it = (j.MediaContainer && j.MediaContainer.Metadata && j.MediaContainer.Metadata[0]) || null;
      if (!it) return null;
      const isShow = it.type === 'show';
      const roles = (it.Role || []).slice(0, 20);
      const directors = (it.Director || []).map((d) => d.tag).filter(Boolean);
      const writers = (it.Writer || []).map((w) => w.tag).filter(Boolean);
      const genres = (it.Genre || []).map((g) => g.tag).filter(Boolean);
      const audience = (it.Rating || []).find((r) => r.type === 'audience' && r.value);
      const voteAverage = audience ? Math.round(Number(audience.value) / 10 * 10) / 10 : null;
      return {
        overview: it.summary || '',
        tagline: '',
        genres,
        voteAverage,
        runtime: !isShow && it.duration ? Math.round(it.duration / 60000) : null,
        seasons: isShow ? (it.childCount || null) : null,
        episodes: null,
        director: !isShow && directors[0] ? directors[0] : null,
        creators: isShow ? writers.slice(0, 3) : [],
        cast: roles.map((r) => ({
          name: r.tag || '',
          character: r.role || '',
          photo: imgUrl(r.thumb),
        })).filter((c) => c.name),
        network: isShow ? (it.studio || null) : null,
        studio: it.studio || null,
        status: null,
      };
    } catch (e) { return null; }
  }

  // Resolve a library node (or show episode) to a playable item with partKey / plexKey.
  async function resolvePlayback(node, episode) {
    if (!conn || !node) return null;
    try {
      if (node.type === 'show' && node.plexKey) {
        const ep = await pickShowEpisode(node, episode);
        if (!ep) return null;
        const leaves = await fetchShowLeavesCached(node.plexKey);
        let leaf = leaves.find((l) => l.season === ep.season && l.episode === ep.n);
        let ratingKey = leaf?.ratingKey;
        if (!ratingKey) ratingKey = await fetchEpisodeRatingKey(node.plexKey, ep.season, ep.n);
        if (!ratingKey) return null;
        const meta = await fetchMetadata(ratingKey);
        if (!meta) return null;
        return {
          ...meta,
          id: node.id,
          title: node.title,
          episodeTitle: meta.title,
          type: node.type,
          playbackKey: meta.plexKey,
        };
      }
      if (node.partKey && node.plexKey) return node;
      if (node.plexKey) {
        const meta = await fetchMetadata(node.plexKey);
        if (!meta) return null;
        return { ...node, ...meta, id: node.id, title: node.title, type: node.type };
      }
    } catch (e) { return null; }
    return null;
  }

  /* ---------- legacy helper used by the existing import modal ---------- */
  async function fetchCollections() {
    const secs = await sections();
    const out = [];
    for (const sec of secs) {
      let colls = [];
      try { const cj = await api('/library/sections/' + sec.key + '/collections'); colls = (cj.MediaContainer && cj.MediaContainer.Metadata) || []; } catch (e) {}
      for (const col of colls) {
        let kids = [];
        try { const kj = await api('/library/metadata/' + col.ratingKey + '/children'); kids = (kj.MediaContainer && kj.MediaContainer.Metadata) || []; } catch (e) {}
        out.push({ title: col.title, library: sec.title, art: imgUrl(col.thumb), items: kids.map(toTitle) });
      }
    }
    return out;
  }

  /* ---------- demo fallback (design sandbox / no server) ---------- */
  function fetchMock() {
    const M = (title, year, genre) => ({ type: 'movie', title, year, genre: genre || '' });
    const S = (title, year, seasons, genre) => ({ type: 'show', title, year, seasons, genre: genre || '' });
    const data = [
      { title: 'Christopher Nolan', library: 'Movies', items: [M('Inception', 2010, 'Sci-Fi'), M('Interstellar', 2014, 'Sci-Fi'), M('The Dark Knight', 2008, 'Action'), M('Dunkirk', 2017, 'War'), M('Tenet', 2020, 'Action'), M('Oppenheimer', 2023, 'Drama')] },
      { title: 'Star Wars', library: 'Movies', items: [M('Star Wars', 1977, 'Sci-Fi'), M('The Empire Strikes Back', 1980, 'Sci-Fi'), M('Return of the Jedi', 1983, 'Sci-Fi'), M('The Force Awakens', 2015, 'Sci-Fi'), S('The Mandalorian', 2019, 3, 'Sci-Fi'), S('Andor', 2022, 2, 'Sci-Fi')] },
      { title: 'Pixar', library: 'Kids Movies', items: [M('Toy Story', 1995, 'Animation'), M('Up', 2009, 'Animation'), M('WALL·E', 2008, 'Animation'), M('Inside Out', 2015, 'Animation'), M('Coco', 2017, 'Animation')] },
      { title: 'Prestige TV', library: 'TV Shows', items: [S('Breaking Bad', 2008, 5, 'Drama'), S('The Wire', 2002, 5, 'Crime'), S('Chernobyl', 2019, 1, 'Drama'), S('True Detective', 2014, 4, 'Crime')] },
      { title: 'Saturday Mornings', library: 'Kids TV', items: [S('Avatar: The Last Airbender', 2005, 3, 'Animation'), S('Gravity Falls', 2012, 2, 'Animation'), S('Bluey', 2018, 3, 'Animation'), S('Adventure Time', 2010, 10, 'Animation')] },
    ];
    return new Promise((res) => setTimeout(() => res(data.map((c) => ({ ...c, art: null }))), 650));
  }

  return {
    // identity / connection
    get clientId() { return clientId; }, setConn, setAccount, disconnect, reloadFromStorage,
    get connected() { return !!(conn && conn.url && conn.token); },
    get conn() { return conn; }, get account() { return account; },
    get useProxy() { return USE_PROXY; },
    // auth + discovery (real)
    createPin, authUrl, pollPin, signIn, resources, bestConnection, connectServer, restoreFromConnState,
    // library + media (real)
    sections, buildTree, fetchCollections, img, imgUrl, mediaUrl, themeUrl, getThemeUrl, api, toTitle,
    fetchMetadata, fetchDetails, fetchSubtitleStreamUrl, resolvePlayback, pickShowEpisode, fetchSeasons, fetchShowLeaves, scrobble, unscrobble, reportProgress,
    sendTimeline, pingTranscodeSession, getPlaybackSession, startPlaybackSession, beginNewPlayback: startPlaybackSession, isLocalConnection,
    // playback (real)
    canDirectPlayInBrowser, proxyStreamUrl, directPlayUrl, nativeDirectUrl, resolveNativeStream,
    transcodeUrl, resolveStream, stopPlayback,
    // demo
    fetchMock,
  };
})();

export const Plex = window.OrbitPlex;
export default Plex;
