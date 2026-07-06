import { serviceCategories, services } from '@dental/db-schema';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import type {
  CreateServiceCategoryInput,
  UpdateServiceCategoryInput,
} from './service-categories.schema.ts';

export const SERVICE_CATEGORY_IN_USE = 'service_category.in_use';
export const SERVICE_CATEGORY_DUPLICATE = 'service_category.duplicate';

export const createServiceCategoriesService = (deps: { audit: AuditLogger }) => {
  async function list(c: Context) {
    const db = getDb(c);
    return db.select().from(serviceCategories).orderBy(serviceCategories.name);
  }

  async function findByNameCI(c: Context, name: string) {
    const db = getDb(c);
    const [row] = await db
      .select()
      .from(serviceCategories)
      .where(sql`lower(${serviceCategories.name}) = lower(${name})`)
      .limit(1);
    return row ?? null;
  }

  async function create(c: Context, input: CreateServiceCategoryInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const existing = await findByNameCI(c, input.name.trim());
    if (existing) return { error: SERVICE_CATEGORY_DUPLICATE };

    const [row] = await db
      .insert(serviceCategories)
      .values({ tenantId, name: input.name.trim(), nameRu: input.nameRu ?? null })
      .returning();
    if (!row) throw new Error('Service category insert failed');

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'service_category',
      resourceId: row.id,
      after: row,
    });
    return { row };
  }

  async function update(c: Context, id: string, input: UpdateServiceCategoryInput) {
    const db = getDb(c);
    const [before] = await db.select().from(serviceCategories).where(eq(serviceCategories.id, id));
    if (!before) return { notFound: true as const };

    const [row] = await db
      .update(serviceCategories)
      .set({
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.nameRu !== undefined ? { nameRu: input.nameRu } : {}),
        updatedAt: new Date(),
      })
      .where(eq(serviceCategories.id, id))
      .returning();

    if (row) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'service_category',
        resourceId: id,
        before,
        after: row,
      });
    }
    return { row };
  }

  async function remove(c: Context, id: string) {
    const db = getDb(c);
    const [before] = await db.select().from(serviceCategories).where(eq(serviceCategories.id, id));
    if (!before) return { notFound: true as const };

    const [{ value: inUse } = { value: 0 }] = await db
      .select({ value: count() })
      .from(services)
      .where(and(eq(services.categoryId, id), isNull(services.deletedAt)));
    if (inUse > 0) return { error: SERVICE_CATEGORY_IN_USE };

    await db.delete(serviceCategories).where(eq(serviceCategories.id, id));
    await deps.audit.record(c, {
      action: 'deleted',
      resourceType: 'service_category',
      resourceId: id,
      before,
    });
    return { row: before };
  }

  /** Xizmat formasidan kelgan nom bo'yicha topadi yoki yaratadi → category id. */
  async function findOrCreateByName(c: Context, name: string): Promise<string> {
    const trimmed = name.trim();
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const existing = await findByNameCI(c, trimmed);
    if (existing) return existing.id;

    const [row] = await db
      .insert(serviceCategories)
      .values({ tenantId, name: trimmed })
      .returning({ id: serviceCategories.id });
    if (!row) throw new Error('Service category insert failed');

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'service_category',
      resourceId: row.id,
      after: { name: trimmed },
    });
    return row.id;
  }

  return { list, create, update, remove, findOrCreateByName };
};

export type ServiceCategoriesService = ReturnType<typeof createServiceCategoriesService>;
