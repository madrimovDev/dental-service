import { randomBytes } from 'node:crypto';
import {
  cashierTransactionItems,
  cashierTransactions,
  expenses,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
} from '@dental/db-schema';
import { createNoOpFiscalProvider, type FiscalProvider } from '@dental/fiscal';
import { and, between, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import {
  computePlanBalance,
  distributeRefundNegations,
  fromCents,
  toCents,
} from './cashier.billing.ts';
import type { CreateTransactionInput, ListTransactionsQuery } from './cashier.schema.ts';

const generateReceiptNumber = (): string => {
  const date = new Date();
  const yyyymmdd = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
  const rnd = randomBytes(4).toString('hex').toUpperCase();
  return `R-${yyyymmdd}-${rnd}`;
};

/** Allocation yig'indisi paidAmount'dan oshganda — routes 400 ga aylantiradi. */
export class AllocationExceedError extends Error {
  constructor() {
    super('Allocation sum exceeds paid amount');
    this.name = 'AllocationExceedError';
  }
}

/**
 * CLI-459: plan-billing rejimida (`items=[]`) allocation yig'indisi `paidAmount`ga
 * AYNAN TENG bo'lishi shart — ilgari guard bir-tomonlama edi (faqat oshib ketish
 * RAD etilardi), `allocSum < paidAmount` bo'lganda esa `netTotalCents` to'g'ridan-
 * to'g'ri `paidAmount`dan olingani sababli "ko'rinmas" pul (allocatsiya qilinmagan
 * qoldiq) hech qanday buxgalteriya izisiz kassaga kirib kelardi.
 */
export class AllocationMismatchError extends Error {
  constructor() {
    super('Allocation sum must equal paid amount');
    this.name = 'AllocationMismatchError';
  }
}

/**
 * CLI-460: allocation'lar (`stageId`) HAQIQATDA bitta umumiy davolash rejasiga
 * tegishli emas, YOKI client yuborgan `treatmentPlanId`/`patientId` DB'dan
 * aniqlangan haqiqiy qiymatga mos kelmaydi (client qiymatiga ISHONILMAYDI —
 * CLI-443 "serverda hisobla" patterni). Mos kelmasa yoki allocation'lar aralash
 * planlarga tegishli bo'lsa — RAD (aks holda noto'g'ri/bo'sh `treatmentPlanId`
 * `payroll.service.ts`dagi INNER JOIN'ni o'tkazib yuborib, doktor komissiyasini
 * yo'qotadi).
 */
export class AllocationPlanMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AllocationPlanMismatchError';
  }
}

/**
 * CLI-443: POS item uchun filialda faol narx topilmasa — routes 400 ga aylantiradi.
 * Narxsiz xizmat POS orqali sotib bo'lmaydi (moliyaviy nazoratsizlik xavfi).
 */
export class NoActivePriceError extends Error {
  constructor(readonly serviceId: string) {
    super(`No active price for service ${serviceId} at this branch`);
    this.name = 'NoActivePriceError';
  }
}

/**
 * CLI-444: `discount` erkin POS itemsGross'dan katta bo'lganda routes 400 ga
 * aylantiradi — avvalgi jim `Math.max(0, ...)` clamp o'rniga.
 */
export class DiscountExceedsTotalError extends Error {
  constructor() {
    super('Discount exceeds items gross total');
    this.name = 'DiscountExceedsTotalError';
  }
}

/**
 * CLI-443: narrow DI hook (recall pattern bilan bir xil — RecallStageHook,
 * treatment-plans.service.ts). `services.service.ts::getActivePrice` shu shaklga
 * strukturaviy mos keladi — to'g'ridan import qilinmaydi, composition root'da uzatiladi.
 */
export type PriceLookup = {
  getActivePrice: (
    c: Context,
    serviceId: string,
    branchId: string,
  ) => Promise<{ price: string } | null>;
};

/**
 * CLI-452: `dailySummary` xarajat maydonlarini (`expensesTotal`/`netCashFlow`)
 * FAQAT shu ruxsat bo'lsa qaytaradi. `patients.service.ts::userHasPiiAccess`
 * bilan BIR XIL naqsh — yangi route middleware YO'Q, maydon-darajasidagi gate.
 */
const userHasExpenseAccess = (c: Context): boolean => {
  const perms = c.get('accessClaims')?.perms ?? [];
  return perms.includes('@owner') || perms.includes('expense.view');
};

