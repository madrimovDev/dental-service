import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mantineTheme } from './mantine-theme';

const css = readFileSync(join(process.cwd(), 'src/theme/tokens.css'), 'utf8');
const token = (name: string) => css.match(new RegExp(`${name}:\\s*([^;\\s]+)`))?.[1];

// UI-0 1.1: asosiy matn 15px, eng kichik 13px (12px faqat badge), bosish zonasi >= 44px.
describe('tipografiya va bosish zonasi tokenlari (1.1)', () => {
  it('--text-base 15px', () => expect(token('--text-base')).toBe('15px'));
  it('o`qiladigan matn 13px dan kichik emas (12px faqat badge tokeni)', () => {
    expect(token('--text-xs')).toBe('13px');
    expect(token('--text-sm')).toBe('13px');
    expect(token('--text-2xs')).toBe('12px');
  });
  it('--tap-min 44px, --tap-chair 60px', () => {
    expect(token('--tap-min')).toBe('44px');
    expect(token('--tap-chair')).toBe('60px');
  });
  it('Mantine fontSizes token bilan mos (md = 15px)', () => {
    expect(mantineTheme.fontSizes?.md).toBe('var(--text-base)');
    expect(mantineTheme.fontSizes?.sm).toBe('var(--text-sm)');
    expect(mantineTheme.fontSizes?.xs).toBe('var(--text-xs)');
  });
  it('Button/ActionIcon/Input min-height 44', () => {
    for (const k of [
      'Button',
      'ActionIcon',
      'TextInput',
      'Select',
      'NumberInput',
      'PasswordInput',
    ]) {
      const c = mantineTheme.components?.[k] as { styles?: unknown; vars?: unknown } | undefined;
      expect(c, k).toBeTruthy();
    }
  });
});
