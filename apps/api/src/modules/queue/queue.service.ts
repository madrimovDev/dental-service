import { appointments, queueTickets } from '@dental/db-schema';
import { and, asc, eq, gte, isNull, lt, max, sql } from 'drizzle-orm';
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
          appointmentId: input.appointmentId ?? null,
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

    // Appointment status sync (faqat bog'langan ticketlarda)
    if (updated && before.appointmentId) {
      const apptStatus =
        input.status === 'in_progress'
          ? ('in_progress' as const)
          : input.status === 'done'
            ? ('completed' as const)
            : input.status === 'missed'
              ? ('no_show' as const)
              : null;

      if (apptStatus) {
        const [appt] = await db
          .select({ id: appointments.id, status: appointments.status })
          .from(appointments)
          .where(eq(appointments.id, before.appointmentId));

        // Terminal holatni qayta yozmaslik
        if (appt && appt.status !== 'cancelled' && appt.status !== 'completed') {
          await db
            .update(appointments)
            .set({ status: apptStatus, updatedAt: now })
            .where(eq(appointments.id, before.appointmentId));

          await deps.audit.record(c, {
            action: 'status_synced',
            resourceType: 'appointment',
            resourceId: before.appointmentId,
            before: { status: appt.status },
            after: { status: apptStatus },
          });
        }
      }
    }

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

  /** Bugungi scheduled/confirmed appointment'lar, navbatga olinmaganlari. */
  async function checkInCandidates(c: Context, branchId: string) {
    const db = getDb(c);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

    return db
      .select({
        id: appointments.id,
        tenantId: appointments.tenantId,
        branchId: appointments.branchId,
        patientId: appointments.patientId,
        doctorId: appointments.doctorId,
        assistantId: appointments.assistantId,
        startTime: appointments.startTime,
        endTime: appointments.endTime,
        status: appointments.status,
        serviceIds: appointments.serviceIds,
        notes: appointments.notes,
        cancellationReason: appointments.cancellationReason,
        createdAt: appointments.createdAt,
        updatedAt: appointments.updatedAt,
      })
      .from(appointments)
      .leftJoin(queueTickets, eq(queueTickets.appointmentId, appointments.id))
      .where(
        and(
          eq(appointments.branchId, branchId),
          gte(appointments.startTime, todayStart),
          lt(appointments.startTime, todayEnd),
          isNull(queueTickets.id),
          sql`${appointments.status} in ('scheduled','confirmed')`,
        ),
      )
      .orderBy(asc(appointments.startTime));
  }

  return { todayList, nextNumber, create, updateStatus, checkInCandidates };
};

export type QueueService = ReturnType<typeof createQueueService>;
