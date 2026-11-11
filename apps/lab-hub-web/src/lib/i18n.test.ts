import { resources } from '@dental/i18n';
import { describe, expect, it } from 'vitest';

const flat = (o: unknown, p = ''): string[] =>
  o && typeof o === 'object'
    ? Object.entries(o).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k))
    : [p];

describe('labHub i18n', () => {
  const uz = flat((resources.uz.translation as Record<string, unknown>).labHub).sort();
  const ru = flat((resources.ru.translation as Record<string, unknown>).labHub).sort();
  it('uz va ru kalitlari bir xil, bo‘sh emas', () => {
    expect(uz.length).toBeGreaterThan(80);
    expect(ru).toEqual(uz);
  });
  it('bo‘sh matn yo‘q', () => {
    const get = (r: unknown, k: string) =>
      k.split('.').reduce<unknown>((a, x) => (a as Record<string, unknown>)[x], r);
    for (const lng of ['uz', 'ru'] as const) {
      const root = (resources[lng].translation as Record<string, unknown>).labHub;
      for (const k of uz) expect(String(get(root, k)).trim(), `${lng}:${k}`).not.toBe('');
    }
  });
});
