import { randomBytes } from 'node:crypto';
import { normalizePhone } from '@dental/core';
import {
  branches,
  permissions as permissionsTable,
  refreshTokens,
  rolePermissions,
  roles,
  staffProfiles,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { and, eq, gt, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Database } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { logger } from '../../lib/logger.ts';
import { hashPassword } from '../../lib/password.ts';
import {
  assertCanGrant,
  loadRolePermissionCodes,
  RoleEscalationError,
} from '../../lib/role-escalation.ts';
import type {
  CreateAssignmentInput,
  InviteUserInput,
  UpdateAssignmentInput,
  UpsertProfileInput,
} from './users.schema.ts';

const callerPerms = (c: Context): string[] => c.get('accessClaims')?.perms ?? [];

export const createUsersService = (deps: { db: Database; audit: AuditLogger }) => {
  /** Joriy tenant'dagi xodimlar (active assignmentlar bilan) */
  async function listAssignments(c: Context) {
    const db = getDb(c);
    return (
      db
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
          // P6b: accepted_at NULL = taklif hali qabul qilinmagan (UI «Kutilmoqda»).
          pending: sql<boolean>`${userAssignments.acceptedAt} IS NULL`,
        })
        .from(userAssignments)
        .innerJoin(users, eq(users.id, userAssignments.userId))
        .leftJoin(branches, eq(branches.id, userAssignments.branchId))
        .innerJoin(roles, eq(roles.id, userAssignments.roleId))
        // CLI-442 #6: soft-deleted user xodim ro'yxatida ko'rinmasin (deleted_at latent edi).
        .where(isNull(users.deletedAt))
        .orderBy(users.fullName)
    );
  }

  /**
   * Chaqiruvchi tayinlay oladigan rollar. Qoida `assertCanGrant` bilan AYNAN bir xil
   * (rol permission'lari chaqiruvchida bo'lishi shart; owner — hammasi), shuning uchun
   * ro'yxatdagi har rol `invite`/`addAssignment` da 403 `role.escalation` bermaydi.
   */
  async function listGrantableRoles(c: Context) {
    const db = getDb(c);
    const roleRows = await db
      .select({ id: roles.id, name: roles.name, isSystem: roles.isSystem })
      .from(roles)
      .orderBy(roles.name);
    const permRows = await db
      .select({ roleId: rolePermissions.roleId, code: permissionsTable.code })
      .from(rolePermissions)
      .innerJoin(permissionsTable, eq(rolePermissions.permissionId, permissionsTable.id));
    const byRole = new Map<string, string[]>();
    for (const r of permRows) {
      const list = byRole.get(r.roleId);
      if (list) list.push(r.code);
      else byRole.set(r.roleId, [r.code]);
    }
    const caller = callerPerms(c);
    return roleRows.filter((r) => {
      try {
        assertCanGrant(caller, byRole.get(r.id) ?? []);
        return true;
      } catch (e) {
        if (e instanceof RoleEscalationError) return false;
        throw e;
      }
    });
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
    // P5: tayinlanayotgan rol chaqiruvchining huquqlaridan yuqori bo'lmasin (yozishdan OLDIN).
    assertCanGrant(callerPerms(c), (await loadRolePermissionCodes(dbContext, input.roleId)) ?? []);

    if (input.branchId) {
      const [branch] = await dbContext
        .select()
        .from(branches)
        .where(eq(branches.id, input.branchId));
      if (!branch) return { ok: false as const, code: 'branch.not_found' };
    }

    // Yagona kanonik shakl (+998XXXXXXXXX) — qidiruv ham, yozish ham SHU
    // qiymat bilan. Aks holda bitta odam `901234567` va `+998901234567`
    // ko'rinishida ikki alohida platform hisobi bo'lib qolardi (`users.phone`
    // platform bo'yicha UNIQUE — CLAUDE.md §3.1) va login topa olmasdi.
    const phone = normalizePhone(input.phone);

    // User mavjudmi? users — platform-level, RLS yo'q, lekin transaction'dagi tx ham ishlatadi
    return await dbContext.transaction(async (tx) => {
      // Tenant context'ni saqlash (transaction ichida)
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      let [user] = await tx.select().from(users).where(eq(users.phone, phone));
      let tempPassword: string | null = null;
      // P6b: faqat shu so'rovda YARATILGAN foydalanuvchi darhol rozi hisoblanadi (boshqa
      // identifikatsiyasi yo'q). Mavjud platforma foydalanuvchisi o'zi qabul qilishi shart.
      let createdNow = false;

      if (!user) {
        // Yangi user — temporary password (12 bytes → 16 base64url chars, login validatori min(12) ni qondiradi)
        tempPassword = randomBytes(12).toString('base64url');
        const passwordHash = await hashPassword(tempPassword);

        const [created] = await tx
          .insert(users)
          .values({
            phone,
            passwordHash,
            fullName: input.fullName,
            // Vaqtinchalik parolni owner biladi — birinchi kirishda almashtirish majburiy
            // (aks holda klinika ishlamaydigan hisobning ishlaydigan parolini saqlab qoladi).
            mustChangePassword: true,
          })
          .returning();

        if (!created) return { ok: false as const, code: 'user.create_failed' };
        user = created;
        createdNow = true;

        // Vaqtinchalik parol FAQAT javobda (owner xodimga beradi) — log'ga yozilmaydi.
        logger.info({ userId: user.id }, 'Invite: yangi foydalanuvchi yaratildi');
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
            pending: existing.acceptedAt === null,
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
          // Qayta faollashtirish accepted_at'ni SAQLAYDI: ilgari qabul qilingan bo'lsa rozi,
          // aks holda (rad etilgan/kutilgan) NULL — yana kutilmoqda.
          pending: existing.acceptedAt === null,
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
          acceptedAt: createdNow ? new Date() : null,
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
        pending: !createdNow,
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
    // P5: tayinlanayotgan rol chaqiruvchining huquqlaridan yuqori bo'lmasin.
    assertCanGrant(callerPerms(c), (await loadRolePermissionCodes(db, input.roleId)) ?? []);

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

    // P6b: foydalanuvchi shu tenantda allaqachon QABUL QILINGAN a'zo bo'lsa (faol qabul
    // qilingan tayinlovi bor) — yangi tayinlov ham rozi; aks holda u o'zi qabul qilishi shart.
    const [accepted] = await db
      .select({ id: userAssignments.id })
      .from(userAssignments)
      .where(
        and(
          eq(userAssignments.userId, userId),
          eq(userAssignments.tenantId, tenantId),
          eq(userAssignments.isActive, true),
          isNotNull(userAssignments.acceptedAt),
        ),
      )
      .limit(1);

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
        acceptedAt: accepted ? new Date() : null,
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

    // P5: eskalatsiya tekshiruvi (yozishdan OLDIN). Rol o'zgarsa yoki assignment qayta
    // faollashtirilsa / muddati uzaytirilsa — EFFEKTIV rol (input.roleId ?? before.roleId)
    // chaqiruvchi huquqlaridan yuqori bo'lmasligi shart. Aks holda eski Tenant Admin
    // assignment'ni `{isActive:true}` / `{validTo:null}` bilan tiriltirib bo'ladi.
    const roleChanged = input.roleId !== undefined && input.roleId !== before.roleId;
    const reactivates = input.isActive === true && !before.isActive;
    const extendsValidity =
      input.validTo !== undefined &&
      before.validTo !== null &&
      (input.validTo === null || new Date(input.validTo).getTime() > before.validTo.getTime());
    if (roleChanged || reactivates || extendsValidity) {
      const effectiveRoleId = input.roleId ?? before.roleId;
      const codes = await loadRolePermissionCodes(db, effectiveRoleId);
      if (codes === null) return { ok: false as const, code: 'role.not_found' as const };
      assertCanGrant(callerPerms(c), codes);
    }

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
    return updated ? { ok: true as const, row: updated } : null;
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
   * P6 — xodim parolini FAQAT klinika egasi (owner) tiklaydi.
   *  - Chaqiruvchi owner bo'lishi shart (`@owner`), aks holda `user.reset_owner_only`
   *  - Owner o'zini bu yo'l bilan tiklamaydi (`user.reset_self` — `/auth/change-password` bor)
   *  - Maqsad shu tenant a'zosi bo'lishi kerak (cross-tenant zarbasiz)
   *  - Yangi 16-belgili vaqtinchalik parol generate qilinadi va `must_change_password = true`
   *    qo'yiladi: shu parol bilan kirilganda faqat parol almashtirish ochiladi
   *  - Foydalanuvchining hamma refresh tokenlari revoke qilinadi
   *  - Audit yoziladi; ochiq parol LOGGA YOZILMAYDI (faqat javobda qaytadi)
   */
  async function resetUserPassword(c: Context, targetUserId: string) {
    const dbContext = getDb(c);
    const tenantId = c.get('activeTenantId');
    const actor = c.get('user');
    if (!tenantId || !actor) throw new Error('No tenant context');

    if (!c.get('accessClaims')?.perms.includes('@owner')) {
      return { ok: false as const, code: 'user.reset_owner_only' };
    }
    if (actor.id === targetUserId) {
      return { ok: false as const, code: 'user.reset_self' };
    }

    // Target user shu tenantda ekanligini tekshirish (assignment yoki owner)
    return await dbContext.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      // Owner check (cross-tenant)
      const [tenant] = await tx
        .select({ ownerUserId: tenants.ownerUserId })
        .from(tenants)
        .where(eq(tenants.id, tenantId));
      const isOwner = tenant?.ownerUserId === targetUserId;

      // P6: maqsad BOSHQA klinikaning egasi bo'lsa — rad etiladi. Hujumchi o'z klinikasiga
      // begona foydalanuvchini (invite orqali, rozilik so'ramasdan) a'zo qilib, keyin
      // parolini tiklab, uning klinikasini to'liq egallashi mumkin edi.
      // `tenants` platform jadvali (RLS yo'q) — shu sababli tenant kontekstidan qat'i nazar
      // barcha klinikalar ko'rinadi.
      const [otherOwned] = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(and(eq(tenants.ownerUserId, targetUserId), ne(tenants.id, tenantId)))
        .limit(1);
      if (otherOwned) {
        return { ok: false as const, code: 'user.reset_other_tenant_owner' };
      }

      // FU-15 qoldig'i: maqsad BOSHQA klinikada ham qabul qilingan a'zo bo'lsa — rad.
      // Aks holda klinika A egasi parolni tiklab, shu hisob bilan klinika B'ga kirardi.
      // `app.current_user_id` user_assignments RLS'ida foydalanuvchining o'z qatorlarini
      // ochadi (workspaces naqshi); tx oxirida bekor bo'ladi.
      await tx.execute(sql`SELECT set_config('app.current_user_id', ${targetUserId}, true)`);
      const [otherMember] = await tx
        .select({ id: userAssignments.id })
        .from(userAssignments)
        .where(
          and(
            eq(userAssignments.userId, targetUserId),
            ne(userAssignments.tenantId, tenantId),
            eq(userAssignments.isActive, true),
            isNotNull(userAssignments.acceptedAt),
          ),
        )
        .limit(1);
      await tx.execute(sql`SELECT set_config('app.current_user_id', '', true)`);
      if (otherMember) {
        return { ok: false as const, code: 'user.reset_multi_tenant_member' };
      }

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
              // P6b: kutilayotgan (qabul qilinmagan) taklif a'zolik emas — begona klinika
              // rozisiz «a'zo» qilib, so'ng parolni tiklab hisobni egallay olmasin.
              isNotNull(userAssignments.acceptedAt),
            ),
          );
        hasAssignment = !!a;
      }

      if (!isOwner && !hasAssignment) {
        return { ok: false as const, code: 'user.not_in_tenant' };
      }

      const [target] = await tx.select().from(users).where(eq(users.id, targetUserId));
      if (!target) return { ok: false as const, code: 'user.not_found' };

      const newPassword = randomBytes(12).toString('base64url'); // 16 belgi
      const newHash = await hashPassword(newPassword);
      const now = new Date();

      await tx
        .update(users)
        // FU-15: parolni boshqa odam (owner) bildi — telefon tasdig'i bekor: keyingi
        // begona klinika taklifini qabul qilish uchun egasi yana Telegram orqali tasdiqlaydi.
        .set({
          passwordHash: newHash,
          mustChangePassword: true,
          phoneVerifiedAt: null,
          updatedAt: now,
        })
        .where(eq(users.id, targetUserId));

      // Barcha refresh tokenlarni revoke (boshqa qurilmalardan logout)
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, targetUserId), isNull(refreshTokens.revokedAt)));

      await deps.audit.record(c, {
        action: 'password_reset_by_owner',
        resourceType: 'user',
        resourceId: targetUserId,
        after: { phone: target.phone, by: actor.id },
      });

      // ⚠️ Ochiq parol log'ga YOZILMAYDI — faqat javob orqali owner'ga qaytadi.
      logger.info({ ownerId: actor.id, userId: targetUserId }, 'Owner reset staff password');

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
            or(isNull(userAssignments.validTo), gt(userAssignments.validTo, now0)),
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
    listGrantableRoles,
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
