import { io } from 'socket.io-client';
const PASS = process.argv[2];
const socket = io('http://192.168.1.177:5001', { transports: ['websocket', 'polling'], reconnection: false });
function agent(action, ...rest) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 30000);
    socket.emit('agent', '', action, ...rest, (res) => { clearTimeout(t); resolve(res); });
  });
}
socket.on('connect', async () => {
  await new Promise((r) => socket.emit('login', { username: 'admin', password: PASS }, r));
  const stack = await agent('getStack', 'orbit');
  console.log(stack.stack?.composeYAML || 'no yaml');
  socket.close();
});
