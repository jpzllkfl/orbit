import { createApp } from './createApp.js';

/** Start the Orbit Express app (used by CLI and Electron desktop). */
export function startOrbitServer(port = 8090, host = '0.0.0.0') {
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve(server));
    server.on('error', (err) => reject(err));
  });
}
