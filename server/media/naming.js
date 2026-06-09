const VIDEO_EXT = new Set([
  '.mkv', '.mp4', '.avi', '.m4v', '.mov', '.webm', '.ts', '.m2ts', '.wmv', '.flv',
]);

export function isVideoFile(fileName) {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  return VIDEO_EXT.has(ext);
}

/** Strip extension and common release-group noise from a filename. */
function baseName(fileName) {
  let n = fileName.replace(/\.[^.]+$/, '');
  n = n.replace(/[._]/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

export function parseMovie(fileName) {
  const raw = baseName(fileName);
  const m = raw.match(/^(.+?)\s*[\[(](\d{4})[\])]\s*$/);
  if (m) return { title: m[1].trim(), year: Number(m[2]) };
  const m2 = raw.match(/^(.+?)\s+(\d{4})\s*$/);
  if (m2) return { title: m2[1].trim(), year: Number(m2[2]) };
  return { title: raw, year: null };
}

export function parseEpisode(fileName) {
  const raw = baseName(fileName);
  const patterns = [
    /[Ss](\d{1,3})[Ee](\d{1,3})/,
    /(\d{1,2})[xX](\d{1,3})/,
    /Season\s*(\d{1,2}).*Episode\s*(\d{1,3})/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m) {
      const season = Number(m[1]);
      const episode = Number(m[2]);
      let title = raw.replace(re, '').replace(/[-–—]\s*$/, '').trim();
      if (!title) title = `Episode ${episode}`;
      return { season, episode, title };
    }
  }
  return null;
}

/** Guess show title from parent folder (e.g. /TV/Breaking Bad/S01E01.mkv). */
export function showFromPath(filePath, libraryRoot) {
  const rel = pathRelative(filePath, libraryRoot);
  const parts = rel.split(/[/\\]/).filter(Boolean);
  if (parts.length >= 2) {
    const folder = parts[parts.length - 2];
    if (!/season\s*\d/i.test(folder) && !/^s\d/i.test(folder)) {
      return folder.replace(/[._]/g, ' ').trim();
    }
    if (parts.length >= 3) {
      return parts[parts.length - 3].replace(/[._]/g, ' ').trim();
    }
  }
  return null;
}

function pathRelative(filePath, root) {
  const norm = (p) => p.replace(/\\/g, '/');
  const f = norm(filePath);
  const r = norm(root).replace(/\/$/, '');
  if (f.startsWith(r + '/')) return f.slice(r.length + 1);
  return f;
}
