import { fail, ok } from '@dental/core';
import { auditLog, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client.ts';
import { env } from '../lib/env.ts';
import { verifyReset as defaultVerifyReset } from '../lib/license-client.ts';
import { hashPassword } from '../lib/password.ts';
import { rateLimit } from '../lib/rate-limit.ts';
import { password as passwordPolicySchema } from '../modules/auth/auth.schema.ts';

/**
 * `POST /api/reset-owner-password` — Local Desktop klinika egasi parolini
 * vendor-vositachiligida tiklash (CLI-226). Auth YO'Q — owner parolini
 * unutgan, hali login qila olmaydi; `license-middleware.ts`ning WHITELIST'i
 * ham shu yo'lni istisno qiladi (activate.ts precedenti).
 *
 * Oqim: vendor (Supervisor admin) bir martalik token beradi → mijoz shu
 * token + yangi parolni bu yerga yuboradi → Supervisor `/v1/verify-reset`
 * orqali online tekshiriladi (atomik consume) → FAQAT
 * `tenants.owner_user_id` foydalanuvchisining `password_hash`i o'zgaradi.
 * Litsenziya (`.lic`), tenant qatori, boshqa foydalanuvchilar TEGILMAYDI.
 *
 * `verifyReset` injectable (test uchun — haqiqiy Supervisor'ga tarmoq
 * so'rovisiz fake in'ektsiya qilinadi).
 */
export const resetOwnerPasswordRoutes = (
  deps: { verifyReset?: (resetToken: string) => Promise<{ ok: boolean }> } = {},
) => {
  const verifyReset = deps.verifyReset ?? defaultVerifyReset;
  const app = new Hono();

  // Rate limiting — activate.ts bilan bir xil uslub/limitlar (CLI-370
  // precedenti): resetToken o'zi taxmin qilinayotgan sir, kalitga
  // kiritilmaydi (aks holda har urinishda boshqa token sinalsa yangi bucket
  // ochilib limit chetlab o'tiladi).
  const resetRateLimit = rateLimit({
    name: 'reset-owner-password',
    limit: env.ACTIVATE_RATE_LIMIT,
    windowSeconds: env.ACTIVATE_RATE_LIMIT_WINDOW_SEC,
  });

  app.post('/', resetRateLimit, async (c) => {
    const json = await c.req.json().catch(() => null);
    const resetToken = (json as { resetToken?: string } | null)?.resetToken;
    const newPassword = (json as { newPassword?: string } | null)?.newPassword;
    // Platforma parol siyosati bilan bir xil (auth.schema.ts `password` —
    // registratsiya/login'da qo'llanadigan min-12/max-128) — reset orqali
    // registratsiyadan zaifroq parol o'rnatib bo'lmaydi.
    if (!resetToken || !newPassword || !passwordPolicySchema.safeParse(newPassword).success) {
      return c.json(
        fail('INVALID_REQUEST', 'resetToken va newPassword (12-128 belgi) majburiy'),
        400,
      );
    }

    const v = await verifyReset(resetToken);
    if (!v.ok) {
      return c.json(fail('reset.invalid_token', "Token yaroqsiz yoki muddati o'tgan"), 400);
    }

    // Desktop = bitta tenant (single-tenant EXE, CLI-338/348). Deterministik
    // orderBy (CLI-477 #2) — bu route public + shartsiz mount qilingan; bir
    // nechta tenant holatida tartibsiz `findFirst` DB-tartibiga bog'liq bo'lardi
    // (latent footgun). Eng eski (createdAt asc) tenant har doim bir xil
    // tanlanadi — single-tenant desktop'da yagona tenant, cloud'da esa bu yo'l
    // `readLicense()→null` tufayli hech qachon shu yergacha yetmaydi.
    const tenant = await db.query.tenants.findFirst({
      orderBy: (t, { asc }) => asc(t.createdAt),
    });
    if (!tenant) {
      return c.json(fail('reset.no_tenant', 'Tenant topilmadi'), 400);
    }

    const passwordHash = await hashPassword(newPassword);
    const now = new Date();

    await db.transaction(async (tx) => {
      // `audit_log` RLS WITH CHECK — tenant_id NULL YOKI joriy tenant bilan
      // teng bo'lishi kerak (auth.service.ts registerTenant precedenti,
      // pre-auth kontekstda `set_config` orqali). Bu yagona mutatsiya, shuning
      // uchun tranzaksiya ichida bitta joyda o'rnatiladi.
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`);
      await tx
        .update(users)
        .set({ passwordHash, updatedAt: now })
        .where(eq(users.id, tenant.ownerUserId));
      await tx.insert(auditLog).values({
        tenantId: tenant.id,
        userId: null, // pre-auth, vendor-vositachiligida — harakat qiluvchi user yo'q
        action: 'owner_password_reset',
        resourceType: 'user',
        resourceId: tenant.ownerUserId,
        before: null,
        after: null,
        ip: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? null,
        userAgent: c.req.header('user-agent') ?? null,
      });
    });

    return c.json(ok({ success: true as const }), 200);
  });

  return app;
};
