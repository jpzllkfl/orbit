#!/usr/bin/env node
/** Push repo docker-compose to Dockge with TrueNAS paths + env. */
import { io } from 'socket.io-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = process.argv[2];
const SHA = process.argv[3] || '678a1c4';
const MEDIA_ROOT = process.argv[4] || '/mnt/broken_eye/media';
const TMDB_KEY = process.argv[5] || process.env.ORBIT_TMDB_API_KEY || '';

if (!PASS) {
  console.error('Usage: node dockge-fix-media.mjs <dockge-pass> [sha] [media-root] [tmdb-key]');
  process.exit(1);
}

function agent(socket, action, ...rest) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout ' + action)), 300000);
    socket.emit('agent', '', action, ...rest, (res) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

function buildCompose() {
  let yaml = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
  yaml = yaml.replace(/build:\s*\./, `build:\n      context: https://github.com/jpzllkfl/orbit.git#main`);
  yaml = yaml.replace(/image:\s*orbit[^\n]*/m, `image: orbit:${SHA}`);
  yaml = yaml.replace(/\$\{ORBIT_MEDIA_ROOT:-[^}]+\}/g, MEDIA_ROOT);
  if (TMDB_KEY) {
    yaml = yaml.replace(
      /ORBIT_TMDB_API_KEY:\s*[^\n]*/,
      `ORBIT_TMDB_API_KEY: "${TMDB_KEY}"`,
    );
  }
  return yaml;
}

const socket = io('http://192.168.1.177:5001', { transports: ['websocket', 'polling'], reconnection: false });

socket.on('connect', async () => {
  try {
    await new Promise((r, j) => socket.emit('login', { username: 'admin', password: PASS }, (res) => (res?.ok ? r() : j(new Error('login')))));
    const yaml = buildCompose();
    console.log('Media root:', MEDIA_ROOT);
    console.log('Image:', 'orbit:' + SHA);
    const deploy = await agent(socket, 'deployStack', 'orbit', yaml, '', false);
    console.log(JSON.stringify(deploy));
    socket.close();
    process.exit(deploy?.ok ? 0 : 1);
  } catch (e) {
    console.error(e.message || e);
    socket.close();
    process.exit(1);
  }
});
