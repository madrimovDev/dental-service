import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { createVisitNotesRepository } from './visit-notes.repository.ts';
import type { CreateVisitNoteInput, UpdateVisitNoteInput } from './visit-notes.schema.ts';

export const createVisitNotesService = (deps: {
  audit: AuditLogger;
  deductStock?: (c: Context, serviceIds: string[], visitNoteId: string) => Promise<void>;
}) => {
  const repo = createVisitNotesRepository();

  const list = (c: Context, patientId?: string) => repo.list(c, patientId);
  const get = (c: Context, id: string) => repo.find(c, id);

  async function create(c: Context, input: CreateVisitNoteInput) {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const note = await repo.insert(c, {
      tenantId,
      patientId: input.patientId,
      doctorId: input.doctorId,
      appointmentId: input.appointmentId ?? null,
      visitDate: input.visitDate ? new Date(input.visitDate) : new Date(),
      subjective: input.subjective ?? null,
      objective: input.objective ?? null,
      assessmentDiagnoses: input.assessmentDiagnoses,
      plan: input.plan ?? null,
      performedServices: input.performedServices,
      freeNotes: input.freeNotes ?? null,
    });

    if (note) {
      // BOM bo'yicha ombor chiqimi (DI) — shu request-tx ichida (RLS tx-bound).
      await deps.deductStock?.(c, input.performedServices ?? [], note.id);
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'visit_note',
        resourceId: note.id,
        after: { patientId: input.patientId, hasSubjective: !!input.subjective },
      });
    }
    return note;
  }

  async function update(c: Context, id: string, input: UpdateVisitNoteInput) {
    const before = await repo.find(c, id);
    if (!before) return null;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.doctorId) patch.doctorId = input.doctorId;
    if (input.appointmentId !== undefined) patch.appointmentId = input.appointmentId;
    if (input.visitDate) patch.visitDate = new Date(input.visitDate);
    if (input.subjective !== undefined) patch.subjective = input.subjective;
    if (input.objective !== undefined) patch.objective = input.objective;
    if (input.assessmentDiagnoses) patch.assessmentDiagnoses = input.assessmentDiagnoses;
    if (input.plan !== undefined) patch.plan = input.plan;
    if (input.performedServices) patch.performedServices = input.performedServices;
    if (input.freeNotes !== undefined) patch.freeNotes = input.freeNotes;

    const updated = await repo.update(c, id, patch);
    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'visit_note',
        resourceId: id,
        before,
        after: updated,
      });
    }
    return updated;
  }

  return { list, get, create, update };
};

export type VisitNotesService = ReturnType<typeof createVisitNotesService>;