/**
 * CLI-446 G3: narrow DI hook (recall/priceLookup pattern bilan bir xil) — payroll
 * modulidan inject qilinadi. Refund finalized payroll davriga tushsa, keyingi run
 * uchun carry-forward komissiya tuzatish yozadi (`payroll_adjustments`). Bog'liqlik
 * yo'nalishi: cashier → payroll (factory injection, to'g'ridan import emas).
 */
export type PayrollAdjustmentHook = {
  recordRefundAdjustment: (
    c: Context,
    args: {
      doctorId: string;
      branchId: string;
      sourceTransactionId: string;
      refundAmount: number;
      transactionCreatedAt: Date;
    },
  ) => Promise<void>;
};

export const createCashierService = (deps: {
  audit: AuditLogger;
  fiscal?: FiscalProvider;
  priceLookup?: PriceLookup;
  /** CLI-446 G3: refund finalized payroll davriga tushsa carry-forward tuzatish yozish uchun. */
  payrollAdjustment?: PayrollAdjustmentHook;
}) => {
  // DI: env'da SOLIQ_* bo'lsa real Soliq provider, aks holda NoOp (V3-1).
  const fiscal: FiscalProvider = deps.fiscal ?? createNoOpFiscalProvider();

  async function list(c: Context, query: ListTransactionsQuery) {
    const db = getDb(c);
    const offset = (query.page - 1) * query.pageSize;

    const filters = [];
    if (query.branchId) filters.push(eq(cashierTransactions.branchId, query.branchId));
    if (query.patientId) filters.push(eq(cashierTransactions.patientId, query.patientId));
    if (query.from && query.to) {
      // from/to date-only (z.iso.date). Asia/Tashkent kun chegarasi — dailySummary bilan
      // izchil. `new Date(query.to)` = UTC yarim tun bo'lib, o'sha kuni yaratilgan
      // tranzaksiyalarni chiqarib tashlar edi (CLI-152: "bugungi operatsiyalar" bo'sh).
      filters.push(
        between(
          cashierTransactions.createdAt,
          new Date(`${query.from}T00:00:00+05:00`),
          new Date(`${query.to}T23:59:59.999+05:00`),
        ),
      );
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(cashierTransactions)
        .where(where)
        .orderBy(desc(cashierTransactions.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      db.select({ total: count() }).from(cashierTransactions).where(where),
    ]);

    const total = totalRows[0]?.total ?? 0;

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'cashier_transaction',
      resourceId: query.patientId ?? null,
      after: {
        patientId: query.patientId ?? null,
        branchId: query.branchId ?? null,
        count: rows.length,
      },
    });

    return { data: rows, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async function getById(c: Context, id: string) {
    const db = getDb(c);
    const [tx] = await db.select().from(cashierTransactions).where(eq(cashierTransactions.id, id));
    if (!tx) return null;

    const items = await db
      .select()
      .from(cashierTransactionItems)
      .where(eq(cashierTransactionItems.transactionId, id));

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'cashier_transaction',
      resourceId: id,
    });

    return { ...tx, items };
  }

  async function create(c: Context, input: CreateTransactionInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    // CLI-443: POS item narxi client'dan ISHONCH bilan qabul qilinmaydi — har
    // item uchun SERVERDA `getActivePrice(serviceId, branchId)` orqali hisoblanadi.
    // Yozuv tranzaksiyasi ochilishidan OLDIN (getDb(c) — request-level RLS tx,
    // priceLookup ham xuddi shu tx'ni ishlatadi; savepoint ichida emas — sof o'qish).
    // Faol narx topilmasa — NoActivePriceError (routes 400 `cashier.no_active_price`).
    const resolvedItems =
      input.items.length > 0
        ? await Promise.all(
            input.items.map(async (i) => {
              if (!deps.priceLookup) {
                throw new Error('priceLookup dependency required for POS items');
              }
              const price = await deps.priceLookup.getActivePrice(c, i.serviceId, input.branchId);
              if (!price) throw new NoActivePriceError(i.serviceId);
              return { ...i, unitPrice: Number(price.price) };
            }),
          )
        : [];

    // CLI-453 #4: guard taqqoslashlari sentlarda (×100, butun son) — distributeRefundNegations
    // uslubi (cashier.billing.ts). Xulq o'zgarmaydi (butun so'm summalar uchun natija bir
    // xil), faqat kelajakdagi kasr-summa float-drift xavfi bartaraf etiladi.
    const itemsGrossCents = resolvedItems.reduce(
      (sum, i) => sum + toCents(i.unitPrice) * i.quantity,
      0,
    );
    const discountCents = toCents(input.discount);

    // CLI-444: discount itemsGross'dan katta bo'lsa jim clamp o'rniga RAD etiladi
    // (routes 400 `cashier.discount_exceeds_total`). Faqat erkin POS (items bor)
    // rejimida ma'noli — plan-billing (allocations) discount'dan mustaqil.
    if (resolvedItems.length > 0 && discountCents > itemsGrossCents) {
      throw new DiscountExceedsTotalError();
    }

    // Erkin POS: jami − chegirma (endi manfiy bo'lmasligi kafolatlangan — yuqoridagi guard).
    // Plan-billing (items bo'sh): allocation = paidAmount.
    const netTotalCents =
      resolvedItems.length > 0 ? itemsGrossCents - discountCents : toCents(input.paidAmount);
    const netTotal = fromCents(netTotalCents);

    // CLI-459: allocation yig'indisi paidAmount'ga AYNAN TENG bo'lishi shart
    // (avval bir-tomonlama edi — kam bo'lishi jim o'tar edi, "ko'rinmas" pul).
    if (input.allocations && input.allocations.length > 0) {
      const allocSumCents = input.allocations.reduce((s, a) => s + toCents(a.amount), 0);
      if (allocSumCents !== toCents(input.paidAmount)) {
        throw new AllocationMismatchError();
      }
    }

    // CLI-460: allocations berilganda `treatmentPlanId`/`patientId` client'dan
    // ISHONCH bilan qabul qilinmaydi — stageId'larning HAQIQIY egaligi DB'dan
    // aniqlanadi (treatmentStages.treatmentPlanId doim NOT NULL, o'zgarmas —
    // tx ochilishidan OLDIN sof o'qish, priceLookup bilan bir xil naqsh).
    // `input.treatmentPlanId`/`patientId` berilsa — mos kelishi SHART (aks holda
    // AllocationPlanMismatchError); berilmasa — aniqlangan qiymat DERIVE qilinadi.
    let resolvedTreatmentPlanId: string | null = input.treatmentPlanId ?? null;
    let resolvedPatientId: string | null = input.patientId ?? null;

    if (input.allocations && input.allocations.length > 0) {
      const stageIds = [...new Set(input.allocations.map((a) => a.stageId))];
      const stagePlans = await db
        .select({
          treatmentPlanId: treatmentStages.treatmentPlanId,
          patientId: treatmentPlans.patientId,
        })
        .from(treatmentStages)
        .innerJoin(treatmentPlans, eq(treatmentStages.treatmentPlanId, treatmentPlans.id))
        .where(inArray(treatmentStages.id, stageIds));

      // Topilmagan stageId (boshqa tenant/mavjud emas) — bu yerda jim o'tkaziladi,
      // mavjud per-stage cost-cap guard (tx ichida, `.for('update')`) baribir
      // AllocationExceedError tashlaydi. Faqat TOPILGANLAR plan izchilligi tekshiriladi.
      const distinctPlanIds = new Set(stagePlans.map((s) => s.treatmentPlanId));
      if (distinctPlanIds.size > 1) {
        throw new AllocationPlanMismatchError(
          "Barcha allocationlar bitta davolash rejasiga tegishli bo'lishi kerak",
        );
      }

      const derivedPlanId = stagePlans[0]?.treatmentPlanId ?? null;
      const derivedPatientId = stagePlans[0]?.patientId ?? null;

      if (derivedPlanId) {
        if (input.treatmentPlanId && input.treatmentPlanId !== derivedPlanId) {
          throw new AllocationPlanMismatchError(
            'treatmentPlanId allocation bosqichlarining haqiqiy rejasiga mos kelmaydi',
          );
        }
        if (input.patientId && input.patientId !== derivedPatientId) {
          throw new AllocationPlanMismatchError(
            'patientId allocation bosqichlarining haqiqiy bemoriga mos kelmaydi',
          );
        }
        resolvedTreatmentPlanId = derivedPlanId;
        resolvedPatientId = derivedPatientId;
      }
    }

    const receiptNumber = generateReceiptNumber();

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const [transaction] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          branchId: input.branchId,
          patientId: resolvedPatientId,
          treatmentPlanId: resolvedTreatmentPlanId,
          receiptNumber,
          totalAmount: String(netTotal),
          paidAmount: String(input.paidAmount),
          discount: String(input.discount),
          paymentMethod: input.paymentMethod,
          notes: input.notes ?? null,
          createdBy: user?.id ?? null,
        })
        .returning();

      if (!transaction) throw new Error('Transaction insert failed');

      // Items — bo'sh massivni insert qilmaymiz (Drizzle throw qiladi). Plan-billing'da items bo'sh.
      // unitPrice/subtotal — server tomonidan resolvedItems'dan (CLI-443, client qiymati emas).
      const items =
        resolvedItems.length > 0
          ? await tx
              .insert(cashierTransactionItems)
              .values(
                resolvedItems.map((i) => ({
                  transactionId: transaction.id,
                  serviceId: i.serviceId,
                  serviceName: i.serviceName,
                  quantity: i.quantity,
                  unitPrice: String(i.unitPrice),
                  subtotal: String(i.unitPrice * i.quantity),
                })),
              )
              .returning()
          : [];

      // Per-bosqich allocation rowlar (ijobiy = to'lov). Bir tx ichida (RLS tx-bound).
      if (input.allocations && input.allocations.length > 0) {
        // CLI-413: overpay guard'ni bir REQUEST ichida stage bo'yicha AGREGAT
        // qilamiz — aks holda [{X,100k},{X,100k}] har biri mustaqil o'tib, 100k
        // cost'ga 200k tushardi. Stage row'ni `.for('update')` bilan qulflaymiz
        // (parallel to'lov poygasi — TOCTOU). Deterministik tartib (stageId sort)
        // deadlock'ni oldini oladi.
        const requestedByStage = new Map<string, number>();
        for (const a of input.allocations) {
          requestedByStage.set(a.stageId, (requestedByStage.get(a.stageId) ?? 0) + a.amount);
        }
        for (const stageId of [...requestedByStage.keys()].sort()) {
          const requested = requestedByStage.get(stageId) as number;
          const [stage] = await tx
            .select({ cost: treatmentStages.cost })
            .from(treatmentStages)
            .where(eq(treatmentStages.id, stageId))
            .for('update');
          if (!stage) throw new AllocationExceedError();
          const [paidRow] = await tx
            .select({
              paid: sql<string>`COALESCE(SUM(${treatmentStagePayments.amount}), 0)`,
            })
            .from(treatmentStagePayments)
            .where(eq(treatmentStagePayments.stageId, stageId));
          const existingPaid = Number(paidRow?.paid ?? 0);
          if (existingPaid + requested > Number(stage.cost)) {
            throw new AllocationExceedError();
          }
        }
        await tx.insert(treatmentStagePayments).values(
          input.allocations.map((a) => ({
            tenantId,
            transactionId: transaction.id,
            stageId: a.stageId,
            amount: String(a.amount),
          })),
        );
      }

      // Fiscal (NoOp — M3 da). CLI-449: paidAmount (haqiqatda olingan naqd) —
      // totalAmount (nominal/hisob-faktura) EMAS, qisman to'langan savdoda fiskal
      // chek haqiqiy qabul qilingan summaga mos bo'lishi uchun.
      const fiscalResult = await fiscal.createReceipt({
        id: transaction.id,
        amount: Number(transaction.paidAmount),
        items: items,
      });

      if (fiscalResult.fiscalId || fiscalResult.response) {
        await tx
          .update(cashierTransactions)
          .set({
            fiscalReceiptId: fiscalResult.fiscalId,
            fiscalResponse: fiscalResult.response as object,
          })
          .where(eq(cashierTransactions.id, transaction.id));
      }

      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'cashier_transaction',
        resourceId: transaction.id,
        after: { receiptNumber, totalAmount: netTotal, items: input.items.length },
      });

      return { ...transaction, items };
    });
  }

  /**
   * Refund — to'liq YOKI qisman (V2-4, CLI-244).
   * `amount` berilmasa = qolgan to'liq summa (eski xulq: void). Qisman (`amount` <
   * qolgan) FAQAT plan-linked tranzaksiyada ruxsat (non-plan = semantik noaniqlik,
   * line-item modeli yo'q → faqat to'liq). Mexanizm: kompensatsiya refund txn +
   * PROPORSIONAL negative allocation (per-stage phantom-credit avtomatik oldi olinadi).
   * Cumulative guard: Σ(refund.paidAmount) ≤ original.paidAmount. Original HECH QACHON
   * void qilinmaydi — manfiy `type='refund'` qatori yagona buxgalteriya izi (CLI-406:
   * void + refund-qatori ikkalasi daromadни ikki marta ayirardi; qisman-refund modeli
   * bilan bir xil yagona model). Advisor qarori + Qaror #24 (allocation filtrlanmaydi).
   */
  async function refund(
    c: Context,
    id: string,
    amount?: number,
  ): Promise<
    | { ok: true; refund: typeof cashierTransactions.$inferSelect }
    | { ok: false; reason: 'invalid' | 'over_refund' | 'non_plan_partial' }
  > {
    const db = getDb(c);

    const txResult = await db.transaction(async (tx) => {
      // Row-lock: ikki parallel refund poygasini oldini olish (TOCTOU). Guard tx ichida.
      const [original] = await tx
        .select()
        .from(cashierTransactions)
        .where(eq(cashierTransactions.id, id))
        .for('update');
      if (!original) return { ok: false as const, reason: 'invalid' as const };
      // Refund of refund yoki allaqachon void qilingan — RAD.
      if (original.type === 'refund' || original.status === 'voided') {
        return { ok: false as const, reason: 'invalid' as const };
      }

      const paid = Number(original.paidAmount);

      // Allaqachon qaytarilgan summa (shu parentning refund row'lari).
      const [refundedRow] = await tx
        .select({ sum: sql<string>`COALESCE(SUM(${cashierTransactions.paidAmount}), 0)` })
        .from(cashierTransactions)
        .where(
          and(
            eq(cashierTransactions.parentTransactionId, id),
            eq(cashierTransactions.type, 'refund'),
          ),
        );
      const alreadyRefunded = Number(refundedRow?.sum ?? 0);
      const remaining = paid - alreadyRefunded;

      const refundAmount = amount ?? remaining;
      if (!(refundAmount > 0)) return { ok: false as const, reason: 'invalid' as const };
      if (refundAmount > remaining) return { ok: false as const, reason: 'over_refund' as const };

      // Qisman (yoki ketma-ket) refund — faqat plan-linked.
      const isPartial = refundAmount < paid;
      if (!original.treatmentPlanId && (isPartial || alreadyRefunded > 0)) {
        return { ok: false as const, reason: 'non_plan_partial' as const };
      }

      const refundSeq =
        (
          await tx
            .select({ c: count() })
            .from(cashierTransactions)
            .where(
              and(
                eq(cashierTransactions.parentTransactionId, id),
                eq(cashierTransactions.type, 'refund'),
              ),
            )
        )[0]?.c ?? 0;

      const [refundTx] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId: original.tenantId,
          branchId: original.branchId,
          patientId: original.patientId,
          treatmentPlanId: original.treatmentPlanId,
          receiptNumber: `${original.receiptNumber}-R${refundSeq + 1}`,
          totalAmount: String(refundAmount),
          paidAmount: String(refundAmount),
          discount: '0',
          paymentMethod: original.paymentMethod,
          type: 'refund',
          parentTransactionId: id,
          status: 'completed',
          notes: `Refund of ${original.receiptNumber}${isPartial ? ` (${refundAmount})` : ''}`,
          createdBy: c.get('user')?.id ?? null,
        })
        .returning();
      if (!refundTx) return { ok: false as const, reason: 'invalid' as const };

      // Asl allocation'larni PROPORSIONAL negatsiya (balansni tiklaydi). Proporsional
      // bo'lgani uchun har bosqich uchun Σ negatsiya ≤ asl allocation (phantom-credit yo'q).
      const origAllocations = await tx
        .select({ stageId: treatmentStagePayments.stageId, amount: treatmentStagePayments.amount })
        .from(treatmentStagePayments)
        .where(eq(treatmentStagePayments.transactionId, id));

      if (origAllocations.length > 0) {
        // CLI-418: 2dp yaxlitlash + residue true-up (Σ negatsiya aynan proporsional
        // maqsad — kasr drift yo'q). `factor` inline ko'paytirish o'rniga sof helper.
        const negations = distributeRefundNegations(origAllocations, refundAmount, paid);
        await tx.insert(treatmentStagePayments).values(
          negations.map((n) => ({
            tenantId: original.tenantId,
            transactionId: refundTx.id,
            stageId: n.stageId,
            amount: n.amount,
          })),
        );
      }

      // CLI-406: original HECH QACHON void qilinmaydi (to'liq refundda ham
      // `completed` qoladi) — manfiy refund qatori yagona buxgalteriya izi.
      // Aks holda void completed-filtrdan chiqarardi VA refund qatori negatsiya
      // qilardi → daromad ikki marta ayirilardi.

      await deps.audit.record(c, {
        action: 'refunded',
        resourceType: 'cashier_transaction',
        resourceId: id,
        before: original,
        after: refundTx,
      });

      // CLI-446 G3: payroll carry-forward hook uchun kerakli maydonlarni tx
      // ichidan tashqariga olib chiqamiz (tx yopilgandan keyin hook chaqiriladi).
      // Faqat plan-linked tranzaksiyada doktor bor (treatmentPlans.doctorId) —
      // non-plan savdo payroll attributsiyasiga umuman bog'lanmagan (createRun
      // ham faqat treatmentPlanId orqali join qiladi), shuning uchun bu yerda
      // ANIQLASH kifoya, hookni CHAQIRISH emas.
      let payrollDoctorId: string | null = null;
      if (original.treatmentPlanId) {
        const [plan] = await tx
          .select({ doctorId: treatmentPlans.doctorId })
          .from(treatmentPlans)
          .where(eq(treatmentPlans.id, original.treatmentPlanId));
        payrollDoctorId = plan?.doctorId ?? null;
      }

      return {
        ok: true as const,
        refund: refundTx,
        payrollDoctorId,
        payrollBranchId: original.branchId,
        payrollRefundAmount: refundAmount,
        payrollTransactionCreatedAt: original.createdAt,
      };
    });

    // CLI-446 G3: tx (savepoint) commit qilingandan KEYIN, lekin hali umumiy
    // request-tranzaksiya (rlsMiddleware) ichida chaqiriladi — `deps.recall.
    // autoCreateFromStage(c, ...)` bilan bir xil naqsh (treatment-plans.service.ts).
    // Agar hook otsa — butun request-tranzaksiya rollback bo'ladi (refund + adjustment
    // baribir bir-biriga bog'liq atomik holda qoladi: yozib bo'lmagan adjustment
    // refundni ham bekor qiladi).
    if (txResult.ok && txResult.payrollDoctorId && deps.payrollAdjustment) {
      await deps.payrollAdjustment.recordRefundAdjustment(c, {
        doctorId: txResult.payrollDoctorId,
        branchId: txResult.payrollBranchId,
        sourceTransactionId: txResult.refund.id,
        refundAmount: txResult.payrollRefundAmount,
        transactionCreatedAt: txResult.payrollTransactionCreatedAt,
      });
    }

    if (!txResult.ok) return txResult;
    return { ok: true as const, refund: txResult.refund };
  }

  /** Daily summary for cashier close */
  async function dailySummary(c: Context, branchId: string, dateStr: string) {
    const db = getDb(c);
    // Asia/Tashkent (UTC+5, DST yo'q) kun chegarasi — appointments bilan izchil (f73a785).
    const start = new Date(`${dateStr}T00:00:00+05:00`);
    const end = new Date(`${dateStr}T23:59:59.999+05:00`);

    const rows = await db
      .select({
        paymentMethod: cashierTransactions.paymentMethod,
        type: cashierTransactions.type,
        // CLI-419: olingan pul = paidAmount (totalAmount = hisob-faktura; sale kam
        // to'langan bo'lishi mumkin → kassa qoldig'i totalAmount emas). `type` bo'yicha
        // guruhlanadi — frontend refundni kassa-chiqim sifatida netlaydi.
        total: sql<string>`SUM(${cashierTransactions.paidAmount})`,
        count: count(),
      })
      .from(cashierTransactions)
      .where(
        and(
          eq(cashierTransactions.branchId, branchId),
          between(cashierTransactions.createdAt, start, end),
          eq(cashierTransactions.status, 'completed'),
        ),
      )
      .groupBy(cashierTransactions.paymentMethod, cashierTransactions.type);

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'cashier_transaction',
      resourceId: branchId,
      after: { date: dateStr, count: rows.length },
    });

    const base = { date: dateStr, branchId, breakdown: rows };

    // CLI-452: expensesTotal/netCashFlow FAQAT `expense.view` (yoki `@owner`)
    // bo'lsa qo'shiladi — routes'da yangi middleware YO'Q, maydon-darajasidagi gate.
    if (!userHasExpenseAccess(c)) return base;

    // `expenses.date` — naive `date` ustuni (calendar kun, instant emas) —
    // expenses.service.ts bilan bir xil to'g'ridan-to'g'ri string taqqoslash
    // (Tashkent T00:00 arifmetikasi kerak emas). branchId=null (tenant-darajali,
    // masalan ijara) xarajatlar QASDDAN hisobga OLINMAYDI — "shu filial uchun"
    // literal talqin (Architecture izohi, kelajakda kengaytirilishi mumkin).
    const [expenseRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses)
      .where(and(eq(expenses.branchId, branchId), eq(expenses.date, dateStr)));
    const expensesTotal = Number(expenseRow?.total ?? 0);

    // Sof tushum — `DailySummaryCard.tsx`dagi `totalPayment - totalRefund` bilan
    // AYNAN bir xil formula (`void` HISOBGA OLINMAYDI — reports moduli
    // `signedPaidAmount`sidan farqli, bu yerda frontend kartaga mos bo'lish kerak).
    const netRevenue = rows.reduce((sum, r) => {
      const amount = Number(r.total);
      if (r.type === 'payment') return sum + amount;
      if (r.type === 'refund') return sum - amount;
      return sum;
    }, 0);

    return { ...base, expensesTotal, netCashFlow: netRevenue - expensesTotal };
  }

  /** Plan balansi — sof o'qish (treatment_stages + allocation yig'indilari). Saqlanmaydi. */
  async function planBalance(c: Context, planId: string) {
    const db = getDb(c);

    // Plan status — C4 predikatining 3-konjunkti (qarzga kiruvchi reja). RLS filtrlaydi.
    const [plan] = await db
      .select({ status: treatmentPlans.status })
      .from(treatmentPlans)
      .where(eq(treatmentPlans.id, planId));

    // Plan bosqichlari (RLS tenant orqali filtrlaydi — explicit WHERE tenant_id YOZILMAYDI).
    // acceptance MAJBURIY — pure fn'ga uzatiladi (C4: faqat 'accepted' qarz cost'iga kiradi).
    const stageRows = await db
      .select({
        id: treatmentStages.id,
        serviceName: treatmentStages.serviceName,
        cost: treatmentStages.cost,
        status: treatmentStages.status,
        acceptance: treatmentStages.acceptance,
      })
      .from(treatmentStages)
      .where(eq(treatmentStages.treatmentPlanId, planId));

    // Shu bosqichlarga tegishli allocation'lar.
    const allocRows = await db
      .select({
        stageId: treatmentStagePayments.stageId,
        amount: treatmentStagePayments.amount,
      })
      .from(treatmentStagePayments)
      .innerJoin(treatmentStages, eq(treatmentStagePayments.stageId, treatmentStages.id))
      .where(eq(treatmentStages.treatmentPlanId, planId));

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'treatment_plan',
      resourceId: planId,
      after: { stageCount: stageRows.length },
    });

    return computePlanBalance(stageRows, allocRows, plan?.status);
  }

  /**
   * Bemorning davolash rejalari — kassa plan-billing selektori uchun (CLI-155).
   * Faqat `{id, title, status}` (yengil) — klinik detal YO'Q, `cashier.view` yetarli.
   * RLS tenant'ni filtrlaydi (explicit WHERE tenant_id YOZILMAYDI).
   */
  async function listPatientPlans(c: Context, patientId: string) {
    const db = getDb(c);
    const rows = await db
      .select({
        id: treatmentPlans.id,
        title: treatmentPlans.title,
        status: treatmentPlans.status,
      })
      .from(treatmentPlans)
      .where(eq(treatmentPlans.patientId, patientId))
      .orderBy(desc(treatmentPlans.createdAt));

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'treatment_plan',
      resourceId: patientId,
      after: { count: rows.length },
    });

    return rows;
  }

  return { list, getById, create, refund, dailySummary, planBalance, listPatientPlans };
};

export type CashierService = ReturnType<typeof createCashierService>;
