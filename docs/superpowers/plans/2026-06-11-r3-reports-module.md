# R3 Reports/agregatsiya moduli — Implementation Plan (CLI-68)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Query-time agregatsiya/KPI moduli (revenue, appointment stats, doctor workload, plan completion) — rol dashboard'lari va reports ekrani uchun backend.

**Architecture:** Yangi `apps/api/src/modules/reports/` — sof helperlar (`reports.aggregations.ts`) + service (Drizzle `GROUP BY`, `getDb(c)` RLS, Asia/Tashkent kun chegarasi) + routes (`report.view`). Precompute yo'q (RFC-0006). api-client qo'lda kengaytiriladi. Integration test SQL'ni real DB'da sinaydi.

**Tech Stack:** Bun, Hono, Drizzle, Zod, Vitest.

**Spec:** [`docs/superpowers/specs/2026-06-11-r3-reports-module-design.md`](../specs/2026-06-11-r3-reports-module-design.md)

---

## Parallel-agent topologiya

| To'lqin | Tasklar | Parallel? |
|---|---|---|
| **A** | Task 1→2→3→4→5 (backend, 1 agent) ∥ Task 6 (docs, 1 agent) | A-backend ∥ A-docs |
| **B** | Task 7 (api-client) | A-backend tugagach |

Frontend yo'q. Verifikatsiya: `bun --filter @dental/api typecheck`, `bun --filter @dental/api-client typecheck`, api test (`cd apps/api && bun test --env-file=../../.env`), `bun run check:rls`. Commit'larni orkestrator qiladi (parallel agentlar commit qilmaydi).

---

## Task 1: Sof agregatsiya helperlari — TDD

**Files:**
- Create: `apps/api/src/modules/reports/reports.aggregations.ts`
- Test: `apps/api/src/modules/reports/reports.aggregations.test.ts`

- [ ] **Step 1: Failing test**

`reports.aggregations.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORK_MINUTES,
  branchOpenMinutes,
  completionRate,
  noShowRate,
  utilizationPct,
} from './reports.aggregations.ts';

describe('reports.aggregations', () => {
  it('noShowRate', () => {
    expect(noShowRate(2, 10)).toBe(0.2);
    expect(noShowRate(0, 0)).toBe(0);
  });
  it('utilizationPct: clamp va 0-division', () => {
    expect(utilizationPct(270, 540)).toBe(0.5);
    expect(utilizationPct(600, 540)).toBe(1); // clamp
    expect(utilizationPct(100, 0)).toBe(0);
  });
  it('completionRate', () => {
    expect(completionRate(3, 4)).toBe(0.75);
    expect(completionRate(0, 0)).toBe(0);
  });
  it('branchOpenMinutes', () => {
    const wh = { mon: { open: '09:00', close: '18:00' }, sun: null };
    expect(branchOpenMinutes(wh, 'mon', DEFAULT_WORK_MINUTES)).toBe(540);
    expect(branchOpenMinutes(wh, 'sun', DEFAULT_WORK_MINUTES)).toBe(0); // yopiq
    expect(branchOpenMinutes(wh, 'tue', DEFAULT_WORK_MINUTES)).toBe(540); // kalit yo'q → default
    expect(branchOpenMinutes(null, 'mon', DEFAULT_WORK_MINUTES)).toBe(540); // workHours yo'q → default
  });
});
```

- [ ] **Step 2: Test fail bo'lishini tekshirish**

Run: `cd apps/api && bun test reports.aggregations`
Expected: FAIL — module topilmaydi.

- [ ] **Step 3: Implementatsiya**

