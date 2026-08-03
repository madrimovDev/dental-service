// Duplicate of packages/core/src/phone.ts — apps/supervisor-api is a separate
// deploy unit with no workspace dependency on @dental/core (license-signature.ts
// precedent). Keep in lockstep by hand: if the normalization rule changes, both
// files must change together or vendor-created accounts stop matching at login.

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
 */
export const normalizePhone = (input: string): string => {
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';
  const withCountry = digits.length === 9 ? `998${digits}` : digits;
  return `+${withCountry}`;
};
