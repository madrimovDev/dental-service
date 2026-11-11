import {
  appointments,
  patientImages,
  patients,
  treatmentPlans,
  visitNotes,
} from '@dental/db-schema';
import { and, count, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';
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
  async function doctorPending(c: Context, userId: string): Promise<DoctorPendingDto> {
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

    return {
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
