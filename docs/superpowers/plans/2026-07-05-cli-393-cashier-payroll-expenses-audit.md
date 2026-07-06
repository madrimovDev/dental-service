# CLI-393 — Cashier/payroll/expenses o'qishlari audit_log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `cashier.service.ts` (`list`/`getById`/`dailySummary`/`planBalance`/`listPatientPlans`), `payroll.service.ts` (`listRuns`/`getRun`), `expenses.service.ts` (`list`/`getById`) — barchasi `action: 'viewed'` audit yozuvi qo'shadi. CLI-363/364'da o'rnatilgan naqshni davom ettirib, CLAUDE.md §3.10 gap'ini moliyaviy modullarda ham yopish.

**Architecture:** CLI-363/364 bilan bir xil yondashuv: bitta-yozuvli `getById`/`getRun` funksiyalar `patients.service.ts`ning `getMedicalRecord` naqshini takrorlaydi (topilsa — `action`/`resourceType`/`resourceId`, `before`/`after` yo'q); ko'p-yozuvli/aggregat `list`/`listRuns`/`listPatientPlans`/`dailySummary`/`planBalance` funksiyalar har doim log qiladi (`after: { count/date/stageCount, scoping-param }`). Har o'qish funksiyasi mos mutatsiya bilan **bir xil `resourceType`** ishlatadi (`cashier_transaction`, `payroll_run`, `expense` — mavjud `create`/`refund`/`createRun`/`finalizeRun` audit chaqiruvlaridan olingan), `planBalance`/`listPatientPlans` esa `treatment_plan` ishlatadi (CLI-363'dagi `treatment-plans.service.ts` bilan bir xil jadval/resourceType — boshqa endpoint, bir xil resurs).

**Tech Stack:** Bun, `apps/api/src/lib/audit-logger.ts` (`AuditLogger.record(c, entry: AuditEntry)`), Drizzle, PostgreSQL (real DB integration test), `bun:test` (`bun test --env-file=../../.env`, NOT vitest).

## Global Constraints

- Audit `'viewed'` chaqiruvlari **faqat identifying metadata** yozadi. `cashierTransactions.totalAmount`/`paidAmount`/`discount`, `cashierTransactionItems`, `treatmentStagePayments.amount`, `payrollLines.baseSalary`/`commissionAmount`/`total`, `expenses.amount` — HECH BIRI audit `after` maydoniga kirmaydi (CLAUDE.md §3.10). Ruxsat etilgan: `count`, `date`, `stageCount`, scoping parametr (`patientId`/`branchId`/`categoryId` — allaqachon query-string'da ko'rinadi).
- Repo qatlami yo'q bu uch modulda (inline Drizzle service ichida) — audit chaqiruvi to'g'ridan-to'g'ri mavjud `*.service.ts` funksiyalari ichidagi select bloklariga qo'shiladi, query mantig'i (filter/join/groupBy) o'zgarmaydi.
- Mavjud mutation audit chaqiruvlari (`create`/`refund` — cashier; `createRun`/`finalizeRun` — payroll; kategoriya/xarajat CRUD — expenses) o'zgarmaydi.
- Mavjud testlar (`cashier-plan-balance.test.ts`, `cashier-list-daterange.test.ts`, `payroll.test.ts`, `expenses.test.ts` — barchasi `noopAudit` bilan) yangi audit chaqiruvidan keyin ham yashil qolishi shart.
- Test konvensiyasi: audit predmet bo'lgan yangi testlar **real** `createAuditLogger({ db })` ishlatadi (mock/spy YO'Q) + `auditLog` jadvalidan to'g'ridan-to'g'ri select bilan tasdiqlaydi (CLI-363/364 naqshi).
- `expenses.service.ts`ning `summary()` — scope tashqarisida (ticket ro'yxatida yo'q), o'zgartirilmaydi.

---

### Task 1: `cashier.service.ts` — `list`/`getById`/`dailySummary`/`planBalance`/`listPatientPlans` audit

**Files:**
- Modify: `apps/api/src/modules/cashier/cashier.service.ts:36-71,73-84,336-360,363-396,403-414`
- Test: `apps/api/tests/integration/cli-393-cashier-audit.test.ts` (yangi)

