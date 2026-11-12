import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSite, flattenDict } from './build';

const SRC = join(import.meta.dir, '..', 'src');
const readDict = async (lang: string) =>
  JSON.parse(await readFile(join(SRC, 'i18n', `${lang}.json`), 'utf8'));

let outDir = '';
let pages: string[] = [];
const html: Record<string, string> = {};

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'landing-'));
  ({ pages } = await buildSite({ srcDir: SRC, outDir }));
  for (const p of pages) html[p] = await readFile(join(outDir, p), 'utf8');
});
afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe("lug'at", () => {
  test("uz va ru kalitlar to'plami teng (rekursiv)", async () => {
    const uz = [...flattenDict(await readDict('uz')).keys()].sort();
    const ru = [...flattenDict(await readDict('ru')).keys()].sort();
    expect(ru).toEqual(uz);
  });
});

describe('buildSite', () => {
  test("5 ta sahifa yig'iladi va hech birida {{ qolmagan", () => {
    expect(pages.sort()).toEqual(
      [
        '404.html',
        'index.html',
        'privacy/index.html',
        'ru/index.html',
        'ru/privacy/index.html',
      ].sort(),
    );
    for (const p of pages) expect(html[p]).not.toContain('{{');
  });

  test('har ikki bosh sahifada narxlar, 30 kun va aloqa bor', () => {
    const common = ['149 000', '299 000', '549 000', '1 490 000', '2 990 000', '5 490 000'];
    const contact = ['+998 95 044 50 14', '@madrimov'];
    for (const [page, trial] of [
      ['index.html', '30 kun'],
      ['ru/index.html', '30 дней'],
    ] as const) {
      for (const needle of [...common, ...contact, trial]) {
        expect(html[page]).toContain(needle);
      }
    }
  });

  test("tarif shifokor oralig'i va filial qoidasi ikkala tilda", () => {
    for (const page of ['index.html', 'ru/index.html']) {
      for (const range of ['1–2', '3–5', '6–10']) expect(html[page]).toContain(range);
    }
    expect(html['index.html']).toContain('Bir nechta filial');
    expect(html['ru/index.html']).toContain('Несколько филиалов');
  });

  test('barcha "bepul boshlash" tugmalari /start ga olib boradi (JS siz ham)', () => {
    for (const page of ['index.html', 'ru/index.html']) {
      const ctas = [...(html[page] ?? '').matchAll(/<a\b[^>]*\bdata-cta\b[^>]*>/g)].map(
        (m) => m[0],
      );
      expect(ctas.length).toBeGreaterThanOrEqual(5);
      for (const tag of ctas) expect(tag).toContain('href="/start"');
    }
  });

  test("hreflang uz/ru/x-default va to'g'ri canonical", () => {
    const uz = html['index.html'] ?? '';
    const ru = html['ru/index.html'] ?? '';
    for (const page of [uz, ru]) {
      expect(page).toContain('hreflang="uz"');
      expect(page).toContain('hreflang="ru"');
      expect(page).toContain('hreflang="x-default"');
    }
    expect(uz).toContain('<link rel="canonical" href="https://dental.madrimov.uz/">');
    expect(ru).toContain('<link rel="canonical" href="https://dental.madrimov.uz/ru/">');
    expect(uz).toContain('<html lang="uz">');
    expect(ru).toContain('<html lang="ru">');
    expect(html['privacy/index.html']).toContain(
      '<link rel="canonical" href="https://dental.madrimov.uz/privacy/">',
    );
    expect(html['ru/privacy/index.html']).toContain(
      '<link rel="canonical" href="https://dental.madrimov.uz/ru/privacy/">',
    );
  });

  test("til almashtirgich bir-birini ko'rsatadi", () => {
    expect(html['index.html']).toContain('href="/ru/" hreflang="ru"');
    expect(html['ru/index.html']).toContain('href="/" hreflang="uz"');
  });

  test("tashqi skript yo'q; tashqi resurs faqat Google Fonts (Manrope)", () => {
    for (const p of pages) {
      const doc = html[p] ?? '';
      for (const m of doc.matchAll(/<script\b[^>]*>/g)) {
        expect(m[0]).not.toMatch(/src="(https?:)?\/\//);
      }
      for (const m of doc.matchAll(/<link\b[^>]*>/g)) {
        const rel = /rel="([^"]+)"/.exec(m[0])?.[1] ?? '';
        if (rel === 'canonical' || rel === 'alternate') continue;
        const href = /href="([^"]+)"/.exec(m[0])?.[1] ?? '';
        if (/^(https?:)?\/\//.test(href)) {
          expect(new URL(href.startsWith('//') ? `https:${href}` : href).host).toBe(
            'fonts.googleapis.com',
          );
        }
      }
      expect(doc).not.toMatch(/<img\b[^>]*src="https?:/);
    }
  });

  test("sahifalarda emoji belgisi yo'q", () => {
    for (const p of pages) {
      const body = (html[p] ?? '').replace(/<style>[\s\S]*?<\/style>/g, '');
      expect(body).not.toMatch(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/u);
    }
  });

  test('skrinshotlar bor — 9 ta <img> (uz/ru), maket zaxirasi qolmaydi', () => {
    for (const [page, lang] of [
      ['index.html', 'uz'],
      ['ru/index.html', 'ru'],
    ] as const) {
      const h = html[page] ?? '';
      expect(h).not.toContain('<!--shot:');
      expect(h).not.toContain('class="scr"');
      const imgs = [...h.matchAll(/<img class="shot [^>]*>/g)].map((m) => m[0]);
      expect(imgs).toHaveLength(9);
      for (const img of imgs) {
        expect(img).toContain(`src="/assets/shots/${lang}/`);
        expect(img).toMatch(/width="\d+" height="\d+"/);
        expect(img).toMatch(/alt="[^"]{8,}"/);
      }
    }
  });

  test("skrinshot bo'lmasa maket chizmasi zaxira bo'lib qoladi (sinmaydi)", async () => {
    const bare = await mkdtemp(join(tmpdir(), 'landing-bare-'));
    const srcCopy = join(bare, 'src');
    await cp(SRC, srcCopy, { recursive: true });
    await rm(join(srcCopy, 'assets', 'shots'), { recursive: true, force: true });
    const outBare = join(bare, 'out');
    await buildSite({ srcDir: srcCopy, outDir: outBare });
    const h = await readFile(join(outBare, 'index.html'), 'utf8');
    expect(h).toContain('class="scr"');
    expect(h).not.toContain('<!--shot:');
    await rm(bare, { recursive: true, force: true });
  });

  test('«Kirish» havolasi ilova hostiga, privacy sahifasi mavjud', () => {
    expect(html['index.html']).toContain('href="https://app.dental.madrimov.uz/login"');
    expect(html['index.html']).toContain('href="/privacy/"');
    expect(html['ru/index.html']).toContain('href="/ru/privacy/"');
  });
});
