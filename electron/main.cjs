const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');
const { MpvController, hwndFromBuffer, findMpv } = require('./mpv.cjs');

const ROOT = path.join(__dirname, '..');
const DEBUG = process.env.ORBIT_ELECTRON_DEBUG === '1';

// Large synced libraries can spike renderer memory during JSON parse.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');

let mainWindow = null;
let videoWindow = null;
let httpServer = null;
let activePort = Number(process.env.PORT) || 8090;
let nativePlaying = false;
const mpv = new MpvController();

function bootErrorHtml(title, detail) {
  const body = `${title}\n\n${detail}\n\nTry:\n  1. Close any other Orbit window\n  2. npm run build\n  3. npm run desktop`;
  return (
    'data:text/html;charset=utf-8,' +
    encodeURIComponent(
      `<!doctype html><html><body style="font:15px/1.5 system-ui;background:#111;color:#eee;padding:32px;max-width:520px">
        <h1 style="color:#f3ba25;margin:0 0 12px">${title}</h1>
        <pre style="white-space:pre-wrap;color:#ccc">${detail}</pre>
        <p style="color:#888">Close other Orbit instances, run <code>npm run build</code>, then <code>npm run desktop</code>.</p>
      </body></html>`,
    )
  );
}

function showBootError(title, detail) {
  const win = new BrowserWindow({ width: 560, height: 360, backgroundColor: '#111111' });
  win.loadURL(bootErrorHtml(title, detail));
  if (DEBUG) win.webContents.openDevTools({ mode: 'detach' });
}

async function startServer() {
  // Packaged app lives in app.asar — auth/sqlite must write to userData, not inside the bundle.
  process.env.ORBIT_DATA_DIR = path.join(app.getPath('userData'), 'data');
  if (!process.env.ORBIT_TMDB_API_KEY) {
    process.env.ORBIT_TMDB_API_KEY = 'b379792391747f1606e1d7a933dd2aea';
  }
  const mod = await import(pathToFileURL(path.join(ROOT, 'server', 'startServer.js')).href);
  let netMod = null;
  try {
    netMod = await import(pathToFileURL(path.join(ROOT, 'server', 'network.js')).href);
  } catch {
    /* optional */
  }
  const ports = [activePort, 8091, 8092, 8093];
  let lastErr = null;
  for (const port of ports) {
    try {
      // 0.0.0.0 — reachable on LAN and Tailscale; Electron UI still loads 127.0.0.1
      httpServer = await mod.startOrbitServer(port, '0.0.0.0');
      activePort = port;
      console.log(`[orbit-desktop] local   http://127.0.0.1:${port}`);
      const nets = netMod?.lanAddresses?.() || [];
      if (nets.length) {
        console.log('[orbit-desktop] remote  (iPad / phone / Tailscale):');
        for (const ip of nets) console.log(`[orbit-desktop]           http://${ip}:${port}`);
      } else {
        console.log(`[orbit-desktop] remote  use this PC's LAN or Tailscale IP with :${port}`);
      }
      return port;
    } catch (err) {
      lastErr = err;
      if (err && err.code !== 'EADDRINUSE') break;
    }
  }
  throw lastErr || new Error('Could not start Orbit server');
}

function waitForHealth(port, ms = 12000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else if (Date.now() - start < ms) setTimeout(tick, 200);
        else reject(new Error('Health check failed'));
      });
      req.on('error', () => {
        if (Date.now() - start < ms) setTimeout(tick, 200);
        else reject(new Error('Health check failed'));
      });
    };
    tick();
  });
}

function destroyVideoWindow() {
  if (videoWindow && !videoWindow.isDestroyed()) {
    videoWindow.close();
  }
  videoWindow = null;
}

