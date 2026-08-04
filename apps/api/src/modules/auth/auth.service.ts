import { randomBytes } from 'node:crypto';
import {
  normalizePhone,
  OWNER_ONLY_PERMISSIONS,
  type Permission,
  ROLE_TEMPLATES,
} from '@dental/core';
import {
  auditLog,
  branches,
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
  ChangePasswordInput,
  LoginInput,
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

async function seedSystemRolesInTx(tx: DbTransaction, tenantId: string): Promise<string[]> {
  const createdRoleIds: string[] = [];

  for (const template of ROLE_TEMPLATES) {
    const [role] = await tx
      .insert(roles)
      .values({
        tenantId,
        name: template.name,
        description: `${template.descriptionUz} / ${template.descriptionRu}`,
        templateKey: template.templateKey,
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

/**
 * Yangi klinika (tenant) uchun to'liq boshlang'ich holat: owner foydalanuvchi →
 * tenant → RLS konteksti → filial → 8 rol shabloni → audit yozuvi.
 *
 * MODUL DARAJASIDA eksport qilingan (factory tashqarisida) — ikki chaqiruvchi
 * bor va ikkalasi ham bitta yo'ldan yurishi shart:
 *  1. `registerTenant` (self-service ro'yxatdan o'tish);
 *  2. aktivatsiyadagi provisioning (`routes/activate.ts`) — u `createAuthService`
 *     qurmasdan, faqat `tx` bilan chaqiradi.
 *
 * 🔴 `seedSystemRolesInTx` HECH QACHON chetlab o'tilmaydi: rol shablonlarisiz
 * tenantda owner'dan boshqa hech kim ishlay olmaydi (bu xato sinfi loyihada
 * uch marta takrorlangan — CLAUDE.md `project_rbac_role_gaps`).
 *
 * ⚠️ `set_config('app.current_tenant_id', ...)` shu funksiya ICHIDA o'rnatiladi:
 * aktivatsiya yo'lida request middleware'i yo'q, tenant hali endigina yaratildi.
 *
 * ⚠️ `input.ownerPassword` hech qayerga (log/audit) yozilmaydi — audit `after`
 * faqat `{ name, slug }`.
 */
export type ProvisionTenantInput = {
  tenantName: string;
  ownerPhone: string;
  ownerFullName: string;
  ownerPassword: string;
  defaultLanguage: 'uz' | 'ru';
  branchName?: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  /** Audit `action` kodi; default `tenant.registered`. */
  auditAction?: string;
};

export type ProvisionTenantResult = {
  userId: string;
  tenantId: string;
  slug: string;
  branchId: string;
};

export async function provisionTenantInTx(
  tx: DbTransaction,
  input: ProvisionTenantInput,
): Promise<ProvisionTenantResult> {
  const passwordHash = await hashPassword(input.ownerPassword);

  const [user] = await tx
    .insert(users)
    .values({
      // Yagona kanonik shakl (+998XXXXXXXXX) — vendor kiritgan va klinika
      // kiritgan raqam bitta hisobga tushishi uchun.
      phone: normalizePhone(input.ownerPhone),
      passwordHash,
      fullName: input.ownerFullName,
      preferredLanguage: input.defaultLanguage,
    })
    .returning({ id: users.id, phone: users.phone });

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

  // RLS context o'rnatish — keyingi insert'lar (branches, roles, role_permissions,
  // audit_log) shu tenant_id bilan o'tadi
  await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`);

  // Default branch
  const [branch] = await tx
    .insert(branches)
    .values({
      tenantId: tenant.id,
      name: input.branchName?.trim() || 'Bosh filial',
      address: input.branchAddress ?? null,
      phone: input.branchPhone ? normalizePhone(input.branchPhone) : null,
    })
    .returning({ id: branches.id });

  if (!branch) throw new Error('Branch insert failed');

  // System role templates seed — MAJBURIY, hech qachon o'tkazib yuborilmaydi
  await seedSystemRolesInTx(tx, tenant.id);

  // Audit (platform-level event) — parol YOZILMAYDI
  await tx.insert(auditLog).values({
    tenantId: tenant.id,
    userId: user.id,
    action: input.auditAction ?? 'tenant.registered',
    resourceType: 'tenant',
    resourceId: tenant.id,
    before: null,
    after: { name: input.tenantName, slug: tenant.slug },
  });

  return { userId: user.id, tenantId: tenant.id, slug: tenant.slug, branchId: branch.id };
}

type ContextPermissions = {
  perms: string[];
  /** Aktiv kontekstdagi birlamchi rol templateKey'i; owner / no-assignment / custom rol → null. */
  roleKey: string | null;
};

async function buildPermissionsForContext(
  db: Database,
  userId: string,
  tenantId: string,
  branchId: string | null,
): Promise<ContextPermissions> {
  // Owner check (tenants jadvalida RLS yo'q)
  const [tenant] = await db
    .select({ ownerUserId: tenants.ownerUserId })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (tenant?.ownerUserId === userId) {
    return { perms: ['@owner'], roleKey: null };
  }

  // RLS context (current_tenant_id) ichida — user_assignments + role_permissions + permissions
  // tenant_isolation policy orqali filterlanadi. Transaction-scoped.
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

    const now = new Date();
    const branchFilter = branchId
      ? or(isNull(userAssignments.branchId), eq(userAssignments.branchId, branchId))
      : isNull(userAssignments.branchId);

    const assignments = await tx
      .select({ roleId: userAssignments.roleId, templateKey: roles.templateKey })
      .from(userAssignments)
      .innerJoin(roles, eq(roles.id, userAssignments.roleId))
      .where(
        and(
          eq(userAssignments.userId, userId),
          eq(userAssignments.tenantId, tenantId),
          eq(userAssignments.isActive, true),
          or(isNull(userAssignments.validTo), gt(userAssignments.validTo, now)),
          branchFilter,
        ),
      );

    if (assignments.length === 0) return { perms: [], roleKey: null };

    // Birlamchi rol — birinchi assignment templateKey'i (custom rol → null).
    const roleKey = assignments[0]?.templateKey ?? null;
    const roleIds = assignments.map((a) => a.roleId);

    const perms = await tx
      .selectDistinct({ code: permissionsTable.code })
      .from(rolePermissions)
      .innerJoin(permissionsTable, eq(rolePermissions.permissionId, permissionsTable.id))
      .where(inArray(rolePermissions.roleId, roleIds));

    return {
      perms: perms
        .map((p) => p.code)
        .filter((code) => !(OWNER_ONLY_PERMISSIONS as readonly string[]).includes(code)),
      roleKey,
    };
  });
}

export type AuthServiceDeps = {
  db: Database;
};

export const createAuthService = (deps: AuthServiceDeps) => {
  const { db } = deps;

  async function registerTenant(input: RegisterTenantInput) {
    // Atomic transaction: user + tenant + branch + 8 role templates + (no owner assignment row).
    // Mantiq `provisionTenantInTx`da — aktivatsiya provisioning'i bilan bitta yo'l.
    return await db.transaction((tx) => provisionTenantInTx(tx, input));
  }

  /**
   * Login natijasi — diskriminatsiyalangan union (CLI-227 audit uchun outcome+userId).
   *  - success: token juftligi + user.
   *  - failure: sabab ('no_user' | 'bad_password') + (mavjud bo'lsa) userId — audit'da
   *    KIM urinib ko'rdi yozish uchun.
   */
  type LoginResult =
    | {
        ok: true;
        userId: string;
        user: { id: string; phone: string; fullName: string | null; lang: string };
        accessToken: string;
        refreshToken: string;
        accessExpiresAt: Date;
      }
    | { ok: false; reason: 'no_user' | 'bad_password'; userId: string | null };

  async function login(input: LoginInput): Promise<LoginResult> {
    // `users.phone` bazada FAQAT kanonik shaklda saqlanadi (`provisionTenantInTx`,
    // `users.service.invite`), lekin schema `+`siz va mahalliy 9 xonali kiritmani
    // ham qabul qiladi. Qidiruvni ham normallashtirmasak, vendor/registratsiya
    // yaratgan hisob `998...` bilan login qilganda topilmay 401 qaytarardi.
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.phone, normalizePhone(input.phone)), isNull(users.deletedAt)));

    if (!user) return { ok: false, reason: 'no_user', userId: null };

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) return { ok: false, reason: 'bad_password', userId: user.id };

    // JWT — no workspace context yet (atid/abid null, empty perms)
    const access = await signAccess({
      sub: user.id,
      atid: null,
      abid: null,
      perms: [],
      roleKey: null,
      lang: (user.preferredLanguage as 'uz' | 'ru') ?? 'uz',
    });
    const refresh = await signRefresh(user.id);

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: await hashToken(refresh.token),
      expiresAt: refresh.expiresAt,
    });

    return {
      ok: true,
      userId: user.id,
      user: {
        id: user.id,
        phone: user.phone,
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
        .where(
          and(
            eq(userAssignments.userId, userId),
            eq(userAssignments.isActive, true),
            // CLI-441 #3: switchWorkspace bilan izchil — muddati o'tgan (validTo < now)
            // assignment ro'yxatda ko'rinmasin (aks holda ko'rinib, switch'da RAD bo'ladi).
            or(isNull(userAssignments.validTo), gt(userAssignments.validTo, new Date())),
          ),
        );

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

  /**
   * Joriy active tenant ichida user almasha oladigan filiallar ro'yxati.
   * Topbar filial dropdown uchun — RBAC-safe: `requirePermission` SIZ (CLI-154/155 precedenti).
   * Owner → tenantning barcha filiallari; xodim → faqat o'z aktiv assignment filiallari.
   * `allowAllBranches` → "Barcha filiallar" (branchId=null) tanlash mumkinmi (owner yoki branch-siz assignment).
   */
  async function workspaceBranches(userId: string, tenantId: string) {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
      await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);

      const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
      if (!tenant) return { branches: [], allowAllBranches: false };

      const isOwner = tenant.ownerUserId === userId;

      if (isOwner) {
        const rows = await tx
          .select({ id: branches.id, name: branches.name })
          .from(branches)
          .where(isNull(branches.deletedAt));
        return { branches: rows, allowAllBranches: true };
      }

      // Xodim — faqat aktiv assignment'lardagi filiallar (switchWorkspace shu doirani majburlaydi)
      const now = new Date();
      const asg = await tx
        .select({ branchId: userAssignments.branchId })
        .from(userAssignments)
        .where(
          and(
            eq(userAssignments.userId, userId),
            eq(userAssignments.tenantId, tenantId),
            eq(userAssignments.isActive, true),
            or(isNull(userAssignments.validTo), gt(userAssignments.validTo, now)),
          ),
        );

      const allowAllBranches = asg.some((a) => a.branchId === null);
      const branchIds = [
        ...new Set(asg.map((a) => a.branchId).filter((b): b is string => b !== null)),
      ];
      const rows = branchIds.length
        ? await tx
            .select({ id: branches.id, name: branches.name })
            .from(branches)
            .where(and(inArray(branches.id, branchIds), isNull(branches.deletedAt)))
        : [];
      return { branches: rows, allowAllBranches };
    });
  }

  async function switchWorkspace(userId: string, input: SwitchWorkspaceInput) {
    // 1. Refresh tokenni validatsiya — chain identifikatori sifatida
    let claims: { sub: string; jti: string };
    try {
      claims = await verifyRefresh(input.refreshToken);
    } catch {
      return { ok: false as const, code: 'auth.invalid_refresh' };
    }
    if (claims.sub !== userId) return { ok: false as const, code: 'auth.refresh_mismatch' };

    const oldHash = await hashToken(input.refreshToken);
    const [existingRefresh] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, oldHash));
    if (!existingRefresh) return { ok: false as const, code: 'auth.invalid_refresh' };
    if (existingRefresh.revokedAt) {
      // Replay — butun chain'ni revoke qilish
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.userId, userId));
      logger.warn({ userId }, 'Switch-workspace: revoked refresh used — chain killed');
      return { ok: false as const, code: 'auth.refresh_revoked' };
    }

    // 2. User shu tenant'da owner yoki assignment'i bormi
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, input.tenantId));
    if (!tenant) return { ok: false as const, code: 'auth.no_workspace_access' };
    const isOwner = tenant.ownerUserId === userId;

    // 3-4. Assignment va branch validation — bitta transaction'da RLS context bilan.
    // current_tenant_id = input.tenantId o'rnatib, user_assignments va branches'ga
    // standart tenant_isolation policy orqali kira olamiz.
    const validationResult = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${input.tenantId}, true)`);
      await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);

      if (!isOwner) {
        const now = new Date();
        const branchFilter = input.branchId
          ? or(isNull(userAssignments.branchId), eq(userAssignments.branchId, input.branchId))
          : undefined;

        const [assignment] = await tx
          .select()
          .from(userAssignments)
          .where(
            and(
              eq(userAssignments.userId, userId),
              eq(userAssignments.tenantId, input.tenantId),
              eq(userAssignments.isActive, true),
              or(isNull(userAssignments.validTo), gt(userAssignments.validTo, now)),
              ...(branchFilter ? [branchFilter] : []),
            ),
          );

        if (!assignment) return { code: 'auth.no_workspace_access' as const };
      }

      // branchId tenant ichida VA o'chirilmagan ekanligini tekshirish (defense in depth).
      // CLI-428: `isNull(deletedAt)` — o'chirilgan branchga stale/saqlangan branchId bilan
      // to'g'ridan-to'g'ri switch RAD (owner va non-owner ikkala yo'l uchun umumiy chokepoint).
      if (input.branchId) {
        const [branch] = await tx
          .select({ tenantId: branches.tenantId })
          .from(branches)
          .where(and(eq(branches.id, input.branchId), isNull(branches.deletedAt)));
        if (!branch || branch.tenantId !== input.tenantId) {
          return { code: 'auth.invalid_branch' as const };
        }
      }

      return { code: null };
    });

    if (validationResult.code) {
      return { ok: false as const, code: validationResult.code };
    }

    // 4. Permissions
    const { perms, roleKey } = await buildPermissionsForContext(
      db,
      userId,
      input.tenantId,
      input.branchId ?? null,
    );

    // 5. User lang
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return { ok: false as const, code: 'auth.user_not_found' };

    // 6. Rotate: revoke old refresh + issue new refresh (workspace bilan) + new access
    return await db.transaction(async (tx) => {
      const newRefresh = await signRefresh(userId);
      const newAccess = await signAccess({
        sub: userId,
        atid: input.tenantId,
        abid: input.branchId ?? null,
        perms: perms as Permission[],
        roleKey,
        lang: (user.preferredLanguage as 'uz' | 'ru') ?? 'uz',
      });

      const [newRow] = await tx
        .insert(refreshTokens)
        .values({
          userId,
          tokenHash: await hashToken(newRefresh.token),
          expiresAt: newRefresh.expiresAt,
          activeTenantId: input.tenantId,
          activeBranchId: input.branchId ?? null,
        })
        .returning({ id: refreshTokens.id });

      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date(), replacedById: newRow?.id })
        .where(eq(refreshTokens.id, existingRefresh.id));

      return {
        ok: true as const,
        accessToken: newAccess.token,
        refreshToken: newRefresh.token,
        accessExpiresAt: newAccess.expiresAt,
      };
    });
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

    // Replay detection
    if (existing.revokedAt) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.userId, claims.sub));
      logger.warn({ userId: claims.sub }, 'Refresh token replay detected — chain revoked');
      return null;
    }

    // User lang uchun
    const [user] = await db.select().from(users).where(eq(users.id, claims.sub));
    if (!user) return null;

    // Workspace context — refresh row'dan
    const activeTenantId = existing.activeTenantId;
    const activeBranchId = existing.activeBranchId;

    // Permissions re-derive (workspace bo'lsa). Yo'q bo'lsa empty.
    let perms: string[] = [];
    let roleKey: string | null = null;
    if (activeTenantId) {
      ({ perms, roleKey } = await buildPermissionsForContext(
        db,
        claims.sub,
        activeTenantId,
        activeBranchId,
      ));
      // Edge case: agar foydalanuvchi shu tenantdan o'chirilgan bo'lsa (assignment revoked yoki owner transferred)
      // perms = [] qaytadi va atid yangi tokenda null'ga tushadi (workspace tushib qoladi).
      if (perms.length === 0) {
        logger.warn(
          { userId: claims.sub, tenantId: activeTenantId },
          'Refresh: user no longer has access to active workspace — clearing context',
        );
      }
    }

    const hasWorkspace = activeTenantId && perms.length > 0;

    return await db.transaction(async (tx) => {
      const newRefresh = await signRefresh(claims.sub);
      const newAccess = await signAccess({
        sub: claims.sub,
        atid: hasWorkspace ? activeTenantId : null,
        abid: hasWorkspace ? activeBranchId : null,
        perms: (hasWorkspace ? perms : []) as Permission[],
        roleKey: hasWorkspace ? roleKey : null,
        lang: (user.preferredLanguage as 'uz' | 'ru') ?? 'uz',
      });

      const [newRow] = await tx
        .insert(refreshTokens)
        .values({
          userId: claims.sub,
          tokenHash: await hashToken(newRefresh.token),
          expiresAt: newRefresh.expiresAt,
          activeTenantId: hasWorkspace ? activeTenantId : null,
          activeBranchId: hasWorkspace ? activeBranchId : null,
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

  async function changePassword(userId: string, input: ChangePasswordInput) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return { ok: false as const, code: 'auth.user_not_found' };

    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) return { ok: false as const, code: 'auth.invalid_current_password' };

    if (input.currentPassword === input.newPassword) {
      return { ok: false as const, code: 'auth.same_password' };
    }

    const newHash = await hashPassword(input.newPassword);
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: newHash, updatedAt: now })
        .where(eq(users.id, userId));
      // Barcha boshqa refresh tokenlarni revoke (xavfsizlik: boshqa qurilmalardan logout)
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    });

    return { ok: true as const };
  }

  return {
    registerTenant,
    login,
    getMemberships,
    workspaceBranches,
    switchWorkspace,
    refresh,
    changePassword,
    logout,
  };
};

export type AuthService = ReturnType<typeof createAuthService>;
