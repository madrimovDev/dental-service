/**
 * Telefon raqamining yagona kanonik shakli: `+` + faqat raqamlar.
 *
 * `users.phone` — login identifikatori va platform bo'yicha unique (CLAUDE.md
 * §3.1). Normalizatsiyasiz `998901234567` va `+998901234567` ikki alohida hisob
 * bo'lib qoladi va login `eq(users.phone, input)` bilan mos kelmaydi.
 *
 * 9 xonali kiritma — O'zbekiston mahalliy formati (`901234567`), `998` prefiksi
 * qo'shiladi. Boshqa uzunliklar davlat kodi bilan kiritilgan deb hisoblanadi va
 * o'zgartirilmaydi.
 *
 * Bu faylning QO'LDA LOCKSTEP saqlanadigan dublikati:
 * `apps/supervisor-api/src/lib/phone.ts` (`license-signature.ts` ↔ `rsa.ts`
 * pretsedenti). Qoida o'zgarsa, ikkala fayl AYNAN birga o'zgarishi shart — aks
 * holda vendor yaratgan hisob klinikada login paytida topilmay qoladi.
 */
export const normalizePhone = (input: string): string => {
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';
  const withCountry = digits.length === 9 ? `998${digits}` : digits;
  return `+${withCountry}`;
};
