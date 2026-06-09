/**
 * Zoey S1E1 — Plex MDE + HLS transcode (same flow as official client).
 */
import fs from 'fs';
import { startOrbitServer } from '../server/startServer.js';

const state = JSON.parse(fs.readFileSync('server/data/states/u_6f3ba3a3b3f0bada.json', 'utf8'));
const plex = JSON.parse(state.bundle['orbit.plex.conn']);
const port = 8105;
const server = await startOrbitServer(port, '127.0.0.1');

const headers = {
  Accept: 'application/json',
  'X-Orbit-Plex-Base': plex.url,
  'X-Orbit-Plex-Token': plex.token,
  'X-Plex-Client-Identifier': 'orbit-test',
  'X-Plex-Client-Capabilities':
    'protocols=http-video,http-live-streaming;videoDecoders=h264{profile:high&resolution:1080};audioDecoders=aac{channels:6}',
  'X-Plex-Provides': 'client,player',
};

function asList(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

async function proxy(path) {
  const r = await fetch(`http://127.0.0.1:${port}/api/plex/proxy${path}`, { headers });
  const t = await r.text();
  if (t.trim().startsWith('{')) return JSON.parse(t);
  const { DOMParser } = await import('@xmldom/xmldom').catch(() => ({ DOMParser: null }));
  if (!DOMParser) throw new Error('need json response');
  return null;
}

// season/episode lookup (Plex-style, not allLeaves)
const showKey = '21383';
const sj = await fetch(`http://127.0.0.1:${port}/api/plex/proxy/library/metadata/${showKey}/children`, { headers });
const sjText = await sj.text();
const sjJ = sjText.startsWith('{') ? JSON.parse(sjText) : null;
const seasons = asList(sjJ?.MediaContainer?.Metadata);
const s1 = seasons.find((s) => Number(s.index) === 1);
console.log('S1', s1?.title, s1?.ratingKey);

const ej = await fetch(
  `http://127.0.0.1:${port}/api/plex/proxy/library/metadata/${s1.ratingKey}/children`,
  { headers },
);
const ejJ = JSON.parse(await ej.text());
const ep = asList(ejJ.MediaContainer?.Metadata).find((e) => Number(e.index) === 1);
console.log('E1', ep?.title, ep?.ratingKey);

const session = 'zoey-mde-' + Date.now();
const decisionParams = new URLSearchParams({
  path: '/library/metadata/' + ep.ratingKey,
  session,
  protocol: 'hls',
  directPlay: '0',
  directStream: '1',
  directStreamAudio: '0',
  fastSeek: '1',
  mediaIndex: '0',
  partIndex: '0',
  location: 'wan',
  autoAdjustQuality: '0',
  subtitles: 'auto',
  copyts: '1',
  hasMDE: '1',
  videoResolution: '1280x720',
  videoQuality: '100',
  maxVideoBitrate: '4000',
  'X-Plex-Token': plex.token,
  'X-Plex-Client-Identifier': 'orbit-test',
});

const dec = await fetch(
  `http://127.0.0.1:${port}/api/plex/proxy/video/:/transcode/universal/decision?${decisionParams}`,
  { headers },
);
const decText = await dec.text();
console.log('MDE', dec.status, decText.slice(0, 200));

const startPath =
  '/video/:/transcode/universal/start.m3u8?' +
  new URLSearchParams({
    path: '/library/metadata/' + ep.ratingKey,
    session,
    protocol: 'hls',
    directPlay: '0',
    directStream: '1',
    directStreamAudio: '0',
    fastSeek: '1',
    mediaIndex: '0',
    partIndex: '0',
    location: 'wan',
    subtitles: 'auto',
    copyts: '1',
    videoResolution: '1280x720',
    videoQuality: '100',
    maxVideoBitrate: '4000',
    'X-Plex-Token': plex.token,
    'X-Plex-Client-Identifier': 'orbit-test',
  }).toString();

const u1 =
  `http://127.0.0.1:${port}/api/plex/media?` +
  new URLSearchParams({ base: plex.url, path: startPath, token: plex.token, clientId: 'orbit-test' });
const r1 = await fetch(u1);
const t1 = await r1.text();
console.log('master', r1.status);
const variantLine = t1.split('\n').find((l) => l && !l.startsWith('#'));
if (variantLine) {
  const r2 = await fetch(`http://127.0.0.1:${port}${variantLine}`);
  const t2 = await r2.text();
  console.log('variant', r2.status, t2.split('\n').filter((l) => l && !l.startsWith('#')).length, 'segments');
  const seg = t2.split('\n').find((l) => l && !l.startsWith('#'));
  if (seg) {
    const r3 = await fetch(`http://127.0.0.1:${port}${seg}`);
    console.log('segment', r3.status, r3.headers.get('content-type'));
  }
}

server.close();
