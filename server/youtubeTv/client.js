import { Innertube } from 'youtubei.js';
import {
  cloudflareBlockError,
  looksLikeHtml,
  sanitizeYoutubeTvErrorText,
} from './errors.js';
import { loadCredentials, saveCredentials } from './store.js';

/** youtubei.js ClientType.TV value — not the shorthand key "TV". */
const YTTV_CLIENT = 'TVHTML5';
const YTTV_CLIENT_VERSION = '7.20250219.14.00';
const YTTV_CLIENT_NAME_ID = '7';
const YTTV_USER_AGENT = 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version';

const UNPLUGGED_BROWSE_ENDPOINTS = [
  {
    url: 'https://www.youtube.com/youtubei/v1/unplugged/browse',
    origin: 'https://www.youtube.com',
    referer: 'https://tv.youtube.com/',
  },
  {
    url: 'https://tv.youtube.com/youtubei/v1/unplugged/browse',
    origin: 'https://tv.youtube.com',
    referer: 'https://tv.youtube.com/',
  },
];

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
  const base = sanitizeYoutubeTvErrorText(err instanceof Error ? err.message : String(err));
  const detail = err?.info;
  if (typeof detail === 'string' && detail.trim() && !looksLikeHtml(detail)) {
    const snippet = sanitizeYoutubeTvErrorText(detail);
    if (snippet && !base.includes(snippet.slice(0, 40))) return `${base} ${snippet}`;
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

function browseRequestBody(yt) {
  ensureTvSessionContext(yt);
  const context = JSON.parse(JSON.stringify(yt.session.context));
  context.client.clientName = YTTV_CLIENT;
  context.client.clientVersion = YTTV_CLIENT_VERSION;
  context.client.userAgent = YTTV_USER_AGENT;
  return JSON.stringify({ context });
}

function browseHeaders(endpoint, accessToken) {
  return {
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Origin: endpoint.origin,
    Referer: endpoint.referer,
    'User-Agent': YTTV_USER_AGENT,
    'X-YouTube-Client-Name': YTTV_CLIENT_NAME_ID,
    'X-YouTube-Client-Version': YTTV_CLIENT_VERSION,
  };
}

function parseBrowseResponse(text, contentType, status, url) {
  if (looksLikeHtml(text) || /text\/html/i.test(contentType || '')) {
    throw cloudflareBlockError();
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    if (looksLikeHtml(text)) throw cloudflareBlockError();
    throw new Error('YouTube TV returned an invalid guide response.');
  }
  if (status === 401 || status === 403) {
    const err = new Error('YouTube TV session expired. Disconnect and reconnect in Connections.');
    err.needsReconnect = true;
    throw err;
  }
  if (!status || status >= 400) {
    const apiMsg = data?.error?.message ? String(data.error.message) : `HTTP ${status}`;
    if (/auth|credential|expired|permission|sign in/i.test(apiMsg)) {
      const err = new Error('YouTube TV session expired. Disconnect and reconnect in Connections.');
      err.needsReconnect = true;
      throw err;
    }
    if (looksLikeHtml(apiMsg)) throw cloudflareBlockError();
    throw new Error(`YouTube TV guide failed: ${sanitizeYoutubeTvErrorText(apiMsg)}`);
  }
  if (data?.error?.message) {
    const err = new Error(
      `YouTube TV guide error: ${sanitizeYoutubeTvErrorText(String(data.error.message))}`,
    );
    if (/auth|credential|expired|permission/i.test(data.error.message)) err.needsReconnect = true;
    throw err;
  }
  return data;
}

async function postUnpluggedBrowse(endpoint, body, accessToken, fetchImpl = fetch) {
  const url = new URL(endpoint.url);
  url.searchParams.set('prettyPrint', 'false');
  url.searchParams.set('alt', 'json');
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: browseHeaders(endpoint, accessToken),
    body,
    signal: AbortSignal.timeout(15000),
  });
  const contentType = response.headers?.get?.('content-type') || '';
  const text = await response.text();
  return parseBrowseResponse(text, contentType, response.status, url.toString());
}

async function fetchUnpluggedBrowse(yt, userId, { fetchImpl } = {}) {
  const accessToken = await ensureFreshAccessToken(yt, userId);
  const body = browseRequestBody(yt);
  const doFetch = fetchImpl || fetch;
  let lastErr;

  for (const endpoint of UNPLUGGED_BROWSE_ENDPOINTS) {
    try {
      return await postUnpluggedBrowse(endpoint, body, accessToken, doFetch);
    } catch (e) {
      lastErr = e;
      if (e?.blockedByCloudflare) continue;
      if (e?.needsReconnect) throw e;
    }
  }

  if (lastErr) throw lastErr;
  throw cloudflareBlockError();
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

export async function listChannels(userId, opts = {}) {
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
  const browse = await fetchUnpluggedBrowse(yt, userId, { fetchImpl: opts.fetchImpl });
  const channels = parseChannelsFromBrowse(browse);
  if (!channels.length) {
    throw new Error(
      `No channels in YouTube TV guide (${browseResponseSummary(browse)}). Confirm your subscription is active, then disconnect and reconnect.`,
    );
  }
  return channels;
}

/** Execute an Innertube browse from this host (desktop relay). */
export async function relayInnertubeFetch({ url, method = 'POST', headers = {}, body = '' }) {
  const target = String(url || '');
  if (!/^https:\/\/(www\.youtube\.com|tv\.youtube\.com)\//i.test(target)) {
    throw new Error('Relay URL not allowed.');
  }
  const response = await fetch(target, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    body: text.slice(0, 4_000_000),
  };
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
