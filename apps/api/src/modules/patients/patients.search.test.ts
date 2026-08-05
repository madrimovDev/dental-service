import { describe, expect, test } from 'bun:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { buildPatientSearchFilter } from './patients.search.ts';

/** Predikatni DB'siz tekshirish — SQL matni + bind parametrlari. */
const compile = (search: string) => {
  const filter = buildPatientSearchFilter(search);
  if (!filter) throw new Error('filter kutilgan edi');
  return new PgDialect().sqlToQuery(filter);
};

describe('buildPatientSearchFilter', () => {
  test('xom shox saqlanadi — ism, telefon, passport', () => {
    const { params } = compile('Qidiruv');
    expect(params).toEqual(['%Qidiruv%', '%Qidiruv%', '%Qidiruv%']);
  });

  test('9 xonali raqam uchun kanonik telefon shoxi qo‘shiladi', () => {
    const { params } = compile('901234567');
    expect(params).toContain('%901234567%');
    expect(params).toContain('%+998901234567%');
  });

  test('formatlangan telefon kanonik shoxga aylanadi', () => {
    const { params } = compile('+998 90 123 45 67');
    expect(params).toContain('%+998901234567%');
  });

  test('allaqachon kanonik qidiruv qo‘shimcha shox ochmaydi', () => {
    // 3 xom shox (ism/telefon/passport) — 4-chi kanonik shox ORTIQCHA bo'lardi.
    const { params } = compile('+998901234567');
    expect(params).toEqual(['%+998901234567%', '%+998901234567%', '%+998901234567%']);
  });

  test('raqamsiz qidiruvda kanonik shox YO‘Q', () => {
    const { params } = compile('Aliyev');
    expect(params.some((p) => String(p).includes('+'))).toBe(false);
  });

  test("bo'sh qidiruv → filtr yo'q", () => {
    expect(buildPatientSearchFilter('')).toBeUndefined();
  });
});
