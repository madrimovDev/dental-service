import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { createTreatmentPlansRepository } from './treatment-plans.repository.ts';
import type {
  ConsentInput,
  CreateTreatmentPlanInput,
  UpdateStageInput,
  UpdateTreatmentPlanInput,
} from './treatment-plans.schema.ts';
import {
  assertPlanTransition,
  assertStageAcceptanceTransition,
  assertStageStatusTransition,
} from './treatment-plans.transitions.ts';

/**
 * Recalls modulidan inject qilinadigan narrow dep (B4, RFC-0011 §5). Bog'liqlik
 * yo'nalishi: treatment-plans → recalls (factory injection, to'g'ridan import emas).
 */
export type RecallStageHook = {
  autoCreateFromStage: (
    c: Context,
    args: {
      patientId: string;
      sourceStageId: string;
      treatmentPlanId?: string | null;
      branchId?: string | null;
    },
  ) => Promise<void>;
};

/** presented→accepted consent yo'q bo'lsa otiladi; routes 400 ga aylantiradi. */
export class ConsentRequiredError extends Error {
  constructor() {
    super('Consent required before accepting a presented plan');
    this.name = 'ConsentRequiredError';
  }
}

export const createTreatmentPlansService = (deps: {
  audit: AuditLogger;
  recall?: RecallStageHook;
}) => {
  const repo = createTreatmentPlansRepository();

  const listPlans = (c: Context, patientId?: string) => repo.listPlans(c, patientId);
  const getPlan = (c: Context, id: string) => repo.getPlanWithStages(c, id);

  async function createPlan(c: Context, input: CreateTreatmentPlanInput) {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const totalCost = input.stages.reduce((sum, s) => sum + s.cost, 0);
    const totalVisits = input.stages.reduce((sum, s) => sum + s.estimatedVisits, 0);

    const plan = await repo.insertPlanWithStages(
      c,
      tenantId,
      {
        tenantId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        title: input.title,
        totalCost: String(totalCost),
        totalVisits,
        notes: input.notes ?? null,
      },
      (planId) =>
        input.stages.map((s, i) => ({
          treatmentPlanId: planId,
          sequence: i + 1,
          serviceId: s.serviceId ?? null,
          serviceName: s.serviceName,
          toothNumbers: s.toothNumbers ?? null,
          estimatedVisits: s.estimatedVisits,
          estimatedDurationMinutes: s.estimatedDurationMinutes ?? null,
          cost: String(s.cost),
          notes: s.notes ?? null,
        })),
    );

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'treatment_plan',
      resourceId: plan.id,
      after: { totalCost, totalVisits, stages: input.stages.length },
    });
    return plan;
  }

  async function updatePlan(c: Context, id: string, input: UpdateTreatmentPlanInput) {
    const before = await repo.findPlan(c, id);
    if (!before) return null;

    // C2 guard: plan status o'tishi (draft→presented→accepted→in_progress→completed/cancelled).
    if (input.status && input.status !== before.status) {
      assertPlanTransition(before.status, input.status);
      // C3: presented→accepted KONSENT talab qiladi (imzo yo'q bo'lsa RAD).
      if (input.status === 'accepted' && !before.consentSignedAt) {
        throw new ConsentRequiredError();
      }
    }

    const updated = await repo.updatePlan(c, id, input);
    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'treatment_plan',
        resourceId: id,
        before,
        after: updated,
      });
    }
    return updated;
  }

  /** C3: plan konsent imzosini saqlash (accept oldidan kerak). */
  async function setConsent(c: Context, id: string, input: ConsentInput) {
    const before = await repo.findPlan(c, id);
    if (!before) return null;
    const updated = await repo.updatePlan(c, id, {
      consentSignedAt: input.consentSignedAt ? new Date(input.consentSignedAt) : new Date(),
      consentSignatureUrl: input.consentSignatureUrl ?? null,
    });
    if (updated) {
      await deps.audit.record(c, {
        action: 'consent_signed',
        resourceType: 'treatment_plan',
        resourceId: id,
        before: { consentSignedAt: before.consentSignedAt },
        after: { consentSignedAt: updated.consentSignedAt },
      });
    }
    return updated;
  }

  async function updateStage(c: Context, stageId: string, input: UpdateStageInput) {
    // C2 guard: status/acceptance o'tishlarini tekshirish uchun joriy holat kerak.
    const current = await repo.findStage(c, stageId);
    if (!current) return null;

    const patch: Record<string, unknown> = {};
    if (input.status && input.status !== current.status) {
      assertStageStatusTransition(current.status, input.status);
      patch.status = input.status;
      if (input.status === 'completed') patch.completedAt = new Date();
    }
    if (input.acceptance && input.acceptance !== current.acceptance) {
      assertStageAcceptanceTransition(current.acceptance, input.acceptance);
      patch.acceptance = input.acceptance;
    }
    if (input.notes !== undefined) patch.notes = input.notes;

    // Hech narsa o'zgarmadi (idempotent yoki bo'sh PATCH) — qayta yozmaymiz, joriy qaytadi.
    if (Object.keys(patch).length === 0) return current;

    const updated = await repo.updateStage(c, stageId, patch);
    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'treatment_stage',
        resourceId: stageId,
        after: { status: input.status, acceptance: input.acceptance },
      });

      // B4: bosqich completed → treatment_followup recall (idempotent). Plan'dan
      // patientId/branchId kerak (stage'da yo'q). Faqat status endi 'completed'
      // bo'lganda (re-PATCH'da onConflictDoNothing baribir dedupe qiladi).
      if (patch.status === 'completed' && deps.recall) {
        const plan = await repo.findPlan(c, updated.treatmentPlanId);
        if (plan) {
          await deps.recall.autoCreateFromStage(c, {
            patientId: plan.patientId,
            sourceStageId: updated.id,
            treatmentPlanId: plan.id,
          });
        }
      }
    }
    return updated;
  }

  /**
   * C5: vizit yozuvi saqlanganda bosqichni 'completed' qilish — C2 guard'ga
   * bo'ysunadi (skipped→completed RAD). visit-notes service factory DI orqali
   * chaqiradi (modullar ajratilgan, to'g'ridan import yo'q). updateStage'ni
   * qayta ishlatadi → recall hook + audit + guard hammasi avtomatik ishlaydi.
   */
  async function completeStageForVisit(c: Context, stageId: string) {
    return updateStage(c, stageId, { status: 'completed' });
  }

  return {
    listPlans,
    getPlan,
    createPlan,
    updatePlan,
    setConsent,
    updateStage,
    completeStageForVisit,
  };
};

export type TreatmentPlansService = ReturnType<typeof createTreatmentPlansService>;
