import { describe, expect, test } from 'bun:test';
import { normalizePhone } from './telegram-bot-manager.ts';

describe('normalizePhone', () => {
  test('strips spaces/dashes, keeps +digits', () => {
    expect(normalizePhone('+998 90 123-45-67')).toBe('+998901234567');
    expect(normalizePhone('998901234567')).toBe('+998901234567');
  });
});
