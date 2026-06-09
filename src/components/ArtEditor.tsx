import { useEffect, useRef, useState } from 'react';
import { Lib } from '../lib';
import type { OrbitNode } from '../types/orbit';
import { Icons } from './icons';

const I = Icons;

type ArtKind = 'poster' | 'backdrop' | 'both';

export function ArtEditor({
  node,
  focus = 'both',
  onClose,
  onSaved,
}: {
  node: OrbitNode;
  focus?: ArtKind;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const isCollection = node.type === 'collection' || node.type === 'library';
  const current = Lib.getOverride(node.id);
  const [tab, setTab] = useState(focus === 'backdrop' ? 'official' : 'upload');
  const [artTab, setArtTab] = useState<'poster' | 'backdrop'>(focus === 'backdrop' ? 'backdrop' : 'poster');
  const [urlVal, setUrlVal] = useState('');
  const [imgs, setImgs] = useState<{ posters: string[]; backdrops: string[] } | null>(null);
  const [loadingImgs, setLoadingImgs] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab !== 'official' || isCollection) return;
    setLoadingImgs(true);
    Lib.fetchImages(node).then((r) => {
      setImgs(r);
      setLoadingImgs(false);
    });
  }, [tab, node.id, isCollection]);

  function apply(kind: 'poster' | 'backdrop', url: string) {
    if (!url) return;
    if (kind === 'poster') Lib.setOverride(node.id, { poster: url });
    else Lib.setOverride(node.id, { backdrop: url });
    onSaved?.();
    onClose();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1280;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.getContext('2d')?.drawImage(img, 0, 0, w, h);
        const data = cv.toDataURL('image/jpeg', 0.88);
        const useBackdrop = focus !== 'poster' && (artTab === 'backdrop' || w > h);
        if (useBackdrop) Lib.setOverride(node.id, { backdrop: data });
        else Lib.setOverride(node.id, { poster: data });
        onSaved?.();
        onClose();
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>Artwork · {node.title}</h3>
        <div className="sub">
          {isCollection
            ? focus === 'poster'
              ? 'Set the collection poster shown on cards — upload or paste an image link.'
              : 'Set a custom collection poster/cover — upload, paste a link, or pick from TMDB.'
            : focus === 'poster'
              ? 'Choose a poster. Changes apply everywhere this title appears.'
              : focus === 'backdrop'
                ? 'Choose a backdrop. Changes apply everywhere this title appears.'
                : 'Choose a poster, backdrop, or both. Changes apply everywhere this title appears.'}
        </div>

        {!isCollection && focus === 'both' && (
          <div className="seg" style={{ marginBottom: 12 }}>
            <button className={artTab === 'poster' ? 'on' : ''} onClick={() => setArtTab('poster')}>
              Poster
            </button>
            <button className={artTab === 'backdrop' ? 'on' : ''} onClick={() => setArtTab('backdrop')}>
              Backdrop
            </button>
          </div>
        )}

        <div className="seg">
          <button className={tab === 'upload' ? 'on' : ''} onClick={() => setTab('upload')}>
            Upload
          </button>
          <button className={tab === 'url' ? 'on' : ''} onClick={() => setTab('url')}>
            Image link
          </button>
          {!isCollection && (
            <button className={tab === 'official' ? 'on' : ''} onClick={() => setTab('official')}>
              TMDB picks
            </button>
          )}
        </div>

        {tab === 'upload' && (
          <div className="art-drop" onClick={() => fileRef.current?.click()}>
            {I.up({})}
            <div className="lbl">Choose an image</div>
            <div className="hint">JPG or PNG · sets {artTab === 'backdrop' ? 'backdrop' : 'poster'}</div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
          </div>
        )}

        {tab === 'url' && (
          <div>
            <div className="field">
              <label>{artTab === 'backdrop' ? 'Backdrop URL' : 'Poster URL'}</label>
              <input
                autoFocus
                value={urlVal}
                onChange={(e) => setUrlVal(e.target.value)}
                placeholder="https://…/image.jpg"
                onKeyDown={(e) => e.key === 'Enter' && apply(artTab, urlVal.trim())}
              />
            </div>
            {urlVal.trim() && (
              <div className="art-preview">
                <img src={urlVal.trim()} alt="" />
              </div>
            )}
            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn primary" disabled={!urlVal.trim()} onClick={() => apply(artTab, urlVal.trim())}>
                Use image
              </button>
            </div>
          </div>
        )}

        {tab === 'official' && (
          loadingImgs ? (
            <div className="searching" style={{ padding: '30px 0', justifyContent: 'center' }}>
              {I.spark({})}Loading artwork…
            </div>
          ) : imgs && (imgs.posters.length || imgs.backdrops.length) ? (
            <div>
              {(artTab === 'poster' || focus === 'both') && imgs.posters.length > 0 && (
                <>
                  <div className="result-head">Posters</div>
                  <div className="art-grid posters">
                    {imgs.posters.map((u, i) => (
                      <button key={i} className="art-opt" onClick={() => apply('poster', u)}>
                        <img src={u} alt="" />
                      </button>
                    ))}
                  </div>
                </>
              )}
              {(artTab === 'backdrop' || focus === 'both') && imgs.backdrops.length > 0 && (
                <>
                  <div className="result-head">Backdrops</div>
                  <div className="art-grid backs">
                    {imgs.backdrops.map((u, i) => (
                      <button key={i} className="art-opt wide" onClick={() => apply('backdrop', u)}>
                        <img src={u} alt="" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="empty" style={{ padding: '24px 0' }}>
              {Lib.connected ? 'No official artwork found. Try a direct image link.' : 'Connect TMDB in Connections for official artwork picks.'}
            </div>
          )
        )}

        {current && (
          <div className="modal-actions" style={{ borderTop: '1px solid var(--line)', marginTop: 16, paddingTop: 16 }}>
            <button
              className="btn danger"
              onClick={() => {
                Lib.clearOverride(node.id);
                onSaved?.();
                onClose();
              }}
            >
              Reset to default
            </button>
            <div style={{ flex: 1 }}></div>
            <button className="btn ghost" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
