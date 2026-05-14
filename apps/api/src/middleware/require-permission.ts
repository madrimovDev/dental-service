import { fail, OWNER_ONLY_PERMISSIONS, type Permission } from '@dental/core';
import type { MiddlewareHandler } from 'hono';

/**
 * Permission check middleware — kompiletime-typed `Permission` code talab qiladi.
 *
 * Tartibi:
 *   1. `accessClaims` (auth middleware'dan) tekshiriladi
 *   2. Joriy permissions ro'yxatida code bormi?
 *   3. Yo'q bo'lsa 403
 *
 * ⚠️ Tenant Owner implicit superuser — M1.2 da Redis-cached owner check qo'shiladi
 * (`tenant:{id}:owner == user.id` → barcha permissions allow).
 * Hozirgi versiya: faqat perms array tekshiradi. Owner check Auth module'da
 * register-tenant + switch-workspace paytida perms[] ga "owner sentinel" qo'shadi.
 *
 * Owner-only permissions (`tenant.delete`, `tenant.transfer_ownership`) — bu kodlar
 * permission middleware orqali tekshirilmaydi, route handler ichida explicit check.
 */
export const requirePermission =
  <P extends Permission>(code: P): MiddlewareHandler =>
  async (c, next) => {
    const claims = c.get('accessClaims');
    if (!claims) {
      return c.json(fail('auth.required', 'Authentication required'), 401);
    }

    // Owner-only permissions — middleware'da tekshirilmaydi
    if ((OWNER_ONLY_PERMISSIONS as readonly string[]).includes(code)) {
      return c.json(
        fail(
          'permission.owner_only',
          'This permission is owner-only; check in route handler, not middleware',
        ),
        403,
      );
    }

    if (!claims.perms.includes(code)) {
      return c.json(fail('permission.denied', `Permission required: ${code}`), 403);
    }

    await next();
  };
