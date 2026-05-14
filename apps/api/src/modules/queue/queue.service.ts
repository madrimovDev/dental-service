import { queueTickets } from '@dental/db-schema';
import { and, asc, eq, gte, max, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import type { CreateQueueTicketInput, UpdateQueueStatusInput } from './queue.schema.ts';

export const createQueueService = (deps: { audit: AuditLogger }) => {
  /** Today's queue for a branch */
  async function todayList(c: Context, branchId: string) {
    const db = getDb(c);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    return db
      .select()
      .from(queueTickets)
      .where(and(eq(queueTickets.branchId, branchId), gte(queueTickets.ticketDate, todayStart)))
      .orderBy(asc(queueTickets.queueNumber));
  }

  async function nextNumber(c: Context, branchId: string): Promise<number> {
    const db = getDb(c);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [row] = await db
      .select({ max: max(queueTickets.queueNumber) })
      .from(queueTickets)
      .where(and(eq(queueTickets.branchId, branchId), gte(queueTickets.ticketDate, todayStart)));

    return (row?.max ?? 0) + 1;
  }

  async function create(c: Context, input: CreateQueueTicketInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const [maxRow] = await tx
        .select({ max: max(queueTickets.queueNumber) })
        .from(queueTickets)
        .where(
          and(eq(queueTickets.branchId, input.branchId), gte(queueTickets.ticketDate, todayStart)),
        );

      const queueNumber = (maxRow?.max ?? 0) + 1;

      const [ticket] = await tx
        .insert(queueTickets)
        .values({
          tenantId,
          branchId: input.branchId,
          patientId: input.patientId ?? null,
          serviceId: input.serviceId ?? null,
          queueNumber,
        })
        .returning();

      if (!ticket) throw new Error('Queue insert failed');

      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'queue_ticket',
        resourceId: ticket.id,
        after: { queueNumber },
      });

      return ticket;
    });
  }

  async function updateStatus(c: Context, id: string, input: UpdateQueueStatusInput) {
    const db = getDb(c);
    const [before] = await db.select().from(queueTickets).where(eq(queueTickets.id, id));
    if (!before) return null;

    const now = new Date();
    const patch: Record<string, unknown> = { status: input.status };
    if (input.doctorId) patch.doctorId = input.doctorId;
    if (input.status === 'in_progress') patch.calledAt = now;
    if (input.status === 'done' || input.status === 'missed') patch.finishedAt = now;

    const [updated] = await db
      .update(queueTickets)
      .set(patch)
      .where(eq(queueTickets.id, id))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'status_changed',
        resourceType: 'queue_ticket',
        resourceId: id,
        before: { status: before.status },
        after: { status: input.status },
      });
    }
    return updated;
  }

  return { todayList, nextNumber, create, updateStatus };
};

export type QueueService = ReturnType<typeof createQueueService>;
