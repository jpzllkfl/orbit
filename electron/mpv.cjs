const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { execFileSync } = require('child_process');

const PIPE_NAME = '\\\\.\\pipe\\orbit-mpv-ipc';

function findMpv() {
  const candidates = [];
  if (process.env.MPV_PATH) candidates.push(process.env.MPV_PATH);
  candidates.push('mpv');
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA;
    if (local) {
      candidates.push(path.join(local, 'Programs', 'mpv', 'mpv.exe'));
      candidates.push(path.join(local, 'mpv', 'mpv.exe'));
    }
    candidates.push('C:\\Program Files\\mpv\\mpv.exe');
    candidates.push('C:\\Program Files (x86)\\mpv\\mpv.exe');
    candidates.push(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'mpv', 'mpv.exe'));
  } else if (process.platform === 'darwin') {
    candidates.push('/opt/homebrew/bin/mpv');
    candidates.push('/usr/local/bin/mpv');
    candidates.push('/Applications/mpv.app/Contents/MacOS/mpv');
  } else {
    candidates.push('/usr/bin/mpv');
    candidates.push('/usr/local/bin/mpv');
  }

  for (const c of candidates) {
    if (c === 'mpv') {
      try {
        execFileSync('mpv', ['--version'], { stdio: 'ignore' });
        return 'mpv';
      } catch {
        /* try next */
      }
      continue;
    }
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function hwndFromBuffer(buf) {
  if (!buf || !buf.length) return 0;
  if (buf.length >= 8) return Number(buf.readBigUInt64LE(0));
  return buf.readUInt32LE(0);
}

class MpvController {
  constructor() {
    this.mpvPath = null;
    this.proc = null;
    this.socket = null;
    this.ready = false;
    this.queue = [];
    this.requestId = 0;
    this.pending = new Map();
  }

  get available() {
    if (!this.mpvPath) this.mpvPath = findMpv();
    return !!this.mpvPath;
  }

  async connectIpc(timeoutMs = 8000) {
    if (this.socket) return;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        await new Promise((resolve, reject) => {
          const sock = net.connect(PIPE_NAME);
          sock.once('connect', () => {
            this.socket = sock;
            sock.setEncoding('utf8');
            let buf = '';
            sock.on('data', (chunk) => {
              buf += chunk;
              let idx;
              while ((idx = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, idx).trim();
                buf = buf.slice(idx + 1);
                if (!line) continue;
                try {
                  const msg = JSON.parse(line);
                  if (msg.request_id != null && this.pending.has(msg.request_id)) {
                    const { resolve: res, reject: rej } = this.pending.get(msg.request_id);
                    this.pending.delete(msg.request_id);
                    if (msg.error !== 'success') rej(new Error(msg.error || 'mpv error'));
                    else res(msg.data);
                  }
                } catch {
                  /* ignore parse noise */
                }
              }
            });
            sock.on('close', () => {
              this.socket = null;
            });
            resolve();
          });
          sock.once('error', reject);
        });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 120));
      }
    }
    throw new Error('Could not connect to mpv IPC');
  }

  command(args) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('mpv IPC not connected'));
        return;
      }
      const request_id = ++this.requestId;
      this.pending.set(request_id, { resolve, reject });
      this.socket.write(JSON.stringify({ command: args, request_id }) + '\n');
      setTimeout(() => {
        if (this.pending.has(request_id)) {
          this.pending.delete(request_id);
          reject(new Error('mpv command timeout'));
        }
      }, 12000);
    });
  }

  async getProp(name) {
    try {
      return await this.command(['get_property', name]);
    } catch {
      return null;
    }
  }

  async play(url, wid, startSec = 0) {
    if (!this.mpvPath) throw new Error('mpv not found — install from https://mpv.io');
    await this.stop();

    const args = [
      `--input-ipc-server=${PIPE_NAME}`,
      '--no-terminal',
      '--keep-open=no',
      '--osc=no',
      '--osd-level=0',
      '--hwdec=auto-safe',
      '--vo=gpu',
      '--aid=auto',
      '--alang=en',
      '--cache=yes',
      '--demuxer-max-bytes=150M',
      '--demuxer-max-back-bytes=75M',
    ];

    if (wid) args.push(`--wid=${wid}`);
    if (startSec > 1) args.push(`--start=${startSec}`);

    args.push(url);

    this.proc = spawn(this.mpvPath, args, { stdio: 'ignore', windowsHide: true });
    this.proc.on('exit', () => {
      this.proc = null;
      if (this.socket) {
        this.socket.destroy();
        this.socket = null;
      }
    });

    await this.connectIpc();
    await this.command(['set_property', 'pause', false]);
  }

  async pause(paused) {
    if (!this.socket) return;
    await this.command(['set_property', 'pause', !!paused]);
  }

  async seek(sec) {
    if (!this.socket) return;
    await this.command(['seek', Math.max(0, sec), 'absolute']);
  }

  async setVolume(pct) {
    if (!this.socket) return;
    const v = Math.max(0, Math.min(100, Math.round(pct * 100)));
    await this.command(['set_property', 'volume', v]);
  }

  async status() {
    if (!this.socket) {
      return { time: 0, duration: 0, paused: true, idle: true };
    }
    const [time, duration, paused] = await Promise.all([
      this.getProp('time-pos'),
      this.getProp('duration'),
      this.getProp('pause'),
    ]);
    return {
      time: typeof time === 'number' ? time : 0,
      duration: typeof duration === 'number' ? duration : 0,
      paused: !!paused,
      idle: false,
    };
  }

  async stop() {
    if (this.socket) {
      try {
        await this.command(['quit']);
      } catch {
        /* ignore */
      }
      this.socket.destroy();
      this.socket = null;
    }
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }
}

module.exports = { MpvController, hwndFromBuffer, findMpv };
