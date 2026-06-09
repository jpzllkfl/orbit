import fs from 'fs';

const state = JSON.parse(fs.readFileSync('server/data/states/u_6f3ba3a3b3f0bada.json', 'utf8'));
const conn = JSON.parse(state.bundle['orbit.conn.v1']);
const plex = JSON.parse(state.bundle['orbit.plex.conn']);

const res = await fetch('http://127.0.0.1:8090/api/plex/import-tree', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ base: plex.url, token: plex.token, keys: conn.libraries }),
});
const j = await res.json();
console.log('status', res.status);
console.log('titleCount', j.titleCount, 'libs', j.tree?.children?.length, 'error', j.error);
