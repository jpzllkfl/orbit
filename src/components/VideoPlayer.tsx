import { useCallback, useEffect, useRef, useState, type SVGProps } from 'react';
import { Plex, Progress } from '../lib';
import { attachHlsSource, videoHasDecodedAudio, type HlsHandle } from '../lib/hlsPlayer';
import { bindBoundsSync, hasNativePlayer, nativePlayerInfo, videoBounds } from '../lib/nativePlayer';
import { loadSettings } from '../lib/settings';
import type { Episode, OrbitNode } from '../types/orbit';

const NATIVE_QUALITY = { id: 'native', label: 'mpv', sub: 'Native Direct Play', direct: true };

const DEMO_SOURCES = [
  'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
  'https://media.w3.org/2010/05/sintel/trailer.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
];

const QUALITIES = [
  { id: 'auto', label: 'Auto', sub: 'Transcode · smart start', direct: false },
  { id: '2160', label: '4K', sub: 'Transcode · 40 Mbps', direct: false },
  { id: '1080', label: '1080p', sub: 'Transcode · 12 Mbps', direct: false },
  { id: '720', label: '720p', sub: 'Transcode · 4 Mbps', direct: false },
  { id: '480', label: '480p', sub: 'Transcode · 2 Mbps', direct: false },
  { id: '360', label: '360p', sub: 'Transcode · 0.7 Mbps', direct: false },
];
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const TRANSCODE_FALLBACKS = ['2160', '1080', '720', '480', '360'];

function defaultQuality() {
  const pref = loadSettings().playback.quality;
  if (pref === 'auto') return QUALITIES[0];
  return QUALITIES.find((q) => q.id === pref) || QUALITIES[0];
}

const ic = {
  play: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M7 5v14l12-7z" />
    </svg>
  ),
  pause: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
    </svg>
  ),
  back: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  fwd: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M12 4a8 8 0 1 1-7.5 5.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 2.5l3 2.2-3 2.3z" fill="currentColor" />
      <text x="12" y="15" fontSize="7.5" fontWeight="700" textAnchor="middle" fill="currentColor">
        10
      </text>
    </svg>
  ),
  rwd: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M12 4a8 8 0 1 0 7.5 5.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 2.5L9 4.7l3 2.3z" fill="currentColor" />
      <text x="12" y="15" fontSize="7.5" fontWeight="700" textAnchor="middle" fill="currentColor">
        10
      </text>
    </svg>
  ),
  vol: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16 8.5a4 4 0 0 1 0 7M18.5 6a7 7 0 0 1 0 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  mute: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  cc: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 10.2a2.2 2.2 0 0 0-3 2 2.2 2.2 0 0 0 3 1.9M17 10.2a2.2 2.2 0 0 0-3 2 2.2 2.2 0 0 0 3 1.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  gear: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  pip: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect x="3" y="4" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="12" y="11" width="7" height="5" rx="1.2" fill="currentColor" />
    </svg>
  ),
  full: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  check: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M5 12.5l4.5 4.5L19 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

function fmt(s: number) {
  if (!isFinite(s)) return '0:00';
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0');
}

function shouldResume() {
  return loadSettings().playback.resumePlayback !== false;
}

async function mediaStream(node: OrbitNode, q: string, episode?: Episode | null) {
  const omsId = episode?.omsItemId || node.omsItemId;
  if (omsId) {
    const { omsStreamUrl } = await import('../lib/importLibraryFromOms');
    return { mode: 'direct', url: omsStreamUrl(omsId), fallbackUrl: null };
  }
  try {
    if (Plex.connected && (node.partKey || node.plexKey)) return await Plex.resolveStream(node, q || 'auto');
  } catch {
    /* ignore */
  }
  return { mode: 'none', url: null, fallbackUrl: null };
}

function attachSource(
  v: HTMLVideoElement,
  url: string,
  hlsRef: React.MutableRefObject<HlsHandle | null>,
  callbacks?: { onFatalError?: () => void; onManifestParsed?: () => void }
) {
  if (hlsRef.current) {
    hlsRef.current.destroy();
    hlsRef.current = null;
  }
  v.removeAttribute('src');
  if (!url.includes('.m3u8')) v.load();
  const handle = attachHlsSource(v, url, callbacks);
  if (handle) hlsRef.current = handle;
}

