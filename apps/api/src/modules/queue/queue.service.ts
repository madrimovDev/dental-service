import { appointments, queueTickets } from '@dental/db-schema';
import { and, asc, eq, gte, isNull, lt, max, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { CLINIC_TZ } from '../../lib/sms-templates.ts';
import type { AppointmentsService } from '../appointments/appointments.service.ts';
import { AppointmentTransitionError } from '../appointments/appointments.transitions.ts';
import type { CreateQueueTicketInput, UpdateQueueStatusInput } from './queue.schema.ts';
import { assertQueueTransition, type QueueTicketStatus } from './queue.transitions.ts';

/**
 * CLI-425: queue done→completed shared completion path uchun narrow dep. app.ts
 * appointmentsService'ni bir marta qurib queue'ga uzatadi (HANDOFF — app.ts
 * wiring). Inject qilinmagan bo'lsa legacy to'g'ridan-to'g'ri db.update yo'liga
 * qaytadi (backward-safe; lekin recall/preventive hook OTLAMAYDI).
 */
type QueueAppointmentSync = Pick<AppointmentsService, 'update'>;

/**
 * A5 (CLI-438): tiket yaratishда linked appointment validatsiyasi otadigan xato.
 * `create()`ning muvaffaqiyatli qaytish shakli (tiket to'g'ridan qaytadi, mavjud
 * chaqiruvchilar/testlar bilan izchil) o'zgarmasin deb throw-based — appointments
 * modulidagi `AppointmentTransitionError` naqshi bilan bir xil (routes try/catch).
 */
export class QueueValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'QueueValidationError';
  }
}

/**
 * A4 (CLI-438): navbat "kun"i — Tashkent (UTC+5) yarim tunida boshlanadi, UTC
 * yarim tunida EMAS. Eski kod `setUTCHours(0,0,0,0)` ishlatardi (= 05:00
 * Tashkent'da reset) — 00:00–05:00 orasidagi tiketlar kechagi ketma-ketlikni
 * davom ettirar edi, check-in oynasi siljigan edi. `${dateStr}T00:00:00+05:00`
 * anchor — schedule.availability.ts/recalls.service.ts bilan izchil pattern
 * (Qaror #22, fixed offset, DST yo'q).
 */
