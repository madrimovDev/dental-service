import {
  cashierTransactions,
  payrollLines,
  payrollRuns,
  staffProfiles,
  treatmentPlans,
} from '@dental/db-schema';
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { computePayrollLine } from './payroll.calc.ts';
import type { CreateRunInput } from './payroll.schema.ts';

/**
 * CLI-417: ustma-ust / takroriy davr run — service guard yoki DB EXCLUDE constraint
 * (`payroll_runs_no_overlap`, 23P01) tomonidan tashlanadi. Route 409'ga map qiladi.
 */
export class PayrollOverlapError extends Error {
  constructor() {
    super('overlap');
    this.name = 'PayrollOverlapError';
  }
}

/** Postgres exclusion_violation (EXCLUDE constraint) — SQLSTATE 23P01. */
const isExclusionViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '23P01';

/**
 * Payroll moduli — gibrid baza + komissiya, snapshot run.
 *
 * `createRun` bir tranzaksiyada: ustma-ust davr guard → payroll_runs (draft) insert →
 * plan-linked attributed daromad (Tashkent kun chegarasi, signed payment − refund,
 * doctorId bo'yicha GROUP BY) → eligible profillar (aktiv ∪ davrda daromadli) → har
 * profil uchun `computePayrollLine` → payroll_lines snapshot insert. Daromad query'si
 * reports.service'dan IMPORT QILINMAYDI (o'z query).
 */
