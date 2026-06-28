import { useCallback, useEffect, useMemo, useState } from 'react';
import { OrbitAccount, Plex } from '../lib';
import { loadLiveTvConfig, type LiveTvSource } from '../lib/liveTvConfig';
import { listPlexLiveChannels, tunePlexLiveChannel, type PlexLiveChannel } from '../lib/plexLiveTv';
import {
  fetchYoutubeTvChannels,
  fetchYoutubeTvStatus,
  resolveYoutubeTvStream,
  YoutubeTvApiError,
  type YoutubeTvChannel,
} from '../lib/youtubeTv';
import { sanitizeApiErrorText } from '../lib/sanitizeError';
import { LiveTvPlayer } from './LiveTvPlayer';
import { Icons } from './icons';

type Playing = { title: string; streamUrl: string };

export function LiveTvView({ onOpenConnections }: { onOpenConnections?: () => void }) {
  const cfg = loadLiveTvConfig();
  const [source, setSource] = useState<LiveTvSource>(cfg.source);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yttvConnected, setYttvConnected] = useState(false);
  const [yttvChannels, setYttvChannels] = useState<YoutubeTvChannel[]>([]);
  const [plexChannels, setPlexChannels] = useState<PlexLiveChannel[]>([]);
  const [group, setGroup] = useState<string>('All');
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [tuning, setTuning] = useState<string | null>(null);

  const plexAvailable = Plex.connected;
  const signedIn = OrbitAccount.signedIn;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (source === 'youtubetv') {
        if (!signedIn) {
          setError('Sign in to your Orbit account, then connect YouTube TV in Connections.');
          return;
        }
        const st = await fetchYoutubeTvStatus();
        setYttvConnected(st.connected);
        if (!st.connected) {
          setError('Connect YouTube TV in Connections to load your live channels.');
          setYttvChannels([]);
          return;
        }
        const ch = await fetchYoutubeTvChannels();
        setYttvChannels(ch);
        setPlexChannels([]);
        return;
      }
      if (!plexAvailable) {
        setError('Connect Plex with Live TV & DVR, or use YouTube TV.');
        return;
      }
      const ch = await listPlexLiveChannels();
      if (!ch.length) setError('No Plex Live TV channels found.');
      setPlexChannels(ch);
      setYttvChannels([]);
    } catch (e) {
      if (e instanceof YoutubeTvApiError && e.needsReconnect) {
        setYttvConnected(false);
        setYttvChannels([]);
      }
      if (e instanceof YoutubeTvApiError) {
        if (e.networkFailure) {
          setError('Network error — could not reach Orbit. Check your connection and try again.');
        } else if (e.blockedByCloudflare) {
          setError(
            'YouTube TV blocked the server. Open Orbit on your desktop (same account) to load channels from your home network.',
          );
        } else {
          setError(sanitizeApiErrorText(e.message, 'Could not load channels.'));
        }
      } else {
        setError(sanitizeApiErrorText(e instanceof Error ? e.message : 'Could not load channels.'));
      }
    } finally {
      setLoading(false);
    }
  }, [source, signedIn, plexAvailable]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (source === 'youtubetv') {
      return yttvChannels.map((c) => ({
        id: c.id,
        title: c.name,
        thumb: c.logo,
        group: c.group || 'YouTube TV',
        videoId: c.videoId,
      }));
    }
    return plexChannels.map((c) => ({
      id: c.id,
      title: c.title,
      thumb: c.thumb,
      group: c.group || 'Plex',
      videoId: c.id,
    }));
  }, [source, yttvChannels, plexChannels]);

  const groups = useMemo(() => {
    const set = new Set(visible.map((c) => c.group || 'Channels'));
    return ['All', ...Array.from(set).sort()];
  }, [visible]);

  const filtered =
    group === 'All' ? visible : visible.filter((c) => (c.group || 'Channels') === group);

  async function playYoutubeTv(ch: YoutubeTvChannel) {
    setTuning(ch.videoId);
    setError(null);
    try {
      const { url, title } = await resolveYoutubeTvStream(ch.videoId);
      setPlaying({ title, streamUrl: url });
    } catch (e) {
      setError(sanitizeApiErrorText(e instanceof Error ? e.message : 'Playback failed.'));
    } finally {
      setTuning(null);
    }
  }

  async function playPlex(ch: PlexLiveChannel) {
    setTuning(ch.id);
    setError(null);
    try {
      const tuned = await tunePlexLiveChannel(ch);
      setPlaying({ title: tuned.title, streamUrl: tuned.streamUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tune failed.');
    } finally {
      setTuning(null);
    }
  }

  return (
    <div className="livetv rise">
      <div className="livetv-head">
        <div>
          <div className="conns-ey">Live TV</div>
          <h2 className="disp">Channels</h2>
          <p className="conns-sub" style={{ marginTop: 8, maxWidth: 560 }}>
            Your YouTube TV subscription, integrated directly in Orbit.
          </p>
        </div>
        <div className="livetv-source-toggle">
          <button type="button" className={source === 'youtubetv' ? 'on' : ''} onClick={() => setSource('youtubetv')}>
            YouTube TV
          </button>
          {plexAvailable && (
            <button type="button" className={source === 'plex' ? 'on' : ''} onClick={() => setSource('plex')}>
              Plex
            </button>
          )}
        </div>
        <button type="button" className="conns-btn sm" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {source === 'youtubetv' && yttvConnected && (
        <div className="livetv-now">
          <span className="livetv-live-dot" /> YouTube TV connected
        </div>
      )}

      {groups.length > 2 && (
        <div className="livetv-source-toggle" style={{ marginBottom: 18 }}>
          {groups.map((g) => (
            <button key={g} type="button" className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>
              {g}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="livetv-status">Loading channels…</div>}

      {!loading && error && (
        <div className="livetv-empty">
          <p>{error}</p>
          {onOpenConnections && (
            <button type="button" className="conns-btn primary sm" style={{ marginTop: 12 }} onClick={onOpenConnections}>
              Open Connections
            </button>
          )}
        </div>
      )}

      {!loading && !error && (
        <div className="livetv-grid">
          {filtered.map((ch) => (
            <button
              key={ch.id}
              type="button"
              className={'livetv-ch' + (tuning === ch.id ? ' tuning' : '') + (playing?.title === ch.title ? ' on' : '')}
              onClick={() => {
                if (source === 'youtubetv') {
                  const hit = yttvChannels.find((c) => c.id === ch.id);
                  if (hit) void playYoutubeTv(hit);
                } else {
                  const hit = plexChannels.find((c) => c.id === ch.id);
                  if (hit) void playPlex(hit);
                }
              }}
            >
              <div className="livetv-ch-logo">
                {ch.thumb ? <img src={ch.thumb} alt="" loading="lazy" /> : Icons.tv({})}
              </div>
              <div className="livetv-ch-name">{ch.title}</div>
            </button>
          ))}
        </div>
      )}

      {playing && (
        <LiveTvPlayer title={playing.title} streamUrl={playing.streamUrl} onClose={() => setPlaying(null)} />
      )}
    </div>
  );
}
