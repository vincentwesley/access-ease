import test from 'node:test';
import assert from 'node:assert/strict';
import { isProtectedUrl } from '../extension/lib/pages.js';

test('browser-internal and store pages are protected; normal sites are not', () => {
  assert.equal(isProtectedUrl('chrome://extensions'), true);
  assert.equal(isProtectedUrl('chrome-extension://abc/x.html'), true);
  assert.equal(isProtectedUrl('https://chromewebstore.google.com/detail/x'), true);
  assert.equal(isProtectedUrl('https://example.com/a.pdf'), true);
  assert.equal(isProtectedUrl('https://example.com/'), false);
  assert.equal(isProtectedUrl('file:///C:/a.html'), false);
});

test('a missing url is "unknown", not protected (callers must check url == null)', () => {
  assert.equal(isProtectedUrl(undefined), false);
  assert.equal(isProtectedUrl(null), false);
  assert.equal(isProtectedUrl(''), false);
});

test('PDFs are protected on file: too (built-in viewer), other files are not', () => {
  assert.equal(isProtectedUrl('file:///C:/docs/x.pdf'), true);
  assert.equal(isProtectedUrl('file:///home/me/X.PDF'), true);
  assert.equal(isProtectedUrl('file:///C:/docs/x.html'), false);
});
