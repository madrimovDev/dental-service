import {
  diagnoses,
  toothCharts,
  toothStates,
  treatmentPlans,
  treatmentStages,
  visitNotes,
} from '@dental/db-schema';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Database } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import type {
  CreateToothChartInput,
  CreateTreatmentPlanInput,
  CreateVisitNoteInput,
  UpdateStageInput,
  UpdateTreatmentPlanInput,
  UpdateVisitNoteInput,
} from './clinical.schema.ts';

export const createClinicalService = (deps: {
  audit: AuditLogger;
  db: Database;
  /** Vizit yozuvi yaratilganda BOM bo'yicha ombor avtomatik chiqim (DI — stock module). Ixtiyoriy. */
  deductStock?: (c: Context, serviceIds: string[], visitNoteId: string) => Promise<void>;
}) => {
  // ===== Diagnoses (platform-level, no RLS) =====
  async function listDiagnoses(search?: string) {
    if (search) {
      const term = `%${search.toLowerCase()}%`;
      return deps.db
        .select()
        .from(diagnoses)
        .where(
          sql`lower(${diagnoses.code}) like ${term} OR lower(${diagnoses.nameUz}) like ${term} OR lower(${diagnoses.nameRu}) like ${term}`,
        )
        .orderBy(asc(diagnoses.code))
        .limit(100);
    }
    return deps.db.select().from(diagnoses).orderBy(asc(diagnoses.code));
  }

  // ===== Treatment Plans =====
  async function listPlans(c: Context, patientId?: string) {
    const db = getDb(c);
    const filters = [];
    if (patientId) filters.push(eq(treatmentPlans.patientId, patientId));
    return db
      .select()
      .from(treatmentPlans)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(treatmentPlans.createdAt));
  }

  async function getPlan(c: Context, id: string) {
    const db = getDb(c);
    const [plan] = await db.select().from(treatmentPlans).where(eq(treatmentPlans.id, id));
    if (!plan) return null;
    const stages = await db
      .select()
      .from(treatmentStages)
      .where(eq(treatmentStages.treatmentPlanId, id))
      .orderBy(asc(treatmentStages.sequence));
    return { ...plan, stages };
  }

  async function createPlan(c: Context, input: CreateTreatmentPlanInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const totalCost = input.stages.reduce((sum, s) => sum + s.cost, 0);
    const totalVisits = input.stages.reduce((sum, s) => sum + s.estimatedVisits, 0);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const [plan] = await tx
        .insert(treatmentPlans)
        .values({
          tenantId,
          patientId: input.patientId,
          doctorId: input.doctorId,
          title: input.title,
          totalCost: String(totalCost),
          totalVisits,
          notes: input.notes ?? null,
        })
        .returning();

      if (!plan) throw new Error('Plan insert failed');

      if (input.stages.length > 0) {
        await tx.insert(treatmentStages).values(
          input.stages.map((s, i) => ({
            treatmentPlanId: plan.id,
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
      }

      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'treatment_plan',
        resourceId: plan.id,
        after: { totalCost, totalVisits, stages: input.stages.length },
      });

      return getPlan(c, plan.id);
    });
  }

  async function updatePlan(c: Context, id: string, input: UpdateTreatmentPlanInput) {
    const db = getDb(c);
    const [before] = await db.select().from(treatmentPlans).where(eq(treatmentPlans.id, id));
    if (!before) return null;

    const [updated] = await db
      .update(treatmentPlans)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(treatmentPlans.id, id))
      .returning();

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
    const db = getDb(c);
    const patch: Record<string, unknown> = {};
    if (input.status) {
      patch.status = input.status;
      if (input.status === 'completed') patch.completedAt = new Date();
    }
    if (input.notes !== undefined) patch.notes = input.notes;

    const [updated] = await db
      .update(treatmentStages)
      .set(patch)
      .where(eq(treatmentStages.id, stageId))
      .returning();

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

  // ===== Visit Notes =====
  async function listVisitNotes(c: Context, patientId?: string) {
    const db = getDb(c);
    const filters = [];
    if (patientId) filters.push(eq(visitNotes.patientId, patientId));
    return db
      .select()
      .from(visitNotes)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(visitNotes.visitDate));
  }

  async function getVisitNote(c: Context, id: string) {
    const db = getDb(c);
    const [note] = await db.select().from(visitNotes).where(eq(visitNotes.id, id));
    return note ?? null;
  }

  async function createVisitNote(c: Context, input: CreateVisitNoteInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const [note] = await db
      .insert(visitNotes)
      .values({
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
      })
      .returning();

    if (note) {
      // BOM bo'yicha ombor chiqimi (DI dep) — shu request-tx ichida (RLS tx-bound).
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

  async function updateVisitNote(c: Context, id: string, input: UpdateVisitNoteInput) {
    const db = getDb(c);
    const [before] = await db.select().from(visitNotes).where(eq(visitNotes.id, id));
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

    const [updated] = await db
      .update(visitNotes)
      .set(patch)
      .where(eq(visitNotes.id, id))
      .returning();

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

  // ===== Tooth Charts =====
  async function listToothCharts(c: Context, patientId: string) {
    const db = getDb(c);
    return db
      .select()
      .from(toothCharts)
      .where(eq(toothCharts.patientId, patientId))
      .orderBy(desc(toothCharts.createdAt));
  }

  async function getLatestToothChart(c: Context, patientId: string) {
    const db = getDb(c);
    const [chart] = await db
      .select()
      .from(toothCharts)
      .where(eq(toothCharts.patientId, patientId))
      .orderBy(desc(toothCharts.createdAt))
      .limit(1);
    if (!chart) return null;

    const states = await db
      .select()
      .from(toothStates)
      .where(eq(toothStates.toothChartId, chart.id));

    return { ...chart, states };
  }

  async function createToothChart(c: Context, input: CreateToothChartInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const [chart] = await tx
        .insert(toothCharts)
        .values({
          tenantId,
          patientId: input.patientId,
          visitNoteId: input.visitNoteId ?? null,
          isPrimaryDentition: input.isPrimaryDentition,
          notes: input.notes ?? null,
          createdBy: user?.id ?? null,
        })
        .returning();

      if (!chart) throw new Error('Chart insert failed');

      if (input.states.length > 0) {
        await tx.insert(toothStates).values(
          input.states.map((s) => ({
            toothChartId: chart.id,
            toothNumber: s.toothNumber,
            surface: s.surface,
            state: s.state,
            diagnosisId: s.diagnosisId ?? null,
            notes: s.notes ?? null,
          })),
        );
      }

      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'tooth_chart',
        resourceId: chart.id,
        after: { patientId: input.patientId, stateCount: input.states.length },
      });

      const states = await tx
        .select()
        .from(toothStates)
        .where(eq(toothStates.toothChartId, chart.id));

      return { ...chart, states };
    });
  }

  return {
    listDiagnoses,
    listPlans,
    getPlan,
    createPlan,
    updatePlan,
    updateStage,
    listVisitNotes,
    getVisitNote,
    createVisitNote,
    updateVisitNote,
    listToothCharts,
    getLatestToothChart,
    createToothChart,
  };
};

export type ClinicalService = ReturnType<typeof createClinicalService>;
