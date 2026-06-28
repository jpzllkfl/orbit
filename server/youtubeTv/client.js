import { Innertube } from 'youtubei.js';
import { loadCredentials, saveCredentials } from './store.js';

const TV_CLIENT = {
  clientName: 'TVHTML5',
  clientVersion: '7.20240701.16.00',
  hl: 'en',
  gl: 'US',
};

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

function parseChannelsFromBrowse(data) {
  const channels = [];
  const seen = new Set();

  walk(data, (node) => {
    const row = node?.epgRowRenderer;
    if (!row) return;
    const station = row.station?.epgStationRenderer;
    const name =
      station?.title?.simpleText ||
      station?.icon?.accessibility?.accessibilityData?.label ||
      station?.channelName?.simpleText;
    if (!name) return;

    let videoId = row.airings?.[0]?.epgAiringRenderer?.navigationEndpoint?.watchEndpoint?.videoId;
    if (!videoId) {
      videoId =
        row.airings?.[0]?.epgAiringRenderer?.navigationEndpoint?.unpluggedPopupEndpoint?.popupRenderer
          ?.unpluggedSelectionMenuDialogRenderer?.items?.[0]?.unpluggedMenuItemRenderer?.command?.watchEndpoint
          ?.videoId;
    }
    if (!videoId) return;

    const thumb =
      station?.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
      station?.icon?.thumbnails?.slice(-1)[0]?.url ||
      null;
    const id = String(videoId);
    if (seen.has(id)) return;
    seen.add(id);
    channels.push({
      id,
      name: String(name).trim(),
      logo: thumb,
      group: station?.category?.simpleText || 'Live',
      videoId: id,
    });
  });

  return channels.sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchUnpluggedBrowse(accessToken) {
  const res = await fetch('https://tv.youtube.com/youtubei/v1/unplugged/browse', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Origin: 'https://tv.youtube.com',
      Referer: 'https://tv.youtube.com/',
    },
    body: JSON.stringify({
      context: { client: TV_CLIENT },
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`YouTube TV guide failed (${res.status}). ${text.slice(0, 120)}`);
  }
  return res.json();
}

export async function createAuthenticatedClient(userId) {
  const stored = loadCredentials(userId);
  if (!stored?.credentials) throw new Error('YouTube TV not connected.');

  const yt = await Innertube.create({
    generate_session_locally: true,
    client_type: 'TV',
  });

  yt.session.on('update-credentials', ({ credentials }) => {
    saveCredentials(userId, credentials);
  });

  await yt.session.signIn(stored.credentials);
  return yt;
}

export async function startConnect(userId) {
  const yt = await Innertube.create({
    generate_session_locally: true,
    client_type: 'TV',
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
  if (stored?.credentials?.access_token) {
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
  if (!stored?.credentials?.access_token) throw new Error('Connect YouTube TV in Connections first.');

  const yt = await createAuthenticatedClient(userId);
  if (yt.session.oauth?.shouldRefreshToken?.()) {
    await yt.session.oauth.refreshAccessToken();
    saveCredentials(userId, yt.session.oauth.oauth2_tokens);
  }

  const token = yt.session.oauth.oauth2_tokens.access_token;
  const browse = await fetchUnpluggedBrowse(token);
  const channels = parseChannelsFromBrowse(browse);
  if (!channels.length) {
    throw new Error('No channels returned. Confirm your YouTube TV subscription is active.');
  }
  return channels;
}

export async function resolveStream(userId, videoId) {
  const yt = await createAuthenticatedClient(userId);
  const info = await yt.getBasicInfo(videoId, { client: 'TV' });
  const format = await yt.getStreamingData(videoId, { type: 'hls', quality: 'best', client: 'TV' });
  if (!format?.url) {
    throw new Error('Could not resolve a playable stream for this channel.');
  }
  return { url: format.url, title: info.basic_info?.title || 'Live TV' };
}
