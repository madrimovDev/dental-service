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

/**
 * Litsenziya-gate'langan navigatsiya manzili (CLI-361 real Windows test'da
 * topildi). Tray callback'lari (`Ochish` / `Sozlamalar`) `hasLicense()`ni
 * BOSILGAN PAYTDA tekshirishi shart — startup'dagi bir martalik tekshiruv
 * (main.ts) yetarli emas edi: litsenziya faollashtirilmagan holda tray'dan
 * `Sozlamalar` bosilsa `/settings/integrations` ochilar, auth talab qilinib
 * SPA `/login`ga uloqtirar edi — foydalanuvchi `/activate`ga qaytolmay
 * qopqonda qolardi (ilovani qayta ishga tushirishdan boshqa yo'l yo'q).
 *
 * Chaqiruv-vaqtida hisoblanadi — aktivatsiyadan keyin (`.lic` yozilgach)
 * o'sha tray menyusi qayta qurilmasdan to'g'ri manzilga o'tadi.
 */
export const licenseGatedUrl = (baseUrl: string, path = ''): string =>
  hasLicense() ? `${baseUrl}${path}` : `${baseUrl}/activate`;

// API port'i ochilgan bo'lsa ham boot (seedPermissions/seedDiagnoses) tugamagan
// bo'lishi mumkin — javobsiz so'rov `app.whenReady()`ni butunlay bloklab, oynani
// UMUMAN ochmasdi (faqat tray qolardi). Gate hech qachon startup'ni ushlab
// qolmasligi shart: muddat tugasa `null` → mavjud `.lic` xulqi.
const BOOTSTRAP_TIMEOUT_MS = 2000;

/**
 * Lokal API'dan "ilova ishlashga tayyormi" signalini oladi (audit C1).
 *
 * `hasLicense()` faqat FAYL mavjudligini ko'radi — `.lic` bor, lekin lokal
 * bazada tenant yo'q holatni (baza yo'qolgan / yangi kompyuter) ajrata olmaydi.
 * Bunda asosiy UI ochilib, login 401 berardi va foydalanuvchi sababni
 * bilmasdi.
 *
 * Xato bo'lsa `null` — gate foydalanuvchini BLOKLAMAYDI, hozirgi
 * `.lic`-asosidagi xulq saqlanadi (API hali ko'tarilmagan bo'lishi mumkin).
 *
 * `fetchImpl` injectable — test uchun.
 */
export const fetchBootstrapStatus = async (
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ hasTenant: boolean } | null> => {
  try {
    const res = await fetchImpl(`${baseUrl}/api/bootstrap-status`, {
      signal: AbortSignal.timeout(BOOTSTRAP_TIMEOUT_MS),
    });
    const body = (await res.json()) as { data?: { hasTenant?: boolean } };
    if (typeof body?.data?.hasTenant !== 'boolean') return null;
    return { hasTenant: body.data.hasTenant };
  } catch {
    return null;
  }
};

/**
 * Startup manzili. `status === null` (so'rov muvaffaqiyatsiz) — hozirgi
 * `.lic`-asosidagi qaror saqlanadi.
 *
 * ⚠️ `hasTenant: true` holatida ham `licenseGatedUrl` orqali o'tiladi, tekis
 * `baseUrl` EMAS: bootstrap gate'i mavjud `.lic` gate'ini yutib yubormasligi
 * shart. `.lic` o'chgan (lekin tenant bor) mashinada asosiy UI ochilsa har bir
 * modul route'i `LICENSE_NOT_FOUND` 403 beradi va foydalanuvchi `/activate`ga
 * qaytolmay qopqonda qoladi (CLI-361 qopqonining aynan o'zi).
 */
export const resolveStartupUrl = (
  baseUrl: string,
  status: { hasTenant: boolean } | null,
): string => {
  if (status === null) return licenseGatedUrl(baseUrl);
  // `/activate` sahifasi holatni O'ZI aniqlab "vendorga murojaat" matnini
  // ko'rsatadi (web tomoni) — bu yerda ikkinchi manzil kerak emas.
  return status.hasTenant ? licenseGatedUrl(baseUrl) : `${baseUrl}/activate`;
};
