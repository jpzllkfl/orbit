const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindowGetter = () => null;
let lastStatus = { state: 'idle', version: app.getVersion() };

function send(payload) {
  lastStatus = { ...lastStatus, ...payload, version: app.getVersion() };
  const win = mainWindowGetter();
  if (win && !win.isDestroyed()) {
    win.webContents.send('orbit-update:status', lastStatus);
  }
}

function initAutoUpdater(getMainWindow) {
  mainWindowGetter = getMainWindow;
  if (!app.isPackaged) {
    send({ state: 'dev', message: 'Updates apply to the installed Orbit app only.' });
    return;
  }

  autoUpdater.on('checking-for-update', () => {
    send({ state: 'checking', message: 'Checking for updates…' });
  });
  autoUpdater.on('update-available', (info) => {
    send({
      state: 'available',
      message: `Update ${info.version} is downloading…`,
      nextVersion: info.version,
    });
  });
  autoUpdater.on('update-not-available', () => {
    send({ state: 'idle', message: 'Orbit is up to date.', nextVersion: null });
  });
  autoUpdater.on('download-progress', (p) => {
    send({
      state: 'downloading',
      message: `Downloading update… ${Math.round(p.percent || 0)}%`,
      percent: p.percent,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    send({
      state: 'ready',
      message: `Update ${info.version} is ready — restart to install.`,
      nextVersion: info.version,
    });
  });
  autoUpdater.on('error', (err) => {
    send({
      state: 'error',
      message: err?.message || 'Update check failed.',
    });
  });
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    return { ...lastStatus, state: 'dev', message: 'Run the installed app to receive updates.' };
  }
  try {
    await autoUpdater.checkForUpdates();
    return lastStatus;
  } catch (e) {
    send({ state: 'error', message: e?.message || 'Update check failed.' });
    return lastStatus;
  }
}

function installUpdate() {
  if (!app.isPackaged) return false;
  autoUpdater.quitAndInstall(false, true);
  return true;
}

function scheduleStartupCheck(delayMs = 8000) {
  if (!app.isPackaged) return;
  setTimeout(() => {
    checkForUpdates().catch(() => {});
  }, delayMs);
  // Re-check every 6 hours while the app stays open.
  setInterval(() => {
    checkForUpdates().catch(() => {});
  }, 6 * 60 * 60 * 1000);
}

module.exports = { initAutoUpdater, checkForUpdates, installUpdate, scheduleStartupCheck, getUpdateStatus: () => lastStatus };
