import path from 'path';
import { fileURLToPath } from 'url';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Writable Orbit server data (auth, sqlite, transcode cache). Override with ORBIT_DATA_DIR. */
export function getOrbitDataDir() {
  return process.env.ORBIT_DATA_DIR || path.join(SERVER_DIR, 'data');
}
