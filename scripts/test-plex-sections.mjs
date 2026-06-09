import fs from 'fs';

const state = JSON.parse(fs.readFileSync('server/data/states/u_6f3ba3a3b3f0bada.json', 'utf8'));
const conn = JSON.parse(state.bundle['orbit.conn.v1']);
const plex = JSON.parse(state.bundle['orbit.plex.conn']);
const savedKeys = conn.libraries || [];

function asList(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

const base = plex.url.replace(/\/+$/, '');
const token = plex.token;
const headers = {
  Accept: 'application/json',
  'X-Plex-Token': token,
};

const secRes = await fetch(`${base}/library/sections?X-Plex-Token=${encodeURIComponent(token)}`, { headers });
const secText = await secRes.text();
console.log('sections status', secRes.status, 'bytes', secText.length);
let secJson;
try {
  secJson = JSON.parse(secText);
} catch (e) {
  console.log('sections parse fail', e.message);
  console.log(secText.slice(0, 300));
  process.exit(1);
}

const dirs = asList(secJson.MediaContainer?.Directory);
console.log(
  'live sections',
  dirs.map((d) => ({ key: d.key, title: d.title, type: d.type })),
);
const keySet = new Set(savedKeys.map(String));
const picked = dirs.filter((d) => keySet.has(String(d.key)));
console.log('saved keys', savedKeys);
console.log('matched', picked.length, picked.map((d) => d.title));

const testSecs = picked.length ? picked : dirs.slice(0, 2);
for (const sec of testSecs) {
  const url = `${base}/library/sections/${sec.key}/all?X-Plex-Container-Size=5&X-Plex-Token=${encodeURIComponent(token)}`;
  const r = await fetch(url, { headers });
  const t = await r.text();
  console.log(`\n${sec.title} (${sec.key}) status=${r.status} bytes=${t.length}`);
  try {
    const j = JSON.parse(t);
    const meta = asList(j.MediaContainer?.Metadata);
    console.log('  metadata count', meta.length, 'totalSize', j.MediaContainer?.totalSize);
  } catch (e) {
    console.log('  parse fail', e.message);
    console.log('  head', t.slice(0, 120));
  }
}
