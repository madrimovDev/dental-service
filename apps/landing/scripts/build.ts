import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

type Dict = { [key: string]: string | Dict };
type ShotSize = { w: number; h: number };
type Lang = 'uz' | 'ru';

export interface BuildOptions {
  srcDir: string;
  outDir: string;
  /** Landing manzili (kanonik, hreflang, OG). `dentdo.uz` olingach shu yerda almashadi. */
  siteUrl?: string;
  /** Ilova manzili («Kirish» havolasi, brauzer ramkasidagi matn). */
  appUrl?: string;
}

export const DEFAULT_SITE_URL = 'https://dental.madrimov.uz';
export const DEFAULT_APP_URL = 'https://app.dental.madrimov.uz';

const LANGS: Lang[] = ['uz', 'ru'];
const OG_LOCALE: Record<Lang, string> = { uz: 'uz_UZ', ru: 'ru_RU' };

const escapeHtml = (s: string): string =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Ichma-ich lug'atni `a.b.c` kalitli tekis xaritaga aylantiradi. */
export function flattenDict(dict: Dict, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flattenDict(value, path)) out.set(k, v);
  }
  return out;
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

async function loadDicts(srcDir: string): Promise<Record<Lang, Map<string, string>>> {
  const read = async (lang: Lang) =>
    flattenDict(JSON.parse(await readFile(join(srcDir, 'i18n', `${lang}.json`), 'utf8')) as Dict);
  return { uz: await read('uz'), ru: await read('ru') };
}

interface RenderCtx {
  lang: Lang;
  dicts: Record<Lang, Map<string, string>>;
  vars: Record<string, string>;
}

/**
 * `{{kalit}}` o'rinbosarlarini almashtiradi. Kod beradigan o'zgaruvchilar (`vars`) —
 * ishonchli HTML, xom qo'yiladi. Nuqtali kalitlar lug'atdan olinadi va HTML-escape
 * qilinadi; `{{other:kalit}}` — ikkinchi til lug'ati. Topilmagan kalit — xato.
 */
function fill(template: string, ctx: RenderCtx): string {
  const other: Lang = ctx.lang === 'uz' ? 'ru' : 'uz';
  return template.replace(/\{\{\s*([A-Za-z0-9_.:-]+)\s*\}\}/g, (_m, key: string) => {
    const raw = ctx.vars[key];
    if (raw !== undefined) return raw;
    const fromOther = key.startsWith('other:');
    const dictKey = fromOther ? key.slice('other:'.length) : key;
    const value = ctx.dicts[fromOther ? other : ctx.lang].get(dictKey);
    if (value === undefined) throw new Error(`Lug'atda kalit yo'q: "${key}" (${ctx.lang})`);
    return escapeHtml(value);
  });
}

/**
 * `<!--shot:nom-->zaxira<!--/shot:nom-->` — agar `assets/shots/<til>/<nom>.webp` bor bo'lsa
 * haqiqiy skrinshot `<img>`, bo'lmasa maketdagi HTML-chizma (zaxira) qoladi.
 */
