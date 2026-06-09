import fs from 'fs';
import path from 'path';
import { getMediaItemById } from './importTree.js';

const MIME = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.m4v': 'video/x-m4v',
  '.ts': 'video/mp2t',
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/** Stream a local media file with Range support (direct play). */
export function streamMediaItem(req, res, itemId) {
  const item = getMediaItemById(itemId);
  if (!item) {
    res.status(404).json({ error: 'Media item not found.' });
    return;
  }

  const filePath = item.filePath;
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.status(404).json({ error: 'File not found on server.' });
    return;
  }
  if (!stat.isFile()) {
    res.status(404).json({ error: 'Path is not a file.' });
    return;
  }

  const total = stat.size;
  const ct = contentType(filePath);
  const range = req.headers.range;

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m) {
      res.status(416).end();
      return;
    }
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : total - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
      res.status(416).end();
      return;
    }
    end = Math.min(end, total - 1);
    const chunk = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', String(chunk));
    res.setHeader('Content-Type', ct);
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.status(200);
  res.setHeader('Content-Length', String(total));
  res.setHeader('Content-Type', ct);
  res.setHeader('Accept-Ranges', 'bytes');
  fs.createReadStream(filePath).pipe(res);
}
