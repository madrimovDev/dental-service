import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// P11: haqiqiy createApp() CSP'si (secure-headers.test.ts faqat nusxa). Desktop'da rasmlar
// Bearer bilan fetch qilinib `blob:` object URL bo'ladi — img-src `blob:`ni ruxsat etishi shart.
test('desktop createApp() CSP img-src allows blob: and data:', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'csp-dist-'));
  await Bun.write(join(dist, 'index.html'), '<html></html>');
  process.env.WEB_DIST_DIR = dist;
  const { createApp } = await import('../app');
  const res = await createApp().request('/');
  const csp = res.headers.get('content-security-policy') ?? '';
  expect(csp).toContain("img-src 'self' data: blob:");
});
