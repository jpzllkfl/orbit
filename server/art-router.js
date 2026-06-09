import { Router } from 'express';
import { resolveTmdbKey, tmdbAuthHeaders, withTmdbKey } from './tmdb-config.js';

const TMDB = 'https://api.themoviedb.org/3';

/** Turn pasted poster/backdrop URLs into usable image list. */
function resolveArtUrl(input) {
  const url = (input || '').trim();
  if (!url) return [];
  if (/^https?:\/\/.+\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) return [url];
  const asset = url.match(/theposterdb\.com\/api\/assets\/(\d+)\/view/i);
  if (asset) return [url];
  const poster = url.match(/theposterdb\.com\/poster[s]?\/(\d+)/i);
  if (poster) return [`https://theposterdb.com/api/assets/${poster[1]}/view`];
  return [url];
}

export function createArtRouter() {
  const router = Router();

  router.post('/resolve-url', (req, res) => {
    const { url } = req.body || {};
    const images = resolveArtUrl(url);
    if (!images.length) {
      res.status(400).json({ error: 'Could not resolve artwork URL.' });
      return;
    }
    res.json({ images });
  });

  /** Search TMDB for alternate posters/backdrops (used by art picker). */
  router.get('/images', async (req, res) => {
    try {
      const kind = req.query.kind === 'tv' ? 'tv' : 'movie';
      const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';
      const year = req.query.year ? Number(req.query.year) : null;
      let tmdbId = req.query.tmdbId ? Number(req.query.tmdbId) : null;
      const apiKey = resolveTmdbKey(req.headers['x-orbit-tmdb-key']);

      if (!apiKey) {
        res.status(503).json({ error: 'TMDB not configured on server.' });
        return;
      }

      if (!tmdbId && title) {
        const params = new URLSearchParams({ query: title, include_adult: 'false' });
        if (year) params.set(kind === 'tv' ? 'first_air_date_year' : 'year', String(year));
        let searchUrl = withTmdbKey(`${TMDB}/search/${kind}?${params}`, apiKey);
        const searchRes = await fetch(searchUrl, { headers: tmdbAuthHeaders(apiKey) });
        const searchJson = await searchRes.json();
        tmdbId = searchJson.results?.[0]?.id || null;
      }

      if (!tmdbId) {
        res.json({ posters: [], backdrops: [], tmdbId: null });
        return;
      }

      let imagesUrl = withTmdbKey(
        `${TMDB}/${kind}/${tmdbId}/images?include_image_language=en,null`,
        apiKey,
      );
      const imgRes = await fetch(imagesUrl, { headers: tmdbAuthHeaders(apiKey) });
      const j = await imgRes.json();
      const img = (p, size) => (p ? `https://image.tmdb.org/t/p/${size}${p}` : null);
      res.json({
        tmdbId,
        posters: (j.posters || []).slice(0, 20).map((p) => img(p.file_path, 'w342')).filter(Boolean),
        backdrops: (j.backdrops || []).slice(0, 12).map((p) => img(p.file_path, 'w780')).filter(Boolean),
      });
    } catch (e) {
      res.status(502).json({ error: e.message || 'Artwork fetch failed.' });
    }
  });

  /** Collection posters from TMDB. */
  router.get('/collection-images', async (req, res) => {
    try {
      const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';
      const apiKey = resolveTmdbKey(req.headers['x-orbit-tmdb-key']);
      if (!apiKey || !title) {
        res.json({ posters: [], backdrops: [] });
        return;
      }
      const searchUrl = withTmdbKey(
        `${TMDB}/search/collection?query=${encodeURIComponent(title)}&language=en-US`,
        apiKey,
      );
      const searchRes = await fetch(searchUrl, { headers: tmdbAuthHeaders(apiKey) });
      const searchJson = await searchRes.json();
      const hit = searchJson.results?.[0];
      if (!hit) {
        res.json({ posters: [], backdrops: [] });
        return;
      }
      const img = (p, size) => (p ? `https://image.tmdb.org/t/p/${size}${p}` : null);
      const posters = [hit.poster_path, hit.backdrop_path].map((p) => img(p, 'w500')).filter(Boolean);
      res.json({
        posters,
        backdrops: hit.backdrop_path ? [img(hit.backdrop_path, 'w1280')] : [],
        tmdbId: hit.id,
      });
    } catch (e) {
      res.status(502).json({ error: e.message || 'Collection artwork failed.' });
    }
  });

  router.get('/tpdb-search-url', (req, res) => {
    const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';
    const year = typeof req.query.year === 'string' ? req.query.year.trim() : '';
    const type = req.query.type === 'show' ? 'Shows' : 'Movies';
    const q = new URLSearchParams({ term: title, category: type });
    if (year) q.set('year', year);
    res.json({ url: `https://theposterdb.com/search?${q}` });
  });

  return router;
}
