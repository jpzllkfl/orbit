import fs from 'fs';

const state = JSON.parse(fs.readFileSync('server/data/states/u_6f3ba3a3b3f0bada.json', 'utf8'));
const conn = JSON.parse(state.bundle['orbit.conn.v1']);
const plex = JSON.parse(state.bundle['orbit.plex.conn']);
const savedKeys = conn.libraries || [];

function asList(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

const headers = {
  Accept: 'application/json',
  'X-Orbit-Plex-Base': plex.url,
  'X-Orbit-Plex-Token': plex.token,
};

const port = process.env.PORT || 8090;
const base = `http://127.0.0.1:${port}/api/plex/proxy`;

async function proxyGet(path) {
  const r = await fetch(base + path, { headers });
  const t = await r.text();
  return { status: r.status, text: t, len: t.length };
}

const sec = await proxyGet('/library/sections');
console.log('proxy sections', sec.status, sec.len);
const secJson = JSON.parse(sec.text);
const dirs = asList(secJson.MediaContainer?.Directory);
console.log('sections', dirs.length);

const keySet = new Set(savedKeys.map(String));
const picked = dirs.filter((d) => keySet.has(String(d.key)));
console.log('picked', picked.length);

// simulate OLD bug: empty array keySet filter
const emptySet = new Set([].map(String));
const pickedOld = dirs.filter((d) => emptySet.has(String(d.key)));
console.log('picked with empty key set', pickedOld.length);

for (const sec of ['14', '6']) {
  const r = await proxyGet(`/library/sections/${sec}/all`);
  console.log(`\nsection ${sec} proxy status=${r.status} len=${r.len}`);
  try {
    const j = JSON.parse(r.text);
    const meta = asList(j.MediaContainer?.Metadata);
    console.log('  metadata', meta.length);
  } catch (e) {
    console.log('  parse error', e.message);
  }
}
