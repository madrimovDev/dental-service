import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { createOwnershipValidator, type OwnershipValidator } from '../../../lib/ownership.ts';
import { createVisitNotesRepository } from './visit-notes.repository.ts';
import type { CreateVisitNoteInput, UpdateVisitNoteInput } from './visit-notes.schema.ts';

/**
 * C5 (CLI-222) — treatment-plans modulidan inject qilinadigan narrow dep.
 * Bog'liqlik yo'nalishi: visit-notes → treatment-plans (factory injection, to'g'ridan
 * import emas). Bosqichni 'completed' qiladi (C2 guard ichida; skipped→completed RAD).
 */
export type StageCompleteHook = {
  completeStageForVisit: (c: Context, stageId: string) => Promise<unknown>;
};

export const createVisitNotesService = (deps: {
  audit: AuditLogger;
  deductStock?: (c: Context, serviceIds: string[], visitNoteId: string) => Promise<void>;
  completeStage?: StageCompleteHook;
  ownership?: OwnershipValidator;
}) => {
  const repo = createVisitNotesRepository();
  const ownership = deps.ownership ?? createOwnershipValidator();

  const list = async (c: Context, patientId?: string) => {
    const rows = await repo.list(c, patientId);
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'visit_note',
      resourceId: patientId ?? null,
      after: { patientId: patientId ?? null, count: rows.length },
    });
    return rows;
  };

  const get = async (c: Context, id: string) => {
    const note = await repo.find(c, id);
    if (note) {
      await deps.audit.record(c, {
        action: 'viewed',
        resourceType: 'visit_note',
        resourceId: id,
      });
    }
    return note;
  };

  async function create(c: Context, input: CreateVisitNoteInput) {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    // CLI-421: cross-entity ownership — schema-validatsiyadan KEYIN, plan-guard/stock'dan
    // OLDIN. stageId/appointmentId/doctorId shu bemorga tegishlimi (cross-tenant/mixed-patient
    // UUID → CrossEntityError → routes 400). Stage guard'dan oldin: avval "shu bemornikimi",
    // so'ng "plan statusi ruxsat beradimi" (CLI-415).
    await ownership.assertPatientExists(c, input.patientId);
    await ownership.assertUserExists(c, input.doctorId);
    if (input.stageId)
      await ownership.assertStageBelongsToPatient(c, input.stageId, input.patientId);
    if (input.appointmentId)
      await ownership.assertAppointmentBelongsToPatient(c, input.appointmentId, input.patientId);

    // C5: stageId berilgan bo'lsa AVVAL bosqichni 'completed' qilamiz (C2 guard).
    // Guard fail (skipped→completed) → InvalidTransitionError → routes 400. Yozuv
    // yaratilishidan oldin tekshiramiz: noto'g'ri transition'da orphan yozuv qolmaydi.
    if (input.stageId && deps.completeStage) {
      await deps.completeStage.completeStageForVisit(c, input.stageId);
    }

    const note = await repo.insert(c, {
      tenantId,
      patientId: input.patientId,
      doctorId: input.doctorId,
      appointmentId: input.appointmentId ?? null,
      stageId: input.stageId ?? null,
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

    // CLI-421: cross-entity ownership — patientId o'zgармаydi (update schema omit qiladi),
    // shu sabab before.patientId'ga nisbatan tekshiramiz. Faqat yuborilgan maydonlar.
    if (input.doctorId) await ownership.assertUserExists(c, input.doctorId);
    if (input.stageId)
      await ownership.assertStageBelongsToPatient(c, input.stageId, before.patientId);
    if (input.appointmentId)
      await ownership.assertAppointmentBelongsToPatient(c, input.appointmentId, before.patientId);

    // C5: stageId yangi berilgan/o'zgargan bo'lsa o'sha bosqichni 'completed' qilamiz (C2 guard).
    if (input.stageId && input.stageId !== before.stageId && deps.completeStage) {
      await deps.completeStage.completeStageForVisit(c, input.stageId);
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.doctorId) patch.doctorId = input.doctorId;
    if (input.appointmentId !== undefined) patch.appointmentId = input.appointmentId;
    if (input.stageId !== undefined) patch.stageId = input.stageId;
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
