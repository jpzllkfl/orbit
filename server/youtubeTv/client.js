import { Innertube } from 'youtubei.js';
import { loadCredentials, saveCredentials } from './store.js';

/** youtubei.js ClientType.TV value — not the shorthand key "TV". */
const YTTV_CLIENT = 'TVHTML5';
const YTTV_USER_AGENT = 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version';

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

export function classifyYoutubeTvError(err) {
  const message =
    err instanceof Error ? err.message : String(err || 'YouTube TV request failed.');
  const needsReconnect = Boolean(
    err?.needsReconnect ||
      /expired|reconnect|not connected|incomplete|invalid tokens|invalid authentication|credentials are/i.test(
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

function buildUnpluggedContext(yt) {
  const client = yt.session.context.client;
  return {
    client: {
      hl: client.hl || 'en',
      gl: client.gl || 'US',
      visitorData: client.visitorData,
      clientName: YTTV_CLIENT,
      clientVersion: client.clientVersion,
      userAgent: YTTV_USER_AGENT,
    },
    user: yt.session.context.user || { enableSafetyMode: false, lockedSafetyMode: false },
  };
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
      saveCredentials(userId, oauth.oauth2_tokens);
    } catch (e) {
      const err = new Error('YouTube TV session expired. Disconnect and reconnect in Connections.');
      err.needsReconnect = true;
      throw err;
    }
  }
  return oauth.oauth2_tokens.access_token;
}

async function fetchUnpluggedBrowse(yt, userId) {
  const accessToken = await ensureFreshAccessToken(yt, userId);
  const res = await fetch('https://tv.youtube.com/youtubei/v1/unplugged/browse', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Origin: 'https://tv.youtube.com',
      Referer: 'https://tv.youtube.com/',
      'User-Agent': YTTV_USER_AGENT,
    },
    body: JSON.stringify({ context: buildUnpluggedContext(yt) }),
    signal: AbortSignal.timeout(45000),
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      const err = new Error('YouTube TV session expired. Disconnect and reconnect in Connections.');
      err.needsReconnect = true;
      throw err;
    }
    throw new Error(`YouTube TV guide failed (${res.status}). ${text.slice(0, 180)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('YouTube TV returned an invalid guide response.');
  }
}

export async function createAuthenticatedClient(userId) {
  const stored = loadCredentials(userId);
  if (!stored?.credentials) throw new Error('YouTube TV not connected.');

  const yt = await Innertube.create({
    generate_session_locally: true,
    client_type: YTTV_CLIENT,
  });

  yt.session.on('update-credentials', ({ credentials }) => {
    saveCredentials(userId, credentials);
  });

  try {
    await yt.session.signIn(stored.credentials);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/invalid tokens|refresh access token/i.test(msg)) {
      const err = new Error('YouTube TV credentials are incomplete. Disconnect and reconnect in Connections.');
      err.needsReconnect = true;
      throw err;
    }
    throw e;
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
    saveCredentials(userId, credentials);
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
    return { status: 'error', error: e.message || 'Sign-in failed' };
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
    throw new Error('No channels returned. Confirm your YouTube TV subscription is active.');
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