`reports.aggregations.ts`:
```ts
/**
 * Reports sof agregatsiya helperlari — SQL'siz arifmetika (testlanadigan yadro).
 * Hafta-kuni kalit konvensiyasi: 'sun','mon','tue','wed','thu','fri','sat' (kichik harf).
 * (branches.workHours sxemasi kalitni majburlamaydi — bu modul shu konvensiyani qabul qiladi.)
 */
export const DEFAULT_WORK_MINUTES = 540; // 09:00–18:00

/** No-show foizi (0..1). total=0 → 0. */
export function noShowRate(noShow: number, total: number): number {
  return total === 0 ? 0 : noShow / total;
}

/** Bandlik foizi (0..1). capacity=0 → 0; booked>capacity → 1. */
export function utilizationPct(bookedMinutes: number, capacityMinutes: number): number {
  if (capacityMinutes <= 0) return 0;
  return Math.min(1, bookedMinutes / capacityMinutes);
}

/** Tugallanish foizi (0..1). total=0 → 0. */
export function completionRate(completed: number, total: number): number {
  return total === 0 ? 0 : completed / total;
}

/** "HH:MM" → daqiqa (yarim tundan). */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Branch ish-daqiqasi berilgan hafta kuni uchun.
 * - workHours null → defaultMinutes
 * - kalit yo'q → defaultMinutes (sozlanmagan kun)
 * - kalit null → 0 (yopiq kun)
 * - {open,close} → close − open (manfiy bo'lsa 0)
 */
export function branchOpenMinutes(
  workHours: Record<string, { open: string; close: string } | null> | null,
  weekday: string,
  defaultMinutes: number,
): number {
  if (!workHours) return defaultMinutes;
  if (!(weekday in workHours)) return defaultMinutes;
  const entry = workHours[weekday];
  if (entry == null) return 0;
  return Math.max(0, toMinutes(entry.close) - toMinutes(entry.open));
}
```

- [ ] **Step 4: Test pass**

Run: `cd apps/api && bun test reports.aggregations`
Expected: PASS (4 test).

- [ ] **Step 5: Commit (orkestrator)** — fayllar: `reports.aggregations.ts`, `reports.aggregations.test.ts`.

---

## Task 2: Schema (`reports.schema.ts`)

**Files:**
- Create: `apps/api/src/modules/reports/reports.schema.ts`

- [ ] **Step 1: Schema**

```ts
import { z } from 'zod';

export const reportRangeSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  branchId: z.uuid().optional(),
});
export type ReportRange = z.infer<typeof reportRangeSchema>;

export type RevenueReport = {
  total: number;
  byBranch: Array<{ branchId: string; total: number }>;
  byService: Array<{ serviceName: string; total: number }>;
  byDoctor: Array<{ doctorId: string | null; total: number }>;
  byPeriod: Array<{ date: string; total: number }>;
};

export type AppointmentStatsReport = {
  total: number;
  byStatus: Array<{ status: string; count: number }>;
  noShowRate: number;
  slotUtilization: number;
};

export type DoctorWorkloadRow = { doctorId: string; total: number; completed: number };

export type PlanCompletionReport = {
  totalStages: number;
  completedStages: number;
  rate: number;
  byStatus: Array<{ status: string; count: number }>;
};
```

- [ ] **Step 2: Typecheck** — `bun --filter @dental/api typecheck`.
- [ ] **Step 3: Commit (orkestrator)** — `reports.schema.ts`.

---

## Task 3: Service (`reports.service.ts`)

**Files:**
- Create: `apps/api/src/modules/reports/reports.service.ts`

> Drizzle aggregate'lar; RLS `getDb(c)` (explicit `WHERE tenant_id` YOZILMAYDI). Revenue signed = `payment − refund`.

- [ ] **Step 1: Implementatsiya**

