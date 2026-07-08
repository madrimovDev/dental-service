import {
  cashierTransactions,
  payrollAdjustments,
  payrollLines,
  payrollRuns,
  staffProfiles,
  treatmentPlans,
  userAssignments,
  users,
} from '@dental/db-schema';
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
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

        // 3.5 (CLI-446 G3, tuzatilgan — adversarial verify topilmasi): shu profillar
        // uchun qo'llanmagan (`appliedToRunId IS NULL`) payroll_adjustments qatorlarini
        // `FOR UPDATE` bilan QULFLAYMIZ (xom qatorlar, aggregatsiya emas — Postgres
        // `FOR UPDATE`ni GROUP BY/SUM bilan ishlatishga ruxsat bermaydi).
        //
        // MUHIM (bug tuzatildi): avvalgi versiyada bu summa faqat O'QILAR, stamp esa
        // faqat `finalizeRun()`da bosilardi. Agar ikkita davr uchun (masalan Fevral
        // va Mart) ikkalasi ham finalize qilinmasdan oldin ketma-ket `createRun`
        // chaqirilsa — ikkalasi ham bir xil "hali qo'llanmagan" adjustmentni ko'rib,
        // ikkalasi ham o'z `payrollLines.commissionAmount`iga singdirib QO'YAR edi
        // (frozen qiymat finalize'da qayta yozilmaydi) — natijada bitta adjustment
        // IKKI MARTA "to'langan komissiyadan" ayirilgan bo'lib chiqardi (doktor kam
        // to'lanardi). Tuzatish: adjustment endi SHU YERDA, createRun ichida, FOR
        // UPDATE qulfi ostida DARHOL stemplanadi (pastda, 4-bo'limda) — ikkinchi
        // parallel/ketma-ket `createRun` endi ushbu qatorni "band qilingan" deb ko'radi.
        const profileUserIds = profiles.map((p) => p.userId).filter((id): id is string => !!id);
        const unappliedAdjRowsRaw =
          profileUserIds.length > 0
            ? await tx
                .select({
                  id: payrollAdjustments.id,
                  doctorId: payrollAdjustments.doctorId,
                  amount: payrollAdjustments.amount,
                })
                .from(payrollAdjustments)
                .where(
                  and(
                    inArray(payrollAdjustments.doctorId, profileUserIds),
                    isNull(payrollAdjustments.appliedToRunId),
                  ),
                )
                .for('update')
            : [];
        const unappliedAdjByDoctor = new Map<string, number>();
        const unappliedAdjIdsByDoctor = new Map<string, string[]>();
        for (const row of unappliedAdjRowsRaw) {
          unappliedAdjByDoctor.set(
            row.doctorId,
            (unappliedAdjByDoctor.get(row.doctorId) ?? 0) + Number(row.amount),
          );
          const ids = unappliedAdjIdsByDoctor.get(row.doctorId) ?? [];
          ids.push(row.id);
          unappliedAdjIdsByDoctor.set(row.doctorId, ids);
        }

        // 4. Har eligible profil uchun snapshot qator (0-daromad profillar ham kiritiladi).
        const lines = [];
        for (const p of profiles) {
          const base = Number(p.baseSalary);
          const percent = Number(p.commissionPercent);
          const attributedRevenue = revByDoctor.get(p.userId) ?? 0;
          const { commissionAmount: rawCommission } = computePayrollLine(
            base,
            attributedRevenue,
            percent,
          );

          // CLI-446 G3: adjustment faqat TO'LIQ singdirilsa qo'llanadi (all-or-nothing).
          const adjustmentSum = unappliedAdjByDoctor.get(p.userId) ?? 0;
          const absorbable = rawCommission + adjustmentSum >= 0;
          const commissionAmount = absorbable ? rawCommission + adjustmentSum : rawCommission;
          const total = Math.max(0, base + commissionAmount);

          // CLI-446 G3 (bug tuzatildi — quyida): agar TO'LIQ singdirilsa, FOR UPDATE
          // qulflangan qatorlarga DARHOL (createRun ichida, finalizeRun'da EMAS)
          // `appliedToRunId = run.id` yoziladi — shu bilan ikkinchi (parallel yoki
          // ketma-ket) createRun endi bu adjustmentni "band qilingan" deb ko'radi va
          // qayta hisobga olmaydi. Draft o'chirilsa (`deleteRun`), FK
          // `ON DELETE SET NULL` orqali avtomatik bo'shaydi (keyingi draft uchun
          // qayta ochiladi).
          if (absorbable && adjustmentSum !== 0) {
            const adjIds = unappliedAdjIdsByDoctor.get(p.userId) ?? [];
            if (adjIds.length > 0) {
              await tx
                .update(payrollAdjustments)
                .set({ appliedToRunId: run.id })
                .where(inArray(payrollAdjustments.id, adjIds));
            }
          }

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

  /**
   * CLI-470: xodim ismlarini yechish uchun yengil `payroll.view`-gated endpoint
   * (`GET /users/assignments`, `user.view` o'rniga — Accountant template'da
   * `user.view` YO'Q, CLI-154/155 precedenti). `users`/`user_assignments`ni
   * `listAssignments` (users.service) kabi to'liq join qilmasdan, faqat
   * `{userId, fullName}` distinct qaytaradi — `fullName` bo'sh bo'lsa `phone`ga
   * fallback (listDoctors bilan bir xil resolve pattern, backendda qilinadi).
   */
  async function listStaffNames(c: Context) {
    const db = getDb(c);
    const rows = await db
      .selectDistinct({
        userId: users.id,
        fullName: users.fullName,
        phone: users.phone,
      })
      .from(userAssignments)
      .innerJoin(users, eq(users.id, userAssignments.userId))
      .where(isNull(users.deletedAt))
      .orderBy(users.fullName);

    return rows.map((r) => ({ userId: r.userId, fullName: r.fullName ?? r.phone }));
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

      // CLI-446 G3 (bug tuzatildi — verify-agent topilmasi): adjustment claim/stamp
      // endi `createRun()` ichida, `FOR UPDATE` qulfi ostida, DARHOL bajariladi —
      // shuning uchun `finalizeRun()` bu yerda payroll_adjustments'ga UMUMAN
      // tegmaydi (avvalgi versiya shu yerda live-recompute+stamp qilardi, lekin
      // `payrollLines.commissionAmount` createRun'da FREEZE qilingani uchun ikkita
      // ketma-ket, hali finalize qilinmagan draft bir xil adjustmentni ikkalasi ham
      // "singdirib" qo'yishi mumkin edi — real-DB'da reproduce qilingan bug, doktor
      // kam to'lanardi). Endi createRun'dagi FOR UPDATE + darhol-stamp bu poygani
      // yopadi (ikkinchi createRun endi qatorni "band" deb ko'radi).

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

  /**
   * CLI-446 G3: `cashier.service.ts::refund()`dan chaqiriladigan narrow DI hook
   * (recall/priceLookup pattern — cashier o'zining `PayrollAdjustmentHook` tipini
   * mustaqil e'lon qiladi, bu yerda faqat strukturaviy mos funksiya bor, to'g'ridan
   * import YO'Q). Faqat FINALIZED run diapazoniga tushgan refund uchun adjustment
   * yozadi — draft davr qo'lda o'chirib qayta yaratilishi mumkin (CLI-417
   * `deleteRun`), refund shu bilan tabiiy hisobga olinadi.
   */
  async function recordRefundAdjustment(
    c: Context,
    args: {
      doctorId: string;
      branchId: string;
      sourceTransactionId: string;
      refundAmount: number;
      transactionCreatedAt: Date;
    },
  ): Promise<void> {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    // Asia/Tashkent (UTC+5, DST yo'q) kalendar kuni — createRun'dagi start/end
    // hisoblash metodologiyasi bilan izchil (teskari yo'nalish: timestamptz → sana).
    const tashkentDateStr = new Date(args.transactionCreatedAt.getTime() + 5 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const [run] = await db
      .select({ id: payrollRuns.id })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.status, 'finalized'),
          sql`daterange(${payrollRuns.periodFrom}, ${payrollRuns.periodTo}, '[]') @> ${tashkentDateStr}::date`,
        ),
      )
      .limit(1);
    if (!run) return; // finalized davrga tushmagan — draft qayta yaratilganda tabiiy hisobga olinadi.

    const [line] = await db
      .select({ commissionPercent: payrollLines.commissionPercent })
      .from(payrollLines)
      .where(and(eq(payrollLines.runId, run.id), eq(payrollLines.userId, args.doctorId)));
    if (!line) return; // doktor shu run'da komissiya olmagan — tuzatish hisoblab bo'lmaydi.

    const percent = Number(line.commissionPercent);
    const amount = -(Math.round(args.refundAmount * percent) / 100);

    await db.insert(payrollAdjustments).values({
      tenantId,
      branchId: args.branchId,
      doctorId: args.doctorId,
      sourceTransactionId: args.sourceTransactionId,
      amount: String(amount),
    });
  }

  return {
    createRun,
    listRuns,
    listStaffNames,
    getRun,
    finalizeRun,
    deleteRun,
    recordRefundAdjustment,
  };
};

export type PayrollService = ReturnType<typeof createPayrollService>;
