import { appointments, roles, userAssignments, users } from '@dental/db-schema';
import { and, asc, between, eq, gte, lt, lte, ne, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { reminderDelayMs } from '../../lib/reminder-delay.ts';
import type {
  CreateAppointmentInput,
  ListAppointmentsQuery,
  UpdateAppointmentInput,
} from './appointments.schema.ts';

export const createAppointmentsService = (deps: {
  audit: AuditLogger;
  enqueueReminder?: (tenantId: string, appointmentId: string, delayMs: number) => Promise<void>;
}) => {
  async function checkConflict(
    c: Context,
    doctorId: string,
    start: Date,
    end: Date,
    excludeId?: string,
  ): Promise<boolean> {
    const db = getDb(c);
    const filters = [
      eq(appointments.doctorId, doctorId),
      ne(appointments.status, 'cancelled' as const),
      // Overlap: existing.start < new.end AND existing.end > new.start
      lt(appointments.startTime, end),
      gte(appointments.endTime, start),
    ];
    if (excludeId) filters.push(ne(appointments.id, excludeId));

    const [row] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(...filters))
      .limit(1);

    return !!row;
  }

  async function list(c: Context, query: ListAppointmentsQuery) {
    const db = getDb(c);
    const filters = [];
    if (query.branchId) filters.push(eq(appointments.branchId, query.branchId));
    if (query.doctorId) filters.push(eq(appointments.doctorId, query.doctorId));
    if (query.patientId) filters.push(eq(appointments.patientId, query.patientId));
    if (query.from && query.to) {
      filters.push(between(appointments.startTime, new Date(query.from), new Date(query.to)));
    } else if (query.from) {
      filters.push(gte(appointments.startTime, new Date(query.from)));
    } else if (query.to) {
      filters.push(lte(appointments.startTime, new Date(query.to)));
    }

    return db
      .select()
      .from(appointments)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(asc(appointments.startTime));
  }

  async function getById(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db.select().from(appointments).where(eq(appointments.id, id));
    return row ?? null;
  }

  async function create(c: Context, input: CreateAppointmentInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    const start = new Date(input.startTime);
    const end = new Date(input.endTime);
    if (end <= start) {
      return { ok: false as const, code: 'time.invalid' };
    }

    const conflict = await checkConflict(c, input.doctorId, start, end);
    if (conflict) {
      return { ok: false as const, code: 'conflict.doctor_busy' };
    }

    const [appt] = await db
      .insert(appointments)
      .values({
        tenantId,
        branchId: input.branchId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        assistantId: input.assistantId ?? null,
        startTime: start,
        endTime: end,
        serviceIds: input.serviceIds,
        notes: input.notes ?? null,
        createdBy: user?.id ?? null,
      })
      .returning();

    if (!appt) return { ok: false as const, code: 'insert.failed' };

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'appointment',
      resourceId: appt.id,
      after: appt,
    });

    const delay = reminderDelayMs(start, new Date());
    if (delay != null) await deps.enqueueReminder?.(tenantId, appt.id, delay);

    return { ok: true as const, appointment: appt };
  }

  async function update(c: Context, id: string, input: UpdateAppointmentInput) {
    const db = getDb(c);
    const [before] = await db.select().from(appointments).where(eq(appointments.id, id));
    if (!before) return { ok: false as const, code: 'not_found' };

    // Conflict check if time/doctor changing
    if (input.startTime || input.endTime || input.doctorId) {
      const start = new Date(input.startTime ?? before.startTime);
      const end = new Date(input.endTime ?? before.endTime);
      const doctor = input.doctorId ?? before.doctorId;
      const conflict = await checkConflict(c, doctor, start, end, id);
      if (conflict) return { ok: false as const, code: 'conflict.doctor_busy' };
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.startTime) patch.startTime = new Date(input.startTime);
    if (input.endTime) patch.endTime = new Date(input.endTime);
    if (input.doctorId) patch.doctorId = input.doctorId;
    if (input.assistantId !== undefined) patch.assistantId = input.assistantId;
    if (input.status) patch.status = input.status;
    if (input.serviceIds) patch.serviceIds = input.serviceIds;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.cancellationReason !== undefined) patch.cancellationReason = input.cancellationReason;

    const [updated] = await db
      .update(appointments)
      .set(patch)
      .where(eq(appointments.id, id))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'appointment',
        resourceId: id,
        before,
        after: updated,
      });
    }
    return { ok: true as const, appointment: updated };
  }

  async function cancel(c: Context, id: string, reason?: string) {
    return update(c, id, { status: 'cancelled', cancellationReason: reason });
  }

  /**
   * Joriy tenant'dagi doktor-rolli xodimlar — yozilish wizardi uchun (CLI-154).
   * `appointment.view` bilan ochiq (yengil) — `user.view` (HR `/users/assignments`)
   * o'rniga, shunda Receptionist ham doktorlar ro'yxatini ko'radi.
   * Rol nomi "doctor" o'z ichiga olganlar (`Doctor`, `Doctor + Assistant`) — mavjud
   * frontend deteksiyasi (`roleName.includes('doctor')`) bilan izchil.
   * RLS tenant'ni filtrlaydi; `selectDistinct` bir userni bir nechta filial
   * assignment'idan dedupe qiladi.
   */
  async function listDoctors(c: Context) {
    const db = getDb(c);
    const rows = await db
      .selectDistinct({
        id: users.id,
        fullName: users.fullName,
        phone: users.phone,
      })
      .from(userAssignments)
      .innerJoin(users, eq(users.id, userAssignments.userId))
      .innerJoin(roles, eq(roles.id, userAssignments.roleId))
      .where(and(eq(userAssignments.isActive, true), sql`lower(${roles.name}) like '%doctor%'`))
      .orderBy(users.fullName);

    return rows.map((r) => ({ id: r.id, name: r.fullName ?? r.phone }));
  }

  return { list, getById, create, update, cancel, listDoctors };
};

export type AppointmentsService = ReturnType<typeof createAppointmentsService>;
