/**
 * Litsenziya holati signali (CLI-348 qaror 1: "Litsenziya yo'q → brauzer
 * `http://localhost/activate`ga ochiladi").
 *
 * Electron asosiy jarayoni `apps/api/src/lib/license.ts`ni bevosita import
 * qila olmaydi — alohida paket, prod'da `api.exe` sifatida mustaqil
 * kompilyatsiya qilinadi (`bun build --compile`). Shu sabab bu yerda faqat
 * `.lic` fayl mavjudligi tekshiriladi (existence-only) — muddat/grace-period
 * (`isLicenseValid()`) va imzo tekshiruvi API tomonida amalga oshadi
 * (`requireModule` middleware, module-gating). Bu — server-startup vaqtida
 * "asosiy UI yoki /activate" qarorini qabul qilish uchun yetarli darajada
 * qo'pol (coarse) lekin foydali signal: litsenziya umuman faollashtirilmagan
 * bo'lsa fayl yo'q, foydalanuvchi darhol /activate sahifasiga yo'naltiriladi.
 *
 * Yo'l konvensiyasi `apps/api/src/lib/license.ts`dagi `LICENSE_PATH` bilan bir
 * xil (`LICENSE_PATH` env override, aks holda platform default) — ikkala
 * process ham bitta fayl haqida gapiradi.
 */
import { existsSync } from 'node:fs';

const getLicensePath = (): string =>
  process.env.LICENSE_PATH ??
  (process.platform === 'win32'
    ? 'C:\\ProgramData\\DentalService\\license.lic'
    : '/var/lib/dental-service/license.lic');

export const hasLicense = (): boolean => existsSync(getLicensePath());
