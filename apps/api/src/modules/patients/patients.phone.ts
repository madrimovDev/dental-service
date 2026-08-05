import { normalizePhone } from '@dental/core';

/**
 * Bemor telefonini yozishdan oldin kanonik shaklga keltiradi.
 *
 * `normalizePhone('')` — va umuman raqamsiz kiritma — BO'SH SATR qaytaradi
 * (`'+'` emas). Bazaga bo'sh satr yozilsa mavjud xulq buziladi: "telefon yo'q"
 * `NULL` bilan ifodalanadi (`patients.phone` nullable, mapper `?? null`).
 * Shuning uchun bo'sh natija `null`ga aylantiriladi.
 *
 * Qoida manbai — `packages/core/src/phone.ts` (yagona kanonik funksiya).
 * Lokal nusxa YOZILMAYDI (H1 darsi: divergent nusxa jimgina mos kelmaydigan
 * qiymat yozadi).
 */
export const normalizeOptionalPhone = (raw?: string | null): string | null => {
  if (!raw) return null;
  const normalized = normalizePhone(raw);
  return normalized === '' ? null : normalized;
};

/**
 * Qidiruv matnining kanonik telefon varianti — yoki `null`, agar qidiruvda
 * raqam bo'lmasa (sof ism qidiruvi).
 *
 * Foydalanuvchi telefonni istalgan formatda kiritadi (`901234567`,
 * `+998 90 123 45 67`), baza esa Task 8 dan keyin kanonik saqlaydi. Xom matn
 * shoxi (ism/passport uchun) O'CHIRILMAYDI — qisman raqam qidiruvi
 * (masalan `9012`) faqat o'sha shox orqali ishlaydi.
 */
export const canonicalPhoneSearch = (search: string): string | null => {
  if (!/\d/.test(search)) return null;
  const normalized = normalizePhone(search);
  return normalized === '' ? null : normalized;
};
