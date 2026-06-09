#!/usr/bin/env node
/**
 * Dockge Socket.IO deploy helper — login, inspect stack, redeploy with rebuild.
 * Usage: node scripts/dockge-deploy.mjs [--host URL] [--user U] [--pass P] [--stack NAME]
 */
import { io } from 'socket.io-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const HOST = getArg('--host', 'http://192.168.1.177:5001');
const USER = getArg('--user', process.env.DOCKGE_USER || 'admin');
const PASS = getArg('--pass', process.env.DOCKGE_PASS || '');
const STACK_HINT = getArg('--stack', 'orbit');

function agent(socket, action, ...rest) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout: ${action}`)), 600000);
    socket.emit('agent', '', action, ...rest, (res) => {
      clearTimeout(timeout);
      resolve(res);
    });
  });
}

function login(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Login timeout')), 30000);
    socket.emit('login', { username: USER, password: PASS }, (res) => {
      clearTimeout(timeout);
      if (res?.ok) resolve(res);
      else reject(new Error(res?.msg || 'Login failed'));
    });
  });
}

function waitEvent(socket, event, ms = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`No event: ${event}`)), ms);
    socket.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

async function main() {
  if (!PASS) {
    console.error('Set DOCKGE_PASS or pass --pass');
    process.exit(1);
  }

  const socket = io(HOST, {
    transports: ['websocket', 'polling'],
    reconnection: false,
    timeout: 20000,
  });

  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('Socket connect timeout')), 20000);
  });
  console.log('Connected to Dockge');

  const stackListPromise = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Timeout waiting for stackList')), 20000);
    const onAgent = (event, data) => {
      if (event === 'stackList' && data?.stackList) {
        clearTimeout(t);
        socket.off('agent', onAgent);
        resolve(data);
      }
    };
    socket.on('agent', onAgent);
  });

  await login(socket);
  console.log('Logged in');

  let listData;
  try {
    listData = await stackListPromise;
  } catch {
    await agent(socket, 'requestStackList');
    listData = await stackListPromise;
  }
  const stacks = Object.values(listData.stackList || {});
  console.log(
    'Stacks:',
    stacks.map((s) => s.name).join(', ') || '(none)',
  );

  const stack =
    stacks.find((s) => s.name.toLowerCase() === STACK_HINT.toLowerCase()) ||
    stacks.find((s) => s.name.toLowerCase().includes('orbit'));
  if (!stack) {
    console.error('Orbit stack not found. Available:', stacks.map((s) => s.name));
    socket.close();
    process.exit(1);
  }
  console.log('Using stack:', stack.name, 'status:', stack.status);

  const detail = await agent(socket, 'getStack', stack.name);
  if (!detail?.ok) {
    console.error('getStack failed:', detail?.msg);
    socket.close();
    process.exit(1);
  }
  const composePath = detail.stack?.composeFile || detail.stack?.composePath;
  console.log('Stack path:', detail.stack?.stackDir || detail.stack?.path || composePath || '(unknown)');

  // Redeploy with local compose (ensures latest yaml) + build via compose up --build
  const composeENV = detail.stack?.composeENV || '';
  let composeYAML = detail.stack?.composeYAML || fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');

  const GIT_SHA = getArg('--sha', '8a4e612');
  // Build from GitHub + unique image tag so compose rebuilds (up -d skips build when :latest exists).
  composeYAML = composeYAML
    .replace(/^\s*build:\s*\.\s*$/m, '    build:\n      context: https://github.com/jpzllkfl/orbit.git#main')
    .replace(
      /context:\s*https:\/\/github\.com\/jpzllkfl\/orbit\.git[^\n]*/g,
      'context: https://github.com/jpzllkfl/orbit.git#main',
    )
    .replace(/^\s*image:\s*orbit[^\n]*$/m, `    image: orbit:${GIT_SHA}`);

  console.log('Stopping stack...');
  const down = await agent(socket, 'downStack', stack.name);
  console.log('downStack:', JSON.stringify(down));

  console.log('Deploying from GitHub main (rebuild)...');
  const deploy = await agent(socket, 'deployStack', stack.name, composeYAML, composeENV, false);
  console.log('deployStack:', JSON.stringify(deploy));

  // Also try update in case images are pulled from registry
  if (deploy?.ok) {
    console.log('Waiting for containers...');
    await new Promise((r) => setTimeout(r, 5000));
  }

  socket.close();
  console.log('Done');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
