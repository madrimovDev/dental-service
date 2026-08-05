import { patients } from '@dental/db-schema';
import { ilike, or, type SQL } from 'drizzle-orm';
import { canonicalPhoneSearch } from './patients.phone.ts';

/**
 * Bemor ro'yxatining erkin qidiruv predikati.
 *
 * Telefon Task 8 dan keyin bazada KANONIK saqlanadi (`+998901234567`), lekin
 * foydalanuvchi uni istalgan formatda kiritadi (`901234567`,
 * `+998 90 123 45 67`). Shuning uchun ikkala shox ham sinaladi:
 *  - xom matn — ism/passport uchun VA qisman raqam qidiruvi uchun
 *    (masalan `9012` faqat shu shox orqali topiladi);
 *  - kanonik telefon — to'liq raqam istalgan formatda kiritilganda.
 *
 * Xom shox HECH QACHON o'chirilmaydi — aks holda qisman qidiruv buziladi.
 * Kanonik shox faqat telefon ustuniga qo'llanadi (ism/passportda `+998…`
 * qidirishning ma'nosi yo'q).
 *
 * `undefined` qaytsa — qidiruv filtri qo'llanmaydi (`where` shoxi yo'q).
 */
export const buildPatientSearchFilter = (search: string): SQL | undefined => {
  if (!search) return undefined;

  const term = `%${search}%`;
  const canonical = canonicalPhoneSearch(search);
  const canonicalTerm = canonical && canonical !== search ? `%${canonical}%` : null;

  return or(
    ilike(patients.fullName, term),
    ilike(patients.phone, term),
    ilike(patients.passport, term),
    ...(canonicalTerm ? [ilike(patients.phone, canonicalTerm)] : []),
  );
};
