import {
  consentForms,
  labOrders,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
  visitNotes,
} from '@dental/db-schema';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
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

  /**
   * FT-01: rejani `FOR UPDATE` bilan qulflab o'qiydi (RLS tranzaksiyasi ichida) — parallel
   * bosqich qo'shishlar bir xil `sequence` olmasin va totalCost qayta hisobi ketma-ket bo'lsin.
   */
  async function lockPlan(c: Context, id: string) {
    const db = getDb(c);
    const [plan] = await db
      .select()
      .from(treatmentPlans)
      .where(eq(treatmentPlans.id, id))
      .for('update');
    return plan ?? null;
  }

  /**
   * FT-01.2: bemor bo'yicha tranzaksiya-darajali advisory qulf — bir bemorga parallel
   * «bajarilgan ish» yozuvlari ikkita avto-reja yaratmasin (commit/rollback'da bo'shaydi).
   */
  async function lockPatientCompletedWork(c: Context, patientId: string) {
    const db = getDb(c);
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`completed-work:${patientId}`}))`);
  }

  /**
   * FT-01.2: bemorning eng so'nggi faol (`accepted|in_progress`) rejasi, `FOR UPDATE` bilan
   * («Bajarilgan ishni yozish» joriy rejasi). Bosqich faqat shu holatlarda yakunlanadi.
   */
  async function lockLatestActivePlan(c: Context, patientId: string) {
    const db = getDb(c);
    const [plan] = await db
      .select()
      .from(treatmentPlans)
      .where(
        and(
          eq(treatmentPlans.patientId, patientId),
          inArray(treatmentPlans.status, ['accepted', 'in_progress']),
        ),
      )
      .orderBy(desc(treatmentPlans.createdAt))
      .limit(1)
      .for('update');
    return plan ?? null;
  }

  /**
   * FT-01.2: «bajarilgan ish» bog'lanadigan vizit yozuvini `FOR UPDATE` bilan o'qiydi
   * (parallel imzo/bog'lash bilan poyga yo'q). `findConsentForm` precedenti — boshqa domen
   * jadvali to'g'ridan, biznes mantiqsiz. RLS → boshqa tenantniki null.
   */
  async function lockVisitNote(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db
      .select({
        id: visitNotes.id,
        patientId: visitNotes.patientId,
        stageId: visitNotes.stageId,
        signedAt: visitNotes.signedAt,
      })
      .from(visitNotes)
      .where(eq(visitNotes.id, id))
      .for('update');
    return row ?? null;
  }

  /**
   * FT-01.2: vizit yozuvini bosqichga bog'laydi — faqat imzolanmagan va hali bosqichsiz
   * bo'lsa (shartli UPDATE; 0 qator → null).
   */
  async function linkVisitNoteStage(c: Context, visitNoteId: string, stageId: string) {
    const db = getDb(c);
    const [row] = await db
      .update(visitNotes)
      .set({ stageId, updatedAt: new Date() })
      .where(
        and(
          eq(visitNotes.id, visitNoteId),
          isNull(visitNotes.stageId),
          isNull(visitNotes.signedAt),
        ),
      )
      .returning({ id: visitNotes.id });
    return row ?? null;
  }

  /** FT-01: rejadagi keyingi bosqich tartib raqami (max(sequence) + 1). */
  async function nextStageSequence(c: Context, planId: string) {
    const db = getDb(c);
    const [row] = await db
      .select({ max: sql<number | null>`max(${treatmentStages.sequence})` })
      .from(treatmentStages)
      .where(eq(treatmentStages.treatmentPlanId, planId));
    return Number(row?.max ?? 0) + 1;
  }

  /** FT-01: bitta bosqich qo'shish. */
  async function insertStage(c: Context, values: typeof treatmentStages.$inferInsert) {
    const db = getDb(c);
    const [stage] = await db.insert(treatmentStages).values(values).returning();
    if (!stage) throw new Error('Stage insert failed');
    return stage;
  }

  /**
   * FT-01: reja `totalCost`/`totalVisits` = bosqichlar yig'indisi (createPlan bilan bir xil
   * qoida — barcha bosqichlar). Avval reja `FOR UPDATE` qulflanadi: parallel tahrirlarda
   * keyingi UPDATE yangi snapshot oladi (READ COMMITTED) va eskirgan yig'indi yozilmaydi.
   */
  async function recomputePlanTotals(c: Context, planId: string) {
    const db = getDb(c);
    await lockPlan(c, planId);
    const [updated] = await db
      .update(treatmentPlans)
      .set({
        totalCost: sql`(SELECT COALESCE(SUM(${treatmentStages.cost}), 0) FROM ${treatmentStages} WHERE ${treatmentStages.treatmentPlanId} = ${planId})`,
        totalVisits: sql`(SELECT COALESCE(SUM(${treatmentStages.estimatedVisits}), 0)::int FROM ${treatmentStages} WHERE ${treatmentStages.treatmentPlanId} = ${planId})`,
        updatedAt: new Date(),
      })
      .where(eq(treatmentPlans.id, planId))
      .returning();
    return updated ?? null;
  }

  /** FX-15: rejadagi 'completed' bosqichlar soni (bekor qilish guard'i uchun). */
  async function countCompletedStages(c: Context, planId: string) {
    const db = getDb(c);
    const [row] = await db
      .select({ n: count() })
      .from(treatmentStages)
      .where(
        and(eq(treatmentStages.treatmentPlanId, planId), eq(treatmentStages.status, 'completed')),
      );
    return Number(row?.n ?? 0);
  }

  /** FX-16: rejadagi bajarilmagan (pending/in_progress) lekin accepted bosqichlar soni. */
  async function countOpenAcceptedStages(c: Context, planId: string) {
    const db = getDb(c);
    const [row] = await db
      .select({ n: count() })
      .from(treatmentStages)
      .where(
        and(
          eq(treatmentStages.treatmentPlanId, planId),
          eq(treatmentStages.acceptance, 'accepted'),
          inArray(treatmentStages.status, ['pending', 'in_progress']),
        ),
      );
    return Number(row?.n ?? 0);
  }

  async function findStage(c: Context, id: string) {
    const db = getDb(c);
    const [stage] = await db.select().from(treatmentStages).where(eq(treatmentStages.id, id));
    return stage ?? null;
  }

  /**
   * CLI-461: raw consent_forms qatorini o'qiydi (biznes mantiqsiz — "amaldagimi"
   * tekshiruvi service qatlamida). `consent` moduli bilan bir xil `consent_forms`
   * jadvaliga to'g'ridan Drizzle orqali murojaat — `treatmentStagePayments`
   * pretsedentiga mos (repository qatlami boshqa "domen" jadvalini to'g'ridan
   * o'qishi RFC-0009'da taqiqlanmagan; DI hook faqat business-logic orkestratsiya
   * — masalan `getActivePrice`, `autoCreateFromStage` — uchun ishlatiladi).
   */
  async function findConsentForm(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db.select().from(consentForms).where(eq(consentForms.id, id));
    return row ?? null;
  }

  /**
   * CLI-487: bosqichga bog'langan lab-order statusini o'qiydi (biznes mantiqsiz —
   * "delivered'mi" tekshiruvi service qatlamida). `findConsentForm` precedenti bilan
   * bir xil — repository qatlami boshqa domen jadvalini to'g'ridan o'qishi RFC-0009'da
   * taqiqlanmagan. RLS tenant bo'yicha filtrlaydi → cross-tenant/mavjud bo'lmagan
   * labOrderId → null (service uni "delivered emas" deb bloklaydi, fail-safe).
   */
  async function findLabOrderStatus(c: Context, labOrderId: string) {
    const db = getDb(c);
    const [row] = await db
      .select({ status: labOrders.status, patientId: labOrders.patientId })
      .from(labOrders)
      .where(eq(labOrders.id, labOrderId))
      .limit(1);
    return row ?? null;
  }

  /** FT-01: bosqichga kamida bitta to'lov allocation'i bormi (kontent tahriri qulfi). */
  async function hasStageAllocations(c: Context, stageId: string) {
    const db = getDb(c);
    const [row] = await db
      .select({ id: treatmentStagePayments.id })
      .from(treatmentStagePayments)
      .where(eq(treatmentStagePayments.stageId, stageId))
      .limit(1);
    return !!row;
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
    lockPlan,
    lockPatientCompletedWork,
    lockLatestActivePlan,
    lockVisitNote,
    linkVisitNoteStage,
    nextStageSequence,
    insertStage,
    recomputePlanTotals,
    findStage,
    countCompletedStages,
    countOpenAcceptedStages,
    findConsentForm,
    findLabOrderStatus,
    listStageAllocations,
    hasStageAllocations,
    updatePlan,
    updateStage,
  };
};
