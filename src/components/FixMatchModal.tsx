import { useEffect, useState } from 'react';
import { Lib } from '../lib';
import type { OrbitNode } from '../types/orbit';
import { Icons } from './icons';

const I = Icons;
const IMG_COVER = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', objectFit: 'cover' as const };
const TYPE_CHIP = {
  position: 'absolute' as const,
  left: 8,
  top: 8,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.14em',
  color: '#fff',
  background: 'rgba(0,0,0,0.4)',
  padding: '3px 7px',
  borderRadius: 99,
  border: '1px solid rgba(255,255,255,0.22)',
};

export type FixMatchPick = {
  tmdbId: number;
  type: 'movie' | 'show';
  title: string;
  year?: number | null;
  genre?: string;
  poster?: string | null;
  backdrop?: string | null;
  overview?: string;
};

export function FixMatchModal({
  node,
  onClose,
  onConfirm,
}: {
  node: OrbitNode;
  onClose: () => void;
  onConfirm: (pick: FixMatchPick) => Promise<void>;
}) {
  const wantType = node.type === 'show' ? 'show' : 'movie';
  const [q, setQ] = useState(node.title || '');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FixMatchPick[]>([]);
  const [applying, setApplying] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const h = setTimeout(async () => {
      try {
        const hits = await Lib.searchTitles(term);
        setResults(
          hits
            .filter((r) => r.type === wantType)
            .map((r) => ({
              tmdbId: r.tmdbId!,
              type: r.type as 'movie' | 'show',
              title: r.title,
              year: r.year,
              genre: r.genre,
              poster: r.poster,
              backdrop: r.backdrop,
              overview: r.overview,
            }))
            .filter((r) => r.tmdbId != null),
        );
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(h);
  }, [q, wantType]);

  async function pick(r: FixMatchPick) {
    if (applying) return;
    setError(null);
    setApplying(r.tmdbId);
    try {
      await onConfirm(r);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply match');
    } finally {
      setApplying(null);
    }
  }

  const label = node.tmdbId || node.poster ? 'Fix match' : 'Match';

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{label}</h3>
        <div className="sub">
          Pick the correct TMDB {wantType === 'show' ? 'series' : 'film'} for &ldquo;{node.title}&rdquo;.
          {node.omsShowTitle && node.omsShowTitle !== node.title && (
            <> Folder name: <strong>{node.omsShowTitle}</strong>.</>
          )}
        </div>

        <div className="search-field">
          {I.search({})}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={wantType === 'show' ? 'Search TV series…' : 'Search movies…'}
          />
        </div>

        {loading && (
          <div className="searching">
            {I.spark({})}Searching…
          </div>
        )}

        {!loading && !q.trim() && (
          <div className="empty" style={{ padding: '26px 0' }}>
            Search TMDB to find the correct match.
          </div>
        )}

        {!loading && q.trim() && !results.length && (
          <div className="empty" style={{ padding: '26px 0' }}>
            No {wantType === 'show' ? 'series' : 'movies'} found for &ldquo;{q}&rdquo;.
          </div>
        )}

        {results.length > 0 && (
          <div className="archive-grid" style={{ maxHeight: 360, overflowY: 'auto', marginTop: 12 }}>
            {results.slice(0, 18).map((r) => {
              const busy = applying === r.tmdbId;
              return (
                <button
                  key={r.tmdbId}
                  type="button"
                  className={'archive-item' + (busy ? ' added' : '')}
                  disabled={!!applying}
                  onClick={() => pick(r)}
                >
                  <div className="frame" style={{ position: 'relative', aspectRatio: '2/3', background: '#15110e' }}>
                    {r.poster ? (
                      <img src={r.poster} alt="" style={IMG_COVER} />
                    ) : (
                      <div className="fr-fallback" style={{ position: 'absolute', inset: 0 }}>
                        {r.type === 'show' ? I.tv({}) : I.film({})}
                      </div>
                    )}
                    <div style={TYPE_CHIP}>{r.type === 'show' ? 'SERIES' : 'FILM'}</div>
                  </div>
                  <div className="t">
                    {r.title}
                    {r.year ? ` · ${r.year}` : ''}
                    {busy ? ' …' : ''}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="confirm-dialog-msg" style={{ marginTop: 12 }}>{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={!!applying}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
