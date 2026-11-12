/**
 * Landing skrinshotlari: namuna klinika (seed-demo-clinic.ts) ekranlaridan WebP kesimlar.
 *
 *   bun scripts/ui/landing-shots.ts --base http://localhost:8165 \
 *     --creds-uz /tmp/.../demo-creds-uz.json --creds-ru /tmp/.../demo-creds-ru.json \
 *     --landing apps/landing/dist --out apps/landing/src/assets [--only calendar,queue]
 *
 * Har ekran uz va ru (tenant alohida: ism-familiyalar kirill/lotin), faqat yorug' mavzu.
 * Natija: <out>/shots/<til>/<nom>.webp (9 ta × 2) + <out>/og.png (apps/landing/src/og.svg dan).
 * `--landing` — `bun run build` qilingan dist (Telegram kartasi shu sahifadan olinadi,
 * chunki Telegram xabarini ilovaning o'zidan olib bo'lmaydi).
 * Barcha ma'lumot o'ylab topilgan; haqiqiy bemor ma'lumoti yo'q.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { chromium, type Locator, type Page } from 'playwright-core';
import { findChromePath } from './chrome';

const args = process.argv.slice(2);
const get = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = (get('base') ?? 'http://localhost:8165').replace(/\/$/, '');
const out = resolve(get('out') ?? 'apps/landing/src/assets');
const landing = resolve(get('landing') ?? 'apps/landing/dist');
const only = get('only')?.split(',');
const debugDir = get('debug');
if (debugDir) mkdirSync(debugDir, { recursive: true });
const MAX_BYTES = 175_000;

type Lang = 'uz' | 'ru';
const root = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const locale = (lang: Lang) =>
  JSON.parse(readFileSync(join(root, 'packages/i18n/src/locales', `${lang}.json`), 'utf8'));
const tFor = (lang: Lang) => {
  const dict = locale(lang);
  return (key: string): string => {
    const v = key.split('.').reduce((o: any, k) => o?.[k], dict);
    if (typeof v !== 'string') throw new Error(`i18n kalit yo'q: ${key}`);
    return v;
  };
};

/** Kesim: sahifadagi (css px) to'rtburchak + chiqish o'lchami (piksel). */
interface Part {
  png: Buffer;
  /** chiqish canvasidagi joylashuv */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}
interface Result {
  w: number;
  h: number;
  bg?: string;
  parts: Part[];
}

const browser = await chromium.launch({ executablePath: findChromePath(), args: ['--no-sandbox'] });

// ─── WebP kodlash (brauzer canvas) ──────────────────────────────────────────
const encoder = await browser.newPage();
async function encode(r: Result): Promise<Buffer> {
  const b64 = await encoder.evaluate(
    async ({ r, parts, max }) => {
      const canvas = document.createElement('canvas');
      canvas.width = r.w;
      canvas.height = r.h;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (r.bg) {
        ctx.fillStyle = r.bg;
        ctx.fillRect(0, 0, r.w, r.h);
      }
      for (const p of parts) {
        const img = new Image();
        img.src = `data:image/png;base64,${p.b64}`;
        await img.decode();
        ctx.drawImage(img, p.dx, p.dy, p.dw, p.dh);
      }
      for (const q of [0.88, 0.82, 0.76, 0.7, 0.62, 0.55]) {
        const url = canvas.toDataURL('image/webp', q);
        if (url.length * 0.75 < max) return url.split(',')[1];
      }
      return canvas.toDataURL('image/webp', 0.5).split(',')[1];
    },
    {
      r: { w: r.w, h: r.h, bg: r.bg },
      parts: r.parts.map((p) => ({
        b64: p.png.toString('base64'),
        dx: p.dx,
        dy: p.dy,
        dw: p.dw,
        dh: p.dh,
      })),
      max: MAX_BYTES,
    },
  );
  return Buffer.from(b64 as string, 'base64');
}