async function applyShots(
  html: string,
  lang: Lang,
  srcDir: string,
  sizes: Record<string, ShotSize>,
): Promise<string> {
  const re = /<!--shot:([a-z-]+)-->([\s\S]*?)<!--\/shot:\1-->/g;
  const parts: Array<string | Promise<string>> = [];
  let last = 0;
  for (const m of html.matchAll(re)) {
    const [whole, name = '', fallback = ''] = m;
    parts.push(html.slice(last, m.index));
    last = (m.index ?? 0) + whole.length;
    parts.push(
      (async () => {
        const size = sizes[name];
        if (!size) throw new Error(`shots.json'da o'lcham yo'q: ${name}`);
        if (!(await exists(join(srcDir, 'assets', 'shots', lang, `${name}.webp`)))) return fallback;
        const hero = name === 'calendar';
        return `<img class="shot shot-${name}" src="/assets/shots/${lang}/${name}.webp" width="${size.w}" height="${size.h}" alt="{{shot.${name}.alt}}" ${hero ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
      })(),
    );
  }
  parts.push(html.slice(last));
  return (await Promise.all(parts)).join('');
}

export async function buildSite(opts: BuildOptions): Promise<{ pages: string[] }> {
  const { srcDir, outDir } = opts;
  const siteUrl = (opts.siteUrl ?? DEFAULT_SITE_URL).replace(/\/$/, '');
  const appUrl = (opts.appUrl ?? DEFAULT_APP_URL).replace(/\/$/, '');
  if (outDir === srcDir) throw new Error("outDir srcDir bilan bir xil bo'lmasligi kerak");

  const dicts = await loadDicts(srcDir);
  const [css, tplHome, tplPrivacy, tpl404, sizesRaw] = await Promise.all([
    readFile(join(srcDir, 'style.css'), 'utf8'),
    readFile(join(srcDir, 'template.html'), 'utf8'),
    readFile(join(srcDir, 'privacy.html'), 'utf8'),
    readFile(join(srcDir, '404.html'), 'utf8'),
    readFile(join(srcDir, 'shots.json'), 'utf8'),
  ]);
  const sizes = JSON.parse(sizesRaw) as Record<string, ShotSize>;

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const pages: string[] = [];
  const urlOf = (lang: Lang, kind: 'home' | 'privacy') =>
    `${lang === 'ru' ? '/ru' : ''}${kind === 'privacy' ? '/privacy' : ''}/`;
  const write = async (relPath: string, html: string) => {
    if (html.includes('{{')) throw new Error(`To'ldirilmagan o'rinbosar: ${relPath}`);
    const target = join(outDir, relPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html);
    pages.push(relPath);
  };

  for (const lang of LANGS) {
    const otherLang: Lang = lang === 'uz' ? 'ru' : 'uz';
    for (const kind of ['home', 'privacy'] as const) {
      const vars: Record<string, string> = {
        lang,
        home: urlOf(lang, 'home'),
        appUrl,
        appHost: new URL(appUrl).host,
        css,
        canonical: `${siteUrl}${urlOf(lang, kind)}`,
        urlUz: `${siteUrl}${urlOf('uz', kind)}`,
        urlRu: `${siteUrl}${urlOf('ru', kind)}`,
        ogImage: `${siteUrl}/assets/og.png`,
        ogLocale: OG_LOCALE[lang],
        ogLocaleAlt: OG_LOCALE[otherLang],
        privacyHref: urlOf(lang, 'privacy'),
        langSwitch: LANGS.map((l) =>
          l === lang
            ? `<span class="cur" aria-current="true">${escapeHtml(dicts[l].get('lang.name') ?? l)}</span>`
            : `<a href="${urlOf(l, kind)}" hreflang="${l}" lang="${l}">${escapeHtml(dicts[l].get('lang.name') ?? l)}</a>`,
        ).join(' · '),
      };
      const template = kind === 'home' ? tplHome : tplPrivacy;
      const withShots = await applyShots(template, lang, srcDir, sizes);
      const html = fill(withShots, { lang, dicts, vars });
      const rel = `${lang === 'ru' ? 'ru/' : ''}${kind === 'privacy' ? 'privacy/' : ''}index.html`;
      await write(rel, html);
    }
  }

  await write('404.html', fill(tpl404, { lang: 'uz', dicts, vars: { lang: 'uz', css } }));

  // Statik fayllar: assets (skrinshotlar, favicon), app.js, og.svg.
  const assetsOut = join(outDir, 'assets');
  await mkdir(assetsOut, { recursive: true });
  if (await exists(join(srcDir, 'assets')))
    await cp(join(srcDir, 'assets'), assetsOut, { recursive: true });
  await cp(join(srcDir, 'app.js'), join(assetsOut, 'app.js'));
  if (await exists(join(srcDir, 'og.svg')))
    await cp(join(srcDir, 'og.svg'), join(assetsOut, 'og.svg'));

  // SEO: robots.txt + sitemap.xml (ikki til, o'zaro hreflang).
  await writeFile(
    join(outDir, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`,
  );
  const entry = (kind: 'home' | 'privacy', lang: Lang) =>
    `  <url>\n    <loc>${siteUrl}${urlOf(lang, kind)}</loc>\n` +
    `    <xhtml:link rel="alternate" hreflang="uz" href="${siteUrl}${urlOf('uz', kind)}"/>\n` +
    `    <xhtml:link rel="alternate" hreflang="ru" href="${siteUrl}${urlOf('ru', kind)}"/>\n  </url>`;
  await writeFile(
    join(outDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${(['home', 'privacy'] as const).flatMap((k) => LANGS.map((l) => entry(k, l))).join('\n')}\n</urlset>\n`,
  );

  return { pages };
}

if (import.meta.main) {
  const root = join(import.meta.dir, '..');
  const { pages } = await buildSite({ srcDir: join(root, 'src'), outDir: join(root, 'dist') });
  console.log(`landing: ${pages.length} sahifa yig'ildi -> dist/`);
}
