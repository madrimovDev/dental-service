import { searchVariants } from '@dental/core';
import { patients } from '@dental/db-schema';
import { ilike, or, type SQL } from 'drizzle-orm';
import { canonicalPhoneSearch } from './patients.phone.ts';

/** `ILIKE` joker belgilarini (`%`, `_`, `\`) matn sifatida talqin qilish uchun. */
const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Qidiruv telefonga o'xshaydimi (faqat raqam, bo'sh joy, `+`, `-`, qavs). */
const PHONE_LIKE = /^[\d\s+\-()]+$/;

/**
 * Bemor ro'yxatining erkin qidiruv predikati.
 *
 * **Ism** — lotin ↔ kirill: qidiruv matnining barcha variantlari
 * (`searchVariants`: «турсун» → «tursun») `ILIKE` bilan sinaladi.
 *
 * **Telefon / passport** — FAQAT `pii: true` bo'lsa (PT-03). `patient.view_pii`siz
 * foydalanuvchi uchun bu ustunlar maskalanadi; ular bo'yicha qidirishga ruxsat
 * berilsa, qidiruv natijasi (topildi/topilmadi) maskalangan qiymatni ochib
 * beruvchi oracle bo'lib qoladi.
 *  - telefon bazada KANONIK saqlanadi (`+998901234567`); foydalanuvchi uni
 *    istalgan formatda kiritadi (`90 123 45 67`, `901234567`), shuning uchun
 *    kanonik variant va faqat-raqam variant ham sinaladi;
 *  - xom matn shoxi O'CHIRILMAYDI — qisman qidiruv (`9012`) shu orqali topiladi.
 *
 * `undefined` qaytsa — qidiruv filtri qo'llanmaydi.
 */
export const buildPatientSearchFilter = (
  search: string,
  opts: { pii: boolean },
): SQL | undefined => {
  const variants = searchVariants(search);
  if (variants.length === 0) return undefined;

  const nameBranches = variants.map((v) => ilike(patients.fullName, `%${escapeLike(v)}%`));
  if (!opts.pii) return or(...nameBranches);

  const raw = variants[0] as string;
  const phoneTerms = new Set<string>([raw]);
  if (PHONE_LIKE.test(raw)) {
    const canonical = canonicalPhoneSearch(raw);
    if (canonical) phoneTerms.add(canonical);
    const digits = raw.replace(/\D/g, '');
    if (digits) phoneTerms.add(digits);
  }

  return or(
    ...nameBranches,
    ...[...phoneTerms].map((term) => ilike(patients.phone, `%${escapeLike(term)}%`)),
    ilike(patients.passport, `%${escapeLike(raw)}%`),
  );
};
