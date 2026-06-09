/** Limits concurrent poster image loads so grids don't stampede the proxy. */
let active = 0;
const MAX = 12;
const waiters: Array<() => void> = [];

export function acquireImageSlot(): Promise<void> {
  if (active < MAX) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      active++;
      resolve();
    });
  });
}

export function releaseImageSlot() {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}
