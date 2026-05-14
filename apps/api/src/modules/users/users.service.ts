import { randomBytes } from 'node:crypto';
import { branches, roles, userAssignments, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Database } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { logger } from '../../lib/logger.ts';
import { hashPassword } from '../../lib/password.ts';
import type {
  CreateAssignmentInput,
  InviteUserInput,
  UpdateAssignmentInput,
} from './users.schema.ts';

export const createUsersService = (deps: { db: Database; audit: AuditLogger }) => {
  /** Joriy tenant'dagi xodimlar (active assignmentlar bilan) */
  async function listAssignments(c: Context) {
    const db = getDb(c);
    return db
      .select({
        assignmentId: userAssignments.id,
        userId: userAssignments.userId,
        userEmail: users.email,
        userPhone: users.phone,
        userFullName: users.fullName,
        branchId: userAssignments.branchId,
        branchName: branches.name,
        roleId: userAssignments.roleId,
        roleName: roles.name,
        validFrom: userAssignments.validFrom,
        validTo: userAssignments.validTo,
        isActive: userAssignments.isActive,
      })
      .from(userAssignments)
      .innerJoin(users, eq(users.id, userAssignments.userId))
      .leftJoin(branches, eq(branches.id, userAssignments.branchId))
      .innerJoin(roles, eq(roles.id, userAssignments.roleId))
      .orderBy(users.fullName);
  }

  /**
   * Yangi xodimni klinikaga taklif qilish.
   *  - Email/phone bo'yicha mavjud platform user bo'lsa — uni shu tenant'ga assignment qilamiz
   *  - Yangi user bo'lsa — temporary password bilan yaratamiz va console'ga log qilamiz (mock OTP)
   *  - Kelajakda M3 da Eskiz SMS / email bilan parol yuboriladi
   */
  async function invite(c: Context, input: InviteUserInput) {
    const dbContext = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    // RoleId joriy tenant'da mavjudligini tekshirish — RLS qiladi
    const [role] = await dbContext.select().from(roles).where(eq(roles.id, input.roleId));
    if (!role) return { ok: false as const, code: 'role.not_found' };

    if (input.branchId) {
      const [branch] = await dbContext
        .select()
        .from(branches)
        .where(eq(branches.id, input.branchId));
      if (!branch) return { ok: false as const, code: 'branch.not_found' };
    }

    // User mavjudmi? users — platform-level, RLS yo'q, lekin transaction'dagi tx ham ishlatadi
    return await dbContext.transaction(async (tx) => {
      // Tenant context'ni saqlash (transaction ichida)
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      let [user] = await tx.select().from(users).where(eq(users.email, input.email));
      let tempPassword: string | null = null;

      if (!user) {
        // Yangi user — temporary password (12 bytes → 16 base64url chars, login validatori min(12) ni qondiradi)
        tempPassword = randomBytes(12).toString('base64url');
        const passwordHash = await hashPassword(tempPassword);

        const [created] = await tx
          .insert(users)
          .values({
            email: input.email,
            phone: input.phone ?? null,
            passwordHash,
            fullName: input.fullName,
          })
          .returning();

        if (!created) return { ok: false as const, code: 'user.create_failed' };
        user = created;

        // Mock OTP — console'ga password log qilinadi (M3 da SMS/email)
        logger.warn(
          { userId: user.id, email: user.email, tempPassword },
          `🔐 Mock invite — production'da bemorga SMS/email orqali parol yuboriladi`,
        );
      }

      // Assignment yaratish (yoki agar mavjud bo'lsa — duplicate'ni oldini olish)
      const [existing] = await tx
        .select()
        .from(userAssignments)
        .where(
          and(
            eq(userAssignments.userId, user.id),
            eq(userAssignments.tenantId, tenantId),
            eq(userAssignments.roleId, input.roleId),
            input.branchId
              ? eq(userAssignments.branchId, input.branchId)
              : sql`${userAssignments.branchId} IS NULL`,
          ),
        );

      if (existing) {
        return {
          ok: true as const,
          userId: user.id,
          assignmentId: existing.id,
          tempPassword,
          alreadyExists: true,
        };
      }

      const [assignment] = await tx
        .insert(userAssignments)
        .values({
          userId: user.id,
          tenantId,
          branchId: input.branchId ?? null,
          roleId: input.roleId,
          isActive: true,
        })
        .returning();

      if (!assignment) return { ok: false as const, code: 'assignment.create_failed' };

      await deps.audit.record(c, {
        action: 'user.invited',
        resourceType: 'user_assignment',
        resourceId: assignment.id,
        after: { userId: user.id, roleId: input.roleId, branchId: input.branchId ?? null },
      });

      return {
        ok: true as const,
        userId: user.id,
        assignmentId: assignment.id,
        tempPassword,
        alreadyExists: false,
      };
    });
  }

  async function addAssignment(c: Context, userId: string, input: CreateAssignmentInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const [user] = await deps.db.select().from(users).where(eq(users.id, userId));
    if (!user) return null;

    const [assignment] = await db
      .insert(userAssignments)
      .values({
        userId,
        tenantId,
        branchId: input.branchId ?? null,
        roleId: input.roleId,
        validFrom: input.validFrom ? new Date(input.validFrom) : new Date(),
        validTo: input.validTo ? new Date(input.validTo) : null,
        isActive: true,
      })
      .returning();

    if (assignment) {
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'user_assignment',
        resourceId: assignment.id,
        after: assignment,
      });
    }

    return assignment;
  }

  async function updateAssignment(c: Context, assignmentId: string, input: UpdateAssignmentInput) {
    const db = getDb(c);
    const [before] = await db
      .select()
      .from(userAssignments)
      .where(eq(userAssignments.id, assignmentId));
    if (!before) return null;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.roleId !== undefined) patch.roleId = input.roleId;
    if (input.branchId !== undefined) patch.branchId = input.branchId;
    if (input.validTo !== undefined) patch.validTo = input.validTo ? new Date(input.validTo) : null;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    const [updated] = await db
      .update(userAssignments)
      .set(patch)
      .where(eq(userAssignments.id, assignmentId))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'user_assignment',
        resourceId: assignmentId,
        before,
        after: updated,
      });
    }
    return updated;
  }

  async function removeAssignment(c: Context, assignmentId: string) {
    const db = getDb(c);
    const [before] = await db
      .select()
      .from(userAssignments)
      .where(eq(userAssignments.id, assignmentId));
    if (!before) return null;

    await db.delete(userAssignments).where(eq(userAssignments.id, assignmentId));

    await deps.audit.record(c, {
      action: 'deleted',
      resourceType: 'user_assignment',
      resourceId: assignmentId,
      before,
    });
    return before;
  }

  return { listAssignments, invite, addAssignment, updateAssignment, removeAssignment };
};

export type UsersService = ReturnType<typeof createUsersService>;