**Interfaces:**
- Consumes: `AuditLogger.record(c: Context, entry: { action: string; resourceType: string; resourceId?: string | null; before?: unknown; after?: unknown; tenantIdOverride?: string | null }): Promise<void>` (`apps/api/src/lib/audit-logger.ts:24-34`).
- Produces: `list`/`getById`/`dailySummary`/`planBalance`/`listPatientPlans` xatti-harakati o'zgarmaydi (qaytariladigan qiymat bir xil shakl), audit yon-effekti qo'shiladi.

- [ ] **Step 1: Write the failing test**

`apps/api/tests/integration/cli-393-cashier-audit.test.ts`:
```ts
/**
 * CLI-393 — cashier.service.ts o'qish funksiyalari (list/getById/dailySummary/
 * planBalance/listPatientPlans) audit_log'ga 'viewed' yozuvi qo'shishini tasdiqlaydi.
 * REAL DB + real audit logger. Audit `after`da moliyaviy summa YO'Q (faqat count/date).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-393-cashier`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  auditLog,
  branches,
  cashierTransactions,
  patients,
  tenants,
  treatmentPlans,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';

const audit = createAuditLogger({ db });
const service = createCashierService({ audit });

let tenantId: string;
let userId: string;
let branchId: string;
let patientId: string;
let planId: string;
let transactionId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: userId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000090', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Cashier Audit Clinic', slug: 'cashier-audit-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Branch 1' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');
    branchId = branch.id;

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: userId, title: 'Reja', status: 'accepted' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    planId = plan.id;

    await tx.insert(treatmentStages).values({
      treatmentPlanId: planId,
      sequence: 1,
      serviceName: 'Davolash',
      cost: '200000',
      status: 'pending',
      acceptance: 'accepted',
    });

    const [transaction] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId,
        patientId,
        treatmentPlanId: planId,
        receiptNumber: 'R-20260515-TEST0001',
        totalAmount: '100000',
        paidAmount: '100000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: new Date('2026-05-15T10:00:00+05:00'),
      })
      .returning({ id: cashierTransactions.id });
    if (!transaction) throw new Error('transaction insert failed');
    transactionId = transaction.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const selectAuditRows = (...conds: Parameters<typeof and>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return tx
      .select()
      .from(auditLog)
      .where(and(...conds));
  });

