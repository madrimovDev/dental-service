import { randomBytes } from 'node:crypto';
import { OWNER_ONLY_PERMISSIONS, type Permission, ROLE_TEMPLATES } from '@dental/core';
import {
  auditLog,
  branches,
  passwordResetTokens,
  permissions as permissionsTable,
  refreshTokens,
  rolePermissions,
  roles,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Database, DbTransaction } from '../../db/client.ts';
import { signAccess, signRefresh, verifyRefresh } from '../../lib/jwt.ts';
import { logger } from '../../lib/logger.ts';
import { hashPassword, verifyPassword } from '../../lib/password.ts';
import type {
  LoginInput,
  PasswordResetInput,
  PasswordResetRequestInput,
  RefreshInput,
  RegisterTenantInput,
  SwitchWorkspaceInput,
} from './auth.schema.ts';

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'clinic';

const hashToken = async (token: string): Promise<string> => {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(token);
  return hasher.digest('hex');
};

const sixDigitCode = (): string =>
  randomBytes(3).readUIntBE(0, 3).toString().padStart(7, '0').slice(-6);

async function seedSystemRolesInTx(tx: DbTransaction, tenantId: string): Promise<string[]> {
  const createdRoleIds: string[] = [];

  for (const template of ROLE_TEMPLATES) {
    const [role] = await tx
      .insert(roles)
      .values({
        tenantId,
        name: template.name,
        description: `${template.descriptionUz} / ${template.descriptionRu}`,
        isTemplate: true,
        isSystem: true,
      })
      .returning({ id: roles.id });

    if (!role) continue;
    createdRoleIds.push(role.id);

    const perms = await tx
      .select({ id: permissionsTable.id })
      .from(permissionsTable)
      .where(inArray(permissionsTable.code, [...template.permissions]));

    if (perms.length > 0) {
      await tx
        .insert(rolePermissions)
        .values(perms.map((p) => ({ roleId: role.id, permissionId: p.id })));
    }
  }

  return createdRoleIds;
}

async function buildPermissionsForContext(
  db: Database,
  userId: string,
  tenantId: string,
  branchId: string | null,
): Promise<string[]> {
  // Owner check
  const [tenant] = await db
    .select({ ownerUserId: tenants.ownerUserId })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (tenant?.ownerUserId === userId) {
    return ['@owner'];
  }

  // User's active assignments in this tenant (branch-specific yoki tenant-wide)
  const now = new Date();
  const branchFilter = branchId
    ? or(isNull(userAssignments.branchId), eq(userAssignments.branchId, branchId))
    : isNull(userAssignments.branchId);

  const assignments = await db
    .select({ roleId: userAssignments.roleId })
    .from(userAssignments)
    .where(
      and(
        eq(userAssignments.userId, userId),
        eq(userAssignments.tenantId, tenantId),
        eq(userAssignments.isActive, true),
        or(isNull(userAssignments.validTo), gt(userAssignments.validTo, now)),
        branchFilter,
      ),
    );

  if (assignments.length === 0) return [];

  const roleIds = assignments.map((a) => a.roleId);

  const perms = await db
    .selectDistinct({ code: permissionsTable.code })
    .from(rolePermissions)
    .innerJoin(permissionsTable, eq(rolePermissions.permissionId, permissionsTable.id))
    .where(inArray(rolePermissions.roleId, roleIds));

  // Owner-only permissions ni filterlash (xavfsizlik)
  return perms
    .map((p) => p.code)
    .filter((code) => !(OWNER_ONLY_PERMISSIONS as readonly string[]).includes(code));
}

export type AuthServiceDeps = {
  db: Database;
};

