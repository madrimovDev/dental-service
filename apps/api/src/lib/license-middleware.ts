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
 *
 * CLI-433 — bu konstanta runtime gate yo'lida ISHLATILMAYDI (gate haqiqiy
 * yo'li: `getActiveModules()` → `lic.modules` — Supervisor-bergan `.lic`dan —
 * → `modules.includes(module)`; modul nomi `requireModuleInDesktop('...')`
 * string-literalidan keladi). Bu — REFERENS/TEST-uchun lug'at, Supervisor
 * `apps/supervisor-api/src/modules/clinics/clinics.routes.ts` MODULE_MAP bilan
 * QO'LDA LOCKSTEP saqlanadi (`license-signature.ts` pretsedenti — ikki alohida
 * deploy birligi, workspace-edge yo'q). Divergensiya `license-middleware.test.ts`
 * dagi guard-test tomonidan ushlanadi (ikkalasi ham shu lug'atga solishtiriladi).
 *
 * ⚠️ `schedule`/`recalls` — kelishilgan jadval (docs/audit-fixes/CLI-433 §2c)
 * ularni enterprise-only qiladi, lekin haqiqiy `requireModuleInDesktop` gate
 * `app.ts`da FAQAT bu ro'yxatga QO'SHILMAGAN: web `/schedule` va `/recalls`
 * sahifalari joriy holatda tarifdan qat'i nazar faqat permission
 * (`schedule.view`/`recalls...`) bilan cheklangan (starter/standard/premium
 * tenant ham ulardan foydalanadi) — enterprise-only gate qo'shish shu
 * tenantlarni buzadi. Shuning uchun bu ikkisi lug'atda (hujjat/til birligi
 * uchun) bor, lekin `app.ts`da GATE QILINMAGAN (qasddan og'ish, spec §3 edge
 * case fallback: "shubha bo'lsa schedule'ni gate'siz qoldirish").
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
  enterprise: [
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
    'expenses',
    'stock',
    'payroll',
    'notifications',
    'schedule',
    'recalls',
  ],
};

/**
 * `requireModule` litsenziya tushunchasi (`.lic`, machine-fingerprint) FAQAT
 * Local Desktop (bitta-EXE, CLI-338/348) mahsulotiga tegishli — cloud/dev/CI
 * muhitida (multi-tenant SaaS) hech qachon `.lic` fayl yozilmaydi, shuning
 * uchun `requireModule`ni shartsiz ulash butun mavjud test suite'ni va
 * cloud deploy'ni buzadi (har doim LICENSE_NOT_FOUND).
 *
 * CLI-433 — signal ATAYIN `DENTAL_LOCAL_DESKTOP === 'true'` (avval
 * `WEB_DIST_DIR` mavjudligi edi — bu litsenziyaga aloqasi bo'lmagan
 * static-serve sozlamasi, `app.ts`da `serveStatic` uchun; agar u boshqa
 * sabab bilan o'rnatilmasa — masalan alohida deploy topologiyasi — gating
 * butunlay o'chib qolardi). `process-manager.ts` `spawnApi()` bu yangi env'ni
 * beradi (Windows-only — jismoniy PC'da qo'lda tasdiqlanadi).
 *
 * `process.env.DENTAL_LOCAL_DESKTOP` har so'rovda qayta o'qiladi (frozen
 * `env.ts` singleton emas) — xuddi `getLicensePath()`dagi kabi (license.ts
 * izohi: top-level const bo'lsa import-vaqtida "muzlab qolar edi").
 */
export const requireModuleInDesktop = (module: string): MiddlewareHandler => {
  const gate = requireModule(module);
  return async (c, next) => {
    if (process.env.DENTAL_LOCAL_DESKTOP !== 'true') {
      await next();
      return;
    }
    return gate(c, next);
  };
};
