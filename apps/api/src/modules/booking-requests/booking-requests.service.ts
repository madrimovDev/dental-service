import type { Context } from 'hono';
import { onAfterCommit } from '../../db/after-commit.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { BOOKING_SLOT_MINUTES } from '../../lib/telegram/booking.ts';
import type { PatientMessenger } from '../../lib/telegram/notify.ts';
import { AppointmentTransitionError } from '../appointments/appointments.transitions.ts';
import type { AppointmentsService } from '../appointments/index.ts';
import { toBookingRequestDto } from './booking-requests.mapper.ts';
import {
  BOOKING_REQUEST_TTL_MS,
  createBookingRequestsRepository,
  expireStaleBookingRequests,
} from './booking-requests.repository.ts';
import type { ListBookingRequestsQuery } from './booking-requests.schema.ts';

export type BookingRequestError =
  | 'not_found'
  | 'booking_request.not_pending'
  | 'booking_request.expired'
  | 'booking_request.doctor_required'
  | string;

/** Appointment yaratish rad etilganda 409 (slot/jadval to'qnashuvi) yoki 400. */
const isConflictCode = (code: string) =>
  code.startsWith('conflict.') || code.startsWith('schedule.') || code === 'time.in_past';

export const createBookingRequestsService = (deps: {
  audit: AuditLogger;
  appointments: Pick<AppointmentsService, 'create' | 'update'>;
  messenger?: PatientMessenger;
  repository?: ReturnType<typeof createBookingRequestsRepository>;
}) => {
  const repo = deps.repository ?? createBookingRequestsRepository();

  async function list(c: Context, query: ListBookingRequestsQuery, now: Date = new Date()) {
    // Lazy expiry — RLS tx ichida faqat shu tenant (taymer — barcha tenantlar uchun alohida).
    const db = c.get('db');
    if (db) await expireStaleBookingRequests(db, now);
    const [rows, pendingCount] = await Promise.all([
      repo.list(c, query.status),
      repo.pendingCount(c),
    ]);
    return { items: rows.map(toBookingRequestDto), pendingCount };
  }

  async function confirm(
    c: Context,
    id: string,
    input: { doctorId?: string },
    now: Date = new Date(),
  ): Promise<
    | { ok: true; id: string; status: 'confirmed'; appointmentId: string }
    | { ok: false; code: BookingRequestError; conflict: boolean }
  > {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');
    const row = await repo.findById(c, id, { lock: true });
    if (!row) return { ok: false, code: 'not_found', conflict: false };
    if (row.status !== 'pending') {
      return { ok: false, code: 'booking_request.not_pending', conflict: true };
    }
    if (row.createdAt.getTime() < now.getTime() - BOOKING_REQUEST_TTL_MS) {
      await repo.markExpired(c, id);
      return { ok: false, code: 'booking_request.expired', conflict: true };
    }
    const doctorId = input.doctorId ?? row.doctorId;
    if (!doctorId) {
      return { ok: false, code: 'booking_request.doctor_required', conflict: false };
    }

    const start = row.requestedStart;
    const end = new Date(start.getTime() + BOOKING_SLOT_MINUTES * 60_000);
    // Slot band bo'lib qolgan bo'lsa (conflict/schedule/o'tmish) — 409 va so'rov
    // `pending` QOLADI (registrator boshqa vaqt/shifokor tanlay oladi yoki rad etadi).
    const res = await deps.appointments.create(c, {
      branchId: row.branchId,
      patientId: row.patientId,
      doctorId,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      serviceIds: row.serviceId ? [row.serviceId] : [],
    });
    if (!res.ok) return { ok: false, code: res.code, conflict: isConflictCode(res.code) };

    const decided = await repo.markDecided(c, id, {
      status: 'confirmed',
      decidedBy: c.get('user')?.id ?? null,
      appointmentId: res.appointment.id,
    });
    if (!decided) return { ok: false, code: 'booking_request.not_pending', conflict: true };

    // «Boshqa vaqt» — eski yozilish yangisiga almashtiriladi.
    if (row.rescheduleOfAppointmentId) {
      try {
        await deps.appointments.update(c, row.rescheduleOfAppointmentId, {
          status: 'cancelled',
          cancellationReason: 'rescheduled_via_telegram',
        });
      } catch (err) {
        if (!(err instanceof AppointmentTransitionError)) throw err;
        // Eski yozilish allaqachon yopilgan (completed/cancelled) — e'tiborsiz.
      }
    }

    await deps.audit.record(c, {
      action: 'confirmed',
      resourceType: 'booking_request',
      resourceId: id,
      after: { appointmentId: res.appointment.id, patientId: row.patientId },
    });

    const messenger = deps.messenger;
    if (messenger) {
      await onAfterCommit(c, () =>
        messenger.sendBookingDecision({
          tenantId,
          patientId: row.patientId,
          decision: 'confirmed',
          start,
        }),
      );
    }
    return { ok: true, id, status: 'confirmed', appointmentId: res.appointment.id };
  }

  async function decline(c: Context, id: string, input: { reason: string }) {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');
    const row = await repo.findById(c, id, { lock: true });
    if (!row) return { ok: false as const, code: 'not_found' };
    if (row.status !== 'pending') {
      return { ok: false as const, code: 'booking_request.not_pending' };
    }
    const decided = await repo.markDecided(c, id, {
      status: 'declined',
      decidedBy: c.get('user')?.id ?? null,
      declineReason: input.reason,
    });
    if (!decided) return { ok: false as const, code: 'booking_request.not_pending' };

    await deps.audit.record(c, {
      action: 'declined',
      resourceType: 'booking_request',
      resourceId: id,
      after: { reason: input.reason, patientId: row.patientId },
    });
    const messenger = deps.messenger;
    if (messenger) {
      await onAfterCommit(c, () =>
        messenger.sendBookingDecision({
          tenantId,
          patientId: row.patientId,
          decision: 'declined',
          start: row.requestedStart,
          reason: input.reason,
        }),
      );
    }
    return { ok: true as const, id, status: 'declined' as const };
  }

  return { list, confirm, decline };
};

export type BookingRequestsService = ReturnType<typeof createBookingRequestsService>;
