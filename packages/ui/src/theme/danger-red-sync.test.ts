import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { red } from './mantine-theme';

// Mantine `color="red"` filled primaryShade'ni oladi ({light:6, dark:4}).
// red[6] = light --danger (tokens.css --red-600), red[4] = dark --danger (#f08a82).
// Bu delete/danger affordance'lar token-danger ekanini kafolatlaydi (Mantine default red emas).
describe('danger red palette (tokens-anchored)', () => {
  it('red[6] = tokens.css --red-600 (light --danger filled)', () => {
    const css = readFileSync(join(process.cwd(), 'src/theme/tokens.css'), 'utf8');
    const redLight = css.match(/--red-600:\s*(#[0-9a-fA-F]{6})/)?.[1];
    expect(redLight).toBeTruthy();
    expect(red[6].toLowerCase()).toBe(redLight?.toLowerCase());
  });

  it('red[4] = tokens.css dark --danger (primaryShade dark=4)', () => {
    const css = readFileSync(join(process.cwd(), 'src/theme/tokens.css'), 'utf8');
    // light --danger = var(--red-600); faqat dark blok --danger hex qiymat beradi.
    const darkDanger = css.match(/--danger:\s*(#[0-9a-fA-F]{6})/)?.[1];
    expect(darkDanger).toBeTruthy();
    expect(red[4].toLowerCase()).toBe(darkDanger?.toLowerCase());
  });
});
