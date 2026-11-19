import { roles, tenants, userAssignments, users } from '@dental/db-schema';
import { and, eq, isNotNull, isNull, or, type SQL } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../db/scoped.ts';

/**
 * FX-34 (LA-08, D-8) — doktor↔filial moslik: BITTA ta'rif.
 *
 * Doktor shu filialda ishlaydi, agar `user_assignments` da: faol (`is_active`), qabul qilingan
 * (`accepted_at IS NOT NULL`), filiali NULL (tenant-wide) YOKI shu filial, va roli
 * `roles.is_practitioner` bo'lgan tayinlov bor. Query'dan foydalanuvchi `userAssignments` +
 * `roles` ni JOIN qilgan bo'lishi shart. RLS tenant'ni filtrlaydi.
 *
 * `branchId` berilmasa — filial cheklovi yo'q (tenant bo'yicha barcha shifokorlar).
 */
export function practitionerAssignmentConditions(branchId?: string | null): SQL[] {
  const conds: SQL[] = [
    eq(userAssignments.isActive, true),
    isNotNull(userAssignments.acceptedAt),
    eq(roles.isPractitioner, true),
  ];
  if (branchId) {
    conds.push(or(isNull(userAssignments.branchId), eq(userAssignments.branchId, branchId)) as SQL);
  }
  return conds;
}

/** Filialdagi (yoki branchId berilmasa — tenant'dagi) shifokorlar, ism bo'yicha tartiblangan. */
export async function listPractitioners(
  c: Context,
  branchId?: string | null,
): Promise<{ id: string; fullName: string | null; phone: string }[]> {
  const db = getDb(c);
  return db
    .selectDistinct({ id: users.id, fullName: users.fullName, phone: users.phone })
    .from(userAssignments)
    .innerJoin(users, eq(users.id, userAssignments.userId))
    .innerJoin(roles, eq(roles.id, userAssignments.roleId))
    .where(and(...practitionerAssignmentConditions(branchId)))
    .orderBy(users.fullName);
}

/**
 * Doktor shu filialda ishlaydimi. Tenant OWNER — implicit superuser (CLAUDE.md §3.3),
 * `user_assignments` qatoriga ega bo'lishi shart emas → istisno (`ownership.ts` bilan bir xil).
 */
export async function isDoctorInBranch(
  c: Context,
  doctorId: string,
  branchId: string,
): Promise<boolean> {
  const db = getDb(c);
  const activeTenantId: string | null | undefined = c.get('activeTenantId');
  if (activeTenantId) {
    const [tenant] = await db
      .select({ ownerUserId: tenants.ownerUserId })
      .from(tenants)
      .where(eq(tenants.id, activeTenantId));
    if (tenant?.ownerUserId === doctorId) return true;
  }
  const [row] = await db
    .select({ id: userAssignments.id })
    .from(userAssignments)
    .innerJoin(roles, eq(roles.id, userAssignments.roleId))
    .where(and(eq(userAssignments.userId, doctorId), ...practitionerAssignmentConditions(branchId)))
    .limit(1);
  return !!row;
}