export function VideoPlayer({
  node,
  episode,
  onClose,
  onPlayNext,
}: {
  node: OrbitNode;
  episode?: Episode | null;
  onClose: () => void;
  onPlayNext?: () => void;
}) {
  const vref = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<HlsHandle | null>(null);
  const streamModeRef = useRef<'direct' | 'transcode' | 'demo'>('demo');
  const [subsSrc, setSubsSrc] = useState<string | null>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [menu, setMenu] = useState<string | null>(null);
  const [quality, setQuality] = useState(defaultQuality);
  const [speed, setSpeed] = useState(1);
  const [subs, setSubs] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [playNode, setPlayNode] = useState<OrbitNode | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const srcIdx = useRef(0);
  const streamFallback = useRef<string | null>(null);
  const triedFallback = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const lastPlexReport = useRef(0);
  const plexKeyRef = useRef<string | undefined>(node.plexKey);
  const playNodeRef = useRef<OrbitNode | null>(null);
  const onStreamFailRef = useRef<() => void>(() => {});
  const qualityFallbackIdx = useRef(0);
  const streamFailCooldown = useRef(0);
  const inElectron = hasNativePlayer();
  const [nativeCheckDone, setNativeCheckDone] = useState(!inElectron);
  const [nativeMode, setNativeMode] = useState(false);
  const [nativeMissing, setNativeMissing] = useState(false);

  const label = episode ? `${node.title} · S${episode.season} E${episode.n}` : node.title;

  useEffect(() => {
    if (!inElectron) return;
    nativePlayerInfo().then((info) => {
      setNativeMode(!!info.available);
      setNativeMissing(!info.available);
      setNativeCheckDone(true);
    });
  }, [inElectron]);

  useEffect(() => {
    if (!nativeMode) return;
    let alive = true;
    setError(false);
    setWaiting(true);
    setReady(false);
    setQuality(NATIVE_QUALITY);

    const nativeStall = window.setTimeout(() => {
      if (alive) setNativeMode(false);
    }, 20000);

    (async () => {
      let pn: OrbitNode = node;
      if (Plex.connected && (node.plexKey || node.partKey)) {
        const resolved = await Plex.resolvePlayback(node, episode || null);
        if (!alive) return;
        if (resolved) {
          pn = resolved;
          playNodeRef.current = resolved;
          setPlayNode(resolved);
          plexKeyRef.current = (resolved as OrbitNode & { playbackKey?: string }).playbackKey || resolved.plexKey;
        } else if (!node.plexKey) {
          setNativeMode(false);
          return;
        }
      }
      playNodeRef.current = pn;
      const info = await Plex.resolveNativeStream(pn);
      if (!alive) return;
      if (!info.url || !window.orbitNative) {
        setNativeMode(false);
        return;
      }
      const rec = Progress.get(node, episode || null);
      const startSec = shouldResume() && rec?.t && rec.t > 12 ? rec.t : 0;
      const bounds = videoBounds(vref.current);
      try {
        await window.orbitNative.play({ url: info.url, startSec, bounds: bounds || undefined });
        if (!alive) return;
        window.clearTimeout(nativeStall);
        setWaiting(false);
        setReady(true);
        setPlaying(true);
      } catch {
        if (!alive) return;
        setNativeMode(false);
      }
    })();

    return () => {
      alive = false;
      window.clearTimeout(nativeStall);
      window.orbitNative?.stop().catch(() => {});
    };
  }, [nativeMode, node, episode?.season, episode?.n]);

  useEffect(() => {
    if (!nativeMode || !ready) return;
    const sync = () => {
      const b = videoBounds(vref.current);
      if (b) window.orbitNative?.setBounds(b).catch(() => {});
    };
    sync();
    return bindBoundsSync(vref.current, sync);
  }, [nativeMode, ready]);

  useEffect(() => {
    if (!nativeMode || !ready) return;
    const tick = window.setInterval(() => {
      window.orbitNative?.status().then((s) => {
        if (s.idle) return;
        setCur(s.time);
        if (s.duration > 0) setDur(s.duration);
        setPlaying(!s.paused);
        setWaiting(false);
        if (s.time > 5 && s.duration > 0) {
          Progress.set(node, episode || null, s.time, s.duration);
          const pk = plexKeyRef.current;
          if (Plex.connected && pk && Date.now() - lastPlexReport.current > 15000) {
            lastPlexReport.current = Date.now();
            Plex.reportProgress(pk, s.time * 1000).catch(() => {});
          }
        }
      }).catch(() => {});
    }, 350);
    return () => window.clearInterval(tick);
  }, [nativeMode, ready, node, episode]);

  useEffect(() => {
    if (!nativeMode) return;
    window.orbitNative?.setVolume(muted ? 0 : vol).catch(() => {});
  }, [nativeMode, vol, muted]);

  useEffect(() => {
    let alive = true;
    if (!nativeCheckDone || nativeMode) return;
    setPlayNode(null);
    setStreamUrl(null);
    setError(false);
    setReady(false);
    setWaiting(true);
    srcIdx.current = 0;
    triedFallback.current = false;
    qualityFallbackIdx.current = 0;
    streamFallback.current = null;
    plexKeyRef.current = node.plexKey;
    playNodeRef.current = null;

    (async () => {
      let pn: OrbitNode = node;
      const omsId = episode?.omsItemId || node.omsItemId;
      if (omsId) {
        const info = await mediaStream(node, 'auto', episode);
        if (!alive) return;
        if (!info.url) {
          setError(true);
          setWaiting(false);
          return;
        }
        playNodeRef.current = node;
        setPlayNode(node);
        streamModeRef.current = 'direct';
        setStreamUrl(info.url);
        return;
      }
      if (Plex.connected && (node.plexKey || node.partKey)) {
        const resolved = await Plex.resolvePlayback(node, episode || null);
        if (!alive) return;
        if (resolved) {
          pn = resolved;
          playNodeRef.current = resolved;
          setPlayNode(resolved);
          plexKeyRef.current = (resolved as OrbitNode & { playbackKey?: string }).playbackKey || resolved.plexKey;
        } else if (!node.plexKey) {
          setError(true);
          setWaiting(false);
          return;
        }
      }
      playNodeRef.current = pn;
      let url: string | null = null;
      if (Plex.connected) {
        await Plex.startPlaybackSession();
        const info = await mediaStream(pn, 'auto', episode);
        url = info.url;
        streamFallback.current = info.fallbackUrl || null;
        streamModeRef.current = info.mode === 'direct' ? 'direct' : 'transcode';
      } else {
        url = DEMO_SOURCES[0];
        streamModeRef.current = 'demo';
      }
      if (!alive) return;
      if (!url) {
        setError(true);
        setWaiting(false);
        return;
      }
      setStreamUrl(url);
    })();

    return () => {
      alive = false;
    };
  }, [node, episode?.season, episode?.n, episode?.omsItemId, nativeMode, nativeCheckDone]);

  onStreamFailRef.current = () => {
    const now = Date.now();
    if (now - streamFailCooldown.current < 12000) return;
    streamFailCooldown.current = now;
    void (async () => {
      const fb = streamFallback.current;
      const pn = playNodeRef.current;

      if (fb && !triedFallback.current) {
        if (!fb.includes('.m3u8') && pn && !Plex.canDirectPlayInBrowser(pn)) {
          /* skip unusable direct-play fallback */
        } else {
          triedFallback.current = true;
          streamFallback.current = null;
          setError(false);
          setWaiting(true);
          setReady(false);
          streamModeRef.current = fb.includes('.m3u8') ? 'transcode' : 'direct';
          setStreamUrl(fb);
          return;
        }
      }

      if (pn && Plex.connected) {
        await Plex.stopPlayback();
        await Plex.startPlaybackSession();
        const triedQ = quality.id === 'auto' ? '1080' : quality.id;
        const afterTried = TRANSCODE_FALLBACKS.indexOf(triedQ) + 1;
        const start = Math.max(qualityFallbackIdx.current, afterTried);
        for (let i = start; i < TRANSCODE_FALLBACKS.length; i++) {
          qualityFallbackIdx.current = i + 1;
          const qid = TRANSCODE_FALLBACKS[i];
          const info = await mediaStream(pn, qid, episode);
          if (info.url) {
            streamFallback.current = info.fallbackUrl || null;
            streamModeRef.current = 'transcode';
            setError(false);
            setWaiting(true);
            setReady(false);
            setQuality(QUALITIES.find((q) => q.id === qid) || QUALITIES[2]);
            setStreamUrl(info.url);
            return;
          }
        }

        if (!triedFallback.current && pn.partKey) {
          triedFallback.current = true;
          const direct = Plex.directPlayUrl(pn);
          if (direct) {
            streamModeRef.current = 'direct';
            streamFallback.current = null;
            setError(false);
            setWaiting(true);
            setReady(false);
            setQuality(QUALITIES[0]);
            setStreamUrl(direct);
            return;
          }
        }
      }

      setError(true);
      setWaiting(false);
    })();
  };

  useEffect(() => {
    if (nativeMode) return;
    const v = vref.current;
    if (!v || !streamUrl) return;

    let playRequested = false;
    const startPlayback = () => {
      if (playRequested) return;
      playRequested = true;
      v.muted = false;
      v.volume = vol;
      const rec = Progress.get(node, episode || null);
      const resume = shouldResume() ? rec?.t || 0 : 0;
      if (v.duration && resume > 12 && resume < v.duration - 15) v.currentTime = resume;
      v.play().catch(() => setPlaying(false));
    };

    attachSource(v, streamUrl, hlsRef, {
      onFatalError: () => onStreamFailRef.current(),
    });

    const stallMs = streamUrl.includes('.m3u8') ? 50000 : 22000;
    const stallTimer = window.setTimeout(() => {
      if (!v.error && v.currentTime < 0.5 && v.readyState < 2) onStreamFailRef.current();
    }, stallMs);

    const onMeta = () => {
      setDur(v.duration || 0);
    };
    const onTime = () => {
      setCur(v.currentTime);
      if (v.currentTime > 0.35) {
        window.clearTimeout(stallTimer);
        setWaiting(false);
        setReady(true);
      }
      if (v.currentTime > 5) {
        Progress.set(node, episode || null, v.currentTime, v.duration);
        const pk = plexKeyRef.current;
        if (Plex.connected && pk && Date.now() - lastPlexReport.current > 15000) {
          lastPlexReport.current = Date.now();
          Plex.reportProgress(pk, v.currentTime * 1000).catch(() => {});
        }
      }
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    const onPlay = () => setPlaying(!v.paused);
    const onPause = () => setPlaying(false);
    const onWaiting = () => setWaiting(true);
    const onPlaying = () => {
      window.clearTimeout(stallTimer);
      setWaiting(false);
      setPlaying(true);
      if (!ready) {
        setReady(true);
        setDur(v.duration || 0);
      }
    };
    const onCanPlay = () => startPlayback();
    const onEnd = () => {
      setPlaying(false);
      Progress.remove(Progress.key(node, episode || null));
      Progress.setWatched(node.id, true);
      const pk = plexKeyRef.current;
      if (Plex.connected && pk) Plex.scrobble(pk).catch(() => {});
      if (loadSettings().playback.autoPlayNext && onPlayNext) onPlayNext();
    };
    const onErr = () => {
      if (Plex.connected && !triedFallback.current && streamFallback.current) {
        onStreamFailRef.current();
        return;
      }
      if (!Plex.connected && srcIdx.current < DEMO_SOURCES.length - 1) {
        srcIdx.current++;
        attachSource(v, DEMO_SOURCES[srcIdx.current], hlsRef);
        v.load();
        v.play().then(() => setPlaying(true)).catch(() => {});
      } else {
        setError(true);
        setWaiting(false);
      }
    };

    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('canplay', onCanPlay);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('progress', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('ended', onEnd);
    v.addEventListener('error', onErr);

    return () => {
      window.clearTimeout(stallTimer);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('canplay', onCanPlay);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('progress', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('ended', onEnd);
      v.removeEventListener('error', onErr);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [node.id, episode?.season, episode?.n, streamUrl, node, vol, nativeMode]);

  // Direct play: fall back to HLS if playback never starts (Auto mode hang) or audio is missing.
  useEffect(() => {
    if (nativeMode) return;
    if (!streamUrl || streamModeRef.current !== 'direct' || !streamFallback.current) return;
    const v = vref.current;
    if (!v) return;
    let cancelled = false;

    const startWatchdog = window.setTimeout(() => {
      if (cancelled || !streamFallback.current) return;
      if (v.currentTime < 0.5) {
        triedFallback.current = true;
        streamModeRef.current = 'transcode';
        const fb = streamFallback.current;
        streamFallback.current = null;
        setWaiting(true);
        setReady(false);
        setStreamUrl(fb);
      }
    }, 7000);

    const audioWatchdog = window.setTimeout(() => {
      if (cancelled || v.paused || v.currentTime < 2) return;
      if (!muted && vol > 0 && !videoHasDecodedAudio(v) && streamFallback.current) {
        triedFallback.current = true;
        streamModeRef.current = 'transcode';
        const fb = streamFallback.current;
        streamFallback.current = null;
        setWaiting(true);
        setReady(false);
        setStreamUrl(fb);
      }
    }, 3500);

    return () => {
      cancelled = true;
      window.clearTimeout(startWatchdog);
      window.clearTimeout(audioWatchdog);
    };
  }, [streamUrl, muted, vol, nativeMode]);

  useEffect(() => {
    if (nativeMode || !streamUrl?.includes('.m3u8') || !Plex.connected) return;
    const beat = () => {
      const pk = plexKeyRef.current;
      if (!pk) return;
      const state = playing ? 'playing' : 'paused';
      Plex.sendTimeline(pk, { state, timeMs: cur * 1000, durationMs: dur * 1000 }).catch(() => {});
      Plex.pingTranscodeSession(Plex.getPlaybackSession()).catch(() => {});
    };
    beat();
    const id = window.setInterval(beat, 5000);
    return () => window.clearInterval(id);
  }, [nativeMode, streamUrl, playing, cur, dur]);

  useEffect(() => {
    return () => {
      if (nativeMode) window.orbitNative?.stop().catch(() => {});
      else if (Plex.connected) Plex.stopPlayback().catch(() => {});
    };
  }, [nativeMode]);

  useEffect(() => {
    const v = vref.current;
    if (v) {
      v.volume = vol;
      v.muted = muted;
    }
  }, [vol, muted]);
  useEffect(() => {
    const v = vref.current;
    if (v) v.playbackRate = speed;
  }, [speed]);
  useEffect(() => {
    let alive = true;
    const pk = playNode?.plexKey || node.plexKey;
    if (!pk || !Plex.connected) {
      setSubsSrc(null);
      return;
    }
    Plex.fetchSubtitleStreamUrl(pk)
      .then((u) => {
        if (alive) setSubsSrc(u);
      })
      .catch(() => {
        if (alive) setSubsSrc(null);
      });
    return () => {
      alive = false;
    };
  }, [playNode?.plexKey, node.plexKey, node.id]);

  useEffect(() => {
    const t = vref.current?.textTracks?.[0];
    if (t) t.mode = subs && subsSrc ? 'showing' : 'hidden';
  }, [subs, subsSrc, ready]);

  const poke = useCallback(() => {
    setShowUI(true);
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => {
      if (!menu) setShowUI(false);
    }, 3200);
  }, [menu]);
  useEffect(() => {
    poke();
    return () => {
      if (idleRef.current) clearTimeout(idleRef.current);
    };
  }, [poke, playing]);

  const togglePlay = () => {
    if (nativeMode) {
      const pause = playing;
      window.orbitNative?.pause(pause).then(() => setPlaying(!pause)).catch(() => {});
      return;
    }
    const v = vref.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  };
  const seekTo = (sec: number) => {
    const clamped = Math.max(0, Math.min(dur || 0, sec));
    if (nativeMode) {
      window.orbitNative?.seek(clamped).then(() => setCur(clamped)).catch(() => {});
      return;
    }
    const v = vref.current;
    if (v) {
      v.currentTime = clamped;
      setCur(v.currentTime);
    }
  };
  const skip = (d: number) => seekTo((vref.current?.currentTime || 0) + d);

  const toggleFull = () => {
    const el = wrapRef.current;
    if (!document.fullscreenElement) el?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  const togglePip = async () => {
    try {
      const v = vref.current;
      if (!v) return;
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menu) {
          setMenu(null);
          return;
        }
        onClose();
      } else if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') skip(10);
      else if (e.key === 'ArrowLeft') skip(-10);
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVol((x) => Math.min(1, x + 0.1));
        setMuted(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVol((x) => Math.max(0, x - 0.1));
      } else if (e.key === 'f') toggleFull();
      else if (e.key === 'm') setMuted((m) => !m);
      else if (e.key === 'c') setSubs((s) => !s);
      poke();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [menu, dur, onClose, poke]);

  const pctFromEvent = (e: MouseEvent | TouchEvent) => {
    const r = trackRef.current!.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - r.left;
    return Math.max(0, Math.min(1, x / r.width));
  };
  const startScrub = (e: React.MouseEvent | React.TouchEvent) => {
    setScrubbing(true);
    seekTo(pctFromEvent(e.nativeEvent) * dur);
  };
  useEffect(() => {
    if (!scrubbing) return;
    const move = (e: MouseEvent | TouchEvent) => seekTo(pctFromEvent(e) * dur);
    const up = () => setScrubbing(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [scrubbing, dur]);

  function pickQuality(q: (typeof QUALITIES)[0]) {
    setQuality(q);
    setMenu(null);
    const v = vref.current;
    const pn = playNode || node;
    const at = v?.currentTime || 0;
    triedFallback.current = false;
    streamFailCooldown.current = 0;
    void Plex.stopPlayback()
      .then(() => Plex.startPlaybackSession())
      .then(() => mediaStream(pn, q.id, episode))
      .then((info) => {
        streamFallback.current = info.fallbackUrl || null;
        streamModeRef.current = info.mode === 'direct' ? 'direct' : 'transcode';
        if (!v || !info.url) return;
        setWaiting(true);
        setReady(false);
        attachSource(v, info.url, hlsRef, {
          onFatalError: () => onStreamFailRef.current(),
          onManifestParsed: () => {
            if (at > 12 && v.duration && at < v.duration - 15) v.currentTime = at;
            v.play().catch(() => setPlaying(false));
          },
        });
        if (!info.url.includes('.m3u8')) {
          if (at > 12 && v.duration && at < v.duration - 15) v.currentTime = at;
          v.play().catch(() => setPlaying(false));
        }
      });
  }

  const pct = dur ? (cur / dur) * 100 : 0;
  const bufPct = dur ? (buffered / dur) * 100 : 0;
  const usingPlex = Plex.connected && !!(playNode?.plexKey || node.plexKey);
  const qualityOptions = nativeMode ? [NATIVE_QUALITY] : QUALITIES;

  return (
    <div className={'vp' + (showUI ? ' ui' : ' hide-ui') + (nativeMode ? ' native' : '')} ref={wrapRef} onMouseMove={poke} onClick={(e) => { if (e.target === e.currentTarget || e.target === vref.current) togglePlay(); }}>
      <video ref={vref} className={'vp-video' + (nativeMode ? ' vp-video-native' : '')} playsInline poster="">
        {subsSrc && <track kind="subtitles" srcLang="en" label="English" src={subsSrc} />}
      </video>

      {waiting && !error && <div className="vp-spinner" aria-label="Buffering"></div>}
      {error && (
        <div className="vp-error">
          <div className="vp-error-card">
            <div className="disp" style={{ fontSize: 22 }}>
              Stream unavailable
            </div>
            <p>
              {usingPlex
                ? streamModeRef.current === 'transcode' || streamUrl?.includes('.m3u8')
                  ? 'Plex could not transcode this title. Check that your server allows remote streaming, then try again.'
                  : nativeMissing
                    ? 'Install mpv for native playback (AC3/DTS/HEVC). Run: winget install mpv — then restart Orbit Desktop.'
                    : 'Could not load this stream from Plex.'
                : 'The sample stream could not load. Connect Plex to play your library.'}
            </p>
            <button onClick={onClose}>Close player</button>
          </div>
        </div>
      )}

      {!playing && ready && !error && (
        <button className="vp-center" onClick={togglePlay} aria-label="Play">
          {ic.play({})}
        </button>
      )}

      <div className="vp-top">
        <button className="vp-icon" onClick={onClose}>
          {ic.back({})}
        </button>
        <div className="vp-titlewrap">
          <div className="vp-title">{label}</div>
          <div className="vp-subline">{[node.year, node.genre, node.rating].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="vp-spacer"></div>
        <div className={'vp-badge' + (quality.direct ? ' direct' : ' transcode')}>
          <span className="vp-badge-dot"></span>
          {nativeMode ? 'Native · mpv' : quality.direct ? 'Direct Play' : 'Transcoding ' + quality.label}
        </div>
      </div>

      <div className="vp-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="vp-scrub">
          <span className="vp-time">{fmt(cur)}</span>
          <div
            className="vp-track"
            ref={trackRef}
            onMouseDown={startScrub}
            onTouchStart={startScrub}
            onMouseMove={(e) => setHoverX(pctFromEvent(e.nativeEvent))}
            onMouseLeave={() => setHoverX(null)}
          >
            <div className="vp-buf" style={{ width: bufPct + '%' }}></div>
            <div className="vp-fill" style={{ width: pct + '%' }}></div>
            <div className="vp-knob" style={{ left: pct + '%' }}></div>
            {hoverX != null && <div className="vp-hover" style={{ left: hoverX * 100 + '%' }}>{fmt(hoverX * dur)}</div>}
          </div>
          <span className="vp-time">{fmt(dur)}</span>
        </div>

        <div className="vp-row">
          <button className="vp-icon big" onClick={togglePlay}>
            {playing ? ic.pause({}) : ic.play({})}
          </button>
          <button className="vp-icon" onClick={() => skip(-10)} title="Back 10s">
            {ic.rwd({})}
          </button>
          <button className="vp-icon" onClick={() => skip(10)} title="Forward 10s">
            {ic.fwd({})}
          </button>
          <div className="vp-volume">
            <button className="vp-icon" onClick={() => setMuted((m) => !m)}>
              {muted || vol === 0 ? ic.mute({}) : ic.vol({})}
            </button>
            <input
              className="vp-vol-slider"
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={muted ? 0 : vol}
              onChange={(e) => {
                setVol(+e.target.value);
                setMuted(+e.target.value === 0);
              }}
            />
          </div>
          <div className="vp-spacer"></div>
          <button className={'vp-icon' + (subs ? ' on' : '')} onClick={() => setSubs((s) => !s)} title="Subtitles (C)">
            {ic.cc({})}
          </button>
          <div className="vp-menuwrap">
            <button className={'vp-icon' + (menu === 'settings' ? ' on' : '')} onClick={() => setMenu(menu === 'settings' ? null : 'settings')} title="Quality & speed">
              {ic.gear({})}
            </button>
            {menu === 'settings' && (
              <div className="vp-menu" onClick={(e) => e.stopPropagation()}>
                <div className="vp-menu-sec">Quality</div>
                {qualityOptions.map((q) => (
                  <button key={q.id} className={'vp-menu-item' + (q.id === quality.id ? ' on' : '')} onClick={() => pickQuality(q)}>
                    <span className="vp-mi-main">
                      {q.label}
                      <i>{q.sub}</i>
                    </span>
                    {q.id === quality.id && ic.check({ style: { width: 16, height: 16 } })}
                  </button>
                ))}
                <div className="vp-menu-sec">Playback speed</div>
                <div className="vp-speeds">
                  {SPEEDS.map((s) => (
                    <button key={s} className={'vp-speed' + (s === speed ? ' on' : '')} onClick={() => setSpeed(s)}>
                      {s === 1 ? 'Normal' : s + '×'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {'pictureInPictureEnabled' in document && (
            <button className="vp-icon" onClick={togglePip} title="Picture in picture">
              {ic.pip({})}
            </button>
          )}
          <button className="vp-icon" onClick={toggleFull} title="Fullscreen (F)">
            {ic.full({})}
          </button>
        </div>
      </div>
    </div>
  );
}
