import { orbitApiFetch } from './orbitApi';

export type YoutubeTvStatus = {
  connected: boolean;
  connectedAt?: number | null;
  expiresAt?: string | null;
};

export class YoutubeTvApiError extends Error {
  needsReconnect: boolean;
  status: number;

  constructor(message: string, status: number, needsReconnect = false) {
    super(message);
    this.name = 'YoutubeTvApiError';
    this.status = status;
    this.needsReconnect = needsReconnect;
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
  const j = (await res.json().catch(() => ({}))) as {
    channels?: YoutubeTvChannel[];
    error?: string;
    needsReconnect?: boolean;
  };
  if (!res.ok) {
    throw new YoutubeTvApiError(
      j.error || `Could not load channels (${res.status})`,
      res.status,
      Boolean(j.needsReconnect),
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
