/**
 * Ilova skrinshoti (light + dark).
 *   bun scripts/ui/app-shot.ts --base http://localhost:8041 --phone +998... --password ... \
 *     --tenant "<klinika nomi>" --paths /,/patients --out /tmp/claude-1000/ui0/app [--dark]
 * Default light; `--dark` faqat dark. Ikkalasi kerak bo'lsa ikki marta chaqiring
 * yoki `--both`.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { findChromePath } from './chrome';

const args = process.argv.slice(2);
const get = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (k: string) => args.includes(`--${k}`);
const base = get('base') ?? 'http://localhost:8041';
const phone = get('phone');
const password = get('password');
const tenant = get('tenant');
const paths = (get('paths') ?? '/').split(',');
const out = resolve(get('out') ?? '/tmp/claude-1000/ui0/app');
if (!phone || !password) {
  console.error('--phone va --password majburiy');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const schemes = has('both') ? ['light', 'dark'] : [has('dark') ? 'dark' : 'light'];

const browser = await chromium.launch({ executablePath: findChromePath(), args: ['--no-sandbox'] });
try {
  for (const scheme of schemes) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript((s) => {
      localStorage.setItem('mantine-color-scheme-value', s);
    }, scheme);
    const page = await ctx.newPage();
    await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
    await page
      .locator('input[data-path="phone"], input[autocomplete="tel"], input[type="tel"]')
      .first()
      .fill(phone.replace(/^\+?998/, '')); // login formada +998 prefiks bor
    await page
      .locator('input[autocomplete="current-password"], input[type="password"]')
      .first()
      .fill(password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(1500);
    if (page.url().includes('select-workspace') && tenant) {
      const card = page.getByText(tenant, { exact: false }).first();
      if (await card.count()) await card.click();
      await page.waitForTimeout(1500);
    }
    for (const p of paths) {
      // token xotirada — to'liq reload sessiyani yo'qotadi; SPA ichida navigatsiya
      await page.evaluate((to) => {
        history.pushState({}, '', to);
        dispatchEvent(new PopStateEvent('popstate'));
      }, p);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);
      const file = `${out}/${p === '/' ? 'home' : p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}-${scheme}.png`;
      await page.screenshot({ path: file, fullPage: false });
      console.log(file);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
