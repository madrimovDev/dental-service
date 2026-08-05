import crypto from 'node:crypto';

// Vaqtinchalik owner paroli. Operator uni og'zaki/qo'lda yetkazishi mumkin —
// chalkashadigan belgilar (0/O, 1/l/I) alifbodan chiqarilgan. 16 belgi
// (apps/api `password` siyosati min 12 talab qiladi).
//
// ⚠️ Bu funksiya ATAYIN `clinics.routes.ts` dan shu yerga ko'chirilgan:
// `licenses.service.ts` (prepareReinstall) ham, `clinics.routes.ts` (klinika
// yaratish) ham unga muhtoj, lekin `clinics.routes.ts` endi
// `createLicenseService()` ni import qiladi — routes ↔ service aylanma
// (circular) importi ESM'da TDZ xatosi beradi. Neytral `lib/` moduli uni
// uzadi.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export const generateTempPassword = (): string =>
  Array.from(crypto.randomBytes(16), (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join(
    '',
  );
