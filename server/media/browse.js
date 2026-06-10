import fs from 'fs';
import path from 'path';

function dockerMode() {
  return process.env.ORBIT_DOCKER === '1';
}

function mediaBrowseRoot() {
  const configured = (process.env.ORBIT_MEDIA_BROWSE_ROOT || '').trim();
  if (configured && fs.existsSync(configured)) return path.resolve(configured);
  if (fs.existsSync('/media/share')) return '/media/share';
  if (dockerMode() && fs.existsSync('/media')) return '/media';
  return null;
}

function windowsDrives() {
  const out = [];
  for (let code = 65; code <= 90; code++) {
    const letter = `${String.fromCharCode(code)}:\\`;
    try {
      if (fs.existsSync(letter)) out.push(letter);
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** Only top-level browse entry points — never pre-list library folders or drive subfolders. */
export function allowedRoots() {
  const seen = new Set();
  const out = [];

  const add = (p) => {
    if (!p) return;
    const resolved = path.resolve(p);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    out.push(resolved);
  };

  const mediaRoot = mediaBrowseRoot();
  if (mediaRoot) add(mediaRoot);

  if (!dockerMode() && process.platform === 'win32') {
    for (const d of windowsDrives()) add(d);
  }

  const envExtra = (process.env.ORBIT_MEDIA_ROOTS || '')
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const r of envExtra) add(r);

  if (!out.length) add(process.cwd());
  return out;
}

function isUnderRoot(target, root) {
  const t = path.resolve(target);
  const r = path.resolve(root);
  if (t === r) return true;
  const prefix = r.endsWith(path.sep) ? r : r + path.sep;
  return t.startsWith(prefix);
}

function validatePath(targetPath) {
  const resolved = path.resolve(targetPath);
  const roots = allowedRoots();
  if (roots.some((r) => isUnderRoot(resolved, r))) return resolved;
  throw new Error('That folder is outside locations Orbit can access.');
}

function rootLabel(rootPath) {
  if (rootPath === '/media/share' || rootPath === '/media') {
    return 'Media (T: — \\\\192.168.1.177\\media)';
  }
  if (/^[A-Z]:\\$/i.test(rootPath)) return rootPath;
  return rootPath;
}

export function browseRoots() {
  return allowedRoots().map((rootPath) => {
    let exists = false;
    let readable = false;
    try {
      exists = fs.existsSync(rootPath);
      if (exists) {
        fs.accessSync(rootPath, fs.constants.R_OK);
        readable = fs.statSync(rootPath).isDirectory();
      }
    } catch {
      /* ignore */
    }
    return {
      path: rootPath,
      name: path.basename(rootPath.replace(/[/\\]+$/, '')) || rootPath,
      label: rootLabel(rootPath),
      exists,
      readable,
    };
  });
}

export function browseDir(requestedPath) {
  if (!requestedPath) {
    return { path: null, parent: null, roots: browseRoots(), entries: [] };
  }

  const target = validatePath(requestedPath);
  if (!fs.existsSync(target)) throw new Error('Folder not found.');
  if (!fs.statSync(target).isDirectory()) throw new Error('That path is not a folder.');

  const parent = path.dirname(target);
  const parentAllowed =
    parent !== target && allowedRoots().some((r) => isUnderRoot(parent, r)) ? parent : null;

  let entries = [];
  try {
    entries = fs
      .readdirSync(target, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => {
        const full = path.join(target, e.name);
        return { name: e.name, path: full, type: 'dir' };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  } catch (e) {
    throw new Error(e.code === 'EACCES' ? 'Permission denied reading that folder.' : 'Cannot read folder.');
  }

  return { path: target, parent: parentAllowed, entries };
}
