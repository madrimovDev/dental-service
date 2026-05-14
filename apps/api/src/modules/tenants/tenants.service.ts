import { tenants, users } from '@dental/db-schema';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { verifyPassword } from '../../lib/password.ts';
import type { TransferOwnershipInput, UpdateTenantInput } from './tenants.schema.ts';

export const createTenantsService = (deps: { db: Database; audit: AuditLogger }) => {
  /** Joriy tenant ma'lumotini olish */
  async function getCurrent(c: Context) {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) return null;

    // tenants RLS yo'q, lekin ehtiyot uchun explicit filter
    const [tenant] = await deps.db.select().from(tenants).where(eq(tenants.id, tenantId));
    return tenant ?? null;
  }

  async function update(c: Context, input: UpdateTenantInput) {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const [before] = await deps.db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!before) return null;

    const [updated] = await deps.db
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

    // Faqat owner ushbu amalni qila oladi
    const [tenant] = await deps.db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) return { ok: false as const, code: 'tenant.not_found' };
    if (tenant.ownerUserId !== currentUser.id) {
      return { ok: false as const, code: 'tenant.owner_only' };
    }

    // Current password verifikatsiya (defense-in-depth)
    const [userRow] = await deps.db.select().from(users).where(eq(users.id, currentUser.id));
    if (!userRow) return { ok: false as const, code: 'auth.required' };
    const passOk = await verifyPassword(input.currentPassword, userRow.passwordHash);
    if (!passOk) return { ok: false as const, code: 'auth.invalid_password' };

    // Yangi owner user mavjudligini tekshirish
    const [newOwner] = await deps.db.select().from(users).where(eq(users.id, input.newOwnerUserId));
    if (!newOwner) return { ok: false as const, code: 'user.not_found' };

    // Transfer
    const [updated] = await deps.db
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
