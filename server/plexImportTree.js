function asList(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function newId(p) {
  return p + '_' + Math.random().toString(36).slice(2, 9);
}

function toTitle(it) {
  const media = asList(it.Media)[0] || null;
  const part = media && asList(media.Part)[0];
  return {
    id: newId(it.type === 'show' ? 's' : 'm'),
    type: it.type === 'show' ? 'show' : 'movie',
    title: it.title,
    year: it.year ? Number(it.year) : undefined,
    genre: asList(it.Genre)[0]?.tag || '',
    runtime: it.duration ? Math.round(Number(it.duration) / 60000) : null,
    rating: it.contentRating || null,
    seasons: it.type === 'show' && it.childCount ? Number(it.childCount) : undefined,
    plexKey: String(it.ratingKey),
    partKey: part?.key || null,
    duration: it.duration ? Number(it.duration) : null,
    videoCodec: media?.videoCodec,
    audioCodec: media?.audioCodec,
    resolution: media?.videoResolution,
    container: media?.container,
    viewCount: it.viewCount ? Number(it.viewCount) : 0,
    viewOffset: it.viewOffset ? Number(it.viewOffset) : 0,
    lastViewedAt: it.lastViewedAt ? Number(it.lastViewedAt) : null,
    addedAt: it.addedAt ? Number(it.addedAt) : null,
  };
}

async function plexGet(base, token, path) {
  const url =
    base.replace(/\/+$/, '') +
    path +
    (path.includes('?') ? '&' : '?') +
    'X-Plex-Token=' +
    encodeURIComponent(token);
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Plex-Token': token },
  });
  if (!res.ok) throw new Error('Plex HTTP ' + res.status + ' for ' + path);
  const text = await res.text();
  if (!text.trim()) throw new Error('Empty Plex response for ' + path);
  return JSON.parse(text);
}

async function listSections(base, token) {
  const root = await plexGet(base, token, '/library/sections');
  return asList(root.MediaContainer?.Directory)
    .filter((s) => s.type === 'movie' || s.type === 'show')
    .map((s) => ({ key: String(s.key), title: s.title, type: s.type }));
}

function pickSections(allSecs, selectedKeys) {
  if (!selectedKeys?.length) return allSecs;
  const keySet = new Set(selectedKeys.map(String));
  const picked = allSecs.filter((s) => keySet.has(String(s.key)));
  return picked.length ? picked : allSecs;
}

/** Build Orbit library tree on the server (avoids multi‑MB JSON parse in Electron). */
export async function buildOrbitTreeFromPlex(base, token, selectedKeys) {
  const allSecs = await listSections(base, token);
  const secs = pickSections(allSecs, selectedKeys);
  if (!secs.length) throw new Error('No movie or TV libraries found on your Plex server.');

  const libs = [];
  const usedKeys = [];

  for (const sec of secs) {
    try {
      const allJ = await plexGet(base, token, '/library/sections/' + sec.key + '/all');
      const all = asList(allJ.MediaContainer?.Metadata).map(toTitle);
      const inColl = new Set();
      const collNodes = [];
      try {
        const cj = await plexGet(base, token, '/library/sections/' + sec.key + '/collections');
        for (const col of asList(cj.MediaContainer?.Metadata)) {
          const kj = await plexGet(base, token, '/library/metadata/' + col.ratingKey + '/children');
          const kids = asList(kj.MediaContainer?.Metadata).map(toTitle);
          kids.forEach((k) => inColl.add(k.plexKey));
          collNodes.push({
            id: newId('c'),
            type: 'collection',
            title: col.title,
            blurb: '',
            plexKey: String(col.ratingKey),
            children: kids,
          });
        }
      } catch {
        /* no collections */
      }
      const loose = all.filter((t) => !inColl.has(t.plexKey));
      libs.push({
        id: newId('lib'),
        type: 'library',
        title: sec.title,
        libKey: sec.title.toLowerCase().replace(/[^a-z0-9]/g, '') || 'lib' + sec.key,
        blurb: '',
        children: [...collNodes, ...loose],
      });
      usedKeys.push(sec.key);
    } catch {
      /* skip bad section */
    }
  }

  let titles = 0;
  (function walk(n) {
    for (const ch of n.children || []) {
      if (ch.type === 'movie' || ch.type === 'show') titles++;
      else walk(ch);
    }
  })({ children: libs });

  return {
    tree: {
      id: 'root',
      type: 'collection',
      title: 'Your Server',
      blurb: 'Live from your Plex server.',
      children: libs,
    },
    sectionKeys: usedKeys,
    titleCount: titles,
  };
}

/** Import one library section at a time — emits progress for streaming clients. */
export async function buildOrbitTreeFromPlexIncremental(base, token, selectedKeys, onProgress) {
  const allSecs = await listSections(base, token);
  const secs = pickSections(allSecs, selectedKeys);
  if (!secs.length) throw new Error('No movie or TV libraries found on your Plex server.');

  const libs = [];
  const usedKeys = [];
  let titles = 0;

  for (const sec of secs) {
    try {
      const allJ = await plexGet(base, token, '/library/sections/' + sec.key + '/all');
      const all = asList(allJ.MediaContainer?.Metadata).map(toTitle);
      const inColl = new Set();
      const collNodes = [];
      try {
        const cj = await plexGet(base, token, '/library/sections/' + sec.key + '/collections');
        for (const col of asList(cj.MediaContainer?.Metadata)) {
          const kj = await plexGet(base, token, '/library/metadata/' + col.ratingKey + '/children');
          const kids = asList(kj.MediaContainer?.Metadata).map(toTitle);
          kids.forEach((k) => inColl.add(k.plexKey));
          collNodes.push({
            id: newId('c'),
            type: 'collection',
            title: col.title,
            blurb: '',
            plexKey: String(col.ratingKey),
            children: kids,
          });
        }
      } catch {
        /* no collections */
      }
      const loose = all.filter((t) => !inColl.has(t.plexKey));
      const libNode = {
        id: newId('lib'),
        type: 'library',
        title: sec.title,
        libKey: sec.title.toLowerCase().replace(/[^a-z0-9]/g, '') || 'lib' + sec.key,
        blurb: '',
        children: [...collNodes, ...loose],
      };
      libs.push(libNode);
      usedKeys.push(sec.key);
      titles += all.length;
      if (onProgress) {
        onProgress({
          type: 'progress',
          message: `Imported ${sec.title}…`,
          libs: libs.length,
          titles,
          tree: {
            id: 'root',
            type: 'collection',
            title: 'Your Server',
            blurb: 'Live from your Plex server.',
            children: libs.slice(),
          },
        });
      }
    } catch {
      /* skip bad section */
    }
  }

  const result = {
    tree: {
      id: 'root',
      type: 'collection',
      title: 'Your Server',
      blurb: 'Live from your Plex server.',
      children: libs,
    },
    sectionKeys: usedKeys,
    titleCount: titles,
  };
  if (onProgress) onProgress({ type: 'done', ...result });
  return result;
}
