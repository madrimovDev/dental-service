import {
  appointments,
  labOrders,
  medicalRecords,
  patientImages,
  patients,
  queueTickets,
  treatmentPlans,
  visitNotes,
} from '@dental/db-schema';
import { and, count, desc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { DoctorPendingDto } from './dashboard.schema.ts';

const LIST_LIMIT = 5;
const NOTE_WINDOW_DAYS = 14;
const IMAGE_WINDOW_DAYS = 14;
const PATIENT_WINDOW_DAYS = 30;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

/**
 * Shifokor «mendan kutilmoqda» agregati. Hamma so'rov `doctorId = userId` bilan
 * cheklanadi (boshqa shifokorniki ko'rinmaydi); tenant — RLS.
 *
 * Ta'riflar (hozirgi sxemada «imzolash»/«ko'rildi» holati YO'Q — D4 imzo keyin keladi):
 *  - imzolanmagan vizit yozuvi = shifokorning `in_progress`/`completed` yozilishi
 *    (oxirgi 14 kun), unga bog'langan visit_note hali YO'Q;
 *  - ko'rilmagan rasm = shifokorning oxirgi 30 kundagi bemorlariga boshqa xodim
 *    yuklagan oxirgi 14 kunlik rasm;
 *  - javob kutayotgan reja = shifokorning `presented` rejasi.
 */
export const createDashboardService = () => {
  async function doctorPending(
    c: Context,
    userId: string,
    canViewLab = false,
  ): Promise<DoctorPendingDto> {
    const db = getDb(c);

    const noteWhere = and(
      eq(appointments.doctorId, userId),
      inArray(appointments.status, ['in_progress', 'completed']),
      gte(appointments.startTime, daysAgo(NOTE_WINDOW_DAYS)),
      sql`NOT EXISTS (SELECT 1 FROM ${visitNotes} WHERE ${visitNotes.appointmentId} = ${appointments.id})`,
    );
    const [noteCount] = await db.select({ n: count() }).from(appointments).where(noteWhere);
    const noteRows = await db
      .select({
        id: appointments.id,
        patientId: patients.id,
        name: patients.fullName,
        at: appointments.startTime,
      })
      .from(appointments)
      .innerJoin(patients, eq(patients.id, appointments.patientId))
      .where(noteWhere)
      .orderBy(desc(appointments.startTime))
      .limit(LIST_LIMIT);

    const myPatients = db
      .select({ id: appointments.patientId })
      .from(appointments)
      .where(
        and(
          eq(appointments.doctorId, userId),
          ne(appointments.status, 'cancelled'),
          gte(appointments.startTime, daysAgo(PATIENT_WINDOW_DAYS)),
        ),
      );
    const imageWhere = and(
      inArray(patientImages.patientId, myPatients),
      gte(patientImages.createdAt, daysAgo(IMAGE_WINDOW_DAYS)),
      sql`${patientImages.uploadedByUserId} IS DISTINCT FROM ${userId}`,
    );
    const [imageCount] = await db.select({ n: count() }).from(patientImages).where(imageWhere);
    const imageRows = await db
      .select({
        id: patientImages.id,
        patientId: patients.id,
        name: patients.fullName,
        at: patientImages.createdAt,
      })
      .from(patientImages)
      .innerJoin(patients, eq(patients.id, patientImages.patientId))
      .where(imageWhere)
      .orderBy(desc(patientImages.createdAt))
      .limit(LIST_LIMIT);

    const planWhere = and(
      eq(treatmentPlans.doctorId, userId),
      eq(treatmentPlans.status, 'presented'),
    );
    const [planCount] = await db.select({ n: count() }).from(treatmentPlans).where(planWhere);
    const planRows = await db
      .select({
        id: treatmentPlans.id,
        patientId: patients.id,
        name: patients.fullName,
        at: treatmentPlans.updatedAt,
      })
      .from(treatmentPlans)
      .innerJoin(patients, eq(patients.id, treatmentPlans.patientId))
      .where(planWhere)
      .orderBy(treatmentPlans.updatedAt)
      .limit(LIST_LIMIT);
    const oldest = planRows[0]?.at;

    const toItems = (rows: Array<{ id: string; patientId: string; name: string; at: Date }>) =>
      rows.map((r) => ({
        id: r.id,
        patientId: r.patientId,
        patientName: r.name,
        at: r.at.toISOString(),
      }));

    // Keyingi bemor: bugungi birinchi kelgusi (scheduled/confirmed) yozilish + klinik kontekst.
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const [next] = await db
      .select({
        id: appointments.id,
        patientId: patients.id,
        name: patients.fullName,
        dob: patients.dateOfBirth,
        startTime: appointments.startTime,
      })
      .from(appointments)
      .innerJoin(patients, eq(patients.id, appointments.patientId))
      .where(
        and(
          eq(appointments.doctorId, userId),
          inArray(appointments.status, ['scheduled', 'confirmed']),
          gte(appointments.startTime, dayStart),
          lt(appointments.startTime, dayEnd),
        ),
      )
      .orderBy(appointments.startTime)
      .limit(1);

    let nextPatient: DoctorPendingDto['nextPatient'] = null;
    if (next) {
      const [ticket] = await db
        .select({ id: queueTickets.id, createdAt: queueTickets.createdAt })
        .from(queueTickets)
        .where(and(eq(queueTickets.appointmentId, next.id), eq(queueTickets.status, 'waiting')))
        .limit(1);
      const [record] = await db
        .select({ allergies: medicalRecords.allergies })
        .from(medicalRecords)
        .where(eq(medicalRecords.patientId, next.patientId))
        .limit(1);
      const [visit] = await db
        .select({
          date: visitNotes.visitDate,
          subjective: visitNotes.subjective,
          plan: visitNotes.plan,
        })
        .from(visitNotes)
        .where(eq(visitNotes.patientId, next.patientId))
        .orderBy(desc(visitNotes.visitDate))
        .limit(1);
      let lab: NonNullable<DoctorPendingDto['nextPatient']>['lab'] = null;
      if (canViewLab) {
        const [l] = await db
          .select({
            orderType: labOrders.orderType,
            labName: labOrders.labName,
            status: labOrders.status,
            items: labOrders.items,
            updatedAt: labOrders.updatedAt,
          })
          .from(labOrders)
          .where(and(eq(labOrders.patientId, next.patientId), ne(labOrders.status, 'cancelled')))
          .orderBy(desc(labOrders.updatedAt))
          .limit(1);
        if (l) {
          const it = l.items?.[0];
          const detail = [it?.material, it?.shade].filter(Boolean).join(', ');
          lab = {
            orderType: l.orderType,
            labName: l.labName,
            status: l.status,
            detail: detail || null,
            at: l.updatedAt.toISOString(),
          };
        }
      }
      nextPatient = {
        appointmentId: next.id,
        patientId: next.patientId,
        patientName: next.name,
        startTime: next.startTime.toISOString(),
        dateOfBirth: next.dob ?? null,
        waitingMinutes: ticket
          ? Math.max(0, Math.floor((Date.now() - ticket.createdAt.getTime()) / 60_000))
          : null,
        queueTicketId: ticket?.id ?? null,
        allergies: (record?.allergies ?? []).map((a) => ({
          substance: a.substance,
          severity: a.severity,
        })),
        lab,
        lastVisit: visit
          ? {
              date: visit.date.toISOString(),
              summary: (visit.subjective ?? visit.plan ?? '').slice(0, 120) || null,
            }
          : null,
      };
    }

    return {
      nextPatient,
      unsignedVisitNotes: { count: noteCount?.n ?? 0, items: toItems(noteRows) },
      unreviewedImages: { count: imageCount?.n ?? 0, items: toItems(imageRows) },
      plansAwaitingResponse: {
        count: planCount?.n ?? 0,
        oldestDays: oldest ? Math.floor((Date.now() - oldest.getTime()) / 86_400_000) : null,
        items: toItems(planRows),
      },
    };
  }
  return { doctorPending };
};
export type DashboardService = ReturnType<typeof createDashboardService>;
