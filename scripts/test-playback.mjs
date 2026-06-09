/**
 * Quick check: Plex transcode playlist via Orbit media proxy (should return in seconds, not hang).
 */
import fs from 'fs';
import { startOrbitServer } from '../server/startServer.js';

const state = JSON.parse(fs.readFileSync('server/data/states/u_6f3ba3a3b3f0bada.json', 'utf8'));
const plex = JSON.parse(state.bundle['orbit.plex.conn']);
const tree = JSON.parse(state.bundle['orbit.tree.v1']);

function firstMovie(node) {
  if (node.type === 'movie' && node.plexKey && node.partKey) return node;
  for (const c of node.children || []) {
    const m = firstMovie(c);
    if (m) return m;
  }
  return null;
}

const movie = firstMovie(tree);
if (!movie) {
  console.error('No movie with plexKey in tree');
  process.exit(1);
}

const port = 8094;
const server = await startOrbitServer(port, '127.0.0.1');
console.log('movie:', movie.title, movie.plexKey);

const path =
  '/video/:/transcode/universal/start.m3u8?' +
  new URLSearchParams({
    path: '/library/metadata/' + movie.plexKey,
    session: 'orbit-test-playback',
    protocol: 'hls',
    directPlay: '0',
    directStream: '1',
    directStreamAudio: '0',
    fastSeek: '1',
    mediaIndex: '0',
    partIndex: '0',
    location: 'wan',
    autoAdjustQuality: '0',
    subtitles: 'burn',
    copyts: '1',
    videoResolution: '1280x720',
    videoQuality: '100',
    maxVideoBitrate: '4000',
    'X-Plex-Token': plex.token,
    'X-Plex-Client-Identifier': 'orbit-test',
    'X-Plex-Client-Capabilities':
      'protocols=http-video,http-live-streaming;videoDecoders=h264{profile:high&resolution:1080};audioDecoders=aac{channels:6}',
  }).toString();

const url =
  `http://127.0.0.1:${port}/api/plex/media?` +
  new URLSearchParams({ base: plex.url, path, token: plex.token, clientId: 'orbit-test' });

const t0 = Date.now();
const res = await fetch(url);
const text = await res.text();
const ms = Date.now() - t0;
console.log('m3u8 status', res.status, 'ms', ms, 'bytes', text.length);
if (res.ok) {
  const lines = text.split('\n').filter((l) => l && !l.startsWith('#'));
  console.log('segments', lines.length, 'sample:', lines[0]?.slice(0, 120));
} else {
  console.log(text.slice(0, 400));
}

server.close();
