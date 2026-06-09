import fs from 'fs';

function stripArtFromJson(raw) {
  return raw
    .replace(/"poster":"(?:\\.|[^"\\])*"/g, '"poster":null')
    .replace(/"backdrop":"(?:\\.|[^"\\])*"/g, '"backdrop":null')
    .replace(/"blurb":"(?:\\.|[^"\\])*"/g, '"blurb":null')
    .replace(/"tagline":"(?:\\.|[^"\\])*"/g, '"tagline":null');
}

const j = JSON.parse(fs.readFileSync('server/data/states/u_6f3ba3a3b3f0bada.json', 'utf8'));
const raw = j.bundle['orbit.tree.v1'];
const stripped = stripArtFromJson(raw);
const t = JSON.parse(stripped);
const libs = (t.children || []).filter((c) => c.type === 'library');
console.log('libs', libs.length, libs.map((l) => l.title));
console.log('stripped MB', (stripped.length / 1024 / 1024).toFixed(2));
