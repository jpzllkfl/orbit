import { useEffect, useRef, useState } from 'react';
import { attachHlsSource, type HlsHandle } from '../lib/hlsPlayer';

export function LiveTvPlayer({
  title,
  streamUrl,
  onClose,
}: {
  title: string;
  streamUrl: string;
  onClose: () => void;
}) {
  const vref = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(1);

  useEffect(() => {
    const v = vref.current;
    if (!v || !streamUrl) return;
    setError(null);
    setWaiting(true);
    let playRequested = false;
    const start = () => {
      if (playRequested) return;
      playRequested = true;
      v.muted = false;
      v.volume = vol;
      v.play().catch(() => setWaiting(false));
    };
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const handle = attachHlsSource(v, streamUrl, {
      onManifestParsed: () => {
        setWaiting(false);
        start();
      },
      onFatalError: () => setError('Live stream failed. Try another channel.'),
    });
    if (handle) hlsRef.current = handle;
    else {
      v.src = streamUrl;
      v.load();
    }
    const onPlaying = () => setWaiting(false);
    const onErr = () => setError('Could not play this channel.');
    v.addEventListener('playing', onPlaying);
    v.addEventListener('canplay', start);
    v.addEventListener('error', onErr);
    const stall = window.setTimeout(() => {
      if (v.currentTime < 0.5 && v.readyState < 2) {
        setError('Channel timed out. Check ErsatzTV or Plex Live TV on your network.');
        setWaiting(false);
      }
    }, 25000);
    return () => {
      window.clearTimeout(stall);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('canplay', start);
      v.removeEventListener('error', onErr);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      v.removeAttribute('src');
    };
  }, [streamUrl, vol]);

  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    v.muted = muted;
    v.volume = vol;
  }, [muted, vol]);

  return (
    <div className="vp-wrap livetv-player">
      <video ref={vref} className="vp-video" playsInline autoPlay />
      <div className="vp-top">
        <span className="vp-badge livetv-badge">
          <span className="vp-badge-dot" /> LIVE
        </span>
        <span className="vp-title">{title}</span>
        <button type="button" className="vp-x" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {waiting && !error && <div className="vp-spinner" aria-label="Loading channel" />}
      {error && (
        <div className="vp-error">
          <div className="vp-error-card">
            <p>{error}</p>
            <button type="button" className="conns-btn sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
      <div className="vp-bar">
        <button type="button" className="vp-ico" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? '🔇' : '🔊'}
        </button>
        <input
          className="vp-vol"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={vol}
          onChange={(e) => setVol(Number(e.target.value))}
          aria-label="Volume"
        />
      </div>
    </div>
  );
}