function ensureVideoWindow() {
  if (videoWindow && !videoWindow.isDestroyed()) return videoWindow;
  videoWindow = new BrowserWindow({
    parent: mainWindow,
    frame: false,
    show: false,
    transparent: false,
    backgroundColor: '#000000',
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  videoWindow.setIgnoreMouseEvents(true);
  videoWindow.loadURL('about:blank');
  return videoWindow;
}

function applyVideoBounds(bounds) {
  if (!nativePlaying || !mainWindow || mainWindow.isDestroyed()) return;
  const content = mainWindow.getContentBounds();
  const vw = ensureVideoWindow();
  const x = Math.round(content.x + (bounds?.x || 0));
  const y = Math.round(content.y + (bounds?.y || 0));
  const w = Math.max(2, Math.round(bounds?.width || 0));
  const h = Math.max(2, Math.round(bounds?.height || 0));
  vw.setBounds({ x, y, width: w, height: h });
  vw.showInactive();
}

function createMainWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0a0a0c',
    title: 'Orbit',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (_evt, code, desc, url) => {
    console.error('[orbit-desktop] load failed', code, desc, url);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(bootErrorHtml('Orbit failed to load', `${desc} (${code})\n${url}`));
      mainWindow.show();
    }
  });

  mainWindow.webContents.on('render-process-gone', (_evt, details) => {
    console.error('[orbit-desktop] render gone', details);
    if (mainWindow && !mainWindow.isDestroyed()) {
      const reason = details?.reason || 'unknown';
      mainWindow.loadURL(
        bootErrorHtml(
          'Orbit ran out of memory',
          `The library is very large and the window crashed (${reason}).\n\nClose other apps, then restart Orbit Desktop.`,
        ),
      );
      mainWindow.show();
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  if (DEBUG) mainWindow.webContents.openDevTools({ mode: 'detach' });

  const appUrl = `http://127.0.0.1:${port}/`;
  console.log('[orbit-desktop] loading', appUrl);
  mainWindow.loadURL(appUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
    nativePlaying = false;
    destroyVideoWindow();
    mpv.stop().catch(() => {});
  });
  mainWindow.on('resize', () => {
    if (nativePlaying && mainWindow) mainWindow.webContents.send('orbit-native:resync-bounds');
  });
  mainWindow.on('move', () => {
    if (nativePlaying && mainWindow) mainWindow.webContents.send('orbit-native:resync-bounds');
  });
}

app.whenReady().then(async () => {
  try {
    const port = await startServer();
    await waitForHealth(port);
    createMainWindow(port);
  } catch (e) {
    console.error('[orbit-desktop] boot error', e);
    showBootError('Orbit could not start', String(e.message || e));
  }
});

app.on('window-all-closed', () => {
  if (httpServer) {
    try {
      httpServer.close();
    } catch {
      /* ignore */
    }
  }
  app.quit();
});

ipcMain.handle('orbit-shell:open-external', async (_evt, url) => {
  if (url) await shell.openExternal(String(url));
});

ipcMain.handle('orbit-shell:pick-folder', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const result = await dialog.showOpenDialog(win || undefined, {
    title: 'Choose media library folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('orbit-native:info', async () => ({
  available: mpv.available,
  mpvPath: mpv.mpvPath,
  platform: process.platform,
}));

ipcMain.handle('orbit-native:bounds', async (_evt, bounds) => {
  if (!nativePlaying) return;
  applyVideoBounds(bounds || {});
});

ipcMain.handle('orbit-native:play', async (_evt, opts) => {
  if (!opts?.url) throw new Error('Missing playback URL');
  nativePlaying = true;
  if (opts.bounds) applyVideoBounds(opts.bounds);
  const vw = ensureVideoWindow();
  const wid = hwndFromBuffer(vw.getNativeWindowHandle());
  await mpv.play(opts.url, wid, opts.startSec || 0);
});

ipcMain.handle('orbit-native:pause', async (_evt, paused) => {
  await mpv.pause(paused);
});

ipcMain.handle('orbit-native:seek', async (_evt, sec) => {
  await mpv.seek(sec);
});

ipcMain.handle('orbit-native:volume', async (_evt, vol) => {
  await mpv.setVolume(vol);
});

ipcMain.handle('orbit-native:status', async () => mpv.status());

ipcMain.handle('orbit-native:stop', async () => {
  nativePlaying = false;
  await mpv.stop();
  destroyVideoWindow();
});

if (!findMpv()) {
  console.warn('[orbit-desktop] mpv not found — winget install shinchiro.mpv');
}