```ts
import {
  appointments,
  branches,
  cashierTransactionItems,
  cashierTransactions,
  treatmentPlans,
  treatmentStages,
} from '@dental/db-schema';
import { and, between, count, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import {
  DEFAULT_WORK_MINUTES,
  branchOpenMinutes,
  completionRate,
  noShowRate,
  utilizationPct,
} from './reports.aggregations.ts';
import type {
  AppointmentStatsReport,
  DoctorWorkloadRow,
  PlanCompletionReport,
  ReportRange,
  RevenueReport,
} from './reports.schema.ts';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const tashkentRange = (from: string, to: string) => ({
  start: new Date(`${from}T00:00:00+05:00`),
  end: new Date(`${to}T23:59:59.999+05:00`),
});

/** Har kun (from..to) uchun 'sun'..'sat' kaliti — Tashkent kuni, noon-anchored (TZ chegarasi xavfsiz). */
function* eachWeekday(from: string, to: string): Generator<string> {
  const cur = new Date(`${from}T12:00:00+05:00`);
  const last = new Date(`${to}T12:00:00+05:00`);
  while (cur.getTime() <= last.getTime()) {
    yield WEEKDAYS[cur.getUTCDay()] as string;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

export const createReportsService = () => {
  async function revenue(c: Context, { from, to, branchId }: ReportRange): Promise<RevenueReport> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);
    const signed = sql<string>`COALESCE(SUM(CASE WHEN ${cashierTransactions.type} = 'refund' THEN -${cashierTransactions.paidAmount} ELSE ${cashierTransactions.paidAmount} END), 0)`;

    const base = [
      eq(cashierTransactions.status, 'completed'),
      between(cashierTransactions.createdAt, start, end),
    ];
    if (branchId) base.push(eq(cashierTransactions.branchId, branchId));

    const dayExpr = sql<string>`(${cashierTransactions.createdAt} AT TIME ZONE 'Asia/Tashkent')::date`;

    const [totalRow] = await db
      .select({ total: signed })
      .from(cashierTransactions)
      .where(and(...base));

    const byBranch = await db
      .select({ branchId: cashierTransactions.branchId, total: signed })
      .from(cashierTransactions)
      .where(and(...base))
      .groupBy(cashierTransactions.branchId);

    const byPeriod = await db
      .select({ date: dayExpr, total: signed })
      .from(cashierTransactions)
      .where(and(...base))
      .groupBy(dayExpr);

    // byService — itemli POS (payment, completed)
    const itemBase = [
      eq(cashierTransactions.status, 'completed'),
      eq(cashierTransactions.type, 'payment'),
      between(cashierTransactions.createdAt, start, end),
    ];
    if (branchId) itemBase.push(eq(cashierTransactions.branchId, branchId));
    const byService = await db
      .select({
        serviceName: cashierTransactionItems.serviceName,
        total: sql<string>`COALESCE(SUM(${cashierTransactionItems.subtotal}), 0)`,
      })
      .from(cashierTransactionItems)
      .innerJoin(cashierTransactions, eq(cashierTransactionItems.transactionId, cashierTransactions.id))
      .where(and(...itemBase))
      .groupBy(cashierTransactionItems.serviceName);

    // byDoctor — plan-linked (treatment_plans.doctorId), plansiz → null
    const byDoctorPlan = await db
      .select({ doctorId: treatmentPlans.doctorId, total: signed })
      .from(cashierTransactions)
      .innerJoin(treatmentPlans, eq(cashierTransactions.treatmentPlanId, treatmentPlans.id))
      .where(and(...base))
      .groupBy(treatmentPlans.doctorId);
    const [unassigned] = await db
      .select({ total: signed })
      .from(cashierTransactions)
      .where(and(...base, isNull(cashierTransactions.treatmentPlanId)));

    const byDoctor: RevenueReport['byDoctor'] = byDoctorPlan.map((r) => ({
      doctorId: r.doctorId,
      total: Number(r.total),
    }));
    const unassignedTotal = Number(unassigned?.total ?? 0);
    if (unassignedTotal !== 0) byDoctor.push({ doctorId: null, total: unassignedTotal });

    return {
      total: Number(totalRow?.total ?? 0),
      byBranch: byBranch.map((r) => ({ branchId: r.branchId, total: Number(r.total) })),
      byService: byService.map((r) => ({ serviceName: r.serviceName, total: Number(r.total) })),
      byDoctor,
      byPeriod: byPeriod.map((r) => ({ date: String(r.date), total: Number(r.total) })),
    };
  }

  async function appointmentStats(
    c: Context,
    { from, to, branchId }: ReportRange,
  ): Promise<AppointmentStatsReport> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);
    const base = [between(appointments.startTime, start, end)];
    if (branchId) base.push(eq(appointments.branchId, branchId));

    const statusRows = await db
      .select({ status: appointments.status, c: count() })
      .from(appointments)
      .where(and(...base))
      .groupBy(appointments.status);
    const byStatus = statusRows.map((r) => ({ status: r.status as string, count: Number(r.c) }));
    const total = byStatus.reduce((s, r) => s + r.count, 0);
    const noShow = byStatus.find((r) => r.status === 'no_show')?.count ?? 0;

    const [bookedRow] = await db
      .select({
        minutes: sql<string>`COALESCE(SUM(EXTRACT(EPOCH FROM (${appointments.endTime} - ${appointments.startTime})) / 60), 0)`,
      })
      .from(appointments)
      .where(and(...base, ne(appointments.status, 'cancelled')));
    const bookedMinutes = Number(bookedRow?.minutes ?? 0);

    // capacity: har branch uchun distinct doktor × kunlik ish-daqiqa
    const docRows = await db
      .select({
        branchId: appointments.branchId,
        docs: sql<number>`COUNT(DISTINCT ${appointments.doctorId})`,
      })
      .from(appointments)
      .where(and(...base))
      .groupBy(appointments.branchId);

    const branchRows = await db
      .select({ id: branches.id, workHours: branches.workHours })
      .from(branches)
      .where(branchId ? eq(branches.id, branchId) : undefined);
    const whById = new Map(branchRows.map((b) => [b.id, b.workHours]));

    let capacityMinutes = 0;
    for (const dr of docRows) {
      const wh = whById.get(dr.branchId) ?? null;
      for (const weekday of eachWeekday(from, to)) {
        capacityMinutes += branchOpenMinutes(wh, weekday, DEFAULT_WORK_MINUTES) * Number(dr.docs);
      }
    }

    return {
      total,
      byStatus,
      noShowRate: noShowRate(noShow, total),
      slotUtilization: utilizationPct(bookedMinutes, capacityMinutes),
    };
  }

  async function doctorWorkload(
    c: Context,
    { from, to, branchId }: ReportRange,
  ): Promise<DoctorWorkloadRow[]> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);
    const base = [between(appointments.startTime, start, end)];
    if (branchId) base.push(eq(appointments.branchId, branchId));

    const rows = await db
      .select({
        doctorId: appointments.doctorId,
        total: count(),
        completed: sql<number>`COUNT(*) FILTER (WHERE ${appointments.status} = 'completed')`,
      })
      .from(appointments)
      .where(and(...base))
      .groupBy(appointments.doctorId);

    return rows.map((r) => ({
      doctorId: r.doctorId,
      total: Number(r.total),
      completed: Number(r.completed),
    }));
  }

  async function planCompletion(
    c: Context,
    { from, to }: ReportRange,
  ): Promise<PlanCompletionReport> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);
    // Reja created_at oraliqda; status accepted/in_progress/completed. (branchId — rejada filial yo'q, e'tiborga olinmaydi.)
    const rows = await db
      .select({ status: treatmentStages.status, c: count() })
      .from(treatmentStages)
      .innerJoin(treatmentPlans, eq(treatmentStages.treatmentPlanId, treatmentPlans.id))
      .where(
        and(
          sql`${treatmentPlans.status} IN ('accepted','in_progress','completed')`,
          between(treatmentPlans.createdAt, start, end),
        ),
      )
      .groupBy(treatmentStages.status);

    const byStatus = rows.map((r) => ({ status: r.status as string, count: Number(r.c) }));
    const totalStages = byStatus.reduce((s, r) => s + r.count, 0);
    const completedStages = byStatus.find((r) => r.status === 'completed')?.count ?? 0;

    return {
      totalStages,
      completedStages,
      rate: completionRate(completedStages, totalStages),
      byStatus,
    };
  }

  return { revenue, appointmentStats, doctorWorkload, planCompletion };
};

export type ReportsService = ReturnType<typeof createReportsService>;
```

