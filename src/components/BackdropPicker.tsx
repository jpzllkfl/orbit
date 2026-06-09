import { useState } from 'react';
import { Lib, OT } from '../lib';
import type { OrbitNode } from '../types/orbit';
import { SmartLandscape } from './Posters';

export function BackdropPicker({ node, onClose, onSaved }: { node: OrbitNode; onClose: () => void; onSaved?: () => void }) {
  const titles = OT.sampleTitles(node, 18);
  const ov = Lib.getOverride(node.id) || {};
  const [url, setUrl] = useState(ov.backdrop || '');
  const [posterUrl, setPosterUrl] = useState(ov.poster || '');
  const [busy, setBusy] = useState(false);

  async function useTitle(t: OrbitNode) {
    setBusy(true);
    let art = Lib.getCached(t);
    if (!art?.backdrop) {
      try {
        art = await Lib.resolve(t);
      } catch {
        /* ignore */
      }
    }
    const bd = art && (art.backdrop || art.poster);
    if (bd) Lib.setOverride(node.id, { backdrop: bd });
    setBusy(false);
    onSaved?.();
    onClose();
  }

  function useUrl() {
    if (url.trim()) Lib.setOverride(node.id, { backdrop: url.trim() });
    onSaved?.();
    onClose();
  }
  function usePoster() {
    if (posterUrl.trim()) Lib.setOverride(node.id, { poster: posterUrl.trim() });
    onSaved?.();
    onClose();
  }
  function reset() {
    Lib.setOverride(node.id, { backdrop: null, poster: null });
    onSaved?.();
    onClose();
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>Artwork for “{node.title}”</h3>
        <div className="sub">
          Pick a background from a title inside this collection, or paste poster / backdrop URLs (e.g. from ThePosterDB).
        </div>
        <div className="bgp-grid">
          {titles.map((t) => (
            <button key={t.id} className="bgp-card" disabled={busy} onClick={() => useTitle(t)} title={t.title}>
              <div className="bgp-art">
                <SmartLandscape node={t} />
              </div>
              <span className="bgp-t">{t.title}</span>
            </button>
          ))}
        </div>
        <div className="bgp-url">
          <input value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} placeholder="Collection poster URL (vertical)…" onKeyDown={(e) => e.key === 'Enter' && usePoster()} />
          <button className="btn primary" onClick={usePoster} disabled={!posterUrl.trim()}>
            Set poster
          </button>
        </div>
        <div className="bgp-url">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Background image URL (wide)…" onKeyDown={(e) => e.key === 'Enter' && useUrl()} />
          <button className="btn primary" onClick={useUrl} disabled={!url.trim()}>
            Set background
          </button>
        </div>
        <div className="modal-actions">
          <button className="btn danger" onClick={reset}>
            Reset to default
          </button>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
