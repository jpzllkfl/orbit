import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getMediaItemById } from './importTree.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_ROOT = path.join(__dirname, '..', 'data', 'transcode');
const active = new Map();

function transcodeDir(itemId) {
  return path.join(CACHE_ROOT, itemId);
}

function waitForFile(filePath, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (fs.existsSync(filePath)) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Transcode startup timed out'));
        return;
      }
      setTimeout(tick, 150);
    };
    tick();
  });
}

function startFfmpeg(itemId, inputPath, outDir, playlistPath) {
  if (active.has(itemId)) return active.get(itemId);

  fs.mkdirSync(outDir, { recursive: true });
  const job = new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      '-map',
      '0:v:0?',
      '-map',
      '0:a:0?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '22',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-ac',
      '2',
      '-f',
      'hls',
      '-hls_time',
      '4',
      '-hls_list_size',
      '0',
      '-hls_flags',
      'independent_segments',
      '-hls_segment_filename',
      path.join(outDir, 'seg_%03d.ts'),
      playlistPath,
    ];
    const proc = spawn('ffmpeg', args, { stdio: 'ignore' });
    active.set(itemId, { proc, promise: job });
    proc.on('error', (e) => {
      active.delete(itemId);
      reject(e);
    });
    proc.on('exit', (code) => {
      active.delete(itemId);
      if (code !== 0 && !fs.existsSync(playlistPath)) reject(new Error('ffmpeg exited ' + code));
    });
    waitForFile(playlistPath, 25000).then(resolve).catch(reject);
  });

  active.set(itemId, { promise: job });
  return job;
}

export async function ensureOmsTranscode(itemId) {
  const item = getMediaItemById(itemId);
  if (!item) throw new Error('Media item not found.');

  const dir = transcodeDir(itemId);
  const playlist = path.join(dir, 'stream.m3u8');
  if (fs.existsSync(playlist)) return { dir, playlist };

  await startFfmpeg(itemId, item.filePath, dir, playlist);
  return { dir, playlist };
}

export function serveTranscodeFile(itemId, fileName, res) {
  const safe = path.basename(fileName);
  if (!/^[a-zA-Z0-9._-]+$/.test(safe)) {
    res.status(400).json({ error: 'Invalid file name.' });
    return;
  }
  const filePath = path.join(transcodeDir(itemId), safe);
  if (!filePath.startsWith(transcodeDir(itemId)) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Transcode file not found.' });
    return;
  }
  if (safe.endsWith('.m3u8')) {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  } else if (safe.endsWith('.ts')) {
    res.setHeader('Content-Type', 'video/mp2t');
  }
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(filePath).pipe(res);
}