describe('Cashier — o‘qish audit (CLI-393)', () => {
  test('list(): action=viewed/resourceType=cashier_transaction/resourceId=patientId, summa yo‘q', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.list(ctx(tx), { page: 1, pageSize: 20, patientId });
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'cashier_transaction'),
      eq(auditLog.resourceId, patientId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(rows[0]?.after ?? {})).not.toContain('100000');
  });

  test('getById(): resourceId=transaction.id', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.getById(ctx(tx), transactionId);
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'cashier_transaction'),
      eq(auditLog.resourceId, transactionId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('dailySummary(): resourceId=branchId, summa yo‘q (faqat date/count)', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.dailySummary(ctx(tx), branchId, '2026-05-15');
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'cashier_transaction'),
      eq(auditLog.resourceId, branchId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(rows[0]?.after ?? {})).not.toContain('100000');
  });

  test('planBalance(): resourceType=treatment_plan/resourceId=planId, summa yo‘q', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.planBalance(ctx(tx), planId);
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'treatment_plan'),
      eq(auditLog.resourceId, planId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(rows[0]?.after ?? {})).not.toContain('200000');
  });

  test('listPatientPlans(): resourceType=treatment_plan/resourceId=patientId', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.listPatientPlans(ctx(tx), patientId);
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'treatment_plan'),
      eq(auditLog.resourceId, patientId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bun test --env-file=../../.env cli-393-cashier
```
Barcha 5 test FAIL (0 audit qatori).

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/cashier/cashier.service.ts:36-71` (`list`) ni almashtiring — faqat `return` dan oldin audit qo'shiladi:
```ts
  async function list(c: Context, query: ListTransactionsQuery) {
    const db = getDb(c);
    const offset = (query.page - 1) * query.pageSize;

    const filters = [];
    if (query.branchId) filters.push(eq(cashierTransactions.branchId, query.branchId));
    if (query.patientId) filters.push(eq(cashierTransactions.patientId, query.patientId));
    if (query.from && query.to) {
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
```

`73-84`-qator (`getById`) ni almashtiring:
```ts
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
```

`336-360`-qator (`dailySummary`) ni almashtiring:
```ts
  /** Daily summary for cashier close */
  async function dailySummary(c: Context, branchId: string, dateStr: string) {
    const db = getDb(c);
    const start = new Date(`${dateStr}T00:00:00+05:00`);
    const end = new Date(`${dateStr}T23:59:59.999+05:00`);

    const rows = await db
      .select({
        paymentMethod: cashierTransactions.paymentMethod,
        type: cashierTransactions.type,
        total: sql<string>`SUM(${cashierTransactions.totalAmount})`,
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

    return { date: dateStr, branchId, breakdown: rows };
  }
```

`363-396`-qator (`planBalance`) ni almashtiring — faqat oxiriga audit qo'shiladi:
```ts
  /** Plan balansi — sof o'qish (treatment_stages + allocation yig'indilari). Saqlanmaydi. */
  async function planBalance(c: Context, planId: string) {
    const db = getDb(c);

    const [plan] = await db
      .select({ status: treatmentPlans.status })
      .from(treatmentPlans)
      .where(eq(treatmentPlans.id, planId));

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
```

`403-414`-qator (`listPatientPlans`) ni almashtiring — endi query natijasi materiallashtiriladi (audit uchun `count` kerak):
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bun test --env-file=../../.env cli-393-cashier
```
Barcha 5 test PASS.

Regressiya:
```bash
cd apps/api && bun test --env-file=../../.env cashier-plan-balance
cd apps/api && bun test --env-file=../../.env cashier-list-daterange
```
Ikkalasi ham yashil qolishi shart (`noopAudit` — yangi audit chaqiruvi no-op, xatti-harakatga ta'sir qilmaydi).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/cashier/cashier.service.ts apps/api/tests/integration/cli-393-cashier-audit.test.ts
git commit -m "fix(api): audit-log cashier reads (CLI-393)"
```

---

### Task 2: `payroll.service.ts` — `listRuns`/`getRun` audit

**Files:**
- Modify: `apps/api/src/modules/payroll/payroll.service.ts:111-114,116-128`
- Test: `apps/api/tests/integration/cli-393-payroll-audit.test.ts` (yangi)

**Interfaces:**
- Consumes: `AuditLogger.record` (bir xil signature).
- Produces: `listRuns(c)` — massiv; `getRun(c, runId)` — `{...run, lines}` yoki `null`. Xatti-harakat o'zgarmaydi.

- [ ] **Step 1: Write the failing test**

`apps/api/tests/integration/cli-393-payroll-audit.test.ts`:
```ts
/**
 * CLI-393 — payroll.service.ts o'qish funksiyalari (listRuns/getRun) audit_log'ga
 * 'viewed' yozuvi qo'shishini tasdiqlaydi. REAL DB + real audit logger. Audit
 * `after`da maosh/komissiya summasi YO'Q.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-393-payroll`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, tenants, users } from '@dental/db-schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createPayrollService } from '../../src/modules/payroll/payroll.service.ts';

const audit = createAuditLogger({ db });
const service = createPayrollService({ audit });

let tenantId: string;
let userId: string;
let runId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: userId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000091', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Payroll Audit Clinic', slug: 'payroll-audit-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  // Aktiv profil/plan yo'q — createRun 0-line run yaratadi, listRuns/getRun uchun yetarli.
  const run = await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return service.createRun(ctx(tx), { periodFrom: '2026-06-01', periodTo: '2026-06-30' });
  });
  runId = run.id;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const selectAuditRows = (...conds: Parameters<typeof and>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return tx
      .select()
      .from(auditLog)
      .where(and(...conds));
  });

