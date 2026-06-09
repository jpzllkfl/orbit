import { Router } from 'express';
import { browseDir, browseRoots } from './browse.js';
import { mediaStats } from './db.js';
import { addLibrary, getLibrary, listLibraries, removeLibrary } from './libraries.js';
import { listShowEpisodes, listShowSeasons } from './episodes.js';
import { buildOrbitTreeFromOms } from './importTree.js';
import { matchAllLibraries, matchLibrary } from './matcher.js';
import { listItems, scanLibrary } from './scanner.js';
import { DEFAULT_OMS_LIBRARIES } from './catalog.js';
import { scanAllLibraries, seedDefaultLibraries } from './seed.js';
import { streamMediaItem } from './stream.js';
import { ensureOmsTranscode, serveTranscodeFile } from './transcode.js';

export function createMediaRouter() {
  const router = Router();

  router.get('/status', (_req, res) => {
    try {
      const stats = mediaStats();
      res.json({
        ok: true,
        service: 'orbit-media',
        version: 1,
        ...stats,
      });
    } catch (e) {
      res.status(503).json({
        ok: false,
        service: 'orbit-media',
        error: e.message || 'Media database unavailable',
      });
    }
  });

  router.get('/browse/roots', (_req, res) => {
    res.json({ roots: browseRoots() });
  });

  router.get('/browse', (req, res) => {
    try {
      const p = typeof req.query.path === 'string' ? req.query.path : '';
      res.json(browseDir(p || null));
    } catch (e) {
      res.status(400).json({ error: e.message || 'Cannot browse folder.' });
    }
  });

  router.get('/shows/seasons', (req, res) => {
    try {
      const libraryId = typeof req.query.libraryId === 'string' ? req.query.libraryId : '';
      const show = typeof req.query.show === 'string' ? req.query.show : '';
      if (!libraryId || !show) {
        res.status(400).json({ error: 'libraryId and show are required.' });
        return;
      }
      res.json({ seasons: listShowSeasons(libraryId, show) });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Could not list seasons.' });
    }
  });

  router.get('/shows/episodes', (req, res) => {
    try {
      const libraryId = typeof req.query.libraryId === 'string' ? req.query.libraryId : '';
      const show = typeof req.query.show === 'string' ? req.query.show : '';
      const season = Number(req.query.season);
      if (!libraryId || !show || !season) {
        res.status(400).json({ error: 'libraryId, show, and season are required.' });
        return;
      }
      res.json({ episodes: listShowEpisodes(libraryId, show, season) });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Could not list episodes.' });
    }
  });

  router.post('/match', async (req, res) => {
    const { tmdbKey, libraryId } = req.body || {};
    if (!tmdbKey) {
      res.status(400).json({ error: 'TMDB API key is required.' });
      return;
    }
    try {
      const result = libraryId
        ? await matchLibrary(libraryId, tmdbKey)
        : await matchAllLibraries(tmdbKey);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Match failed.' });
    }
  });

  router.get('/import-tree', (_req, res) => {
    try {
      const result = buildOrbitTreeFromOms();
      if (!result.tree) {
        res.status(404).json({ error: 'No scanned libraries yet. Add folders and run Scan first.' });
        return;
      }
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message || 'Could not build library tree.' });
    }
  });

  router.get('/stream/:id', (req, res) => {
    try {
      streamMediaItem(req, res, req.params.id);
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ error: e.message || 'Stream failed.' });
    }
  });

  router.get('/transcode/:id/:file', async (req, res) => {
    try {
      await ensureOmsTranscode(req.params.id);
      serveTranscodeFile(req.params.id, req.params.file, res);
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ error: e.message || 'Transcode failed.' });
    }
  });

  router.get('/catalog', (_req, res) => {
    res.json({ libraries: DEFAULT_OMS_LIBRARIES });
  });

  router.post('/libraries/seed', (_req, res) => {
    try {
      const result = seedDefaultLibraries();
      res.json({ ok: true, ...result, libraries: listLibraries() });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Could not seed libraries.' });
    }
  });

  router.post('/libraries/scan-all', (_req, res) => {
    try {
      const results = scanAllLibraries();
      res.json({ ok: true, results, libraries: listLibraries() });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Scan all failed.' });
    }
  });

  router.get('/libraries/scan-all/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const results = scanAllLibraries((ev) => send({ type: 'progress', ...ev }));
      send({ type: 'done', results, libraries: listLibraries() });
    } catch (e) {
      send({ type: 'error', error: e.message || 'Scan all failed.' });
    }
    res.end();
  });

  router.get('/libraries', (_req, res) => {
    try {
      res.json({ libraries: listLibraries() });
    } catch (e) {
      res.status(503).json({ error: e.message || 'Media database unavailable' });
    }
  });

  router.post('/libraries', (req, res) => {
    try {
      const { name, type, rootPath } = req.body || {};
      const lib = addLibrary({ name, type, rootPath });
      res.status(201).json({ library: lib });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Could not add library.' });
    }
  });

  router.delete('/libraries/:id', (req, res) => {
    const ok = removeLibrary(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Library not found.' });
    res.json({ ok: true });
  });

  router.get('/libraries/:id', (req, res) => {
    const lib = getLibrary(req.params.id);
    if (!lib) return res.status(404).json({ error: 'Library not found.' });
    res.json({ library: lib });
  });

  router.get('/libraries/:id/items', (req, res) => {
    const lib = getLibrary(req.params.id);
    if (!lib) return res.status(404).json({ error: 'Library not found.' });
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    res.json({ items: listItems(req.params.id, limit) });
  });

  router.post('/libraries/:id/scan', (req, res) => {
    const lib = getLibrary(req.params.id);
    if (!lib) return res.status(404).json({ error: 'Library not found.' });
    try {
      const result = scanLibrary(req.params.id);
      res.json({ ok: true, ...result, library: getLibrary(req.params.id) });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Scan failed.' });
    }
  });

  /** SSE scan progress for large libraries. */
  router.get('/libraries/:id/scan/stream', (req, res) => {
    const lib = getLibrary(req.params.id);
    if (!lib) return res.status(404).json({ error: 'Library not found.' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = scanLibrary(req.params.id, (ev) => send({ type: 'progress', ...ev }));
      send({ type: 'done', ...result, library: getLibrary(req.params.id) });
    } catch (e) {
      send({ type: 'error', error: e.message || 'Scan failed.' });
    }
    res.end();
  });

  return router;
}