- [ ] **Step 2: Typecheck** — `bun --filter @dental/api typecheck`. Xato bo'lsa tuzat (masalan `where(undefined)` Drizzle'da ruxsat — branchId yo'q holat).
- [ ] **Step 3: Commit (orkestrator)** — `reports.service.ts`.

---

## Task 4: Routes + mount + index

**Files:**
- Create: `apps/api/src/modules/reports/reports.routes.ts`
- Create: `apps/api/src/modules/reports/index.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Routes**

`reports.routes.ts` (patients/cashier uslubida — `Hono`, `authMiddleware`, `rlsMiddleware(db)`):
```ts
import { ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { reportRangeSchema } from './reports.schema.ts';
import { createReportsService } from './reports.service.ts';

export const reportsRoutes = (deps: { db: Database }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createReportsService();

  const parseRange = (c: import('hono').Context) => {
    const parsed = reportRangeSchema.safeParse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    if (!parsed.success) throw new HTTPException(400, { message: 'Invalid range' });
    return parsed.data;
  };

  app.get('/revenue', requirePermission('report.view'), async (c) =>
    c.json(ok(await service.revenue(c, parseRange(c)))),
  );
  app.get('/appointments', requirePermission('report.view'), async (c) =>
    c.json(ok(await service.appointmentStats(c, parseRange(c)))),
  );
  app.get('/doctors', requirePermission('report.view'), async (c) =>
    c.json(ok(await service.doctorWorkload(c, parseRange(c)))),
  );
  app.get('/treatment-plans', requirePermission('report.view'), async (c) =>
    c.json(ok(await service.planCompletion(c, parseRange(c)))),
  );

  return app;
};
```

`index.ts`:
```ts
export { reportsRoutes } from './reports.routes.ts';
```

- [ ] **Step 2: app.ts mount**

`apps/api/src/app.ts` — import qo'shish va `cashier` route'idan keyin mount:
```ts
import { reportsRoutes } from './modules/reports/index.ts';
// ... mount qatorlari orasida:
  app.route('/api/reports', reportsRoutes({ db }));
```

- [ ] **Step 3: Typecheck** — `bun --filter @dental/api typecheck`.
- [ ] **Step 4: Commit (orkestrator)** — `reports.routes.ts`, `index.ts`, `app.ts`.

---

## Task 5: Integration test (real DB — MAJBURIY)

**Files:**
- Create: `apps/api/tests/integration/reports.test.ts`

> CLI-67 `patient-balance.test.ts` patternida: soxta `Context` (`c.get('db')=tx`, `accessClaims`), tenant-scoped seed, har metrika SQL'ini ishga tushirib kutilgan qiymat.

- [ ] **Step 1: Test yozish**

`reports.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  cashierTransactionItems,
  cashierTransactions,
  patients,
  tenants,
  treatmentPlans,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createReportsService } from '../../src/modules/reports/reports.service.ts';

