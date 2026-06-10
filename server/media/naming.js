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

const RELEASE_NOISE =
  /\b(2160p|1080p|720p|480p|4320p|4k|uhd|hdr10\+?|hdr|dv|web-?dl|webrip|bluray|blu-?ray|bdrip|brrip|hdtv|remux|x264|x265|hevc|h\.?264|h\.?265|aac|dts|truehd|atmos|amzn|nf|dsnp|hmax|proper|repack|extended|unrated|multi|10bit|8bit)\b/gi;

function cleanReleaseTitle(s) {
  return (s || '')
    .replace(RELEASE_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when a parsed title is too weak for TMDB search (numeric dumps, hashes, etc.). */
export function isWeakTitle(title) {
  const t = (title || '').trim();
  if (!t || t.length < 2) return true;
  if (/^\d+$/.test(t)) return true;
  if (/^[0-9a-f]{8,}$/i.test(t.replace(/\s/g, ''))) return true;
  if (/^(disc|cd|disk|pt|part|reel|tape)\s*\d+$/i.test(t)) return true;
  if (t.length <= 5 && /^\d/.test(t) && !/[a-z]{3,}/i.test(t)) return true;
  return false;
}

export function titleFromFolderName(folderName) {
  let n = (folderName || '').replace(/[._]/g, ' ').trim();
  const m = n.match(/^(.+?)\s*[\[(](\d{4})[\])]\s*$/);
  if (m) return { title: cleanReleaseTitle(m[1]), year: Number(m[2]) };
  const m2 = n.match(/^(.+?)\s+(19\d{2}|20\d{2})$/);
  if (m2) return { title: cleanReleaseTitle(m2[1]), year: Number(m2[2]) };
  return { title: cleanReleaseTitle(n), year: null };
}

function pathRelative(filePath, root) {
  const norm = (p) => p.replace(/\\/g, '/');
  const f = norm(filePath);
  if (!root) return f;
  const r = norm(root).replace(/\/$/, '');
  if (f.startsWith(r + '/')) return f.slice(r.length + 1);
  return f;
}

/** Folder names along a file path (nearest parent first). */
export function folderNamesFromPath(filePath, libraryRoot) {
  const rel = pathRelative(filePath, libraryRoot);
  const parts = rel.split(/[/\\]/).filter(Boolean);
  if (!parts.length) return [];
  parts.pop();
  return parts.reverse();
}

export function parseMovie(fileName) {
  const raw = baseName(fileName);
  const m = raw.match(/^(.+?)\s*[\[(](\d{4})[\])]\s*/);
  if (m) return { title: cleanReleaseTitle(m[1]), year: Number(m[2]) };
  const m2 = raw.match(/^(.+?)\s+(19\d{2}|20\d{2})(?:\s|$)/);
  if (m2) return { title: cleanReleaseTitle(m2[1]), year: Number(m2[2]) };
  return { title: cleanReleaseTitle(raw), year: null };
}

/** Use parent/grandparent folder when the filename alone is not searchable. */
export function movieTitleFromPath(filePath, libraryRoot, fileName) {
  const parsed = parseMovie(fileName);
  if (!isWeakTitle(parsed.title)) return parsed;

  for (const folder of folderNamesFromPath(filePath, libraryRoot)) {
    if (/^season\s*\d/i.test(folder) || /^s\d{1,2}$/i.test(folder)) continue;
    const fromFolder = titleFromFolderName(folder);
    if (!isWeakTitle(fromFolder.title)) {
      return { title: fromFolder.title, year: fromFolder.year || parsed.year };
    }
  }
  return parsed;
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

/** Guess show title from parent folders (e.g. /TV/Breaking Bad/Season 01/file.mkv). */
export function showFromPath(filePath, libraryRoot) {
  for (const folder of folderNamesFromPath(filePath, libraryRoot)) {
    if (/^season\s*\d/i.test(folder) || /^s\d{1,2}$/i.test(folder)) continue;
    const fromFolder = titleFromFolderName(folder);
    if (!isWeakTitle(fromFolder.title)) return fromFolder.title;
  }
  return null;
}

/** Build ordered TMDB search queries for a movie row. */
export function movieSearchQueries(row, libraryRoot) {
  const queries = [];
  const seen = new Set();
  const add = (t) => {
    const q = (t || '').trim();
    if (!q || seen.has(q.toLowerCase())) return;
    seen.add(q.toLowerCase());
    queries.push(q);
  };

  add(row.title);
  if (row.file_path && row.file_name) {
    const fromPath = movieTitleFromPath(row.file_path, libraryRoot, row.file_name);
    add(fromPath.title);
    for (const folder of folderNamesFromPath(row.file_path, libraryRoot)) {
      add(titleFromFolderName(folder).title);
    }
  }
  return queries;
}

/** Build ordered TMDB search queries for a TV show. */
export function showSearchQueries(showTitle, sampleRow, libraryRoot) {
  const queries = [];
  const seen = new Set();
  const add = (t) => {
    const q = (t || '').trim();
    if (!q || seen.has(q.toLowerCase())) return;
    seen.add(q.toLowerCase());
    queries.push(q);
  };

  add(showTitle);
  if (sampleRow?.file_path) {
    for (const folder of folderNamesFromPath(sampleRow.file_path, libraryRoot)) {
      if (/^season\s*\d/i.test(folder) || /^s\d{1,2}$/i.test(folder)) continue;
      add(titleFromFolderName(folder).title);
    }
  }
  return queries;
}
