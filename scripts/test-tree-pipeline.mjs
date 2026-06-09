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

console.log('--- raw parse ---');
const rawParsed = JSON.parse(raw);
for (const lib of rawParsed.children.filter((c) => c.type === 'library')) {
  console.log(lib.title, 'children', lib.children?.length ?? 0);
}

console.log('--- after strip parse ---');
const stripped = stripArtFromJson(raw);
const parsed = JSON.parse(stripped);
for (const lib of parsed.children.filter((c) => c.type === 'library')) {
  console.log(lib.title, 'children', lib.children?.length ?? 0);
  if (lib.title === 'Movies' && lib.children?.[0]) {
    console.log('  first child keys', Object.keys(lib.children[0]));
    console.log('  first child children', lib.children[0].children?.length);
  }
}
