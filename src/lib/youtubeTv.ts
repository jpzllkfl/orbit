import { orbitApiFetch } from './orbitApi';
import { isDesktopApp } from './isDesktop';
import { sanitizeApiErrorText } from './sanitizeError';

export type YoutubeTvStatus = {
  connected: boolean;
  connectedAt?: number | null;
  expiresAt?: string | null;
};

export class YoutubeTvApiError extends Error {
  needsReconnect: boolean;
  status: number;
  blockedByCloudflare: boolean;
  clientBrowseAvailable: boolean;

  constructor(
    message: string,
    status: number,
    needsReconnect = false,
    opts: { blockedByCloudflare?: boolean; clientBrowseAvailable?: boolean } = {},
  ) {
    super(message);
    this.name = 'YoutubeTvApiError';
    this.status = status;
    this.needsReconnect = needsReconnect;
    this.blockedByCloudflare = Boolean(opts.blockedByCloudflare);
    this.clientBrowseAvailable = Boolean(opts.clientBrowseAvailable);
  }
}

export type YoutubeTvChannel = {
  id: string;
  name: string;
  logo?: string | null;
  group?: string;
  videoId: string;
};

export type YoutubeTvConnectStart = {
  status: 'pending' | 'connected';
  verificationUrl?: string;
  userCode?: string;
  already?: boolean;
};

type BrowseRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
};

type ChannelsErrorPayload = {
  error?: string;
  needsReconnect?: boolean;
  blockedByCloudflare?: boolean;
  clientBrowseAvailable?: boolean;
};

function shouldTryClientBrowse(payload: ChannelsErrorPayload, status: number): boolean {
  if (payload.clientBrowseAvailable || payload.blockedByCloudflare) return true;
  if (status !== 502) return false;
  return /blocked the (cloud )?server|network protection|desktop Orbit|Sync now/i.test(payload.error || '');
}

async function fetchBrowseRequests(): Promise<BrowseRequest[]> {
  const res = await orbitApiFetch('/api/youtube-tv/browse-requests');
  const j = (await res.json().catch(() => ({}))) as { requests?: BrowseRequest[]; error?: string };
  if (!res.ok || !Array.isArray(j.requests) || !j.requests.length) {
    throw new YoutubeTvApiError(
      sanitizeApiErrorText(j.error || '', 'Could not prepare YouTube TV channel load.'),
      res.status,
      Boolean((j as ChannelsErrorPayload).needsReconnect),
    );
  }
  return j.requests;
}

async function executeBrowseRequest(req: BrowseRequest): Promise<{ status: number; contentType: string; body: string; url: string }> {
  if (isDesktopApp() && window.orbitNative?.yttvBrowse) {
    const out = await window.orbitNative.yttvBrowse({
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
    return {
      status: out.status,
      contentType: out.contentType || '',
      body: out.body || '',
      url: req.url,
    };
  }
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    credentials: 'omit',
  });
  return {
    status: res.status,
    contentType: res.headers.get('content-type') || '',
    body: await res.text(),
    url: req.url,
  };
}

async function parseBrowseResult(payload: {
  status: number;
  contentType: string;
  body: string;
  url: string;
}): Promise<YoutubeTvChannel[]> {
  const res = await orbitApiFetch('/api/youtube-tv/channels/from-browse', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const j = (await res.json().catch(() => ({}))) as { channels?: YoutubeTvChannel[]; error?: string; needsReconnect?: boolean };
  if (!res.ok || !j.channels?.length) {
    throw new YoutubeTvApiError(
      sanitizeApiErrorText(j.error || '', 'Could not parse YouTube TV channel guide.'),
      res.status,
      Boolean(j.needsReconnect),
    );
  }
  return j.channels;
}

async function loadChannelsViaClientRelay(): Promise<YoutubeTvChannel[]> {
  const requests = await fetchBrowseRequests();
  let lastErr: Error | null = null;
  for (const req of requests) {
    try {
      const result = await executeBrowseRequest(req);
      return await parseBrowseResult(result);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (e instanceof YoutubeTvApiError && e.needsReconnect) throw e;
    }
  }
  const hint = isDesktopApp()
    ? 'Could not load channels from this PC. Confirm YouTube TV is connected, then try Refresh.'
    : 'Could not load channels from your browser. Open Orbit on your Plex PC, sign in, tap Sync now, keep it running, then refresh Live TV.';
  throw new YoutubeTvApiError(lastErr?.message || hint, 502, false, { clientBrowseAvailable: true });
}

export async function fetchYoutubeTvStatus(): Promise<YoutubeTvStatus> {
  const res = await orbitApiFetch('/api/youtube-tv/status');
  if (!res.ok) return { connected: false };
  return res.json();
}

export async function startYoutubeTvConnect(): Promise<YoutubeTvConnectStart> {
  const res = await orbitApiFetch('/api/youtube-tv/connect/start', { method: 'POST' });
  const j = (await res.json().catch(() => ({}))) as YoutubeTvConnectStart & { error?: string };
  if (!res.ok) throw new Error(j.error || `Connect failed (${res.status})`);
  return j;
}

export async function pollYoutubeTvConnect(): Promise<{
  status: string;
  verificationUrl?: string;
  userCode?: string;
  error?: string;
}> {
  const res = await orbitApiFetch('/api/youtube-tv/connect/poll');
  return res.json();
}

export async function disconnectYoutubeTv(): Promise<void> {
  await orbitApiFetch('/api/youtube-tv/disconnect', { method: 'POST' });
}

export async function fetchYoutubeTvChannels(): Promise<YoutubeTvChannel[]> {
  const res = await orbitApiFetch('/api/youtube-tv/channels');
  const text = await res.text().catch(() => '');
  let j: { channels?: YoutubeTvChannel[] } & ChannelsErrorPayload = {};
  try {
    j = text ? (JSON.parse(text) as typeof j) : {};
  } catch {
    throw new YoutubeTvApiError(
      sanitizeApiErrorText(text, `Could not load channels (${res.status})`),
      res.status,
      false,
    );
  }
  if (res.ok && j.channels?.length) {
    return j.channels;
  }
  if (!res.ok && shouldTryClientBrowse(j, res.status)) {
    try {
      return await loadChannelsViaClientRelay();
    } catch (clientErr) {
      if (clientErr instanceof YoutubeTvApiError) throw clientErr;
      throw new YoutubeTvApiError(
        sanitizeApiErrorText(clientErr instanceof Error ? clientErr.message : '', j.error || text),
        res.status,
        Boolean(j.needsReconnect),
        { blockedByCloudflare: Boolean(j.blockedByCloudflare), clientBrowseAvailable: true },
      );
    }
  }
  if (!res.ok) {
    throw new YoutubeTvApiError(
      sanitizeApiErrorText(j.error || text, `Could not load channels (${res.status})`),
      res.status,
      Boolean(j.needsReconnect),
      { blockedByCloudflare: Boolean(j.blockedByCloudflare), clientBrowseAvailable: Boolean(j.clientBrowseAvailable) },
    );
  }
  return j.channels || [];
}

export async function resolveYoutubeTvStream(videoId: string): Promise<{ url: string; title: string }> {
  const res = await orbitApiFetch('/api/youtube-tv/stream/' + encodeURIComponent(videoId));
  const j = (await res.json().catch(() => ({}))) as { url?: string; title?: string; error?: string };
  if (!res.ok || !j.url) throw new Error(j.error || 'Could not start stream.');
  return { url: j.url, title: j.title || 'Live TV' };
}

export function youtubeTvStreamUrl(videoId: string): string {
  return '/api/youtube-tv/stream/' + encodeURIComponent(videoId);
}
