import { ApiError } from '@dental/api-client';

/**
 * FX-127 (LC-05) — desktop `.lic` tarif modullari (web tomoni).
 *
 * API `requireModuleInDesktop('<modul>')` bilan gate qilingan bo'limlar shu yerda
 * sahifa yo'li → modul nomi sifatida takrorlanadi (nomlar `apps/api` MODULE_MAP
 * lug'ati bilan bir xil). Ro'yxatda yo'q yo'l (masalan `/schedule`, `/recalls`,
 * sozlamalar) tarif bilan cheklanmaydi — API'da ham gate'siz.
 *
 * `modules`: `null`/`undefined` = tarif cheklamaydi (bulut — modul gate'i yo'q,
 * yoki holat hali yuklanmagan); `'*'` = enterprise (hammasi).
 */
export type LicensedModules = readonly string[] | null | undefined;

/** Eng aniq naqsh birinchi. `[^/]+` route pattern'dagi `:id`ni ham, haqiqiy id'ni ham qamraydi. */
const MODULE_BY_PATH: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/patients\/[^/]+\/visits(\/|$)/, 'clinical'],
  [/^\/patients\/[^/]+\/lab-orders(\/|$)/, 'lab-orders'],
  [/^\/patients(\/|$)/, 'patients'],
  [/^\/appointments(\/|$)/, 'appointments'],
  [/^\/queue(\/|$)/, 'queue'],
  [/^\/cashier(\/|$)/, 'cashier'],
  [/^\/transactions(\/|$)/, 'cashier'],
  [/^\/plans(\/|$)/, 'clinical'],
  [/^\/lab(\/|$)/, 'lab-orders'],
  [/^\/lab-orders(\/|$)/, 'lab-orders'],
  [/^\/settings\/labs(\/|$)/, 'lab-orders'],
  [/^\/rx(\/|$)/, 'prescriptions'],
  [/^\/reports(\/|$)/, 'reports'],
  [/^\/settings\/users(\/|$)/, 'staff'],
  [/^\/stock(\/|$)/, 'stock'],
  [/^\/expenses(\/|$)/, 'expenses'],
  [/^\/payroll(\/|$)/, 'payroll'],
];

/** Sahifa yo'li (yoki route pattern) → API moduli; tarif bilan cheklanmasa `null`. */
export function moduleForPath(path: string): string | null {
  for (const [re, module] of MODULE_BY_PATH) {
    if (re.test(path)) return module;
  }
  return null;
}

/** Modul joriy tarifda bormi. Cheklov yo'q (`null`) yoki modulsiz yo'l → `true`. */
export function isModuleLicensed(module: string | null, modules: LicensedModules): boolean {
  if (!module || !modules) return true;
  return modules.includes('*') || modules.includes(module);
}

/** Server `403 MODULE_DISABLED` — tarifda yo'q (rol ruxsati emas). */
export function isModuleDisabledError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && err.code === 'MODULE_DISABLED';
}
