import type { OrbitNode } from '../types/orbit';

let _seq = 0;
export const newId = (p: string) => p + '_' + Date.now().toString(36) + '_' + (++_seq).toString(36);

export function resultToNode(r: {
  type: string;
  title: string;
  year?: number | null;
  genre?: string;
  tmdbId?: number;
}): OrbitNode {
  const base = {
    title: r.title,
    year: r.year || undefined,
    genre: r.genre || '',
    tmdbId: r.tmdbId,
    tagline: '',
  };
  return r.type === 'show'
    ? { id: newId('s'), type: 'show', seasons: 1, ...base }
    : { id: newId('m'), type: 'movie', runtime: 0, ...base };
}
