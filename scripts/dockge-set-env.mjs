#!/usr/bin/env node
/** Set stack env in compose YAML and redeploy (no rebuild unless --sha passed). */
import { io } from 'socket.io-client';

const PASS = process.argv[2];
const envKey = process.argv[3];
const envVal = process.argv[4];
const sha = process.argv[5]; // optional image tag

if (!PASS || !envKey || !envVal) {
  console.error('Usage: node dockge-set-env.mjs <dockge-pass> <ENV_KEY> <ENV_VALUE> [image-sha]');
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

function injectEnv(yaml, key, value) {
  const line = `      ${key}: "${value}"`;
  if (new RegExp(`^\\s*${key}:`, 'm').test(yaml)) {
    return yaml.replace(new RegExp(`^\\s*${key}:.*$`, 'm'), line);
  }
  if (/^\s+environment:\s*$/m.test(yaml)) {
    return yaml.replace(/(\n\s+environment:\s*\n)/, `$1${line}\n`);
  }
  return yaml.replace(/(services:\s*\n\s+orbit:\s*\n)/, `$1    environment:\n${line}\n`);
}

const socket = io('http://192.168.1.177:5001', { transports: ['websocket', 'polling'], reconnection: false });

socket.on('connect', async () => {
  try {
    await new Promise((r, j) => socket.emit('login', { username: 'admin', password: PASS }, (res) => (res?.ok ? r(res) : j(new Error('login')))));
    const detail = await agent(socket, 'getStack', 'orbit');
    if (!detail?.ok) throw new Error('getStack failed');
    let yaml = detail.stack.composeYAML || '';
    const env = detail.stack.composeENV || '';
    yaml = injectEnv(yaml, envKey, envVal);
    if (sha) {
      yaml = yaml.replace(/^\s*image:\s*orbit[^\n]*$/m, `    image: orbit:${sha}`);
    }
    console.log('Redeploying with', envKey, '= (set)');
    const deploy = await agent(socket, 'deployStack', 'orbit', yaml, env, false);
    console.log(JSON.stringify(deploy));
    socket.close();
    process.exit(deploy?.ok ? 0 : 1);
  } catch (e) {
    console.error(e.message || e);
    socket.close();
    process.exit(1);
  }
});
