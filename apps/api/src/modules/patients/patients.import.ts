import type { patients } from '@dental/db-schema';
import { normalizeOptionalPhone } from './patients.phone.ts';
import type { ImportPatientRow } from './patients.schema.ts';

/**
 * FU-24 — import qatorini kanonik bemor qiymatiga aylantirish (SOF funksiya, DB yo'q).
 * Har qator mustaqil: xato qator `{ ok: false, code }` qaytaradi va butun importni to'xtatmaydi.
 */

/** Formula-injection: Excel/CSV keyin ochganda formula sifatida ishlashi mumkin bo'lgan bosh belgilar. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;
const PHONE_CANONICAL = /^\+\d{9,15}$/;
const GENDERS = new Set(['male', 'female', 'other']);

export type ImportRowError =
  | 'invalid_name'
  | 'invalid_phone'
  | 'invalid_date'
  | 'invalid_gender'
  | 'too_long'
  | 'unsafe_value';

type ParsedValue = Omit<typeof patients.$inferInsert, 'tenantId'>;
export type ParsedImportRow =
  | { ok: true; value: ParsedValue }
  | { ok: false; code: ImportRowError };

const clean = (v: string | null | undefined): string => (v ?? '').replace(/\s+/g, ' ').trim();

const isRealDate = (iso: string, today: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return false;
  return iso >= '1900-01-01' && iso <= today;
};

export function parseImportRow(raw: ImportPatientRow, now = new Date()): ParsedImportRow {
  const fullName = clean(raw.fullName);
  const passport = clean(raw.passport);
  const address = clean(raw.address);
  const notes = clean(raw.notes);
  const source = clean(raw.source);

  // Matnli maydonlar formula bilan boshlanmasligi shart (keyingi CSV/Excel eksportda xavf).
  for (const text of [fullName, passport, address, notes, source]) {
    if (text && FORMULA_LEAD.test(text)) return { ok: false, code: 'unsafe_value' };
  }

  if (fullName.length < 2) return { ok: false, code: 'invalid_name' };
  if (
    fullName.length > 120 ||
    passport.length > 64 ||
    address.length > 500 ||
    notes.length > 2000 ||
    source.length > 80
  ) {
    return { ok: false, code: 'too_long' };
  }

  const phoneRaw = clean(raw.phone);
  const phone = phoneRaw ? normalizeOptionalPhone(phoneRaw) : null;
  if (phoneRaw && (!phone || !PHONE_CANONICAL.test(phone)))
    return { ok: false, code: 'invalid_phone' };
  const secondRaw = clean(raw.phoneSecondary);
  const phoneSecondary = secondRaw ? normalizeOptionalPhone(secondRaw) : null;
  if (secondRaw && (!phoneSecondary || !PHONE_CANONICAL.test(phoneSecondary))) {
    return { ok: false, code: 'invalid_phone' };
  }

  const dobRaw = clean(raw.dateOfBirth);
  if (dobRaw && !isRealDate(dobRaw, now.toISOString().slice(0, 10))) {
    return { ok: false, code: 'invalid_date' };
  }

  const genderRaw = clean(raw.gender).toLowerCase();
  if (genderRaw && !GENDERS.has(genderRaw)) return { ok: false, code: 'invalid_gender' };

  return {
    ok: true,
    value: {
      fullName,
      phone,
      phoneSecondary,
      dateOfBirth: dobRaw || null,
      gender: (genderRaw || null) as ParsedValue['gender'],
      passport: passport || null,
      address: address || null,
      notes: notes || null,
      source: source || null,
      tags: [],
    },
  };
}
