import {
  appointments,
  patients,
  treatmentPlans,
  treatmentStages,
  userAssignments,
  visitNotes,
} from '@dental/db-schema';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../db/scoped.ts';

/**
 * CLI-421 — cross-entity ownership validator (in-tenant).
 *
 * Tenant-scoped jadvallar RLS bilan himoyalangan, LEKIN FK constraint RLS'ni chetlab
 * o'tadi: `visit_notes.stage_id` ga FK yozganda Postgres faqat satr mavjudligini
 * tekshiradi — cross-tenant UUID ham, bir tenant ichida BOSHQA bemorning entity'si
 * ham qabul qilinadi. Bu validator har havolani `getDb(c)` (RLS-scoped) select bilan
 * tekshiradi:
 *   - cross-tenant UUID → RLS bo'sh select → 'not_found'
 *   - mixed-patient (bir tenant, boshqa bemor) → satr keladi, patientId mos kelmaydi → 'mismatch'
 *
 * Ikkala holat ham NOTO'G'RI request body → routes 400 (`ownership.*`), 404 EMAS.
 */
export class CrossEntityError extends Error {
  constructor(
    readonly entity: string,
    readonly reason: 'not_found' | 'mismatch',
    message?: string,
  ) {
    super(message ?? `Ownership check failed for ${entity}: ${reason}`);
    this.name = 'CrossEntityError';
  }
}

export const createOwnershipValidator = () => {
  async function assertPatientExists(c: Context, patientId: string): Promise<void> {
    const db = getDb(c);
    const [row] = await db
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);
    if (!row) throw new CrossEntityError('patient', 'not_found');
  }

  /**
   * doctorId platform-level (`users`da tenant_id YO'Q, CLAUDE.md §3.1). Shu sabab
   * "bu tenantda aktiv assignment'i bormi" tekshiruvi — user_assignments RLS-scoped.
   */
  async function assertUserExists(c: Context, userId: string): Promise<void> {
    const db = getDb(c);
    const [row] = await db
      .select({ id: userAssignments.id })
      .from(userAssignments)
      .where(and(eq(userAssignments.userId, userId), eq(userAssignments.isActive, true)))
      .limit(1);
    if (!row) throw new CrossEntityError('user', 'not_found');
  }

  async function assertStageBelongsToPatient(
    c: Context,
    stageId: string,
    patientId: string,
  ): Promise<void> {
    const db = getDb(c);
    const [row] = await db
      .select({ patientId: treatmentPlans.patientId })
      .from(treatmentStages)
      .innerJoin(treatmentPlans, eq(treatmentStages.treatmentPlanId, treatmentPlans.id))
      .where(eq(treatmentStages.id, stageId))
      .limit(1);
    if (!row) throw new CrossEntityError('stage', 'not_found');
    if (row.patientId !== patientId) throw new CrossEntityError('stage', 'mismatch');
  }

  async function assertVisitNoteBelongsToPatient(
    c: Context,
    visitNoteId: string,
    patientId: string,
  ): Promise<void> {
    const db = getDb(c);
    const [row] = await db
      .select({ patientId: visitNotes.patientId })
      .from(visitNotes)
      .where(eq(visitNotes.id, visitNoteId))
      .limit(1);
    if (!row) throw new CrossEntityError('visit_note', 'not_found');
    if (row.patientId !== patientId) throw new CrossEntityError('visit_note', 'mismatch');
  }

  async function assertAppointmentBelongsToPatient(
    c: Context,
    appointmentId: string,
    patientId: string,
  ): Promise<void> {
    const db = getDb(c);
    const [row] = await db
      .select({ patientId: appointments.patientId })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);
    if (!row) throw new CrossEntityError('appointment', 'not_found');
    if (row.patientId !== patientId) throw new CrossEntityError('appointment', 'mismatch');
  }

  return {
    assertPatientExists,
    assertUserExists,
    assertStageBelongsToPatient,
    assertVisitNoteBelongsToPatient,
    assertAppointmentBelongsToPatient,
  };
};

export type OwnershipValidator = ReturnType<typeof createOwnershipValidator>;
