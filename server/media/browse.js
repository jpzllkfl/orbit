import fs from 'fs';
import path from 'path';
import { DEFAULT_OMS_LIBRARIES } from './catalog.js';
import { listAllFolderPaths, listLibraries } from './libraries.js';

function dockerMode() {
  return process.env.ORBIT_DOCKER === '1';
}

function envRoots() {
  const raw = process.env.ORBIT_MEDIA_ROOTS || '';
  return raw
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
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

  for (const r of envRoots()) add(r);
  for (const p of listAllFolderPaths()) add(p);
  for (const lib of listLibraries()) {
    for (const f of lib.folders || []) add(f.path);
  }

  if (fs.existsSync('/media')) {
    add('/media');
    try {
      for (const entry of fs.readdirSync('/media', { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          add(path.join('/media', entry.name));
        }
      }
    } catch {
      /* ignore unreadable /media */
    }
  }

  if (!dockerMode() && process.platform === 'win32') {
    for (const d of windowsDrives()) add(d);
  }

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

function browseLabel(rootPath) {
  const def = DEFAULT_OMS_LIBRARIES.find((l) => l.mount === rootPath);
  if (def) return `${def.name} — broken_eye/media/${def.hostDir}`;
  if (rootPath === '/media') return 'All media folders';
  if (rootPath.startsWith('/media/')) {
    const leaf = path.basename(rootPath);
    return `${leaf} — broken_eye/media/${leaf}`;
  }
  return rootPath;
}

export function browseRoots() {
  let roots = allowedRoots();
  const hasMediaChildren = roots.some((r) => r.startsWith('/media/') && r !== '/media');
  if (hasMediaChildren) {
    roots = roots.filter((r) => r !== '/media');
  }
  return roots.map((rootPath) => {
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
      label: browseLabel(rootPath),
      hostHint: browseLabel(rootPath),
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
