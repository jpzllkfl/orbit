const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orbitNative', {
  available: true,
  async getInfo() {
    return ipcRenderer.invoke('orbit-native:info');
  },
  play(opts) {
    return ipcRenderer.invoke('orbit-native:play', opts);
  },
  pause(paused) {
    return ipcRenderer.invoke('orbit-native:pause', paused);
  },
  seek(sec) {
    return ipcRenderer.invoke('orbit-native:seek', sec);
  },
  setVolume(vol) {
    return ipcRenderer.invoke('orbit-native:volume', vol);
  },
  setBounds(bounds) {
    return ipcRenderer.invoke('orbit-native:bounds', bounds);
  },
  status() {
    return ipcRenderer.invoke('orbit-native:status');
  },
  stop() {
    return ipcRenderer.invoke('orbit-native:stop');
  },
  onResyncBounds(cb) {
    ipcRenderer.on('orbit-native:resync-bounds', () => cb());
  },
  openExternal(url) {
    return ipcRenderer.invoke('orbit-shell:open-external', url);
  },
});
