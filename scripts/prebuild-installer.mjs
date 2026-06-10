#!/usr/bin/env node
/** Close Orbit and move aside a locked release/ folder before electron-builder runs. */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(root, 'release');

try {
  execSync('taskkill /F /IM Orbit.exe /T 2>nul', { stdio: 'ignore', shell: true });
} catch {
  /* not running */
}

if (!fs.existsSync(release)) process.exit(0);

try {
  fs.rmSync(release, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
} catch {
  const bak = release + '.bak.' + Date.now();
  try {
    fs.renameSync(release, bak);
    console.log('Moved locked release folder to', path.basename(bak));
  } catch (e) {
    console.error('Close Orbit and File Explorer windows on release/, then retry.');
    console.error(e.message || e);
    process.exit(1);
  }
}
