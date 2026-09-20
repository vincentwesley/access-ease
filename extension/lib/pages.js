// Pages the browser never lets an extension touch.
export function isProtectedUrl(url) {
  if (!url) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return true;
  }
  if (!['http:', 'https:', 'file:'].includes(u.protocol)) return true;
  if (/\.pdf$/i.test(u.pathname)) return true; // built-in PDF viewer (also file:///x.pdf)
  if (u.protocol === 'file:') return false;
  if (u.hostname === 'chromewebstore.google.com') return true;
  if (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore')) return true;
  return false;
}
