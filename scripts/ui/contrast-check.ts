/**
 * WCAG kontrast tekshiruvi — `packages/ui/src/theme/tokens.css` dan light va
 * `[data-mantine-color-scheme="dark"]` juftliklari. Matn juftliklari >= 4.5:1,
 * exit 1 agar biror juftlik yetmasa.
 *   bun scripts/ui/contrast-check.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(
  resolve(import.meta.dir, '../../packages/ui/src/theme/tokens.css'),
  'utf8',
);

function block(selector: RegExp): Record<string, string> {
  const m = css.match(selector);
  const vars: Record<string, string> = {};
  if (!m) return vars;
  for (const d of m[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]!] = d[2]!.trim();
  return vars;
}
const root = block(/:root\s*\{([\s\S]*?)\n\}/);
const darkOverrides = block(/\[data-mantine-color-scheme="dark"\]\s*\{([\s\S]*?)\n\}/);
const themes: Record<string, Record<string, string>> = {
  light: root,
  dark: { ...root, ...darkOverrides },
};

function resolveVar(vars: Record<string, string>, name: string, depth = 0): string {
  const v = vars[name];
  if (!v) throw new Error(`token topilmadi: ${name}`);
  const m = v.match(/^var\((--[\w-]+)\)$/);
  if (m && depth < 10) return resolveVar(vars, m[1]!, depth + 1);
  return v;
}
function lum(hex: string): number {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(f.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function ratio(a: string, b: string): number {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

/** [matn tokeni, fon tokeni, minimal nisbat]. Yangi rang juftligi qo'shilsa shu yerga. */
export const PAIRS: Array<[string, string, number]> = [
  ['--text', '--bg', 4.5],
  ['--text', '--surface', 4.5],
  ['--text', '--surface-2', 4.5],
  ['--text-2', '--bg', 4.5],
  ['--text-2', '--surface', 4.5],
  ['--text-2', '--surface-2', 4.5],
  ['--text-2', '--sidebar', 4.5],
  ['--text-on-primary', '--primary', 4.5],
  ['--text-on-danger', '--danger', 4.5],
  ['--primary', '--surface', 4.5],
  ['--primary', '--primary-tint', 4.5],
  ['--success', '--success-bg', 4.5],
  ['--warning', '--warning-bg', 4.5],
  ['--danger', '--danger-bg', 4.5],
  ['--info', '--info-bg', 4.5],
  ['--violet', '--violet-soft', 4.5],
];

let failed = 0;
for (const [theme, vars] of Object.entries(themes)) {
  for (const [fg, bg, min] of PAIRS) {
    const r = ratio(resolveVar(vars, fg), resolveVar(vars, bg));
    const ok = r >= min;
    if (!ok) failed++;
    console.log(
      `${ok ? 'OK  ' : 'FAIL'} ${theme.padEnd(5)} ${fg} on ${bg}: ${r.toFixed(2)} (min ${min})`,
    );
  }
}
if (failed) {
  console.error(`${failed} juftlik yetarli emas`);
  process.exit(1);
}
