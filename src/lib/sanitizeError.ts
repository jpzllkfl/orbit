const HTML_MARKERS = /<!DOCTYPE|<html[\s>]|cloudflare|cf-browser-verification|challenge-platform/i;

export function looksLikeHtml(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (t.startsWith('<')) return true;
  return HTML_MARKERS.test(t.slice(0, 600));
}

export function sanitizeApiErrorText(text: string, fallback = 'Request failed.'): string {
  const raw = String(text || '').trim();
  if (!raw) return fallback;
  if (looksLikeHtml(raw)) {
    return 'YouTube TV blocked the server request. Try again, reconnect in Connections, or use the Orbit desktop app.';
  }
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  return oneLine.length > 220 ? oneLine.slice(0, 217) + '…' : oneLine;
}