describe('Payroll — o‘qish audit (CLI-393)', () => {
  test('listRuns(): action=viewed/resourceType=payroll_run/resourceId=null', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.listRuns(ctx(tx));
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'payroll_run'),
      isNull(auditLog.resourceId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('getRun(): resourceId=run.id, summa yo‘q', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.getRun(ctx(tx), runId);
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'payroll_run'),
      eq(auditLog.resourceId, runId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.after).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bun test --env-file=../../.env cli-393-payroll
```
Ikkala test FAIL (0 audit qatori `action='viewed'` uchun — faqat `createRun`ning `action='created'` yozuvi bor).

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/payroll/payroll.service.ts:111-114` (`listRuns`) ni almashtiring:
```ts
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
```

`116-128`-qator (`getRun`) ni almashtiring:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bun test --env-file=../../.env cli-393-payroll
```
Ikkala test PASS.

Regressiya:
```bash
cd apps/api && bun test --env-file=../../.env payroll
```
Yashil qolishi shart (`noopAudit` bilan, mavjud `listRuns`/`getRun`/`createRun`/`finalizeRun` assertlari o'zgarmaydi).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/payroll/payroll.service.ts apps/api/tests/integration/cli-393-payroll-audit.test.ts
git commit -m "fix(api): audit-log payroll reads (CLI-393)"
```

---

### Task 3: `expenses.service.ts` — `list`/`getById` audit

**Files:**
- Modify: `apps/api/src/modules/expenses/expenses.service.ts:112-139,141-145`
- Test: `apps/api/tests/integration/cli-393-expenses-audit.test.ts` (yangi)

**Interfaces:**
- Consumes: `AuditLogger.record` (bir xil signature).
- Produces: `list(c, query: ListExpensesQuery)` — `{data, meta}`; `getById(c, id)` — bitta yozuv yoki `null`. Xatti-harakat o'zgarmaydi.

- [ ] **Step 1: Write the failing test**

`apps/api/tests/integration/cli-393-expenses-audit.test.ts`:
```ts
/**
 * CLI-393 — expenses.service.ts o'qish funksiyalari (list/getById) audit_log'ga
 * 'viewed' yozuvi qo'shishini tasdiqlaydi. REAL DB + real audit logger. Audit
 * `after`da xarajat summasi YO'Q.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-393-expenses`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, expenses, tenants, users } from '@dental/db-schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createExpensesService } from '../../src/modules/expenses/expenses.service.ts';

const audit = createAuditLogger({ db });
const service = createExpensesService({ audit });

let tenantId: string;
let userId: string;
let expenseId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: userId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000092', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Expense Audit Clinic', slug: 'expense-audit-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [row] = await tx
      .insert(expenses)
      .values({ tenantId, amount: '150000', date: '2026-06-15', createdBy: userId })
      .returning({ id: expenses.id });
    if (!row) throw new Error('expense insert failed');
    expenseId = row.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const selectAuditRows = (...conds: Parameters<typeof and>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return tx
      .select()
      .from(auditLog)
      .where(and(...conds));
  });

describe('Expenses — o‘qish audit (CLI-393)', () => {
  test('list(): action=viewed/resourceType=expense/resourceId=null, summa yo‘q', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.list(ctx(tx), { page: 1, pageSize: 20 });
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'expense'),
      isNull(auditLog.resourceId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(rows[0]?.after ?? {})).not.toContain('150000');
  });

  test('getById(): resourceId=expense.id', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.getById(ctx(tx), expenseId);
    });

    const rows = await selectAuditRows(
      eq(auditLog.action, 'viewed'),
      eq(auditLog.resourceType, 'expense'),
      eq(auditLog.resourceId, expenseId),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bun test --env-file=../../.env cli-393-expenses
```
Ikkala test FAIL (0 audit qatori `action='viewed'` uchun).

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/expenses/expenses.service.ts:112-139` (`list`) ni almashtiring:
```ts
  async function list(c: Context, query: ListExpensesQuery) {
    const db = getDb(c);
    const offset = (query.page - 1) * query.pageSize;

    const filters = [];
    if (query.categoryId) filters.push(eq(expenses.categoryId, query.categoryId));
    if (query.branchId) filters.push(eq(expenses.branchId, query.branchId));
    if (query.from && query.to) filters.push(between(expenses.date, query.from, query.to));
    else if (query.from) filters.push(gte(expenses.date, query.from));
    else if (query.to) filters.push(lte(expenses.date, query.to));

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(expenses)
        .where(where)
        .orderBy(desc(expenses.date), desc(expenses.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      db.select({ total: count() }).from(expenses).where(where),
    ]);

    const total = totalRows[0]?.total ?? 0;

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'expense',
      resourceId: null,
      after: {
        categoryId: query.categoryId ?? null,
        branchId: query.branchId ?? null,
        count: rows.length,
      },
    });

    return { data: rows, meta: { page: query.page, pageSize: query.pageSize, total } };
  }
```

`141-145`-qator (`getById`) ni almashtiring:
```ts
  async function getById(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
    if (row) {
      await deps.audit.record(c, {
        action: 'viewed',
        resourceType: 'expense',
        resourceId: id,
      });
    }
    return row ?? null;
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bun test --env-file=../../.env cli-393-expenses
```
Ikkala test PASS.

Regressiya:
```bash
cd apps/api && bun test --env-file=../../.env expenses
```
Yashil qolishi shart (`noopAudit` bilan, mavjud CRUD/`summary` assertlari o'zgarmaydi).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/expenses/expenses.service.ts apps/api/tests/integration/cli-393-expenses-audit.test.ts
git commit -m "fix(api): audit-log expenses reads (CLI-393)"
```

---

## Self-review

- **Placeholder tekshiruvi:** har uch task'da audit chaqiruvi CLI-363/364'dagi aynan bir xil naqshni ishlatadi (`patients.service.ts`'dan olingan); `<placeholder>`/`TODO` yo'q — barcha kod bloklari mavjud fayllardan o'qilgan aniq qatorlar asosida yozilgan.
- **`resourceType` tanlovi izchil:** har o'qish funksiyasi o'z modulidagi MAVJUD mutation `resourceType`sini qayta ishlatadi (`cashier_transaction` — `create`/`refund` bilan bir xil, 194/323-qator; `payroll_run` — `createRun`/`finalizeRun` bilan bir xil, 100/142-qator; `expense` — CRUD bilan bir xil, 171/200/219-qator). `planBalance`/`listPatientPlans` — `treatment_plan` (CLI-363'dagi `treatment-plans.service.ts` bilan bir xil jadval, endi ikkinchi endpoint'dan ham audit qilinadi — bu qasddan, chunki auditLog'ni `resourceType='treatment_plan'` bo'yicha so'rasa, KIM QAChON shu rejani ko'rgani (klinik yoki kassa ekranidan) to'liq ko'rinadi).
- **Global constraint tekshirildi kodda:** hech bir `after` blokida `totalAmount`/`paidAmount`/`cost`/`amount`/`baseSalary`/`commissionAmount`/`total` maydoni yo'q — faqat `count`/`date`/`stageCount`/`patientId`/`branchId`/`categoryId ?? null`. Har task testida buni aniq tekshiruvchi negative-assertion bor (`JSON.stringify(...).not.toContain('<summa>')`), CLI-364'dagi `patient-images` maxsus talabi bilan bir xil qattiqlik darajasida.
- **`listPatientPlans` o'zgarishi kattaroq:** query builder to'g'ridan qaytarish o'rniga endi `await` bilan materiallashtiriladi (audit `count` uchun kerak) — natija shakli (massiv) o'zgarmaydi, faqat ichki bajarilish tartibi.
- **Payroll test minimalligi:** `createRun` uchun aktiv `staffProfiles`/`cashierTransactions` seed qilinmagan — funksiya bo'sh jadvallar bilan ham `lines: []` snapshot yaratadi (payroll.service.ts:77-98 — profillar bo'lmasa `for` loop hech narsa qo'shmaydi), bu yetarli chunki test faqat `listRuns`/`getRun` audit yozuvini tekshiradi, `createRun`ning o'z hisob-kitob mantig'i emas (u allaqachon `payroll.test.ts`da qamrab olingan).
- **Regressiya xatari:** har task'da mavjud `noopAudit`-asosli test (`cashier-plan-balance.test.ts`, `cashier-list-daterange.test.ts`, `payroll.test.ts`, `expenses.test.ts`) aniq eslatilgan va ishga tushirish buyrug'i berilgan.
- **Test fayl nomlari** noyob (`cli-393-<modul>-audit.test.ts`), CLI-363/364 fayllari bilan to'qnashmaydi. Test foydalanuvchi telefon raqamlari (`+998900000090/91/92`) mavjud testlardagi diapazonlar bilan to'qnashmaydi (har fayl o'z `TRUNCATE`iga ega bo'lsa-da, ehtiyot chorasi).
