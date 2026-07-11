import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { createOwnershipValidator, type OwnershipValidator } from '../../../lib/ownership.ts';
import { InvalidTransitionError } from '../treatment-plans/treatment-plans.transitions.ts';
import { createVisitNotesRepository } from './visit-notes.repository.ts';
import type { CreateVisitNoteInput, UpdateVisitNoteInput } from './visit-notes.schema.ts';

/**
 * CLI-481 — vizit yozuvining stage bog'lanishini QAYTA yo'naltirishni bloklaydi.
 *
 * Vizit yaratilganda/yangilanganda `stageId` berilsa, o'sha bosqich `completed` qilinadi
 * (+ auto-recall). `completed` — terminal holat (revert yo'q). Shu sabab bir vizit
 * allaqachon bir bosqichni yopgan bo'lsa (`before.stageId` non-null), uni BOSHQA
 * bosqichga ko'chirish eski bosqichni phantom-`completed` (endi hech bir vizit ishora
 * qilmaydi) + uning recall'ini orphan qoldiradi va yangi bosqich ikkinchi completed+
 * recall oladi. Blok bu holatni oldini oladi — bosqich holatini o'zgartirish kerak
 * bo'lsa `/treatment-stages` endpoint'i orqali. `InvalidTransitionError` subklassi
 * (PlanLockedError precedenti) → visit-notes/treatment-plans routes'dagi mavjud
 * `instanceof InvalidTransitionError` catch uni 400 (`stage.invalid_transition`) ga
 * aylantiradi (route o'zgarishi shart emas).
 */
export class VisitStageRepointError extends InvalidTransitionError {
  constructor(fromStageId: string, toStageId: string) {
    super('stage_status', `stage:${fromStageId}`, `stage:${toStageId}`);
    this.name = 'VisitStageRepointError';
    this.message =
      'Cannot re-point a visit note to a different treatment stage: the previously ' +
      'linked stage is already completed. Change stage status via /treatment-stages.';
  }
}

/**
 * C5 (CLI-222) — treatment-plans modulidan inject qilinadigan narrow dep.
 * Bog'liqlik yo'nalishi: visit-notes → treatment-plans (factory injection, to'g'ridan
 * import emas). Bosqichni 'completed' qiladi (C2 guard ichida; skipped→completed RAD).
 */
export type StageCompleteHook = {
  completeStageForVisit: (c: Context, stageId: string) => Promise<unknown>;
};

/**
 * CLI-414 — stock modulidan inject qilinadigan narrow dep (deductStock bilan bir xil
 * bog'liqlik yo'nalishi: visit-notes → stock, to'g'ridan import emas). Update'da
 * `performedServices` multiset diff'ini hisoblab BOM ayirish/qaytarishni bajaradi
 * (`stock.service.ts`dagi `reconcileForServices` — STOCK agent implementatsiyasi;
 * bu yerda faqat chaqiruv nuqtasi/wiring). `before`/`after` — occurrence-aware
 * (duplikat serviceId) multiset; `undefined` maydon chaqirilishdan oldin filtrlanadi
 * (`update()` faqat `performedServices !== undefined` bo'lganda chaqiradi).
 */
export type ReconcileStockHook = (
  c: Context,
  before: string[],
  after: string[],
  visitNoteId: string,
) => Promise<void>;

export const createVisitNotesService = (deps: {
  audit: AuditLogger;
  deductStock?: (c: Context, serviceIds: string[], visitNoteId: string) => Promise<void>;
  completeStage?: StageCompleteHook;
  ownership?: OwnershipValidator;
  reconcileStock?: ReconcileStockHook;
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

    // CLI-481: re-point blok — ownership/completeStage'dan OLDIN. Bu vizit allaqachon
    // bir bosqichni 'completed' qilgan bo'lsa (before.stageId non-null), yangi va
    // boshqa stageId RAD (phantom-completed + orphan recall oldini olish).
    if (
      input.stageId !== undefined &&
      before.stageId !== null &&
      input.stageId !== before.stageId
    ) {
      throw new VisitStageRepointError(before.stageId, input.stageId);
    }

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
      // CLI-414: `performedServices` YUBORILGAN bo'lsa (undefined EMAS) — stock reconcile
      // (multiset diff: delta>0 ayirish, delta<0 qaytarish). `undefined` (maydon yo'q) →
      // stockga tegilmaydi; `[]` (bo'shatish) → hammasi qaytariladi. Idempotent PATCH
      // (bir xil qiymat) → nol movement (STOCK implementatsiyasi ichida).
      if (input.performedServices !== undefined) {
        await deps.reconcileStock?.(c, before.performedServices ?? [], input.performedServices, id);
      }
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