const service = createReportsService();
const ctx = (tx: DbOrTx): Context =>
  ({ get: (k: string) => (k === 'db' ? tx : k === 'accessClaims' ? { perms: ['@owner'] } : undefined) }) as unknown as Context;

const RANGE = { from: '2026-06-01', to: '2026-06-30' };

let tenantId: string;
let ownerId: string;
let branchId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000020', passwordHash: 'x', fullName: 'Doc' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'R', slug: 'r-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    // Branch: 2026-06-01 = dushanba; mon ochiq 09:00–18:00 (540), shu sababli capacity aniqlanadi
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B', workHours: { mon: { open: '09:00', close: '18:00' } } })
      .returning({ id: branches.id });
    branchId = branch!.id;

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'P' })
      .returning({ id: patients.id });
    const patientId = patient!.id;

    // Appointments (2026-06-01 dushanba): 1 completed (60 daq), 1 no_show (60 daq), 1 cancelled (60 daq)
    const day = '2026-06-01';
    await tx.insert(appointments).values([
      { tenantId, branchId, doctorId: ownerId, patientId, startTime: new Date(`${day}T09:00:00+05:00`), endTime: new Date(`${day}T10:00:00+05:00`), status: 'completed' },
      { tenantId, branchId, doctorId: ownerId, patientId, startTime: new Date(`${day}T10:00:00+05:00`), endTime: new Date(`${day}T11:00:00+05:00`), status: 'no_show' },
      { tenantId, branchId, doctorId: ownerId, patientId, startTime: new Date(`${day}T11:00:00+05:00`), endTime: new Date(`${day}T12:00:00+05:00`), status: 'cancelled' },
    ]);

    // Cashier: plansiz payment 100000 (item 'Tozalash' 100000); plan-linked payment 50000; refund 20000 (plansiz)
    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: ownerId, title: 'Pl', status: 'accepted', createdAt: new Date(`${day}T09:00:00+05:00`) })
      .returning({ id: treatmentPlans.id });
    await tx.insert(treatmentStages).values([
      { treatmentPlanId: plan!.id, sequence: 1, serviceName: 'S1', cost: '50000', status: 'completed' },
      { treatmentPlanId: plan!.id, sequence: 2, serviceName: 'S2', cost: '50000', status: 'pending' },
    ]);

    const [txItem] = await tx
      .insert(cashierTransactions)
      .values({ tenantId, branchId, patientId, totalAmount: '100000', paidAmount: '100000', paymentMethod: 'cash', type: 'payment', status: 'completed', createdAt: new Date(`${day}T12:00:00+05:00`) })
      .returning({ id: cashierTransactions.id });
    await tx.insert(cashierTransactionItems).values({ transactionId: txItem!.id, serviceName: 'Tozalash', quantity: 1, unitPrice: '100000', subtotal: '100000' });

    await tx.insert(cashierTransactions).values({ tenantId, branchId, patientId, treatmentPlanId: plan!.id, totalAmount: '50000', paidAmount: '50000', paymentMethod: 'cash', type: 'payment', status: 'completed', createdAt: new Date(`${day}T12:30:00+05:00`) });
    await tx.insert(cashierTransactions).values({ tenantId, branchId, patientId, totalAmount: '20000', paidAmount: '20000', paymentMethod: 'cash', type: 'refund', status: 'completed', createdAt: new Date(`${day}T13:00:00+05:00`) });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const run = <T>(fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx));
  });

