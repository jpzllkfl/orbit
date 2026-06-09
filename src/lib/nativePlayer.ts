import type { VideoBounds } from '../types/native';

export function hasNativePlayer() {
  return typeof window !== 'undefined' && !!window.orbitNative?.available;
}

export async function nativePlayerInfo() {
  if (!window.orbitNative) return { available: false, mpvPath: null as string | null };
  return window.orbitNative.getInfo();
}

export function videoBounds(el: HTMLElement | null): VideoBounds | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    x: r.left,
    y: r.top,
    width: r.width,
    height: r.height,
  };
}

export function bindBoundsSync(el: HTMLElement | null, onSync: () => void) {
  if (!el) return () => {};
  const ro = new ResizeObserver(() => onSync());
  ro.observe(el);
  window.orbitNative?.onResyncBounds?.(onSync);
  window.addEventListener('resize', onSync);
  return () => {
    ro.disconnect();
    window.removeEventListener('resize', onSync);
  };
}
