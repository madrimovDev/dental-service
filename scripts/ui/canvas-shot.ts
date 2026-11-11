/**
 * Kanvas artboard skrinshoti.
 *   bun scripts/ui/canvas-shot.ts <Name> [out.png]
 * `docs/design/ui-redesign-2026-11/canvas/<Name>.dc.html` ni ochadi; `support.js`
 * so'rovi `.cache/dc-runtime.js` ga yo'naltiriladi (oflayn runtime).
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { findChromePath } from './chrome';

const root = resolve(import.meta.dir, '../..');
const name = process.argv[2];
if (!name) {
  console.error('usage: bun scripts/ui/canvas-shot.ts <Name> [out.png]');
  process.exit(2);
}
const out = resolve(process.argv[3] ?? `/tmp/claude-1000/ui0/canvas-${name}.png`);
const file = resolve(root, `docs/design/ui-redesign-2026-11/canvas/${name}.dc.html`);
if (!existsSync(file)) {
  console.error(`canvas not found: ${file}`);
  process.exit(2);
}
const runtime = resolve(root, '.cache/dc-runtime.js');

const browser = await chromium.launch({ executablePath: findChromePath(), args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('**/support.js*', (r) =>
    r.fulfill({ path: runtime, contentType: 'application/javascript' }),
  );
  // tashqi shriftlar (oflayn) — bloklanadi, tizim shrifti ishlatiladi
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(`file://${file}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await import('node:fs').then((fs) => fs.mkdirSync(dirname(out), { recursive: true }));
  await page.screenshot({ path: out, fullPage: true });
  console.log(out);
} finally {
  await browser.close();
}
