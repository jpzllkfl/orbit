export type VideoBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type UpdateStatus = {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'dev';
  message?: string;
  version?: string;
  nextVersion?: string | null;
  percent?: number;
};

export type OrbitNativeAPI = {
  available: boolean;
  getInfo(): Promise<{
    available: boolean;
    mpvPath: string | null;
    platform?: string;
    localPort?: number;
    mediaOrigin?: string;
    appVersion?: string;
  }>;
  play(opts: { url: string; startSec?: number; bounds?: VideoBounds }): Promise<void>;
  pause(paused: boolean): Promise<void>;
  seek(sec: number): Promise<void>;
  setVolume(vol: number): Promise<void>;
  setBounds(bounds: VideoBounds): Promise<void>;
  status(): Promise<{ time: number; duration: number; paused: boolean; idle?: boolean }>;
  stop(): Promise<void>;
  onResyncBounds?(cb: () => void): void;
  openExternal(url: string): Promise<void>;
  pickFolder?(): Promise<string | null>;
  checkForUpdates?(): Promise<UpdateStatus>;
  installUpdate?(): Promise<boolean>;
  getUpdateStatus?(): Promise<UpdateStatus>;
  onUpdateStatus?(cb: (status: UpdateStatus) => void): () => void;
};

declare global {
  interface Window {
    orbitNative?: OrbitNativeAPI;
  }
}

export {};