export const createAuthService = (deps: AuthServiceDeps) => {
  const { db } = deps;

  async function registerTenant(input: RegisterTenantInput) {
    // Atomic transaction: user + tenant + branch + 8 role templates + (no owner assignment row)
    return await db.transaction(async (tx) => {
      const passwordHash = await hashPassword(input.ownerPassword);

      const [user] = await tx
        .insert(users)
        .values({
          email: input.ownerEmail,
          phone: input.ownerPhone ?? null,
          passwordHash,
          fullName: input.ownerFullName,
          preferredLanguage: input.defaultLanguage,
        })
        .returning({ id: users.id, email: users.email });

      if (!user) throw new Error('User insert failed');

      const baseSlug = slugify(input.tenantName);
      // Unique slug suffix bilan
      const slug = `${baseSlug}-${randomBytes(3).toString('hex')}`;

      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: input.tenantName,
          slug,
          ownerUserId: user.id,
          defaultLanguage: input.defaultLanguage,
        })
        .returning({ id: tenants.id, slug: tenants.slug });

      if (!tenant) throw new Error('Tenant insert failed');

      // RLS context o'rnatish — keyingi insert'lar (branches, roles, role_permissions, audit_log)
      // shu tenant_id bilan o'tadi
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`);

      // Default branch
      const [branch] = await tx
        .insert(branches)
        .values({
          tenantId: tenant.id,
          name: 'Bosh filial',
        })
        .returning({ id: branches.id });

      if (!branch) throw new Error('Branch insert failed');

      // System role templates seed
      await seedSystemRolesInTx(tx, tenant.id);

      // Audit (platform-level event)
      await tx.insert(auditLog).values({
        tenantId: tenant.id,
        userId: user.id,
        action: 'tenant.registered',
        resourceType: 'tenant',
        resourceId: tenant.id,
        before: null,
        after: { name: input.tenantName, slug: tenant.slug },
      });

      return { userId: user.id, tenantId: tenant.id, slug: tenant.slug, branchId: branch.id };
    });
  }

  async function login(input: LoginInput) {
    const isEmail = input.identifier.includes('@');
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          isEmail ? eq(users.email, input.identifier) : eq(users.phone, input.identifier),
          isNull(users.deletedAt),
        ),
      );

    if (!user) return null;

    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) return null;

    // JWT — no workspace context yet (atid/abid null, empty perms)
    const access = await signAccess({
      sub: user.id,
      atid: null,
      abid: null,
      perms: [],
      lang: (user.preferredLanguage as 'uz' | 'ru') ?? 'uz',
    });
    const refresh = await signRefresh(user.id);

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: await hashToken(refresh.token),
      expiresAt: refresh.expiresAt,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        lang: user.preferredLanguage,
      },
      accessToken: access.token,
      refreshToken: refresh.token,
      accessExpiresAt: access.expiresAt,
    };
  }

  async function getMemberships(userId: string) {
    // User platform-level — RLS yoq users jadvalida. tenants ham RLS yoq.
    // user_assignments RLS bor lekin context o'rnatilmagan bo'lsa 0 row.
    // ⚠️ Bu metod RLS context'siz chaqiriladi (workspace tanlanmagan). Shuning uchun
    // raw query bilan join qilamiz — explicit user_id filter (RLS by design teska to'g'rilangan).
    // Production'da bu maxsus assignment query'lariga "BYPASSRLS" service role yoki app-level
    // FORCE TENANT_ID = NULL pattern kerak bo'lishi mumkin.

    // ECHIM: tx ochib RLS ni vaqtinchalik o'tkazib yuborish — admin role kerak.
    // Hozircha: superuser admin URL bilan alohida query qilamiz? Yo'q, bu murakkab.
    //
    // Boshqa yo'l: user_assignments dan tashqari joins qilamiz tenants/branches/roles bilan,
    // shu RLS'siz jadvallar bir-biriga JOIN qilinadi va user_id filter ishlatamiz.
    // Lekin user_assignments RLS bor.
    //
    // EHTIMOL eng to'g'risi: server-side query bo'lganda user'ning own assignments'i uchun
    // RLS qisman bypass qiluvchi alohida endpoint kerak. Yoki user_assignments RLS'ni o'zgartirish:
    //   policy USING (user_id = current_setting('app.current_user_id', true)::uuid)
    // Bu boshqacha yondashuv.
    //
    // M1.2 v0 — sodda yondashuv: user_assignments RLS'ni user_id yoki tenant_id bo'yicha ham qilamiz.
    // Yoki: memberships'ni alohida endpoint orqali qilamiz bilan SET LOCAL bypass:
    //   `SET LOCAL row_security = off` — superuser only.
    //
    // SIMPLEST: SetSet LOCAL user_id orqali RLS'ni bypassla — keyingi commit'da.
    // HOZIRGA: barcha tenant'lardagi user'ning assignment'larini ko'rish uchun
    // SET LOCAL row_security = off (admin URL bilan)?
    //
    // Vaqtinchalik echim: yangi RLS policy qo'shamiz user_assignments'ga:
    //   policy USING (user_id = current_setting('app.current_user_id', true)::uuid OR ...)
    //
    // BU YERDA: oddiy approach — har tenant uchun alohida query qilib RLS context bilan.
    // Lekin biz user'ning hamma tenantlarini bilmaymiz.
    //
    // M1.2 yechim: alohida user_assignments uchun maxsus RLS yondashuv (keyingi qadamda).
    // Hozirgi versiya: SET LOCAL app.current_user_id orqali — pastdagi DDL'ni qo'shamiz.

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);

      const result = await tx
        .select({
          tenantId: userAssignments.tenantId,
          tenantName: tenants.name,
          tenantSlug: tenants.slug,
          branchId: userAssignments.branchId,
          branchName: branches.name,
          roleId: userAssignments.roleId,
          roleName: roles.name,
          isOwner: sql<boolean>`${tenants.ownerUserId} = ${userId}`,
        })
        .from(userAssignments)
        .innerJoin(tenants, eq(tenants.id, userAssignments.tenantId))
        .leftJoin(branches, eq(branches.id, userAssignments.branchId))
        .innerJoin(roles, eq(roles.id, userAssignments.roleId))
        .where(and(eq(userAssignments.userId, userId), eq(userAssignments.isActive, true)));

      // Owner uchun assignment bo'lmasligi mumkin — owner sifatida tenant'larni ham qaytaramiz
      const ownerTenants = await tx
        .select({
          tenantId: tenants.id,
          tenantName: tenants.name,
          tenantSlug: tenants.slug,
        })
        .from(tenants)
        .where(eq(tenants.ownerUserId, userId));

      return { assignments: result, ownerTenants };
    });
  }

  async function switchWorkspace(userId: string, input: SwitchWorkspaceInput) {
    // 1. User shu tenant'da owner yoki assignment'i bormi tekshirish
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, input.tenantId));

    if (!tenant) return null;

    const isOwner = tenant.ownerUserId === userId;

    if (!isOwner) {
      // Active assignment tekshirish
      const now = new Date();
      const branchFilter = input.branchId
        ? or(isNull(userAssignments.branchId), eq(userAssignments.branchId, input.branchId))
        : isNull(userAssignments.branchId);

      const [assignment] = await db
        .select()
        .from(userAssignments)
        .where(
          and(
            eq(userAssignments.userId, userId),
            eq(userAssignments.tenantId, input.tenantId),
            eq(userAssignments.isActive, true),
            or(isNull(userAssignments.validTo), gt(userAssignments.validTo, now)),
            branchFilter,
          ),
        );

      if (!assignment) return null;
    }

    // 2. Permissions ro'yxati
    const perms = await buildPermissionsForContext(
      db,
      userId,
      input.tenantId,
      input.branchId ?? null,
    );

    // 3. User lang
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return null;

    // 4. New JWT
    const access = await signAccess({
      sub: userId,
      atid: input.tenantId,
      abid: input.branchId ?? null,
      perms: perms as Permission[],
      lang: (user.preferredLanguage as 'uz' | 'ru') ?? 'uz',
    });

    return { accessToken: access.token, accessExpiresAt: access.expiresAt };
  }

  async function refresh(input: RefreshInput) {
    let claims: { sub: string; jti: string };
    try {
      claims = await verifyRefresh(input.refreshToken);
    } catch {
      return null;
    }

    const tokenHash = await hashToken(input.refreshToken);
    const [existing] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));

    if (!existing) return null;

    // Replay detection — bu token allaqachon revoke qilingan
    if (existing.revokedAt) {
      // Butun chain revoke qilish — replaced_by_id bo'yicha kelajakdagi tokenlarni
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.userId, claims.sub));
      logger.warn({ userId: claims.sub }, 'Refresh token replay detected — chain revoked');
      return null;
    }

    // Rotate: eski token revoke + yangi yaratish
    return await db.transaction(async (tx) => {
      const newRefresh = await signRefresh(claims.sub);
      const newAccessClaims = {
        sub: claims.sub,
        atid: null,
        abid: null,
        perms: [] as Permission[],
        lang: 'uz' as const,
      };
      const newAccess = await signAccess(newAccessClaims);

      const [newRow] = await tx
        .insert(refreshTokens)
        .values({
          userId: claims.sub,
          tokenHash: await hashToken(newRefresh.token),
          expiresAt: newRefresh.expiresAt,
        })
        .returning({ id: refreshTokens.id });

      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date(), replacedById: newRow?.id })
        .where(eq(refreshTokens.id, existing.id));

      return {
        accessToken: newAccess.token,
        refreshToken: newRefresh.token,
        accessExpiresAt: newAccess.expiresAt,
      };
    });
  }

  async function logout(refreshToken: string) {
    const tokenHash = await hashToken(refreshToken);
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash));
  }

  async function requestPasswordReset(input: PasswordResetRequestInput) {
    const isEmail = input.identifier.includes('@');
    const [user] = await db
      .select()
      .from(users)
      .where(isEmail ? eq(users.email, input.identifier) : eq(users.phone, input.identifier));

    // Security: invalid user uchun ham success qaytaramiz (enumeration oldini olish)
    if (!user) return { sent: true };

    const code = sixDigitCode();
    const tokenHash = await hashToken(code);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 daq

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    // MOCK OTP — Phase 1 da SMS yo'q, kodni log'ga yozamiz (M3 da Eskiz)
    logger.warn(
      { userId: user.id, email: user.email, code },
      `🔐 Mock OTP — bu console'da production'da SMS bilan yuboriladi`,
    );

    return { sent: true };
  }

  async function resetPassword(input: PasswordResetInput) {
    const tokenHash = await hashToken(input.token);
    const now = new Date();

    const [reset] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          gt(passwordResetTokens.expiresAt, now),
          isNull(passwordResetTokens.usedAt),
        ),
      );

    if (!reset) return null;

    const newHash = await hashPassword(input.newPassword);

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: newHash, updatedAt: now })
        .where(eq(users.id, reset.userId));
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(eq(passwordResetTokens.id, reset.id));
      // Barcha refresh tokenlarni revoke (parol o'zgargach)
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(eq(refreshTokens.userId, reset.userId));
    });

    return { ok: true };
  }

  return {
    registerTenant,
    login,
    getMemberships,
    switchWorkspace,
    refresh,
    logout,
    requestPasswordReset,
    resetPassword,
  };
};

export type AuthService = ReturnType<typeof createAuthService>;