describe('reports — real DB', () => {
  test('revenue: total = payment − refund; breakdown', async () => {
    const r = await run((c) => service.revenue(c, RANGE));
    expect(r.total).toBe(130000); // 100000 + 50000 − 20000
    expect(r.byService.find((s) => s.serviceName === 'Tozalash')?.total).toBe(100000);
    // byDoctor: plan-linked 50000 (ownerId) + plansiz (100000 − 20000 = 80000, doctorId null)
    expect(r.byDoctor.find((d) => d.doctorId === ownerId)?.total).toBe(50000);
    expect(r.byDoctor.find((d) => d.doctorId === null)?.total).toBe(80000);
  });

  test('appointmentStats: no-show va slot bandligi', async () => {
    const r = await run((c) => service.appointmentStats(c, RANGE));
    expect(r.total).toBe(3);
    expect(r.noShowRate).toBeCloseTo(1 / 3, 5);
    // booked = completed(60) + no_show(60) = 120 daq (cancelled chiqarilgan)
    // capacity = faqat 2026-06-01 (mon, 540) × 1 doktor = 540; iyun boshqa kunlari kalit yo'q → default 540 × 1 × 29 kun
    // util = 120 / (540 × 30 kun) — kichik son; faqat > 0 va < 1 ekanini tekshiramiz
    expect(r.slotUtilization).toBeGreaterThan(0);
    expect(r.slotUtilization).toBeLessThan(1);
  });

  test('doctorWorkload: doktor bo\'yicha count', async () => {
    const r = await run((c) => service.doctorWorkload(c, RANGE));
    const row = r.find((d) => d.doctorId === ownerId);
    expect(row?.total).toBe(3);
    expect(row?.completed).toBe(1);
  });

  test('planCompletion: 1/2 completed', async () => {
    const r = await run((c) => service.planCompletion(c, RANGE));
    expect(r.totalStages).toBe(2);
    expect(r.completedStages).toBe(1);
    expect(r.rate).toBe(0.5);
  });
});
```

- [ ] **Step 2: Test ishga tushirish**

Run: `cd apps/api && bun test --env-file=../../.env reports`
Expected: PASS (aggregations 4 + integration 4).

- [ ] **Step 3: To'liq backend verifikatsiya**

Run: `cd apps/api && bun test --env-file=../../.env && cd ../.. && bun --filter @dental/api typecheck && bun run check:rls`
Expected: hammasi PASS. (Wave A-backend yakuni.)

- [ ] **Step 4: Commit (orkestrator)** — `reports.test.ts`.

---

## Task 6: Docs (Wave A — A-backend'ga PARALLEL)

**Files:**
- Modify: `docs/rfcs/0006-reporting-aggregation.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: RFC-0006 yangilash** — Status'ga `> ⚠️ Implemented 2026-06-11 (CLI-68).` qo'sh; §4 metrika katalogiga 3 caveat qo'sh (byService faqat itemli POS; revenueByDoctor faqat plan-linked + "Belgilanmagan"; slotUtilization ish-vaqti taxmini + distinct-doktor capacity proxy; workHours kalit konvensiyasi `sun..sat`, sozlanmagan → default 540).
- [ ] **Step 2: CLAUDE.md** — Progress qatorida CLI-68 (reports moduli) tugaganini eslat.
- [ ] **Step 3: Commit (orkestrator)** — `docs/rfcs/0006-reporting-aggregation.md`, `CLAUDE.md`.

