import { servicePrices, services } from '@dental/db-schema';
import { and, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import type {
  CreateServiceInput,
  SetServicePriceInput,
  UpdateServiceInput,
} from './services.schema.ts';

export const createServicesService = (deps: { audit: AuditLogger }) => {
  async function list(c: Context) {
    const db = getDb(c);
    return db
      .select()
      .from(services)
      .where(isNull(services.deletedAt))
      .orderBy(services.category, services.nameUz);
  }

  async function findById(c: Context, id: string) {
    const db = getDb(c);
    const [service] = await db
      .select()
      .from(services)
      .where(and(eq(services.id, id), isNull(services.deletedAt)));
    if (!service) return null;

    // Per-branch active prices
    const today = new Date().toISOString().slice(0, 10);
    const prices = await db
      .select()
      .from(servicePrices)
      .where(
        and(
          eq(servicePrices.serviceId, id),
          lte(servicePrices.validFrom, today),
          or(isNull(servicePrices.validTo), sql`${servicePrices.validTo} >= ${today}`),
        ),
      )
      .orderBy(desc(servicePrices.validFrom));

    return { ...service, prices };
  }

  async function create(c: Context, input: CreateServiceInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const [service] = await tx
        .insert(services)
        .values({
          tenantId,
          code: input.code,
          nameUz: input.nameUz,
          nameRu: input.nameRu ?? null,
          category: input.category ?? null,
          durationMinutes: input.durationMinutes,
          requiredRole: input.requiredRole ?? null,
          descriptionUz: input.descriptionUz ?? null,
          descriptionRu: input.descriptionRu ?? null,
          isActive: input.isActive,
        })
        .returning();

      if (!service) throw new Error('Service insert failed');

      // Optional initial price for a branch
      if (input.initialPrice !== undefined && input.initialBranchId) {
        await tx.insert(servicePrices).values({
          serviceId: service.id,
          branchId: input.initialBranchId,
          price: String(input.initialPrice),
        });
      }

      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'service',
        resourceId: service.id,
        after: service,
      });

      return service;
    });
  }

  async function update(c: Context, id: string, input: UpdateServiceInput) {
    const db = getDb(c);
    const [before] = await db.select().from(services).where(eq(services.id, id));
    if (!before) return null;

    const [updated] = await db
      .update(services)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(services.id, id))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'service',
        resourceId: id,
        before,
        after: updated,
      });
    }
    return updated;
  }

  async function remove(c: Context, id: string) {
    const db = getDb(c);
    const [before] = await db
      .select()
      .from(services)
      .where(and(eq(services.id, id), isNull(services.deletedAt)));
    if (!before) return null;

    await db
      .update(services)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(services.id, id));

    await deps.audit.record(c, {
      action: 'deleted',
      resourceType: 'service',
      resourceId: id,
      before,
    });

    return before;
  }

  async function setPrice(c: Context, serviceId: string, input: SetServicePriceInput) {
    const db = getDb(c);
    const today = new Date().toISOString().slice(0, 10);

    return await db.transaction(async (tx) => {
      // Avvalgi narxni "close" qilish (validTo = bugun -1 kun)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      await tx
        .update(servicePrices)
        .set({ validTo: yesterdayStr })
        .where(
          and(
            eq(servicePrices.serviceId, serviceId),
            eq(servicePrices.branchId, input.branchId),
            isNull(servicePrices.validTo),
          ),
        );

      // Yangi narx
      const [price] = await tx
        .insert(servicePrices)
        .values({
          serviceId,
          branchId: input.branchId,
          price: String(input.price),
          currency: input.currency,
          validFrom: today,
        })
        .returning();

      await deps.audit.record(c, {
        action: 'price_updated',
        resourceType: 'service',
        resourceId: serviceId,
        after: { price: input.price, branchId: input.branchId },
      });

      return price;
    });
  }

  /** Get active price for service+branch (utility for cashier) */
  async function getActivePrice(c: Context, serviceId: string, branchId: string) {
    const db = getDb(c);
    const today = new Date().toISOString().slice(0, 10);

    const [price] = await db
      .select()
      .from(servicePrices)
      .where(
        and(
          eq(servicePrices.serviceId, serviceId),
          eq(servicePrices.branchId, branchId),
          lte(servicePrices.validFrom, today),
          or(isNull(servicePrices.validTo), sql`${servicePrices.validTo} >= ${today}`),
        ),
      )
      .orderBy(desc(servicePrices.validFrom))
      .limit(1);

    return price ?? null;
  }

  return { list, findById, create, update, remove, setPrice, getActivePrice };
};

export type ServicesService = ReturnType<typeof createServicesService>;