// ─── ilovaga kirish ─────────────────────────────────────────────────────────
async function openApp(lang: Lang, viewport: { width: number; height: number }) {
  const creds = JSON.parse(readFileSync(get(`creds-${lang}`) ?? '', 'utf8'));
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 3,
    locale: lang === 'ru' ? 'ru-RU' : 'uz-UZ',
    timezoneId: 'Asia/Tashkent',
  });
  // login rate-limit chelagi: har brauzer sessiyasiga noyob IP
  await ctx.setExtraHTTPHeaders({
    'x-real-ip': `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
  });
  await ctx.addInitScript((l) => {
    localStorage.setItem('mantine-color-scheme-value', 'light');
    localStorage.setItem('dental_lang', l);
  }, lang);
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page
    .locator('input[data-path="phone"], input[autocomplete="tel"], input[type="tel"]')
    .first()
    .fill(creds.owner.phone.replace(/^\+?998/, ''));
  await page.locator('input[type="password"]').first().fill(creds.owner.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2000);
  return { page, ctx, creds };
}
const go = async (page: Page, to: string, settle = 1200) => {
  await page.evaluate((p) => {
    history.pushState({}, '', p);
    dispatchEvent(new PopStateEvent('popstate'));
  }, to);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(settle);
};
const api = async (creds: any, method: string, path: string) => {
  const call = async (p: string, m: string, body?: unknown, tok?: string) => {
    const res = await fetch(`${base}/api${p}`, {
      method: m,
      headers: {
        'content-type': 'application/json',
        'x-real-ip': `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
        ...(tok ? { authorization: `Bearer ${tok}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return ((await res.json()) as any).data;
  };
  const lg = await call('/auth/login', 'POST', creds.owner);
  const ws = await call(
    '/auth/switch-workspace',
    'POST',
    { tenantId: creds.tenantId, branchId: creds.branchId, refreshToken: lg.refreshToken },
    lg.accessToken,
  );
  return call(path, method, undefined, ws.accessToken);
};

const CARD_W = 700;
const CARD_H = 380;
/** `cw` css px kenglikdagi kesim → 700×380 karta rasmi (nisbat 700:380). */
async function cardClip(page: Page, x: number, y: number, cw: number): Promise<Result> {
  const ch = (cw * CARD_H) / CARD_W;
  const png = await page.screenshot({ clip: { x, y, width: cw, height: ch } });
  return { w: CARD_W, h: CARD_H, parts: [{ png, dx: 0, dy: 0, dw: CARD_W, dh: CARD_H }] };
}
const box = async (loc: Locator) => {
  const b = await loc.first().boundingBox();
  if (!b) throw new Error('element topilmadi');
  return b;
};
/** Sahifani ma'lum Y gacha aylantirib, joriy ko'rinishdagi koordinatalarni olish. */
const scrollTo = (page: Page, y: number) => page.evaluate((v) => window.scrollTo(0, v), y);

type Ctx = { page: Page; lang: Lang; t: (k: string) => string; creds: any };
const SHOTS: Record<
  string,
  { viewport?: { width: number; height: number }; run: (c: Ctx) => Promise<Result> }
> = {
  // 1) Hero: kunlik kalendar (3 shifokor)
  calendar: {
    viewport: { width: 1160, height: 656 },
    run: async ({ page }) => {
      await go(page, '/appointments', 1800);
      await scrollTo(page, 150);
      await page.waitForTimeout(300);
      const png = await page.screenshot();
      return { w: 1520, h: 860, parts: [{ png, dx: 0, dy: 0, dw: 1520, dh: 860 }] };
    },
  },
  // 2) Yangi yozilish: shifokor + bo'sh vaqt + Telegram eslatma matni
  booking: {
    viewport: { width: 1280, height: 900 },
    run: async ({ page, lang, t }) => {
      await go(page, '/appointments/new');
      const names = {
        uz: ['Malika Yusupova', 'Konsultatsiya', 'Dr. Karimova'],
        ru: ['Малика Юсупова', 'Консультация', 'Др. Каримова'],
      }[lang];
      const [pn, sn, dn] = names as [string, string, string];
      await page.locator('input[role="combobox"], input[aria-haspopup="listbox"]').first().click();
      await page.keyboard.type(pn.split(' ')[0] ?? pn, { delay: 30 });
      await page.waitForTimeout(900);
      await page
        .getByRole('option', { name: new RegExp(pn.split(' ')[0] ?? pn) })
        .first()
        .click();
      await page
        .getByRole('button', { name: new RegExp(sn) })
        .first()
        .click();
      await page
        .getByRole('button', { name: new RegExp(dn.replace('.', '\\.')) })
        .first()
        .click();
      // ertangi kun
      const tomorrow = new Date(Date.now() + (5 + 24) * 3_600_000).getUTCDate();
      await page
        .locator('button[aria-haspopup="dialog"], input[readonly]')
        .last()
        .click()
        .catch(() => undefined);
      await page.waitForTimeout(400);
      await page
        .locator('button[class*="Day"], button[data-day], td button')
        .filter({ hasText: new RegExp(`^${tomorrow}$`) })
        .first()
        .click();
      await page.waitForTimeout(1500);
      await page
        .getByRole('button', { name: /15:00/ })
        .first()
        .click()
        .catch(() => undefined);
      await page.waitForTimeout(600);
      const sec = await box(page.locator('section[aria-labelledby="bk-time"]'));
      const picked = await box(page.getByRole('button', { name: /15:00/ }));
      return cardClip(page, sec.x, picked.y - 58, sec.width);
    },
  },
  'tooth-chart': {
    viewport: { width: 1280, height: 900 },
    run: async ({ page, lang, t }) => {
      const first = lang === 'ru' ? 'Сардор' : 'Sardor';
      const found = await api(creds, 'GET', `/patients?search=${encodeURIComponent(first)}`);
      await go(page, `/patients/${found.data[0].id}`, 1500);
      await page
        .getByRole('tab', { name: t('patientCard.section.treatment') })
        .first()
        .click()
        .catch(async () => {
          await page.getByText(t('patientCard.section.treatment'), { exact: true }).first().click();
        });
      await page.waitForTimeout(1500);
      await page
        .getByText(t('patientCard.sub.odontogram'), { exact: true })
        .first()
        .click()
        .catch(() => undefined);
      await page.waitForTimeout(1500);
      return cardClip(page, 285, 432, 520);
    },
  },
  // 3) Kassa: kunlik xulosa (naqd/karta, karta turi bo'yicha)
  cashier: {
    run: async ({ page }) => {
      await go(page, '/cashier', 1500);
      return cardClip(page, 905, 440, 358);
    },
  },
  // 4) Navbat: kutmoqda + qabulda ustunlari
  queue: {
    run: async ({ page }) => {
      await go(page, '/queue', 1500);
      return cardClip(page, 282, 368, 640);
    },
  },
  // 5) Hisobotlar: davr bo'yicha tushum (kunlar diagrammasi)
  reports: {
    run: async ({ page, t }) => {
      await go(page, '/reports', 1500);
      await page.getByText(t('reportsQ.q.revenue'), { exact: true }).first().click();
      await page.waitForTimeout(1500);
      return cardClip(page, 576, 378, 668);
    },
  },
  // 6) Ish haqi (yuqori yarmi) + ombor qoldig'i (pastki yarmi)
  payroll: {
    run: async ({ page, t }) => {
      await go(page, '/payroll', 1500);
      await page.getByText(t('payroll.view_detail'), { exact: true }).first().click();
      await page.waitForTimeout(1800);
      const half = 187;
      // faqat asosiy ustunlar (Xodim, Komissiya %, Jami) — kichik rasmda o'qilishi uchun
      await page.evaluate(() => {
        const tbl = Array.from(document.querySelectorAll('table')).pop() as HTMLTableElement;
        for (const row of Array.from(tbl.rows))
          for (const i of [1, 2, 4, 5])
            (row.cells[i] as HTMLElement | undefined)?.style.setProperty('display', 'none');
        tbl.style.width = '480px';
      });
      await page.waitForTimeout(300);
      const tb = await box(page.locator('table').last());
      const top = await page.screenshot({
        clip: { x: tb.x - 8, y: tb.y - 4, width: 520, height: (520 * half) / CARD_W },
      });
      await go(page, '/stock', 1800);
      const bottom = await page.screenshot({
        clip: { x: 299, y: 400, width: 400, height: (400 * half) / CARD_W },
      });
      return {
        w: CARD_W,
        h: CARD_H,
        bg: '#ffffff',
        parts: [
          { png: top, dx: 0, dy: 0, dw: CARD_W, dh: half },
          { png: bottom, dx: 0, dy: CARD_H - half, dw: CARD_W, dh: half },
        ],
      };
    },
  },
  // 7) Rahbar telefoni: bosh sahifa kartalari ustun qilib terilgan
  'owner-phone': {
    viewport: { width: 1280, height: 1000 },
    run: async ({ page }) => {
      await go(page, '/', 2500);
      const clip = (x: number, y: number, width: number, height: number) =>
        page.screenshot({ clip: { x, y, width, height } });
      const a = await clip(283, 123, 234, 180);
      const b = await clip(532, 123, 234, 144);
      const c = await clip(905, 431, 358, 112);
      const W = 688;
      const parts: Part[] = [];
      let y = 24;
      for (const [png, w, h] of [
        [a, 234, 180],
        [b, 234, 144],
        [c, 358, 112],
      ] as const) {
        const dh = Math.round((W * h) / w);
        parts.push({ png, dx: 24, dy: y, dw: W, dh });
        y += dh + 16;
      }
      return { w: 736, h: 1360, bg: '#f0f2ee', parts };
    },
  },
  // 8) Telegram eslatmasi: landing sahifasidagi karta (Telegram xabarini ilovadan olib bo'lmaydi)
  telegram: {
    run: async ({ lang }) => {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 3,
        colorScheme: 'light',
      });
      const page = await ctx.newPage();
      await page.goto(`file://${landing}/${lang === 'ru' ? 'ru/' : ''}index.html`);
      // kartani sahnadan ajratib, tekis (burilmagan) holda olish
      await page.evaluate(() => {
        const el = document.querySelector('.f-tg') as HTMLElement;
        const holder = document.createElement('div');
        holder.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:99999';
        document.body.appendChild(holder);
        holder.appendChild(el);
        el.style.cssText =
          'position:static;transform:none;box-shadow:none;border:0;border-radius:0;width:270px;height:162px;box-sizing:border-box;overflow:hidden;margin:0;display:block';
      });
      const png = await page.locator('.f-tg').first().screenshot();
      await ctx.close();
      return { w: 540, h: 324, parts: [{ png, dx: 0, dy: 0, dw: 540, dh: 324 }] };
    },
  },
};

const names = Object.keys(SHOTS).filter((n) => !only || only.includes(n));
for (const lang of (get('lang')?.split(',') ?? ['uz', 'ru']) as Lang[]) {
  for (const name of names) {
    const def = SHOTS[name];
    if (!def) continue;
    const { page, ctx, creds } = await openApp(lang, def.viewport ?? { width: 1280, height: 800 });
    try {
      const result = await def.run({ page, lang, t: tFor(lang), creds });
      const buf = await encode(result);
      const file = join(out, 'shots', lang, `${name}.webp`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, buf);
      if (debugDir) await page.screenshot({ path: join(debugDir, `${lang}-${name}.png`) });
      console.log(`${lang}/${name}.webp ${Math.round(buf.length / 1024)} KB`);
    } finally {
      await ctx.close();
    }
  }
}
// OG (ulashish) rasmi: og.svg → 1200×630 PNG (faqat to'liq yurgizishda)
if (!only && !get('lang')) {
  const svg = readFileSync(join(root, 'apps/landing/src/og.svg'), 'utf8');
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'og.png'), await page.screenshot({ type: 'png' }));
  console.log('og.png');
}
await browser.close();
