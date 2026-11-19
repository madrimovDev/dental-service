import { fail } from '@dental/core';
import { permissions, rolePermissions, userAssignments } from '@dental/db-schema';
import { and, eq, gt, isNotNull, isNull, or } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { getDb } from '../db/scoped.ts';

/**
 * X-2: filial doirasi helper'i (IR-06 naqshining operatsion umumlashtirilishi, D-8).
 * Chaqiruvchining ruxsat etilgan filiallari — owner (`@owner`) va tenant-wide
 * (`branchId = null`) tayinlov → hammasi; aks holda `permission`ni beradigan
 * rolli faol/qabul qilingan tayinlovlar filiallari; tayinlov yo'q → hech narsa (fail-closed).
 */
export type BranchScope =
  | { kind: 'all' }
  | { kind: 'branches'; branchIds: string[] }
  | { kind: 'none' };

/** Sof qaror: tayinlov filiallaridan doira. `null` = tenant-wide tayinlov. */
export const decideBranchScope = (assignmentBranchIds: (string | null)[]): BranchScope => {
  if (assignmentBranchIds.length === 0) return { kind: 'none' };
  if (assignmentBranchIds.some((b) => b === null)) return { kind: 'all' };
  return { kind: 'branches', branchIds: [...new Set(assignmentBranchIds as string[])] };
};

/**
 * Chaqiruvchining `permissionCode` bo'yicha filial doirasi. `rlsMiddleware`dan KEYIN
 * chaqiriladi (tx-bound db). Doiraga FAQAT shu permission'ni beradigan rolli
 * tayinlovlar kiradi — aks holda boshqa filialdagi boshqa rol doirani kengaytirib yuboradi.
 */
export const loadBranchScope = async (c: Context, permissionCode: string): Promise<BranchScope> => {
  const claims = c.get('accessClaims');
  if (!claims?.atid) return { kind: 'none' };
  if (claims.perms.includes('@owner')) return { kind: 'all' };

  const now = new Date();
  const rows = await getDb(c)
    .select({ branchId: userAssignments.branchId })
    .from(userAssignments)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userAssignments.roleId))
    .innerJoin(
      permissions,
      and(eq(permissions.id, rolePermissions.permissionId), eq(permissions.code, permissionCode)),
    )
    .where(
      and(
        eq(userAssignments.userId, claims.sub),
        eq(userAssignments.tenantId, claims.atid),
        eq(userAssignments.isActive, true),
        isNotNull(userAssignments.acceptedAt),
        or(isNull(userAssignments.validTo), gt(userAssignments.validTo, now)),
      ),
    );
  return decideBranchScope([...new Set(rows.map((r) => r.branchId))]);
};

export const scopeAllows = (scope: BranchScope, branchId: string): boolean =>
  scope.kind === 'all' || (scope.kind === 'branches' && scope.branchIds.includes(branchId));

export const BRANCH_FORBIDDEN_CODE = 'branch.forbidden';
export const BRANCH_FORBIDDEN_MESSAGE = "Bu filial doirasida ishlashga ruxsat yo'q";

/** Yagona filial `permissionCode` doirasida ruxsat etilganmi (owner/tenant-wide → har doim). */
export const isBranchAllowed = async (
  c: Context,
  permissionCode: string,
  branchId: string,
): Promise<boolean> => scopeAllows(await loadBranchScope(c, permissionCode), branchId);

/**
 * FX-133: route-darajasidagi filial doirasi middleware'i (`requirePermission`dan KEYIN,
 * `rlsMiddleware`dan keyin). `resolveBranchId` tekshiriladigan filialni qaytaradi
 * (query/body/resurs qatoridan); `null`/`undefined` — filial aniqlanmadi (resurs topilmadi
 * yoki filial filtri berilmagan): faqat doira `none` emasligi tekshiriladi, qolganini
 * handler hal qiladi (404 / doira bo'yicha filtr). Owner/tenant-wide → har doim o'tadi.
 */
export const requireBranchScope =
  (
    permissionCode: string,
    resolveBranchId: (c: Context) => Promise<string | null | undefined> | string | null | undefined,
  ): MiddlewareHandler =>
  async (c, next) => {
    const scope = await loadBranchScope(c, permissionCode);
    const branchId = await resolveBranchId(c);
    if (scope.kind === 'none' || (branchId && !scopeAllows(scope, branchId))) {
      return c.json(fail(BRANCH_FORBIDDEN_CODE, BRANCH_FORBIDDEN_MESSAGE), 403);
    }
    await next();
  };

/** Body'dagi `branchId` (JSON) — Hono body'ni keshlaydi, handler `valid('json')` baribir ishlaydi. */
export const branchIdFromJson = async (c: Context): Promise<string | undefined> => {
  const body = (await c.req.json().catch(() => null)) as { branchId?: unknown } | null;
  return typeof body?.branchId === 'string' ? body.branchId : undefined;
};
