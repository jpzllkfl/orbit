import { Innertube } from 'youtubei.js';
import { loadCredentials, saveCredentials } from './store.js';

/** youtubei.js ClientType.TV value — not the shorthand key "TV". */
const YTTV_CLIENT = 'TVHTML5';
const YTTV_USER_AGENT = 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version';
const UNPLUGGED_BROWSE_URL = 'https://tv.youtube.com/youtubei/v1/unplugged/browse';

const pendingSessions = new Map();

function walk(obj, fn) {
  if (!obj || typeof obj !== 'object') return;
  fn(obj);
  if (Array.isArray(obj)) {
    for (const item of obj) walk(item, fn);
  } else {
    for (const v of Object.values(obj)) walk(v, fn);
  }
}

function errorMessageFrom(err) {
  if (!err) return 'YouTube TV request failed.';
  const base = err instanceof Error ? err.message : String(err);
  const detail = err?.info;
  if (typeof detail === 'string' && detail.trim()) {
    const snippet = detail.trim().slice(0, 220);
    if (!base.includes(snippet.slice(0, 40))) return `${base} ${snippet}`;
  }
  return base;
}

export function classifyYoutubeTvError(err) {
  const message = errorMessageFrom(err);
  const needsReconnect = Boolean(
    err?.needsReconnect ||
      /expired|reconnect|not connected|incomplete|invalid tokens|invalid authentication|credentials are|invalid credentials/i.test(
        message,
      ),
  );
  return { message, needsReconnect };
}

function channelFromEpgRow(row) {
  const station = row?.station?.epgStationRenderer;
  const name =
    station?.title?.simpleText ||
    station?.icon?.accessibility?.accessibilityData?.label ||
    station?.channelName?.simpleText;
  if (!name) return null;

  let videoId = row.airings?.[0]?.epgAiringRenderer?.navigationEndpoint?.watchEndpoint?.videoId;
  if (!videoId) {
    videoId =
      row.airings?.[0]?.epgAiringRenderer?.navigationEndpoint?.unpluggedPopupEndpoint?.popupRenderer
        ?.unpluggedSelectionMenuDialogRenderer?.items?.[0]?.unpluggedMenuItemRenderer?.command?.watchEndpoint
        ?.videoId;
  }
  if (!videoId) return null;

  const thumb =
    station?.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
    station?.icon?.thumbnails?.slice(-1)[0]?.url ||
    null;
  const id = String(videoId);
  return {
    id,
    name: String(name).trim(),
    logo: thumb,
    group: station?.category?.simpleText || 'Live',
    videoId: id,
  };
}

function parseChannelsFromBrowse(data) {
  const channels = [];
  const seen = new Set();

  function pushRow(row) {
    const ch = channelFromEpgRow(row);
    if (!ch || seen.has(ch.id)) return;
    seen.add(ch.id);
    channels.push(ch);
  }

  const directRows =
    data?.contents?.epgRenderer?.paginationRenderer?.epgPaginationRenderer?.contents ||
    data?.contents?.epgRenderer?.contents ||
    [];
  for (const item of directRows) {
    if (item?.epgRowRenderer) pushRow(item.epgRowRenderer);
  }

  if (!channels.length) {
    walk(data, (node) => {
      if (node?.epgRowRenderer) pushRow(node.epgRowRenderer);
    });
  }

  return channels.sort((a, b) => a.name.localeCompare(b.name));
}

function browseResponseSummary(data) {
  if (!data || typeof data !== 'object') return 'empty response';
  const keys = Object.keys(data).slice(0, 8).join(', ') || 'none';
  const contentKeys = data.contents ? Object.keys(data.contents).join(', ') : 'no contents';
  const rowCount = [];
  walk(data, (node) => {
    if (node?.epgRowRenderer) rowCount.push(1);
  });
  return `keys=${keys}; contents=${contentKeys}; epgRows=${rowCount.length}`;
}

function ensureTvSessionContext(yt) {
  const client = yt.session.context.client;
  client.clientName = YTTV_CLIENT;
  client.userAgent = YTTV_USER_AGENT;
  if (!yt.session.context.user) {
    yt.session.context.user = { enableSafetyMode: false, lockedSafetyMode: false };
  }
}

function credentialsWithOAuthClient(yt, credentials) {
  const client = yt.session.oauth?.client_id;
  if (!client?.client_id) return credentials;
  return { ...credentials, client };
}

async function ensureFreshAccessToken(yt, userId) {
  const oauth = yt.session.oauth;
  if (!oauth.oauth2_tokens?.access_token) {
    const err = new Error('YouTube TV not connected.');
    err.needsReconnect = true;
    throw err;
  }
  if (oauth.shouldRefreshToken()) {
    try {
      await oauth.refreshAccessToken();
      saveCredentials(userId, credentialsWithOAuthClient(yt, oauth.oauth2_tokens));
    } catch (e) {
      const err = new Error(
        `YouTube TV session expired (${errorMessageFrom(e)}). Disconnect and reconnect in Connections.`,
      );
      err.needsReconnect = true;
      throw err;
    }
  }
  return oauth.oauth2_tokens.access_token;
}

