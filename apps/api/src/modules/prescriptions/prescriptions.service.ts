import {
  type DrugAllergyConflict,
  findDrugAllergyConflicts,
  overrideCoversConflict,
} from '@dental/core';
import { medicalRecords, prescriptions, visitNotes } from '@dental/db-schema';
import { and, desc, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { onAfterCommit } from '../../db/after-commit.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { createOwnershipValidator, type OwnershipValidator } from '../../lib/ownership.ts';
import type { PatientMessenger } from '../../lib/telegram/notify.ts';
import { VisitNoteSignedError } from '../clinical/visit-notes/visit-notes.service.ts';
import type { CreatePrescriptionInput, UpdatePrescriptionInput } from './prescriptions.schema.ts';

/**
 * FX-22 (LA-34): retsept bemor allergiyasiga zid va sababli override yo'q → route 409
 * `prescription.allergy_conflict`. Hech narsa yozilmasdan (insert/update'dan OLDIN) otiladi.
 */
export class AllergyConflictError extends Error {
  constructor(readonly conflicts: DrugAllergyConflict[]) {
    super('Prescription conflicts with a recorded patient allergy');
    this.name = 'AllergyConflictError';
  }
}

export const createPrescriptionsService = (deps: {
  audit: AuditLogger;
  ownership?: OwnershipValidator;
  /** UI-T2: retsept berilganda bemorga Telegram xabari (commit'dan keyin, best-effort). */
  messenger?: PatientMessenger;
}) => {
  const ownership = deps.ownership ?? createOwnershipValidator();

  /**
   * Server tomonda yagona qoida (web bilan bir xil core funksiya). Allergiyani to'g'ridan
   * RLS-bound tx'dan o'qiydi — chaqiruvchida `medical_record.view` bo'lishi shart emas
   * (yozuv bo'lmasa/bo'sh bo'lsa to'qnashuv yo'q).
   */
  async function assertNoUnresolvedAllergyConflict(
    c: Context,
    patientId: string,
    items: Array<{ medicationName: string }>,
    overrides: CreatePrescriptionInput['allergyOverrides'],
  ) {
    const [record] = await getDb(c)
      .select({ allergies: medicalRecords.allergies })
      .from(medicalRecords)
      .where(eq(medicalRecords.patientId, patientId));
    const allergies = record?.allergies;
    if (!Array.isArray(allergies) || allergies.length === 0) return;
    const unresolved: DrugAllergyConflict[] = [];
    for (const item of items) {
      for (const conflict of findDrugAllergyConflicts(item.medicationName, allergies)) {
        if (
          !(overrides ?? []).some((o) => overrideCoversConflict(o, item.medicationName, conflict))
        )
          unresolved.push(conflict);
      }
    }
    if (unresolved.length > 0) throw new AllergyConflictError(unresolved);
  }

  /**
   * FX-154 (LC-32): imzolangan vizit yozuvi o'zgarmas — unga bog'langan retseptni
   * yaratish/o'zgartirish/o'chirish `VisitNoteSignedError` (route → 409 `visit_note.signed`).
   * Hech narsa yozilmasdan OLDIN chaqiriladi.
   */
  async function assertVisitNoteNotSigned(c: Context, visitNoteId: string | null | undefined) {
    if (!visitNoteId) return;
    const [note] = await getDb(c)
      .select({ signedAt: visitNotes.signedAt })
      .from(visitNotes)
      .where(eq(visitNotes.id, visitNoteId));
    if (note?.signedAt) throw new VisitNoteSignedError(visitNoteId);
  }

  async function list(c: Context, patientId?: string) {
    const db = getDb(c);
    const filters = [];
    if (patientId) filters.push(eq(prescriptions.patientId, patientId));
    const rows = await db
      .select()
      .from(prescriptions)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(prescriptions.issuedDate));

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'prescription',
      resourceId: patientId ?? null,
      after: { patientId: patientId ?? null, count: rows.length },
    });
    return rows;
  }

  async function get(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
    if (row) {
      await deps.audit.record(c, {
        action: 'viewed',
        resourceType: 'prescription',
        resourceId: id,
      });
    }
    return row ?? null;
  }

  async function create(c: Context, input: CreatePrescriptionInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    // CLI-421: cross-entity ownership — patientId/doctorId/visitNoteId shu bemorga/tenantga
    // tegishlimi (cross-tenant/mixed UUID → CrossEntityError → routes 400).
    await ownership.assertPatientExists(c, input.patientId);
    await ownership.assertUserExists(c, input.doctorId);
    if (input.visitNoteId)
      await ownership.assertVisitNoteBelongsToPatient(c, input.visitNoteId, input.patientId);
    await assertVisitNoteNotSigned(c, input.visitNoteId);
    await assertNoUnresolvedAllergyConflict(
      c,
      input.patientId,
      input.items,
      input.allergyOverrides,
    );

    const [row] = await db
      .insert(prescriptions)
      .values({
        tenantId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        visitNoteId: input.visitNoteId ?? null,
        issuedDate: input.issuedDate ? new Date(input.issuedDate) : new Date(),
        items: input.items,
        diagnosis: input.diagnosis ?? null,
        notes: input.notes ?? null,
      })
      .returning();

    if (row) {
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'prescription',
        resourceId: row.id,
        after: {
          patientId: input.patientId,
          itemCount: input.items.length,
          // FX-22: sabab bilan o'tilgan allergiya to'qnashuvlari (audit izi).
          ...(input.allergyOverrides?.length ? { allergyOverrides: input.allergyOverrides } : {}),
        },
      });
      // FX-123 (LC-01): vizitga bog'langan retsept — xabar vizit imzolanganda ketadi
      // (`visitNotes.sign`); shifokor imzogacha tuzatishi/o'chirishi mumkin. (Imzolangan vizitga
      // yaratish yuqorida rad etilgan, demak bu yerda bog'langan vizit qoralama.)
      const messenger = row.visitNoteId ? undefined : deps.messenger;
      if (messenger) {
        await onAfterCommit(c, () =>
          messenger.sendPrescription({
            tenantId,
            patientId: row.patientId,
            issuedAt: row.issuedDate,
            items: row.items,
          }),
        );
      }
    }
    return row;
  }

  async function update(c: Context, id: string, input: UpdatePrescriptionInput) {
    const db = getDb(c);
    const [before] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
    if (!before) return null;
    await assertVisitNoteNotSigned(c, before.visitNoteId);
    if (input.visitNoteId) await assertVisitNoteNotSigned(c, input.visitNoteId);

    // CLI-421: cross-entity ownership — patientId o'zgармаydi (update schema omit
    // qiladi), shu sabab before.patientId'ga nisbatan tekshiramiz. Faqat yuborilgan
    // maydonlar (visit-notes.service.ts::update() bilan bir xil naqsh).
    if (input.doctorId) await ownership.assertUserExists(c, input.doctorId);
    if (input.visitNoteId)
      await ownership.assertVisitNoteBelongsToPatient(c, input.visitNoteId, before.patientId);
    if (input.items)
      await assertNoUnresolvedAllergyConflict(
        c,
        before.patientId,
        input.items,
        input.allergyOverrides,
      );

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.doctorId) patch.doctorId = input.doctorId;
    if (input.visitNoteId !== undefined) patch.visitNoteId = input.visitNoteId;
    if (input.issuedDate) patch.issuedDate = new Date(input.issuedDate);
    if (input.items) patch.items = input.items;
    if (input.diagnosis !== undefined) patch.diagnosis = input.diagnosis;
    if (input.notes !== undefined) patch.notes = input.notes;

    const [row] = await db
      .update(prescriptions)
      .set(patch)
      .where(eq(prescriptions.id, id))
      .returning();

    if (row) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'prescription',
        resourceId: id,
        before,
        after: input.allergyOverrides?.length
          ? { ...row, allergyOverrides: input.allergyOverrides }
          : row,
      });
    }
    return row;
  }

  async function remove(c: Context, id: string) {
    const db = getDb(c);
    const [before] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
    if (!before) return null;
    await assertVisitNoteNotSigned(c, before.visitNoteId);

    await db.delete(prescriptions).where(eq(prescriptions.id, id));
    await deps.audit.record(c, {
      action: 'deleted',
      resourceType: 'prescription',
      resourceId: id,
      before,
    });
    return before;
  }

  return { list, get, create, update, remove };
};

export type PrescriptionsService = ReturnType<typeof createPrescriptionsService>;
