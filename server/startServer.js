import { createApp } from './createApp.js';
import { ensureDockerDataDir } from './docker-data.js';
import { maybeAutoSeedOnBoot } from './media/seed.js';

/** Start the Orbit Express app (used by CLI and Electron desktop). */
export function startOrbitServer(port = 8090, host = '0.0.0.0') {
  ensureDockerDataDir();
  const seeded = maybeAutoSeedOnBoot();
  if (seeded?.added?.length) {
    console.log(`[orbit-oms] Auto-seeded ${seeded.added.length} media libraries (mount paths in container).`);
  }
  if (seeded?.missing?.length) {
    console.log(`[orbit-oms] ${seeded.missing.length} library folders not mounted — check docker-compose volumes.`);
  }
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve(server));
    server.on('error', (err) => reject(err));
  });
}
