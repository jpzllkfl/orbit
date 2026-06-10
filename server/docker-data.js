import fs from 'fs';
import path from 'path';
import { getOrbitDataDir } from './data-dir.js';

/** Ensure server data dir exists (Docker volume, Electron userData, or dev). */
export function ensureDockerDataDir() {
  const dataDir = getOrbitDataDir();
  try {
    fs.mkdirSync(path.join(dataDir, 'states'), { recursive: true });
    if (process.env.ORBIT_DOCKER === '1') {
      fs.chmodSync(dataDir, 0o777);
    }
  } catch (err) {
    if (err?.code === 'EACCES' && typeof process.getuid === 'function' && process.getuid() === 0) {
      fs.chmodSync(dataDir, 0o777);
      fs.mkdirSync(path.join(dataDir, 'states'), { recursive: true, mode: 0o777 });
      return;
    }
    throw err;
  }
}
