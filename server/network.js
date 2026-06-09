import os from 'os';

/** Non-loopback IPv4 addresses (Wi‑Fi / Ethernet) for LAN access from phones and tablets. */
export function lanAddresses() {
  const ips = new Set();
  const ifaces = os.networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    for (const iface of entries || []) {
      const v4 = iface.family === 'IPv4' || iface.family === 4;
      if (v4 && !iface.internal && iface.address) ips.add(iface.address);
    }
  }
  return [...ips];
}