---

## Task 7: api-client (Wave B — A-backend tugagach)

**Files:**
- Create: `packages/api-client/src/types-reports.ts`
- Modify: `packages/api-client/src/endpoints.ts`

- [ ] **Step 1: Tiplar** — `types-reports.ts` (Task 2 DTO'lari ko'chiriladi: `ReportRange` param emas — querystring; `RevenueReport`, `AppointmentStatsReport`, `DoctorWorkloadRow`, `PlanCompletionReport`):
```ts
export type RevenueReport = {
  total: number;
  byBranch: Array<{ branchId: string; total: number }>;
  byService: Array<{ serviceName: string; total: number }>;
  byDoctor: Array<{ doctorId: string | null; total: number }>;
  byPeriod: Array<{ date: string; total: number }>;
};
export type AppointmentStatsReport = {
  total: number;
  byStatus: Array<{ status: string; count: number }>;
  noShowRate: number;
  slotUtilization: number;
};
export type DoctorWorkloadRow = { doctorId: string; total: number; completed: number };
export type PlanCompletionReport = {
  totalStages: number;
  completedStages: number;
  rate: number;
  byStatus: Array<{ status: string; count: number }>;
};
```

- [ ] **Step 2: Endpoint bloki** — `endpoints.ts`'da import qo'shish (`from './types-reports.ts'`) va yangi `reports` bloki (`cashier` blokidan keyin):
```ts
  reports: {
    revenue: (q: { from: string; to: string; branchId?: string }) => {
      const p = new URLSearchParams({ from: q.from, to: q.to });
      if (q.branchId) p.set('branchId', q.branchId);
      return api.get<RevenueReport>(`/api/reports/revenue?${p.toString()}`);
    },
    appointments: (q: { from: string; to: string; branchId?: string }) => {
      const p = new URLSearchParams({ from: q.from, to: q.to });
      if (q.branchId) p.set('branchId', q.branchId);
      return api.get<AppointmentStatsReport>(`/api/reports/appointments?${p.toString()}`);
    },
    doctors: (q: { from: string; to: string; branchId?: string }) => {
      const p = new URLSearchParams({ from: q.from, to: q.to });
      if (q.branchId) p.set('branchId', q.branchId);
      return api.get<DoctorWorkloadRow[]>(`/api/reports/doctors?${p.toString()}`);
    },
    treatmentPlans: (q: { from: string; to: string; branchId?: string }) => {
      const p = new URLSearchParams({ from: q.from, to: q.to });
      if (q.branchId) p.set('branchId', q.branchId);
      return api.get<PlanCompletionReport>(`/api/reports/treatment-plans?${p.toString()}`);
    },
  },
```

- [ ] **Step 3: Typecheck** — `bun --filter @dental/api-client typecheck`.
- [ ] **Step 4: Commit (orkestrator)** — `types-reports.ts`, `endpoints.ts`.

---

## Yakuniy verifikatsiya
- [ ] `bun --filter @dental/api typecheck && bun --filter @dental/api-client typecheck`
- [ ] `cd apps/api && bun test --env-file=../../.env` (aggregations + integration PASS)
- [ ] `bun run check:rls`
- [ ] Linear CLI-68 → Done (PR strategiyasi: R3 slice'lar).
