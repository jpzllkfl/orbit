import { isDesktopApp } from './isDesktop';
import { OrbitMedia } from './orbitMedia';
import { loadSettings } from './settings';

const SCAN_INTERVAL_MS = 30 * 60 * 1000;
let lastScanAt = 0;
let scanInFlight: Promise<boolean> | null = null;

/** Scan OMS libraries for new/changed files on disk (desktop only). */
export async function maybeAutoScanOms(force = false): Promise<boolean> {
  if (!isDesktopApp()) return false;
  if (!loadSettings().library.autoScanOms) return false;
  if (!force && Date.now() - lastScanAt < SCAN_INTERVAL_MS) return false;
  if (scanInFlight) return scanInFlight;

  scanInFlight = (async () => {
    try {
      const libs = await OrbitMedia.listLibraries();
      if (!libs.length) return false;
      await OrbitMedia.scanAllLibraries();
      lastScanAt = Date.now();
      return true;
    } catch {
      return false;
    } finally {
      scanInFlight = null;
    }
  })();

  return scanInFlight;
}
