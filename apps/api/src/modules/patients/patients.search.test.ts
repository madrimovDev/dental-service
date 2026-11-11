import { describe, expect, test } from 'bun:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { buildPatientSearchFilter } from './patients.search.ts';

/** Predikatni DB'siz tekshirish — SQL matni + bind parametrlari. */
const compile = (search: string, pii = true) => {
  const filter = buildPatientSearchFilter(search, { pii });
  if (!filter) throw new Error('filter kutilgan edi');
  return new PgDialect().sqlToQuery(filter);
};

describe('buildPatientSearchFilter', () => {
  test('lotin ism → lotin + kirill variant (ism ustuni)', () => {
    const { params } = compile('Tursun');
    expect(params).toContain('%Tursun%');
    expect(params).toContain('%Турсун%');
  });

  test('kirill ism → kirill + lotin variant', () => {
    const { params } = compile('турсун');
    expect(params).toContain('%турсун%');
    expect(params).toContain('%tursun%');
  });

  test('9 xonali raqam uchun kanonik telefon shoxi qo‘shiladi', () => {
    const { params } = compile('901234567');
    expect(params).toContain('%901234567%');
    expect(params).toContain('%+998901234567%');
  });

  test('formatlangan telefon kanonik shoxga aylanadi', () => {
    const { params } = compile('+998 90 123 45 67');
    expect(params).toContain('%+998901234567%');
    expect(params).toContain('%998901234567%');
  });

  test('bo‘shliqli qisman raqam faqat-raqam shoxi bilan topiladi', () => {
    const { params } = compile('90 123');
    expect(params).toContain('%90123%');
  });

  test('PT-03: pii=false — telefon va passport shoxi YO‘Q, faqat ism', () => {
    const { sql, params } = compile('901234567', false);
    expect(sql).not.toContain('"phone"');
    expect(sql).not.toContain('"passport"');
    expect(params).not.toContain('%+998901234567%');
  });

  test('pii=true — telefon va passport shoxi bor', () => {
    const { sql } = compile('AB1234567');
    expect(sql).toContain('"phone"');
    expect(sql).toContain('"passport"');
  });

  test('ILIKE jokerlari escape qilinadi', () => {
    const { params } = compile('50%_');
    expect(params).toContain('%50\\%\\_%');
  });

  test('raqamsiz qidiruvda kanonik shox YO‘Q', () => {
    const { params } = compile('Aliyev');
    expect(params.some((p) => String(p).includes('+'))).toBe(false);
  });

  test("bo'sh qidiruv → filtr yo'q", () => {
    expect(buildPatientSearchFilter('', { pii: true })).toBeUndefined();
    expect(buildPatientSearchFilter('   ', { pii: true })).toBeUndefined();
  });
});