async function fetchUnpluggedBrowse(yt, userId) {
  await ensureFreshAccessToken(yt, userId);
  ensureTvSessionContext(yt);

  const url = new URL(UNPLUGGED_BROWSE_URL);
  let response;
  try {
    response = await yt.session.http.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://tv.youtube.com',
        Referer: 'https://tv.youtube.com/',
        'User-Agent': YTTV_USER_AGENT,
      },
      body: JSON.stringify({ context: yt.session.context }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    const msg = errorMessageFrom(e);
    if (/401|403|invalid credentials/i.test(msg)) {
      const err = new Error('YouTube TV session expired. Disconnect and reconnect in Connections.');
      err.needsReconnect = true;
      throw err;
    }
    throw new Error(`YouTube TV guide failed: ${msg.slice(0, 240)}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('YouTube TV returned an invalid guide response.');
  }

  if (data?.error?.message) {
    const err = new Error(`YouTube TV guide error: ${String(data.error.message).slice(0, 200)}`);
    if (/auth|credential|expired|permission/i.test(data.error.message)) err.needsReconnect = true;
    throw err;
  }

  return data;
}

export async function createAuthenticatedClient(userId) {
  const stored = loadCredentials(userId);
  if (!stored?.credentials) throw new Error('YouTube TV not connected.');

  const yt = await Innertube.create({
    generate_session_locally: true,
    client_type: YTTV_CLIENT,
  });

  yt.session.on('update-credentials', ({ credentials }) => {
    saveCredentials(userId, credentialsWithOAuthClient(yt, credentials));
  });

  try {
    await yt.session.signIn(stored.credentials);
    if (stored.credentials.client && yt.session.oauth && !yt.session.oauth.client_id) {
      yt.session.oauth.client_id = stored.credentials.client;
    }
  } catch (e) {
    const msg = errorMessageFrom(e);
    if (/invalid tokens|refresh access token/i.test(msg)) {
      const err = new Error('YouTube TV credentials are incomplete. Disconnect and reconnect in Connections.');
      err.needsReconnect = true;
      throw err;
    }
    throw new Error(`YouTube TV sign-in failed: ${msg.slice(0, 220)}`);
  }
  return yt;
}

export async function startConnect(userId) {
  const yt = await Innertube.create({
    generate_session_locally: true,
    client_type: YTTV_CLIENT,
  });

  let verification = null;
  let resolved = false;
  let resolveAuth;
  let rejectAuth;
  const authPromise = new Promise((resolve, reject) => {
    resolveAuth = resolve;
    rejectAuth = reject;
  });

  yt.session.on('auth-pending', (data) => {
    verification = {
      verificationUrl: data.verification_url,
      userCode: data.user_code,
    };
    pendingSessions.set(userId, { yt, verification, authPromise, resolveAuth, rejectAuth });
  });

  yt.session.on('auth', ({ credentials }) => {
    resolved = true;
    saveCredentials(userId, credentialsWithOAuthClient(yt, credentials));
    pendingSessions.delete(userId);
    resolveAuth({ ok: true, credentials });
  });

  void yt.session.signIn().catch((e) => {
    if (!resolved) {
      pendingSessions.delete(userId);
      rejectAuth(e);
    }
  });

  await new Promise((r) => setTimeout(r, 800));
  const pending = pendingSessions.get(userId);
  if (!pending?.verification) {
    const stored = loadCredentials(userId);
    if (stored?.credentials) return { status: 'connected', already: true };
    throw new Error('Could not start YouTube TV sign-in. Try again.');
  }
  return {
    status: 'pending',
    verificationUrl: pending.verification.verificationUrl,
    userCode: pending.verification.userCode,
  };
}

export async function pollConnect(userId) {
  const stored = loadCredentials(userId);
  if (stored?.credentials?.access_token && stored?.credentials?.refresh_token) {
    return { status: 'connected' };
  }
  const pending = pendingSessions.get(userId);
  if (!pending) {
    return { status: 'idle', error: 'No sign-in in progress. Click Connect YouTube TV again.' };
  }
  try {
    await Promise.race([
      pending.authPromise,
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch (e) {
    pendingSessions.delete(userId);
    return { status: 'error', error: errorMessageFrom(e) || 'Sign-in failed' };
  }
  if (loadCredentials(userId)?.credentials) {
    return { status: 'connected' };
  }
  return {
    status: 'pending',
    verificationUrl: pending.verification?.verificationUrl,
    userCode: pending.verification?.userCode,
  };
}

export async function disconnect(userId) {
  pendingSessions.delete(userId);
  try {
    const yt = await createAuthenticatedClient(userId);
    await yt.session.signOut();
  } catch {
    /* ignore */
  }
}

export async function listChannels(userId) {
  const stored = loadCredentials(userId);
  if (!stored?.credentials?.access_token) {
    const err = new Error('Connect YouTube TV in Connections first.');
    err.needsReconnect = true;
    throw err;
  }
  if (!stored.credentials.refresh_token) {
    const err = new Error('YouTube TV credentials are incomplete. Disconnect and reconnect in Connections.');
    err.needsReconnect = true;
    throw err;
  }

  const yt = await createAuthenticatedClient(userId);
  const browse = await fetchUnpluggedBrowse(yt, userId);
  const channels = parseChannelsFromBrowse(browse);
  if (!channels.length) {
    throw new Error(
      `No channels in YouTube TV guide (${browseResponseSummary(browse)}). Confirm your subscription is active, then disconnect and reconnect.`,
    );
  }
  return channels;
}

export async function resolveStream(userId, videoId) {
  const yt = await createAuthenticatedClient(userId);
  await ensureFreshAccessToken(yt, userId);
  const info = await yt.getBasicInfo(videoId, { client: 'TV' });
  const format = await yt.getStreamingData(videoId, { type: 'hls', quality: 'best', client: 'TV' });
  if (!format?.url) {
    throw new Error('Could not resolve a playable stream for this channel.');
  }
  return { url: format.url, title: info.basic_info?.title || 'Live TV' };
}
