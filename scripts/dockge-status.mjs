import { io } from 'socket.io-client';

const PASS = process.argv[2] || process.env.DOCKGE_PASS;
const socket = io('http://192.168.1.177:5001', { transports: ['websocket', 'polling'], reconnection: false });

function agent(action, ...rest) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout ' + action)), 60000);
    socket.emit('agent', '', action, ...rest, (res) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

socket.on('connect', async () => {
  await new Promise((r) => socket.emit('login', { username: 'admin', password: PASS }, r));
  const st = await agent('serviceStatusList', 'orbit');
  console.log(JSON.stringify(st, null, 2));
  const stack = await agent('getStack', 'orbit');
  console.log('compose build line:', (stack.stack?.composeYAML || '').split('\n').slice(0, 15).join('\n'));
  socket.close();
  process.exit(0);
});

socket.on('connect_error', (e) => {
  console.error(e.message);
  process.exit(1);
});
