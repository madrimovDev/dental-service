import {
  cashierTransactions,
  payrollLines,
  payrollRuns,
  staffProfiles,
  treatmentPlans,
} from '@dental/db-schema';
import { and, between, desc, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { computePayrollLine } from './payroll.calc.ts';
import type { CreateRunInput } from './payroll.schema.ts';

/**
 * Payroll moduli — gibrid baza + komissiya, snapshot run.
 *
 * `createRun` bir tranzaksiyada: payroll_runs (draft) insert → aktiv staff_profiles →
 * plan-linked attributed daromad (Tashkent kun chegarasi, signed payment − refund,
 * doctorId bo'yicha GROUP BY) → har profil uchun `computePayrollLine` → payroll_lines
 * snapshot insert. Daromad query'si reports.service'dan IMPORT QILINMAYDI (o'z query).
 */
export const createPayrollService = (deps: { audit: AuditLogger }) => {
  async function createRun(c: Context, input: CreateRunInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    // Asia/Tashkent (UTC+5, DST yo'q) kun chegarasi — cashier/reports bilan izchil.
    const start = new Date(`${input.periodFrom}T00:00:00+05:00`);
    const end = new Date(`${input.periodTo}T23:59:59.999+05:00`);

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      // 1. Run (draft)
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

      // 2. Aktiv profillar (RLS tenant orqali filtrlaydi)
      const profiles = await tx
        .select({
          userId: staffProfiles.userId,
          baseSalary: staffProfiles.baseSalary,
          commissionPercent: staffProfiles.commissionPercent,
        })
        .from(staffProfiles)
        .where(eq(staffProfiles.employmentStatus, 'active'));

      // 3. Plan-linked attributed daromad (signed: refund manfiy), doctorId bo'yicha.
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
            between(cashierTransactions.createdAt, start, end),
          ),
        )
        .groupBy(treatmentPlans.doctorId);
      const revByDoctor = new Map(revRows.map((r) => [r.doctorId, Number(r.revenue)]));

      // 4. Har aktiv profil uchun snapshot qator (0-daromad profillar ham kiritiladi).
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
    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    if (!run) return { run: null, error: 'not_found' as const };
    if (run.status !== 'draft') return { run: null, error: 'not_draft' as const };

    const [updated] = await db
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
  }

  return { createRun, listRuns, getRun, finalizeRun };
};

export type PayrollService = ReturnType<typeof createPayrollService>;
