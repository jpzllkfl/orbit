import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plex } from '../lib';
import { fetchM3uPlaylist, iptvPlaybackUrl, type IptvChannel } from '../lib/iptv';
import { loadLiveTvConfig, resolvedIptvPlaylistUrl, type LiveTvSource } from '../lib/liveTvConfig';
import { listPlexLiveChannels, tunePlexLiveChannel, type PlexLiveChannel } from '../lib/plexLiveTv';
import { LiveTvPlayer } from './LiveTvPlayer';
import { Icons } from './icons';

type Playing = { title: string; streamUrl: string };

export function LiveTvView({ onOpenConnections }: { onOpenConnections?: () => void }) {
  const cfg = loadLiveTvConfig();
  const [source, setSource] = useState<LiveTvSource>(cfg.source);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plexChannels, setPlexChannels] = useState<PlexLiveChannel[]>([]);
  const [iptvChannels, setIptvChannels] = useState<IptvChannel[]>([]);
  const [group, setGroup] = useState<string>('All');
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [tuning, setTuning] = useState<string | null>(null);

  const plexAvailable = Plex.connected;
  const iptvUrl = resolvedIptvPlaylistUrl(cfg);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const active = source === 'plex' && plexAvailable ? 'plex' : 'iptv';
      if (active === 'plex') {
        const ch = await listPlexLiveChannels();
        if (!ch.length) {
          setError(
            'No Plex Live TV channels found. Set up Live TV & DVR in Plex (ErsatzTV/xTeVe tuner), or switch to IPTV in Connections.',
          );
        }
        setPlexChannels(ch);
        setIptvChannels([]);
      } else {
        if (!iptvUrl) {
          setError('Add your ErsatzTV URL or M3U playlist in Connections → Live TV.');
          setIptvChannels([]);
        } else {
          const ch = await fetchM3uPlaylist(iptvUrl);
          setIptvChannels(ch);
          setPlexChannels([]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load channels.');
    } finally {
      setLoading(false);
    }
  }, [source, plexAvailable, iptvUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const ch = source === 'plex' && plexAvailable ? plexChannels : iptvChannels;
    const set = new Set<string>();
    for (const c of ch) {
      const g = ('group' in c && c.group) || 'Channels';
      set.add(g);
    }
    return ['All', ...Array.from(set).sort()];
  }, [source, plexAvailable, plexChannels, iptvChannels]);

  const visible = useMemo(() => {
    const list =
      source === 'plex' && plexAvailable
        ? plexChannels
        : iptvChannels.map((c) => ({ id: c.id, title: c.name, thumb: c.logo, group: c.group }));
    if (group === 'All') return list;
    return list.filter((c) => (c.group || 'Channels') === group);
  }, [source, plexAvailable, plexChannels, iptvChannels, group]);

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

  function playIptv(ch: IptvChannel) {
    setPlaying({ title: ch.name, streamUrl: iptvPlaybackUrl(ch.url) });
  }

  return (
    <div className="livetv rise">
      <div className="livetv-head">
        <div>
          <div className="conns-ey">Live TV</div>
          <h2 className="disp">Channels</h2>
          <p className="conns-sub" style={{ marginTop: 8, maxWidth: 560 }}>
            YouTube TV plays here when bridged through Plex Live TV or ErsatzTV — not via a direct Google sign-in.
          </p>
        </div>
        {plexAvailable && (
          <div className="livetv-source-toggle">
            <button type="button" className={source === 'plex' ? 'on' : ''} onClick={() => setSource('plex')}>
              Plex
            </button>
            <button type="button" className={source === 'iptv' ? 'on' : ''} onClick={() => setSource('iptv')}>
              IPTV
            </button>
          </div>
        )}
        <button type="button" className="conns-btn sm" onClick={() => void load()}>
          Refresh
        </button>
      </div>

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
          {visible.map((ch) => (
            <button
              key={ch.id}
              type="button"
              className={'livetv-ch' + (tuning === ch.id ? ' tuning' : '') + (playing?.title === ch.title ? ' on' : '')}
              onClick={() => {
                if (source === 'plex' && plexAvailable) {
                  void playPlex(ch as PlexLiveChannel);
                } else {
                  const hit = iptvChannels.find((c) => c.id === ch.id);
                  if (hit) playIptv(hit);
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
