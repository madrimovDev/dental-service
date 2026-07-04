import { fail } from '@dental/core';
import type { MiddlewareHandler } from 'hono';
import { getActiveModules } from './license.ts';

/**
 * `/activate` va `/api/activate` — license faol bo'lmasa ham ochiq (public).
 * Electron (Task 9) startup'da `.lic` topilmasa brauzer shu sahifaga ochiladi;
 * bu route'lar orqali foydalanuvchi license key kiritib aktivatsiya qiladi.
 */
const WHITELIST = ['/activate', '/api/activate'];

/**
 * Hono middleware — berilgan modul joriy litsenziyada yoqilganmi tekshiradi.
 *
 * - `.lic` yo'q yoki muddati (grace period bilan) o'tgan bo'lsa → 403 `LICENSE_NOT_FOUND`
 * - `.lic` bor, lekin `module` ro'yxatda yo'q → 403 `MODULE_DISABLED`
 * - `modules` ichida `'*'` bo'lsa (enterprise tarif) — barcha modul ruxsat etiladi
 */
export const requireModule = (module: string): MiddlewareHandler => {
  return async (c, next) => {
    if (WHITELIST.some((path) => c.req.path.startsWith(path))) {
      await next();
      return;
    }

    const modules = await getActiveModules();
    if (!modules.length) {
      return c.json(fail('LICENSE_NOT_FOUND', 'License not activated'), 403);
    }
    if (!modules.includes('*') && !modules.includes(module)) {
      return c.json(fail('MODULE_DISABLED', `Module '${module}' is not enabled in your plan`), 403);
    }

    await next();
  };
};

/**
 * Tarif → modul ro'yxati xaritasi. `packages/core/vertical-features.ts`dagi
 * dental/general vertical feature-gating'dan alohida qatlam — bu yerda
 * *tarif* (starter/standard/premium/enterprise) bo'yicha modul cheklovi.
 */
export const MODULE_MAP: Record<string, string[]> = {
  starter: ['patients', 'appointments', 'queue'],
  standard: ['patients', 'appointments', 'queue', 'cashier', 'reports', 'staff'],
  premium: [
    'patients',
    'appointments',
    'queue',
    'cashier',
    'reports',
    'staff',
    'clinical',
    'lab-orders',
    'patient-images',
    'prescriptions',
    'consent',
  ],
  enterprise: ['*'],
};

/**
 * `requireModule` litsenziya tushunchasi (`.lic`, machine-fingerprint) FAQAT
 * Local Desktop (bitta-EXE, CLI-338/348) mahsulotiga tegishli — cloud/dev/CI
 * muhitida (multi-tenant SaaS) hech qachon `.lic` fayl yozilmaydi, shuning
 * uchun `requireModule`ni shartsiz ulash butun mavjud test suite'ni va
 * cloud deploy'ni buzadi (har doim LICENSE_NOT_FOUND).
 *
 * Bu wrapper `requireModule`ni `process.env.WEB_DIST_DIR` (Local Desktop
 * signali — `app.ts` CSP branch bilan bir xil, `process-manager.ts`
 * `spawnApi()` shu env'ni beradi) bilan shartlaydi: WEB_DIST_DIR yo'q bo'lsa
 * gating butunlay chetlab o'tiladi (no-op), bor bo'lsa `requireModule` bilan
 * bir xil ishlaydi.
 *
 * `process.env.WEB_DIST_DIR` har so'rovda qayta o'qiladi (frozen `env.ts`
 * singleton emas) — xuddi `getLicensePath()`dagi kabi (license.ts izohi:
 * top-level const bo'lsa import-vaqtida "muzlab qolar edi").
 */
export const requireModuleInDesktop = (module: string): MiddlewareHandler => {
  const gate = requireModule(module);
  return async (c, next) => {
    if (!process.env.WEB_DIST_DIR) {
      await next();
      return;
    }
    return gate(c, next);
  };
};
