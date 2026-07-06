import { appointments, branches, userAssignments } from '@dental/db-schema';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import type { CreateBranchInput, UpdateBranchInput } from './branches.schema.ts';

/** `remove` natijasi — topilmadi (null), qaramliklar bor, yoki muvaffaqiyat. */
export type RemoveBranchResult =
  | null
  | { ok: false; code: 'branch.has_dependencies' }
  | { ok: true; branch: typeof branches.$inferSelect };

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

  /**
   * Soft delete — referensial guard bilan (CLI-428). Faol xodim assignmentlari yoki
   * kelajakdagi (aktiv) appointmentlar bo'lsa RAD (`branch.has_dependencies`), aks holda
   * soft-delete. Blok (cascade emas): admin avval xodim/yozilishlarni ko'chiradi.
   * RLS tenant'ni filtrlaydi (ikkala jadval tenant-scoped) — explicit tenant WHERE yo'q.
   */
  async function remove(c: Context, id: string): Promise<RemoveBranchResult> {
    const db = getDb(c);
    const before = await findById(c, id);
    if (!before) return null;

    const [{ count: activeAssignments } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userAssignments)
      .where(and(eq(userAssignments.branchId, id), eq(userAssignments.isActive, true)));

    const [{ count: futureAppointments } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(appointments)
      .where(
        and(
          eq(appointments.branchId, id),
          gt(appointments.startTime, new Date()),
          inArray(appointments.status, ['scheduled', 'confirmed', 'in_progress']),
        ),
      );

    if (Number(activeAssignments) > 0 || Number(futureAppointments) > 0) {
      return { ok: false as const, code: 'branch.has_dependencies' };
    }

    const [updated] = await db
      .update(branches)
      .set({ deletedAt: new Date() })
      .where(eq(branches.id, id))
      .returning();

    if (!updated) return null;

    await deps.audit.record(c, {
      action: 'deleted',
      resourceType: 'branch',
      resourceId: id,
      before,
      after: { deletedAt: updated.deletedAt },
    });
    return { ok: true as const, branch: updated };
  }

  return { list, findById, create, update, remove };
};

export type BranchesService = ReturnType<typeof createBranchesService>;
