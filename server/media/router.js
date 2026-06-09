import { Router } from 'express';
import { browseDir, browseRoots } from './browse.js';
import { mediaStats } from './db.js';
import { addLibrary, getLibrary, listLibraries, removeLibrary } from './libraries.js';
import { listItems, scanLibrary } from './scanner.js';

export function createMediaRouter() {
  const router = Router();

  router.get('/status', (_req, res) => {
    const stats = mediaStats();
    res.json({
      ok: true,
      service: 'orbit-media',
      version: 1,
      ...stats,
    });
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

  router.get('/libraries', (_req, res) => {
    res.json({ libraries: listLibraries() });
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
