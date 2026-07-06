import { randomBytes } from 'node:crypto';
import {
  branches,
  refreshTokens,
  roles,
  staffProfiles,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
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
  UpsertProfileInput,
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

      let [user] = await tx.select().from(users).where(eq(users.phone, input.phone));
      let tempPassword: string | null = null;

      if (!user) {
        // Yangi user — temporary password (12 bytes → 16 base64url chars, login validatori min(12) ni qondiradi)
        tempPassword = randomBytes(12).toString('base64url');
        const passwordHash = await hashPassword(tempPassword);

        const [created] = await tx
          .insert(users)
          .values({
            phone: input.phone,
            passwordHash,
            fullName: input.fullName,
          })
          .returning();

        if (!created) return { ok: false as const, code: 'user.create_failed' };
        user = created;

        // Mock OTP — console'ga password log qilinadi (M3 da SMS)
        logger.warn(
          { userId: user.id, phone: user.phone, tempPassword },
          `🔐 Mock invite — production'da SMS orqali parol yuboriladi`,
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
        // CLI-427: haqiqatan aktiv → alreadyExists (o'zgarishsiz). Aks holda (deaktivlangan)
        // → QAYTA FAOLLASHTIRISH: isActive=true + validTo=null (o'tgan validTo login'ni
        // bloklamasin) → xodim yana kira oladi (switchWorkspace o'tadi).
        if (existing.isActive) {
          return {
            ok: true as const,
            userId: user.id,
            assignmentId: existing.id,
            tempPassword,
            alreadyExists: true,
            reactivated: false,
          };
        }

        const now = new Date();
        await tx
          .update(userAssignments)
          .set({ isActive: true, validTo: null, updatedAt: now })
          .where(eq(userAssignments.id, existing.id));

        await deps.audit.record(c, {
          action: 'user.reactivated',
          resourceType: 'user_assignment',
          resourceId: existing.id,
          before: existing,
          after: { ...existing, isActive: true, validTo: null },
        });

        return {
          ok: true as const,
          userId: user.id,
          assignmentId: existing.id,
          tempPassword,
          alreadyExists: false,
          reactivated: true,
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
        reactivated: false,
      };
    });
  }

  async function addAssignment(c: Context, userId: string, input: CreateAssignmentInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const [user] = await deps.db.select().from(users).where(eq(users.id, userId));
    if (!user) return null;

    // CLI-429: roleId/branchId joriy tenant'da mavjudligini `getDb(c)` (RLS-bound) orqali
    // tekshirish — cross-tenant/ghost assignment oldini olish (invite bilan bir xil pattern).
    const [role] = await db.select().from(roles).where(eq(roles.id, input.roleId));
    if (!role) return { ok: false as const, code: 'role.not_found' as const };

    if (input.branchId) {
      const [branch] = await db.select().from(branches).where(eq(branches.id, input.branchId));
      if (!branch) return { ok: false as const, code: 'branch.not_found' as const };
    }

    // Dublikat-guard (invite bilan bir xil) — bir xil (user, tenant, role, branch) juftligi
    // qayta qo'shilmaydi; mavjudni idempotent qaytaramiz.
    const [existing] = await db
      .select()
      .from(userAssignments)
      .where(
        and(
          eq(userAssignments.userId, userId),
          eq(userAssignments.tenantId, tenantId),
          eq(userAssignments.roleId, input.roleId),
          input.branchId
            ? eq(userAssignments.branchId, input.branchId)
            : sql`${userAssignments.branchId} IS NULL`,
        ),
      );
    if (existing) {
      return { ok: true as const, assignment: existing, alreadyExists: true };
    }

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

    if (!assignment) return { ok: false as const, code: 'assignment.create_failed' as const };

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'user_assignment',
      resourceId: assignment.id,
      after: assignment,
    });

    return { ok: true as const, assignment, alreadyExists: false };
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

  /**
   * Admin tomonidan xodim parolini qayta tiklash.
   *  - User joriy tenantda assignment yoki owner bo'lishi kerak (cross-tenant zarbasiz)
   *  - Yangi 16-belgili vaqtinchalik parol generate qilinadi (login validator min 12)
   *  - Foydalanuvchining hamma refresh tokenlari revoke qilinadi (logout boshqa qurilmalardan)
   *  - Audit yoziladi
   *  - Yangi parol qaytariladi (UI'da admin'ga ko'rsatiladi, u xodimga beradi)
   */
  async function resetUserPassword(c: Context, targetUserId: string) {
    const dbContext = getDb(c);
    const tenantId = c.get('activeTenantId');
    const actor = c.get('user');
    if (!tenantId || !actor) throw new Error('No tenant context');

    // Target user shu tenantda ekanligini tekshirish (assignment yoki owner)
    return await dbContext.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      // Owner check (cross-tenant)
      const [tenant] = await tx
        .select({ ownerUserId: tenants.ownerUserId })
        .from(tenants)
        .where(eq(tenants.id, tenantId));
      const isOwner = tenant?.ownerUserId === targetUserId;

      let hasAssignment = false;
      if (!isOwner) {
        const [a] = await tx
          .select()
          .from(userAssignments)
          .where(
            and(
              eq(userAssignments.userId, targetUserId),
              eq(userAssignments.tenantId, tenantId),
              eq(userAssignments.isActive, true),
            ),
          );
        hasAssignment = !!a;
      }

      if (!isOwner && !hasAssignment) {
        return { ok: false as const, code: 'user.not_in_tenant' };
      }

      // Tenant owner parolini faqat o'zi yoki tenant owner reset qila oladi
      // (boshqa adminlar tenant owner'ning parolini o'zgartira olmaydi — xavfsizlik)
      if (isOwner && actor.id !== tenant?.ownerUserId) {
        return { ok: false as const, code: 'user.cannot_reset_owner' };
      }

      const [target] = await tx.select().from(users).where(eq(users.id, targetUserId));
      if (!target) return { ok: false as const, code: 'user.not_found' };

      const newPassword = randomBytes(12).toString('base64url'); // 16 belgi
      const newHash = await hashPassword(newPassword);
      const now = new Date();

      await tx
        .update(users)
        .set({ passwordHash: newHash, updatedAt: now })
        .where(eq(users.id, targetUserId));

      // Barcha refresh tokenlarni revoke (boshqa qurilmalardan logout)
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, targetUserId), isNull(refreshTokens.revokedAt)));

      await deps.audit.record(c, {
        action: 'password_reset_by_admin',
        resourceType: 'user',
        resourceId: targetUserId,
        after: { phone: target.phone, by: actor.id },
      });

      logger.warn(
        { adminId: actor.id, userId: targetUserId, phone: target.phone, newPassword },
        `🔐 Admin reset password — production'da SMS orqali yuboriladi`,
      );

      return {
        ok: true as const,
        userId: targetUserId,
        phone: target.phone,
        tempPassword: newPassword,
      };
    });
  }

  /**
   * Xodim employment profilini olish (tenant+user). Hali yaratilmagan bo'lsa — `null`
   * (bu normal holat; frontend bo'sh formani ko'rsatadi). RLS tenant'ni filtrlaydi.
   */
  async function getProfile(c: Context, userId: string) {
    const db = getDb(c);
    const [profile] = await db.select().from(staffProfiles).where(eq(staffProfiles.userId, userId));
    return profile ?? null;
  }

  /**
   * Xodim profilini upsert qiladi (PUT — to'liq almashtirish).
   * `(tenant_id, user_id)` unique konfliktida UPDATE; aks holda INSERT.
   * Ixtiyoriy maydonlar berilmasa null/default'ga tushadi (merge emas).
   *
   * CLI-441 #4: RLS faqat joriy tenant_id'ni tekshiradi — `userId` aynan shu tenantga
   * a'zo ekanligini tasdiqlamaydi. Insertdan oldin tenant-membership tekshiriladi:
   * OWNER (assignmentsiz bo'lishi mumkin, CLAUDE.md §3.3 — kodda hardcoded check) YOKI
   * aktiv (muddati o'tmagan) `user_assignments` qatori (`resetUserPassword` pattern bilan
   * bir xil — owner carve-out shart, aks holda owner o'z profilini yarata olmaydi).
   */
  async function upsertProfile(c: Context, userId: string, input: UpsertProfileInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const [tenant] = await db
      .select({ ownerUserId: tenants.ownerUserId })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    const isOwner = tenant?.ownerUserId === userId;

    if (!isOwner) {
      const now0 = new Date();
      const [assignment] = await db
        .select()
        .from(userAssignments)
        .where(
          and(
            eq(userAssignments.userId, userId),
            eq(userAssignments.tenantId, tenantId),
            eq(userAssignments.isActive, true),
            sql`(${userAssignments.validTo} IS NULL OR ${userAssignments.validTo} > ${now0})`,
          ),
        );
      if (!assignment) return { ok: false as const, code: 'user.not_member' as const };
    }

    const before = await getProfile(c, userId);
    const now = new Date();

    const values = {
      tenantId,
      userId,
      specialty: input.specialty ?? null,
      employmentStatus: input.employmentStatus ?? ('active' as const),
      startedAt: input.startedAt ?? null,
      baseSalary: String(input.baseSalary),
      commissionPercent: String(input.commissionPercent),
    };

    const [profile] = await db
      .insert(staffProfiles)
      .values(values)
      .onConflictDoUpdate({
        target: [staffProfiles.tenantId, staffProfiles.userId],
        set: {
          specialty: values.specialty,
          employmentStatus: values.employmentStatus,
          startedAt: values.startedAt,
          baseSalary: values.baseSalary,
          commissionPercent: values.commissionPercent,
          updatedAt: now,
        },
      })
      .returning();

    if (!profile) return { ok: false as const, code: 'profile.upsert_failed' as const };

    await deps.audit.record(c, {
      action: before ? 'updated' : 'created',
      resourceType: 'staff_profile',
      resourceId: profile.id,
      before: before ?? undefined,
      after: profile,
    });

    return { ok: true as const, profile };
  }

  return {
    listAssignments,
    invite,
    addAssignment,
    updateAssignment,
    removeAssignment,
    resetUserPassword,
    getProfile,
    upsertProfile,
  };
};

export type UsersService = ReturnType<typeof createUsersService>;