export const createPayrollService = (deps: { audit: AuditLogger }) => {
  async function createRun(c: Context, input: CreateRunInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    // Asia/Tashkent (UTC+5, DST yo'q) kun chegarasi — cashier/reports bilan izchil.
    // YARIM-OCHIQ interval (CLI-442 #1): `>= start AND < end` (end = periodTo'dan keyingi
    // kun 00:00). Inklyuziv `…23:59:59.999` sub-ms tranzaksiyalarni tushirib qoldirardi.
    const start = new Date(`${input.periodFrom}T00:00:00+05:00`);
    const end = new Date(`${input.periodTo}T00:00:00+05:00`);
    end.setUTCDate(end.getUTCDate() + 1);

    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

        // 0. Ustma-ust / takroriy davr guard (service qatlam; DB EXCLUDE backstop bilan).
        //    RLS tenant scope; `[]` inklyuziv daterange — tutash davr KESISHMAYDI.
        const overlapExisting = await tx
          .select({ id: payrollRuns.id })
          .from(payrollRuns)
          .where(
            sql`daterange(${payrollRuns.periodFrom}, ${payrollRuns.periodTo}, '[]') && daterange(${input.periodFrom}::date, ${input.periodTo}::date, '[]')`,
          )
          .limit(1);
        if (overlapExisting.length > 0) throw new PayrollOverlapError();

        // 1. Run (draft) — DB EXCLUDE poyga bo'lsa bu yerda 23P01 tashlaydi.
        const [run] = await tx
          .insert(payrollRuns)
          .values({
            tenantId,
            periodFrom: input.periodFrom,
            periodTo: input.periodTo,
            createdBy: user?.id ?? null,
          })
          .returning();
        if (!run) throw new Error('Payroll run insert failed');

        // 2. Plan-linked attributed daromad (signed: refund manfiy), doctorId bo'yicha.
        const revRows = await tx
          .select({
            doctorId: treatmentPlans.doctorId,
            revenue: sql<string>`COALESCE(SUM(CASE WHEN ${cashierTransactions.type} = 'refund' THEN -${cashierTransactions.paidAmount} ELSE ${cashierTransactions.paidAmount} END), 0)`,
          })
          .from(cashierTransactions)
          .innerJoin(treatmentPlans, eq(cashierTransactions.treatmentPlanId, treatmentPlans.id))
          .where(
            and(
              eq(cashierTransactions.status, 'completed'),
              gte(cashierTransactions.createdAt, start),
              lt(cashierTransactions.createdAt, end),
            ),
          )
          .groupBy(treatmentPlans.doctorId);
        const revByDoctor = new Map(revRows.map((r) => [r.doctorId, Number(r.revenue)]));

        // 3. Eligible profillar = aktiv ∪ davrda attributed daromadli (CLI-417 M4b).
        //    Davr o'rtasida ishdan ketgan (endi `inactive`) lekin davrda daromad
        //    keltirgan doktor komissiya izini yo'qotmasin. Snapshot falsafasi (Qaror #16)
        //    saqlanadi — baribir staff_profiles'dagi qiymatlar snapshot qilinadi, faqat
        //    eligibility to'plami kengayadi. (Ochiq cheklov: ketgan xodim to'liq baza
        //    maoshini oladi — proratsiya YO'Q, keyingi ticket.)
        const activeProfiles = await tx
          .select({
            userId: staffProfiles.userId,
            baseSalary: staffProfiles.baseSalary,
            commissionPercent: staffProfiles.commissionPercent,
          })
          .from(staffProfiles)
          .where(eq(staffProfiles.employmentStatus, 'active'));

        const activeIds = new Set(activeProfiles.map((p) => p.userId));
        const earningIds = [...revByDoctor.keys()].filter(
          (id): id is string => id != null && !activeIds.has(id),
        );
        const inactiveEarning = earningIds.length
          ? await tx
              .select({
                userId: staffProfiles.userId,
                baseSalary: staffProfiles.baseSalary,
                commissionPercent: staffProfiles.commissionPercent,
              })
              .from(staffProfiles)
              .where(inArray(staffProfiles.userId, earningIds))
          : [];
        const profiles = [...activeProfiles, ...inactiveEarning];

        // 4. Har eligible profil uchun snapshot qator (0-daromad profillar ham kiritiladi).
        const lines = [];
        for (const p of profiles) {
          const base = Number(p.baseSalary);
          const percent = Number(p.commissionPercent);
          const attributedRevenue = revByDoctor.get(p.userId) ?? 0;
          const { commissionAmount, total } = computePayrollLine(base, attributedRevenue, percent);

          const [line] = await tx
            .insert(payrollLines)
            .values({
              tenantId,
              runId: run.id,
              userId: p.userId,
              baseSalary: p.baseSalary,
              attributedRevenue: String(attributedRevenue),
              commissionPercent: p.commissionPercent,
              commissionAmount: String(commissionAmount),
              total: String(total),
            })
            .returning();
          if (line) lines.push(line);
        }

        await deps.audit.record(c, {
          action: 'created',
          resourceType: 'payroll_run',
          resourceId: run.id,
          after: { periodFrom: input.periodFrom, periodTo: input.periodTo, lines: lines.length },
        });

        return { ...run, lines };
      });
    } catch (err) {
      // Service guard yoki DB EXCLUDE (23P01) → yagona `overlap` semantikasi.
      if (err instanceof PayrollOverlapError) throw err;
      if (isExclusionViolation(err)) throw new PayrollOverlapError();
      throw err;
    }
  }

  async function listRuns(c: Context) {
    const db = getDb(c);
    const runs = await db.select().from(payrollRuns).orderBy(desc(payrollRuns.createdAt));

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'payroll_run',
      resourceId: null,
      after: { count: runs.length },
    });

    return runs;
  }

  async function getRun(c: Context, runId: string) {
    const db = getDb(c);
    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    if (!run) return null;

    const lines = await db
      .select()
      .from(payrollLines)
      .where(eq(payrollLines.runId, runId))
      .orderBy(desc(payrollLines.total));

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'payroll_run',
      resourceId: runId,
    });

    return { ...run, lines };
  }

  async function finalizeRun(c: Context, runId: string) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    // CLI-417: transaksiya + qator qulfi (FOR UPDATE) — ikki parallel finalize ikkalasi
    // ham `draft` ko'rib double-finalize qilishining oldini oladi (TOCTOU).
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const [run] = await tx
        .select()
        .from(payrollRuns)
        .where(eq(payrollRuns.id, runId))
        .for('update');
      if (!run) return { run: null, error: 'not_found' as const };
      if (run.status !== 'draft') return { run: null, error: 'not_draft' as const };

      const [updated] = await tx
        .update(payrollRuns)
        .set({ status: 'finalized' })
        .where(eq(payrollRuns.id, runId))
        .returning();

      await deps.audit.record(c, {
        action: 'finalized',
        resourceType: 'payroll_run',
        resourceId: runId,
        before: run,
        after: updated,
      });

      return { run: updated ?? null, error: null };
    });
  }

  /**
   * CLI-417: draft run'ni o'chirish (deadlock yechimi — noto'g'ri draft davr abadiy
   * bloklamasin). FAQAT `status='draft'`; finalized o'chirilmaydi (audit yaxlitligi).
   * `payroll_lines` FK `onDelete: 'cascade'` orqali birga o'chadi.
   */
  async function deleteRun(c: Context, runId: string) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const [run] = await tx
        .select()
        .from(payrollRuns)
        .where(eq(payrollRuns.id, runId))
        .for('update');
      if (!run) return { ok: false as const, error: 'not_found' as const };
      if (run.status !== 'draft') return { ok: false as const, error: 'not_draft' as const };

      await tx.delete(payrollRuns).where(eq(payrollRuns.id, runId));

      await deps.audit.record(c, {
        action: 'deleted',
        resourceType: 'payroll_run',
        resourceId: runId,
        before: run,
      });

      return { ok: true as const, error: null };
    });
  }

  return { createRun, listRuns, getRun, finalizeRun, deleteRun };
};

export type PayrollService = ReturnType<typeof createPayrollService>;
