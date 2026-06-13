import { describe, expect, test } from 'bun:test';
import { hasFeature, VERTICAL_FEATURES, VERTICALS } from './vertical-features';

describe('vertical-features', () => {
  test('dental — odontogram va labOrders yoqilgan', () => {
    expect(hasFeature('dental', 'odontogram')).toBe(true);
    expect(hasFeature('dental', 'labOrders')).toBe(true);
  });

  test("general — odontogram va labOrders o'chiq", () => {
    expect(hasFeature('general', 'odontogram')).toBe(false);
    expect(hasFeature('general', 'labOrders')).toBe(false);
  });

  test("noma'lum vertical — default false", () => {
    expect(hasFeature('unknown' as never, 'odontogram')).toBe(false);
  });

  test('VERTICALS va map kalitlari mos', () => {
    expect(VERTICALS).toEqual(['dental', 'general']);
    expect(Object.keys(VERTICAL_FEATURES).sort()).toEqual([...VERTICALS].sort());
  });
});
