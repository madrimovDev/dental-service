import { treatmentPlans, treatmentStages } from '@dental/db-schema';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../../db/scoped.ts';

export const createTreatmentPlansRepository = () => {
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

  async function getPlanWithStages(c: Context, id: string) {
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

  async function insertPlanWithStages(
    c: Context,
    tenantId: string,
    planValues: typeof treatmentPlans.$inferInsert,
    stageValues: (planId: string) => (typeof treatmentStages.$inferInsert)[],
  ) {
    const db = getDb(c);
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
      const [plan] = await tx.insert(treatmentPlans).values(planValues).returning();
      if (!plan) throw new Error('Plan insert failed');
      const stages = stageValues(plan.id);
      if (stages.length > 0) await tx.insert(treatmentStages).values(stages);
      const fullStages = await tx
        .select()
        .from(treatmentStages)
        .where(eq(treatmentStages.treatmentPlanId, plan.id))
        .orderBy(asc(treatmentStages.sequence));
      return { ...plan, stages: fullStages };
    });
  }

  async function findPlan(c: Context, id: string) {
    const db = getDb(c);
    const [plan] = await db.select().from(treatmentPlans).where(eq(treatmentPlans.id, id));
    return plan ?? null;
  }

  async function updatePlan(
    c: Context,
    id: string,
    patch: Partial<typeof treatmentPlans.$inferInsert>,
  ) {
    const db = getDb(c);
    const [updated] = await db
      .update(treatmentPlans)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(treatmentPlans.id, id))
      .returning();
    return updated ?? null;
  }

  async function updateStage(
    c: Context,
    stageId: string,
    patch: Partial<typeof treatmentStages.$inferInsert>,
  ) {
    const db = getDb(c);
    const [updated] = await db
      .update(treatmentStages)
      .set(patch)
      .where(eq(treatmentStages.id, stageId))
      .returning();
    return updated ?? null;
  }

  return { listPlans, getPlanWithStages, insertPlanWithStages, findPlan, updatePlan, updateStage };
};
