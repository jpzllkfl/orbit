import type { OrbitNode } from '../types/orbit';

export function TitleInfoModal({ node, onClose }: { node: OrbitNode; onClose: () => void }) {
  const rows: Array<{ label: string; value: string | number | undefined | null }> = [
    { label: 'Title', value: node.title },
    { label: 'Type', value: node.type },
    { label: 'Year', value: node.year },
    { label: 'Genre', value: node.genre },
    { label: 'Seasons', value: node.seasons },
    { label: 'TMDB ID', value: node.tmdbId },
    { label: 'Plex key', value: node.plexKey },
    { label: 'OMS library', value: node.omsLibraryId },
    { label: 'OMS show', value: node.omsShowTitle },
    { label: 'OMS item', value: node.omsItemId },
    { label: 'File path', value: node.omsPath },
    { label: 'Runtime', value: node.runtime ? `${node.runtime} min` : undefined },
    { label: 'Resolution', value: node.resolution },
    { label: 'Video', value: node.videoCodec },
    { label: 'Audio', value: node.audioCodec },
  ];

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal confirm-dialog title-info-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Get info</h3>
        <p className="sub">{node.title}</p>
        <div className="title-info-body">
          {rows
            .filter((r) => r.value != null && r.value !== '')
            .map((r) => (
              <div key={r.label} className="title-info-row">
                <span className="title-info-label">{r.label}</span>
                <code className="title-info-val">{String(r.value)}</code>
              </div>
            ))}
          {!node.omsPath && !node.plexKey && !node.tmdbId && (
            <p className="confirm-dialog-msg">No file or metadata IDs on this title yet. Try Refresh metadata from the title menu.</p>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
