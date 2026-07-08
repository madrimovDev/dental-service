import { prescriptions } from '@dental/db-schema';
import { and, desc, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { createOwnershipValidator, type OwnershipValidator } from '../../lib/ownership.ts';
import type { CreatePrescriptionInput, UpdatePrescriptionInput } from './prescriptions.schema.ts';

export const createPrescriptionsService = (deps: {
  audit: AuditLogger;
  ownership?: OwnershipValidator;
}) => {
  const ownership = deps.ownership ?? createOwnershipValidator();
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
        after: { patientId: input.patientId, itemCount: input.items.length },
      });
    }
    return row;
  }

  async function update(c: Context, id: string, input: UpdatePrescriptionInput) {
    const db = getDb(c);
    const [before] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
    if (!before) return null;

    // CLI-421: cross-entity ownership — patientId o'zgармаydi (update schema omit
    // qiladi), shu sabab before.patientId'ga nisbatan tekshiramiz. Faqat yuborilgan
    // maydonlar (visit-notes.service.ts::update() bilan bir xil naqsh).
    if (input.doctorId) await ownership.assertUserExists(c, input.doctorId);
    if (input.visitNoteId)
      await ownership.assertVisitNoteBelongsToPatient(c, input.visitNoteId, before.patientId);

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
        after: row,
      });
    }
    return row;
  }

  async function remove(c: Context, id: string) {
    const db = getDb(c);
    const [before] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
    if (!before) return null;

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
