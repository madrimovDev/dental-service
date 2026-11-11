import { fail } from '@dental/core';
import { userAssignments } from '@dental/db-schema';
import { and, eq, gt, isNotNull, isNull, or } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { getDb } from '../db/scoped.ts';

declare module 'hono' {
  interface ContextVariableMap {
    /** IR-06: chaqiruvchining hisobot filial doirasi. `null`/yo'q = cheklovsiz (butun klinika). */
    reportBranchIds?: string[] | null;
  }
}

export type BranchScope =
  | { kind: 'all' }
  | { kind: 'branches'; branchIds: string[] }
  | { kind: 'none' };

/**
 * Sof qaror: faol va qabul qilingan tayinlovlardan filial doirasi.
 * Bitta tenant-wide (`branchId = null`) tayinlov → butun klinika; aks holda tayinlangan
 * filiallar; tayinlov yo'q → hech narsa (fail-closed).
 */
export const decideBranchScope = (assignmentBranchIds: (string | null)[]): BranchScope => {
  if (assignmentBranchIds.length === 0) return { kind: 'none' };
  if (assignmentBranchIds.some((b) => b === null)) return { kind: 'all' };
  return { kind: 'branches', branchIds: [...new Set(assignmentBranchIds as string[])] };
};

/**
 * Hisobot filial doirasini SERVER tomonida majburlaydi (IR-06).
 * - Owner (`@owner`) va tenant-wide tayinlov → cheklovsiz (so'ralgan `branchId` o'z holicha).
 * - Filialga tayinlangan xodim → faqat shu filiallar; boshqa filial so'ralsa 403;
 *   `branchId` berilmasa — barcha tayinlangan filiallar yig'indisi.
 * - `tenantWide: true` (filialga bo'linmaydigan hisobotlar: qarz, davolash rejalari,
 *   dental analitika) — filialga tayinlangan xodimga 403.
 * `rlsMiddleware`dan KEYIN o'rnatiladi (tx-bound db kerak).
 */
export const reportBranchScope =
  (opts: { tenantWide?: boolean } = {}): MiddlewareHandler =>
  async (c, next) => {
    const claims = c.get('accessClaims');
    if (!claims?.atid) return c.json(fail('auth.required', 'Authentication required'), 401);

    let scope: BranchScope = { kind: 'all' };
    if (!claims.perms.includes('@owner')) {
      const now = new Date();
      const rows = await getDb(c)
        .select({ branchId: userAssignments.branchId })
        .from(userAssignments)
        .where(
          and(
            eq(userAssignments.userId, claims.sub),
            eq(userAssignments.tenantId, claims.atid),
            eq(userAssignments.isActive, true),
            isNotNull(userAssignments.acceptedAt),
            or(isNull(userAssignments.validTo), gt(userAssignments.validTo, now)),
          ),
        );
      scope = decideBranchScope(rows.map((r) => r.branchId));
    }

    if (scope.kind === 'none') {
      return c.json(fail('report.no_branch_access', 'Hech bir filialga tayinlanmagansiz'), 403);
    }

    if (scope.kind === 'all') {
      c.set('reportBranchIds', null);
      return next();
    }

    if (opts.tenantWide) {
      return c.json(
        fail(
          'report.tenant_scope_required',
          'Bu hisobot butun klinika uchun — filial doirasida mavjud emas',
        ),
        403,
      );
    }
    const requested = c.req.query('branchId');
    if (requested && !scope.branchIds.includes(requested)) {
      return c.json(fail('report.branch_forbidden', "Bu filial hisobotiga ruxsat yo'q"), 403);
    }
    c.set('reportBranchIds', requested ? [requested] : scope.branchIds);
    return next();
  };