function tashkentDayStart(now: Date = new Date()): Date {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${dateStr}T00:00:00+05:00`);
}

export const createQueueService = (deps: {
  audit: AuditLogger;
  appointments?: QueueAppointmentSync;
}) => {
  /** Today's queue for a branch */
  async function todayList(c: Context, branchId: string) {
    const db = getDb(c);
    const todayStart = tashkentDayStart();

    return db
      .select()
      .from(queueTickets)
      .where(and(eq(queueTickets.branchId, branchId), gte(queueTickets.ticketDate, todayStart)))
      .orderBy(asc(queueTickets.queueNumber));
  }

  async function nextNumber(c: Context, branchId: string): Promise<number> {
    const db = getDb(c);
    const todayStart = tashkentDayStart();

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

      // CLI-457: navbat raqami race condition — `MAX(queueNumber)+1` qulfsiz
      // hisoblanardi. `ticketDate` mikrosekund-aniq `defaultNow()` bo'lgani uchun
      // `UNIQUE(tenantId,branchId,ticketDate,queueNumber)` deyarli hech qachon
      // to'qnashmaydi — parallel so'rovlar bir xil MAX'ni ko'rib bir xil
      // queueNumber olishi mumkin edi. `SELECT ... FOR UPDATE` bu yerda ishlamaydi
      // (a) aggregat `MAX()` bilan FOR UPDATE Postgres'da taqiqlangan, (b) kunning
      // BIRINCHI tiketida qulflanadigan qator umuman yo'q (phantom insert).
      // Transaction-scoped advisory lock — tenant+branch+kun bo'yicha — ikkinchi
      // parallel so'rovni birinchisi commit bo'lguncha kutkazadi (avto-bo'shaydi,
      // RLS'dan mustaqil, boshqa tenant/branch/kun bilan to'qnashmaydi).
      const lockDay = tashkentDayStart().toISOString().slice(0, 10);
      const lockKey = `queue-ticket:${tenantId}:${input.branchId}:${lockDay}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

      // A5 (CLI-438): linked appointment validatsiyasi — mavjudlik + branch/
      // patient mosligi + status (cancelled emas) + dublikat-ochiq-tiket rad.
      // Ilgari bular tekshirilmasdi (dedupe faqat candidates query'da, create'da
      // emas edi).
      if (input.appointmentId) {
        const [appt] = await tx
          .select({
            id: appointments.id,
            branchId: appointments.branchId,
            patientId: appointments.patientId,
            status: appointments.status,
          })
          .from(appointments)
          .where(eq(appointments.id, input.appointmentId));

        if (!appt) throw new QueueValidationError('appointment.not_found');
        if (appt.branchId !== input.branchId) {
          throw new QueueValidationError('appointment.branch_mismatch');
        }
        if (input.patientId && appt.patientId !== input.patientId) {
          throw new QueueValidationError('appointment.patient_mismatch');
        }
        if (appt.status === 'cancelled') {
          throw new QueueValidationError('appointment.cancelled');
        }

        const [existingOpen] = await tx
          .select({ id: queueTickets.id })
          .from(queueTickets)
          .where(
            and(
              eq(queueTickets.appointmentId, input.appointmentId),
              sql`${queueTickets.status} in ('waiting','in_progress')`,
            ),
          )
          .limit(1);
        if (existingOpen) throw new QueueValidationError('queue.duplicate_ticket');
      }

      const todayStart = tashkentDayStart();

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

    // A6 (CLI-438): state-machine guard — istalgan status→status ilgari mumkin
    // edi (mas. done→waiting). Noto'g'ri o'tish → throw (routes 400ga aylantiradi).
    assertQueueTransition(before.status as QueueTicketStatus, input.status as QueueTicketStatus);

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
        if (deps.appointments) {
          // CLI-425: shared completion path — appointmentsService.update() bir
          // marta preventive-recall hook, state-machine guard (CLI-409), reminder
          // cleanup va audit'ni bajaradi. Terminal/invalid o'tish (mas. cancelled→
          // completed) AppointmentTransitionError otadi — bu queue ticket'ni buzmasin:
          // yutamiz (appointment o'z terminal/cancelled holatida qoladi, ticket done).
          try {
            if (apptStatus === 'completed') {
              // Navbatда 'waiting'→'done' TO'G'RIDAN-TO'G'RI ruxsat (A6 — tez
              // checkout), lekin appointment darajasida 'scheduled'→'completed'
              // bevosita TAQIQLANGAN (CLI-409 matritsasi faqat in_progress→
              // completed'ga ruxsat beradi). Avval 'in_progress'ga o'tkazamiz —
              // allaqachon shu yoki keyingi holatda bo'lsa (idempotent 2-chaqiruv)
              // bu qadam AppointmentTransitionError beradi, xavfsiz e'tiborsiz
              // qoldiriladi.
              try {
                await deps.appointments.update(c, before.appointmentId, {
                  status: 'in_progress',
                });
              } catch (e) {
                if (!(e instanceof AppointmentTransitionError)) throw e;
              }
            }
            await deps.appointments.update(c, before.appointmentId, { status: apptStatus });
          } catch (e) {
            if (!(e instanceof AppointmentTransitionError)) throw e;
          }
        } else {
          // Legacy fallback (app.ts hali appointmentsService'ni ulamaguncha) —
          // terminal holatni qayta yozmaslik + qo'lda audit. ⚠️ recall hook OTLAMAYDI.
          const [appt] = await db
            .select({ id: appointments.id, status: appointments.status })
            .from(appointments)
            .where(eq(appointments.id, before.appointmentId));

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
    const todayStart = tashkentDayStart();
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

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

  /**
   * A6 (CLI-438): kun oxiri no-show sweep — o'tgan kun(lar)dagi hal qilinmagan
   * (waiting/in_progress) tiketlarni `missed`ga o'tkazadi. ⚠️ Cron/repeatable
   * job registratsiyasi (`lib/queue.ts` + `index.ts` — bu agent egaligidan
   * tashqari) hali ULANMAGAN; bu funksiya + `POST /queue/sweep-no-shows` route
   * (queue.manage) qo'lda yoki kelajakdagi wiring uchun tayyor. Faqat BUGUNDAN
   * OLDINGI tiketlar (bugungi hali kutayotgan tiketlar tegilmaydi — kun hali
   * tugamagan).
   *
   * MUHIM: `reports.service.ts` `noShowRate`'ni `appointments.status = 'no_show'`
   * bo'yicha hisoblaydi (queue_ticket status'i EMAS). Shuning uchun bulk
   * `UPDATE queue_tickets` YETARLI EMAS — har tiket `updateStatus()` orqali
   * o'tkaziladi, bu allaqachon (a) state-machine'ni tekshiradi, (b) bog'langan
   * appointment'ni `no_show`ga sinxronlaydi (shared completion path, CLI-425
   * bilan bir xil), (c) audit yozadi. Bulk raw UPDATE bu sinxronizatsiyani
   * chetlab o'tib, noShowRate'ni O'ZGARTIRMAS edi (A6'ning ikkinchi qabul
   * mezoni buzilardi).
   */
  async function sweepNoShows(c: Context, branchId?: string) {
    const db = getDb(c);
    const todayStart = tashkentDayStart();

    const filters = [
      lt(queueTickets.ticketDate, todayStart),
      sql`${queueTickets.status} in ('waiting','in_progress')`,
    ];
    if (branchId) filters.push(eq(queueTickets.branchId, branchId));

    const stale = await db
      .select({ id: queueTickets.id })
      .from(queueTickets)
      .where(and(...filters));

    let swept = 0;
    for (const ticket of stale) {
      const updated = await updateStatus(c, ticket.id, { status: 'missed' });
      if (updated) swept++;
    }
    return swept;
  }

  return { todayList, nextNumber, create, updateStatus, checkInCandidates, sweepNoShows };
};

export type QueueService = ReturnType<typeof createQueueService>;
