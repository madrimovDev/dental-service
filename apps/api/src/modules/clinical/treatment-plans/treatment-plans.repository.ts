import { treatmentPlans, treatmentStagePayments, treatmentStages } from '@dental/db-schema';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../../db/scoped.ts';
import type { ListPlansQuery } from './treatment-plans.schema.ts';

export const createTreatmentPlansRepository = () => {
  /**
   * DS7: planlar ro'yxati + har planning stage'lari (nested) — tenant-wide yoki
   * patientId-filtered. RLS tenant bo'yicha filtrlaydi (explicit WHERE tenant_id YO'Q).
   * Pagination (page/pageSize) + ixtiyoriy status filtri; jami count alohida so'rov.
   * N+1 oldini olish uchun stage'lar BITTA `IN`-query bilan olinadi (sahifa planlari)
   * va xotirada plan bo'yicha guruhlanadi → jami 3 so'rov (plan-soni'dan mustaqil).
   */
  async function listPlans(c: Context, query: ListPlansQuery) {
    const db = getDb(c);
    const offset = (query.page - 1) * query.pageSize;

    const filters = [];
    if (query.patientId) filters.push(eq(treatmentPlans.patientId, query.patientId));
    if (query.status) filters.push(eq(treatmentPlans.status, query.status));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [plans, totalRows] = await Promise.all([
      db
        .select()
        .from(treatmentPlans)
        .where(where)
        .orderBy(desc(treatmentPlans.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      db.select({ total: count() }).from(treatmentPlans).where(where),
    ]);
    const total = totalRows[0]?.total ?? 0;

    if (plans.length === 0) {
      return { data: [], meta: { page: query.page, pageSize: query.pageSize, total } };
    }

    const stages = await db
      .select()
      .from(treatmentStages)
      .where(
        inArray(
          treatmentStages.treatmentPlanId,
          plans.map((p) => p.id),
        ),
      )
      .orderBy(asc(treatmentStages.sequence));

    const stagesByPlan = new Map<string, (typeof stages)[number][]>();
    for (const s of stages) {
      const arr = stagesByPlan.get(s.treatmentPlanId);
      if (arr) arr.push(s);
      else stagesByPlan.set(s.treatmentPlanId, [s]);
    }

    const data = plans.map((p) => ({ ...p, stages: stagesByPlan.get(p.id) ?? [] }));
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
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

  async function findStage(c: Context, id: string) {
    const db = getDb(c);
    const [stage] = await db.select().from(treatmentStages).where(eq(treatmentStages.id, id));
    return stage ?? null;
  }

  /** C6: estimate uchun plan bosqichlariga tegishli allocation'lar (RLS filtrlaydi). */
  async function listStageAllocations(c: Context, planId: string) {
    const db = getDb(c);
    return db
      .select({
        stageId: treatmentStagePayments.stageId,
        amount: treatmentStagePayments.amount,
      })
      .from(treatmentStagePayments)
      .innerJoin(treatmentStages, eq(treatmentStagePayments.stageId, treatmentStages.id))
      .where(eq(treatmentStages.treatmentPlanId, planId));
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

  return {
    listPlans,
    getPlanWithStages,
    insertPlanWithStages,
    findPlan,
    findStage,
    listStageAllocations,
    updatePlan,
    updateStage,
  };
};
