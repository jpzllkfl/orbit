const HTML_MARKERS = /<!DOCTYPE|<html[\s>]|cloudflare|cf-browser-verification|challenge-platform/i;

export function looksLikeHtml(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (t.startsWith('<')) return true;
  return HTML_MARKERS.test(t.slice(0, 600));
}

export function sanitizeYoutubeTvErrorText(text, fallback = 'YouTube TV request failed.') {
  const raw = String(text || '').trim();
  if (!raw) return fallback;
  if (looksLikeHtml(raw)) {
    return 'YouTube TV blocked the server request (network protection). Open Orbit on your desktop app to load channels, or try again later.';
  }
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  return oneLine.length > 220 ? oneLine.slice(0, 217) + '…' : oneLine;
}

export function cloudflareBlockError() {
  const err = new Error(
    'YouTube TV blocked the server request (network protection). Open Orbit on your desktop app to load channels, or try again later.',
  );
  err.blockedByCloudflare = true;
  return err;
}
