import {
  appointments,
  branches,
  patients,
  roles,
  services,
  stockItems,
  tenants,
  treatmentPlans,
  treatmentStages,
  userAssignments,
  visitNotes,
} from '@dental/db-schema';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../db/scoped.ts';
import { practitionerAssignmentConditions } from './doctor-branch.ts';

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
    readonly reason: 'not_found' | 'mismatch' | 'not_practitioner',
    message?: string,
  ) {
    super(message ?? `Ownership check failed for ${entity}: ${reason}`);
    this.name = 'CrossEntityError';
  }
}

/**
 * FX-155 (LC-33) — yozuv muallifi (`doctorId`) boshqa shifokor bo'lsa, `*.on_behalf` ruxsati
 * talab qilinadi; yo'q bo'lsa route 403 (`<resource>.on_behalf_forbidden`).
 */
export class OnBehalfForbiddenError extends Error {
  constructor(readonly permission: string) {
    super(`Recording on behalf of another doctor requires '${permission}'`);
    this.name = 'OnBehalfForbiddenError';
  }
}

export const createOwnershipValidator = () => {
  /** X-1: branchId RLS ostida shu tenantda mavjudmi (FK RLS'ni chetlab o'tadi). */
  async function assertBranchExists(c: Context, branchId: string): Promise<void> {
    const db = getDb(c);
    const [row] = await db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.id, branchId))
      .limit(1);
    if (!row) throw new CrossEntityError('branch', 'not_found');
  }

  /** X-1: treatmentPlanId RLS ostida shu tenantda mavjudmi. */
  async function assertTreatmentPlanExists(c: Context, planId: string): Promise<void> {
    const db = getDb(c);
    const [row] = await db
      .select({ id: treatmentPlans.id })
      .from(treatmentPlans)
      .where(eq(treatmentPlans.id, planId))
      .limit(1);
    if (!row) throw new CrossEntityError('treatment_plan', 'not_found');
  }

  /** X-1 (FX-03a): ombor itemId RLS ostida shu tenantda mavjudmi. */
  async function assertStockItemExists(c: Context, itemId: string): Promise<void> {
    const db = getDb(c);
    const [row] = await db
      .select({ id: stockItems.id })
      .from(stockItems)
      .where(eq(stockItems.id, itemId))
      .limit(1);
    if (!row) throw new CrossEntityError('stock_item', 'not_found');
  }

  /** X-1 (FX-03a): serviceId RLS ostida shu tenantda mavjudmi. */
  async function assertServiceExists(c: Context, serviceId: string): Promise<void> {
    const db = getDb(c);
    const [row] = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.id, serviceId))
      .limit(1);
    if (!row) throw new CrossEntityError('service', 'not_found');
  }

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
   * Tenant OWNER uchun carve-out: owner implicit superuser (§3.3), hech qachon
   * `user_assignments` qatoriga ega bo'lishi shart emas (users.service.ts'даgi
   * bir xil `isOwner` pattern — upsertProfile/addAssignment precedenti).
   */
  async function assertUserExists(c: Context, userId: string): Promise<void> {
    const db = getDb(c);
    const activeTenantId: string | null | undefined = c.get('activeTenantId');
    if (activeTenantId) {
      const [tenant] = await db
        .select({ ownerUserId: tenants.ownerUserId })
        .from(tenants)
        .where(eq(tenants.id, activeTenantId));
      if (tenant?.ownerUserId === userId) return;
    }
    const [row] = await db
      .select({ id: userAssignments.id })
      .from(userAssignments)
      .where(
        and(
          eq(userAssignments.userId, userId),
          eq(userAssignments.isActive, true),
          isNotNull(userAssignments.acceptedAt),
        ),
      )
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

  /**
   * FX-117 (LB-26): vizit yozuvi faqat shu yozilish shifokorining yozuvi bo'lishi mumkin —
   * aks holda boshqa shifokorning «Mendan kutilmoqda» bandi yozuvsiz yopilib qoladi.
   */
  async function assertAppointmentDoctor(
    c: Context,
    appointmentId: string,
    doctorId: string,
  ): Promise<void> {
    const db = getDb(c);
    const [row] = await db
      .select({ doctorId: appointments.doctorId })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);
    if (!row) throw new CrossEntityError('appointment', 'not_found');
    if (row.doctorId !== doctorId) {
      throw new CrossEntityError(
        'appointment',
        'mismatch',
        'Appointment belongs to a different doctor than the visit note',
      );
    }
  }

  /**
   * FX-155 (LC-33): klinik yozuv muallifi (`doctorId`) — (1) shu tenantda faol, qabul qilingan
   * `roles.is_practitioner` tayinlovi bor shifokor (tenant OWNER — implicit superuser istisno),
   * (2) joriy foydalanuvchi emas bo'lsa — `onBehalfPermission` (yoki `@owner`) shart.
   * FX-112: lab buyurtma shifokori ham shu tekshiruvdan o'tadi — u yerda `onBehalfPermission`
   * berilmaydi (Technician shifokorni tanlaydi; faqat amaliyotchi ekanligi tekshiriladi).
   */
  async function assertPractitioner(
    c: Context,
    doctorId: string,
    onBehalfPermission?: string,
  ): Promise<void> {
    const db = getDb(c);
    const activeTenantId: string | null | undefined = c.get('activeTenantId');
    let isOwner = false;
    if (activeTenantId) {
      const [tenant] = await db
        .select({ ownerUserId: tenants.ownerUserId })
        .from(tenants)
        .where(eq(tenants.id, activeTenantId));
      isOwner = tenant?.ownerUserId === doctorId;
    }
    if (!isOwner) {
      const [assignment] = await db
        .select({ id: userAssignments.id })
        .from(userAssignments)
        .innerJoin(roles, eq(roles.id, userAssignments.roleId))
        .where(and(eq(userAssignments.userId, doctorId), ...practitionerAssignmentConditions(null)))
        .limit(1);
      if (!assignment) {
        // Tayinlov umuman yo'q → 'not_found' (assertUserExists bilan bir xil); bor, lekin
        // shifokor roli emas → 'not_practitioner'.
        await assertUserExists(c, doctorId);
        throw new CrossEntityError('user', 'not_practitioner');
      }
    }
    const currentUserId: string | undefined = c.get('user')?.id;
    if (onBehalfPermission && doctorId !== currentUserId) {
      const perms: string[] = c.get('accessClaims')?.perms ?? [];
      if (!perms.includes('@owner') && !perms.includes(onBehalfPermission)) {
        throw new OnBehalfForbiddenError(onBehalfPermission);
      }
    }
  }

  return {
    assertBranchExists,
    assertTreatmentPlanExists,
    assertStockItemExists,
    assertServiceExists,
    assertPatientExists,
    assertUserExists,
    assertPractitioner,
    assertStageBelongsToPatient,
    assertVisitNoteBelongsToPatient,
    assertAppointmentBelongsToPatient,
    assertAppointmentDoctor,
  };
};

export type OwnershipValidator = ReturnType<typeof createOwnershipValidator>;
