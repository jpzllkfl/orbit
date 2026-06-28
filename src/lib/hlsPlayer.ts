import Hls from 'hls.js';
import { Plex } from './index';

/** OMS direct/transcode routes — must not go through the Plex media proxy. */
function isOrbitMediaUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/api/media/')) return true;
  try {
    const u = /^https?:\/\//i.test(url) ? new URL(url) : new URL(url, window.location.origin);
    return u.pathname.startsWith('/api/media/');
  } catch {
    return url.includes('/api/media/');
  }
}

export type HlsHandle = {
  destroy: () => void;
};

export type HlsCallbacks = {
  onFatalError?: () => void;
  onManifestParsed?: () => void;
};

/** Attach an HLS or progressive URL to a <video> with Plex-aware proxying. */
export function attachHlsSource(
  video: HTMLVideoElement,
  url: string,
  callbacks?: HlsCallbacks
): HlsHandle | null {
  if (!url.includes('.m3u8')) {
    video.src = url;
    return null;
  }

  if (Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 90,
      maxBufferLength: 120,
      maxMaxBufferLength: 600,
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.5,
      liveDurationInfinity: true,
      manifestLoadingTimeOut: 30000,
      manifestLoadingMaxRetry: 6,
      levelLoadingMaxRetry: 6,
      fragLoadingTimeOut: 60000,
      fragLoadingMaxRetry: 8,
      fetchSetup: (context, initParams) => {
        const url = context.url;
        const proxied = isOrbitMediaUrl(url) ? url : Plex.proxyStreamUrl(url);
        return new Request(proxied, initParams);
      },
    });

    if (callbacks?.onFatalError) {
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) {
          if (data.details === 'bufferStalledError' || data.details === 'bufferSeekOverHole') {
            hls.startLoad();
          }
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          try {
            hls.startLoad();
            return;
          } catch {
            /* fall through */
          }
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try {
            hls.recoverMediaError();
            return;
          } catch {
            /* fall through */
          }
        }
        callbacks.onFatalError?.();
      });
    }

    if (callbacks?.onManifestParsed) {
      hls.on(Hls.Events.MANIFEST_PARSED, () => callbacks.onManifestParsed?.());
    }

    hls.attachMedia(video);
    hls.loadSource(url);
    return {
      destroy: () => {
        hls.destroy();
      },
    };
  }

  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    return null;
  }

  return null;
}

/** Browsers often play video without decoding non-AAC audio (silent direct play). */
export function videoHasDecodedAudio(video: HTMLVideoElement) {
  const v = video as HTMLVideoElement & { webkitAudioDecodedByteCount?: number; mozHasAudio?: boolean };
  if (typeof v.webkitAudioDecodedByteCount === 'number' && v.webkitAudioDecodedByteCount > 0) return true;
  if (v.mozHasAudio === false) return false;
  const tracks = (video as HTMLVideoElement & { audioTracks?: { length: number } }).audioTracks;
  if (tracks && tracks.length > 0) return true;
  return false;
}
