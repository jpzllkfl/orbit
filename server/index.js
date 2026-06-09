import { startOrbitServer } from './startServer.js';
import { lanAddresses } from './network.js';

const PORT = Number(process.env.PORT) || 8090;

startOrbitServer(PORT, '0.0.0.0').then(() => {
  const nets = lanAddresses();
  console.log('');
  console.log('  Orbit is running');
  console.log(`  → On this PC:     http://localhost:${PORT}`);
  if (nets.length) {
    console.log('  → On iPad / phone (same Wi‑Fi):');
    for (const ip of nets) console.log(`       http://${ip}:${PORT}`);
  } else {
    console.log('  → LAN: no Wi‑Fi/Ethernet IP found — use this PC’s IP manually');
  }
  console.log('');
  console.log('  Plex proxy: /api/plex/*');
  if (process.platform === 'win32') {
    console.log('  If iPad cannot connect, allow Node.js through Windows Firewall (private networks).');
  }
  console.log('');
}).catch((err) => {
  console.error('Orbit failed to start:', err.message || err);
  process.exit(1);
});
