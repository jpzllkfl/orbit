import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');

/** Ensure /app/server/data is writable in Docker (named volumes often arrive root-owned). */
export function ensureDockerDataDir() {
  if (process.env.ORBIT_DOCKER !== '1') return;

  try {
    fs.mkdirSync(path.join(DATA_DIR, 'states'), { recursive: true, mode: 0o777 });
    fs.chmodSync(DATA_DIR, 0o777);
  } catch (err) {
    if (err?.code === 'EACCES' && typeof process.getuid === 'function' && process.getuid() === 0) {
      fs.chmodSync(DATA_DIR, 0o777);
      fs.mkdirSync(path.join(DATA_DIR, 'states'), { recursive: true, mode: 0o777 });
      return;
    }
    throw err;
  }
}
