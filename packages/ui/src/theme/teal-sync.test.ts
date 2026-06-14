import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { teal } from './mantine-theme';

// Teal shkala ikki joyda qo'lda saqlanadi: mantine-theme.ts (tuple) va tokens.css (--teal-*).
// Bu test drift'ni ushlaydi — biri o'zgarib ikkinchisi unutilsa, fail bo'ladi.
describe('teal scale sync (mantine-theme.ts ↔ tokens.css)', () => {
  it('tokens.css --teal-50..900 mantine-theme teal tuple bilan mos', () => {
    const css = readFileSync(join(process.cwd(), 'src/theme/tokens.css'), 'utf8');
    const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
    const cssValues = steps.map((step) => {
      const hex = css.match(new RegExp(`--teal-${step}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
      if (!hex) throw new Error(`tokens.css'da --teal-${step} topilmadi`);
      return hex.toLowerCase();
    });
    const tupleValues = teal.map((c) => c.toLowerCase());
    expect(cssValues).toEqual(tupleValues);
  });
});
