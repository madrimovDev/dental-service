import { tenants, userAssignments, users } from '@dental/db-schema';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Database } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { verifyPassword } from '../../lib/password.ts';
import type { TransferOwnershipInput, UpdateTenantInput } from './tenants.schema.ts';

export const createTenantsService = (deps: { db: Database; audit: AuditLogger }) => {
  /** Joriy tenant ma'lumotini olish */
  async function getCurrent(c: Context) {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) return null;

    // tenants RLS yo'q, lekin ehtiyot uchun explicit filter. `getDb(c)` — rlsMiddleware
    // `activeTenantId` mavjud bo'lganda har doim per-request transaction ochadi (RLS
    // yo'qligidan qat'i nazar) — shu tx'dan foydalanish CLI-442 #2 atomiklik talabiga
    // mos (audit.record ham xuddi shu `c.get('db')` orqali yozadi).
    const db = getDb(c);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    return tenant ?? null;
  }

  async function update(c: Context, input: UpdateTenantInput) {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');
    const db = getDb(c);

    const [before] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!before) return null;

    // CLI-442 #2: `getDb(c)` ishlatiladi — xom `deps.db` pool emas — shuning uchun
    // UPDATE va audit.record BIR XIL per-request tranzaksiyada (rlsMiddleware ochgan)
    // ishlaydi: audit yozuvi fail bo'lsa UPDATE ham rollback bo'ladi (atomik).
    const [updated] = await db
      .update(tenants)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'tenant',
        resourceId: tenantId,
        before,
        after: updated,
      });
    }

    return updated;
  }

  async function transferOwnership(c: Context, input: TransferOwnershipInput) {
    const tenantId = c.get('activeTenantId');
    const currentUser = c.get('user');
    if (!tenantId || !currentUser) return { ok: false as const, code: 'auth.required' };
    const db = getDb(c);

    // Faqat owner ushbu amalni qila oladi
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) return { ok: false as const, code: 'tenant.not_found' };
    if (tenant.ownerUserId !== currentUser.id) {
      return { ok: false as const, code: 'tenant.owner_only' };
    }

    // Current password verifikatsiya (defense-in-depth)
    const [userRow] = await db.select().from(users).where(eq(users.id, currentUser.id));
    if (!userRow) return { ok: false as const, code: 'auth.required' };
    const passOk = await verifyPassword(input.currentPassword, userRow.passwordHash);
    if (!passOk) return { ok: false as const, code: 'auth.invalid_password' };

    // Yangi owner user mavjudligini tekshirish
    const [newOwner] = await db.select().from(users).where(eq(users.id, input.newOwnerUserId));
    if (!newOwner) return { ok: false as const, code: 'user.not_found' };

    // CLI-442 #2: member-guard — yangi owner shu tenantga AKTIV a'zo bo'lishi shart
    // (owner o'zi assignmentsiz bo'lishi mumkin — auth.service.ts owner-path — shuning
    // uchun tekshiruv faqat *yangi* owner ustida, joriy owner ustida emas).
    const [membership] = await db
      .select({ id: userAssignments.id })
      .from(userAssignments)
      .where(
        and(
          eq(userAssignments.tenantId, tenantId),
          eq(userAssignments.userId, input.newOwnerUserId),
          eq(userAssignments.isActive, true),
        ),
      );
    if (!membership) return { ok: false as const, code: 'user.not_member' };

    // Transfer — `getDb(c)` orqali: UPDATE va audit.record BIR XIL tranzaksiyada
    // (atomik — biri fail bo'lsa ikkalasi ham rollback).
    const [updated] = await db
      .update(tenants)
      .set({ ownerUserId: input.newOwnerUserId, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'tenant.ownership_transferred',
        resourceType: 'tenant',
        resourceId: tenantId,
        before: { ownerId: tenant.ownerUserId },
        after: { ownerId: input.newOwnerUserId },
      });
    }

    return { ok: true as const, tenant: updated };
  }

  return { getCurrent, update, transferOwnership };
};

export type TenantsService = ReturnType<typeof createTenantsService>;
