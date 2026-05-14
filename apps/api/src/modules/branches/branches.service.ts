import { branches } from '@dental/db-schema';
import { and, eq, isNull } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import type { CreateBranchInput, UpdateBranchInput } from './branches.schema.ts';

export const createBranchesService = (deps: { audit: AuditLogger }) => {
  async function list(c: Context) {
    const db = getDb(c);
    return db.select().from(branches).where(isNull(branches.deletedAt)).orderBy(branches.name);
  }

  async function findById(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db
      .select()
      .from(branches)
      .where(and(eq(branches.id, id), isNull(branches.deletedAt)));
    return row ?? null;
  }

  async function create(c: Context, input: CreateBranchInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const [row] = await db
      .insert(branches)
      .values({
        tenantId,
        name: input.name,
        address: input.address ?? null,
        phone: input.phone ?? null,
        workHours: input.workHours ?? null,
      })
      .returning();

    if (row) {
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'branch',
        resourceId: row.id,
        after: row,
      });
    }
    return row;
  }

  async function update(c: Context, id: string, input: UpdateBranchInput) {
    const db = getDb(c);
    const before = await findById(c, id);
    if (!before) return null;

    const [updated] = await db
      .update(branches)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(branches.id, id))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'branch',
        resourceId: id,
        before,
        after: updated,
      });
    }
    return updated;
  }

  /** Soft delete */
  async function remove(c: Context, id: string) {
    const db = getDb(c);
    const before = await findById(c, id);
    if (!before) return null;

    const [updated] = await db
      .update(branches)
      .set({ deletedAt: new Date() })
      .where(eq(branches.id, id))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'deleted',
        resourceType: 'branch',
        resourceId: id,
        before,
        after: { deletedAt: updated.deletedAt },
      });
    }
    return updated;
  }

  return { list, findById, create, update, remove };
};

export type BranchesService = ReturnType<typeof createBranchesService>;
