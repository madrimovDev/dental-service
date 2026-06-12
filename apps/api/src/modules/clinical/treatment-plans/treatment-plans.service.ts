import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { createTreatmentPlansRepository } from './treatment-plans.repository.ts';
import type {
  CreateTreatmentPlanInput,
  UpdateStageInput,
  UpdateTreatmentPlanInput,
} from './treatment-plans.schema.ts';

export const createTreatmentPlansService = (deps: { audit: AuditLogger }) => {
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

  async function updateStage(c: Context, stageId: string, input: UpdateStageInput) {
    const patch: Record<string, unknown> = {};
    if (input.status) {
      patch.status = input.status;
      if (input.status === 'completed') patch.completedAt = new Date();
    }
    if (input.notes !== undefined) patch.notes = input.notes;
    const updated = await repo.updateStage(c, stageId, patch);
    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'treatment_stage',
        resourceId: stageId,
        after: { status: input.status },
      });
    }
    return updated;
  }

  return { listPlans, getPlan, createPlan, updatePlan, updateStage };
};

export type TreatmentPlansService = ReturnType<typeof createTreatmentPlansService>;
