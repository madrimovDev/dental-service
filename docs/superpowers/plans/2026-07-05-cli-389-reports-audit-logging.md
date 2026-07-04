# CLI-389 Reports Audit Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/api/src/modules/reports/reports.routes.ts` (`reportsRoutes({ db })`, mounted at `app.ts:132`) and `reports.service.ts` (`createReportsService()`) never receive or use an `audit` dependency, so `GET /api/reports/1c-export` and 5 other report endpoints leak bulk financial/PII access with zero audit trail. Wire `AuditLogger` into `reportsRoutes`/`createReportsService`, and add `deps.audit.record(...)` calls to all 6 report-read methods (`revenue`, `appointmentStats`, `doctorWorkload`, `planCompletion`, `dentalAnalytics`, `oneCExport`), per the design in `docs/superpowers/specs/2026-07-05-cli-389-reports-audit-logging-design.md`.

**Architecture:** Factory-DI pattern already used by every other module (`patients.service.ts`, `lab-orders.service.ts`): `createReportsService(deps: { audit: AuditLogger })`. `reportsRoutes(deps: { db: Database; audit: AuditLogger })` constructs the service with `createReportsService({ audit: deps.audit })`. `app.ts:46` already has `const audit = createAuditLogger({ db })` in scope — `app.ts:132` just needs to pass it through, matching the sibling line 131 (`cashierRoutes({ db, audit, fiscal })`).

**Tech Stack:** Bun, `bun:test`, `apps/api/src/lib/audit-logger.ts` (`AuditLogger`, `createAuditLogger`), Drizzle (`auditLog` table from `@dental/db-schema`).

## Global Constraints
- Audit entries log only identifying metadata/filters (`report` name, `from`, `to`, `branchId`, `rowCount` where applicable) — never report result content (no `total`, `byService`, `patientName`, `amount`, `receiptNumber`, etc.).
- `resourceType: 'report'` and `resourceId: null` for all 6 methods (date-range reports have no single-resource identity — see spec §3.2/§3.3).
- `action: 'exported'` only for `oneCExport`; `action: 'viewed'` for the other 5 (aggregate) methods.
- Every method calls `deps.audit.record(...)` unconditionally (reports always return a result, even if empty/zero — that's still a meaningful "viewed" event), unlike `patients.findById`'s conditional pattern.

---

### Task 1: Wire `audit` dependency into `reportsRoutes` / `createReportsService`

**Files:**
- Modify: `apps/api/src/app.ts:132`
- Modify: `apps/api/src/modules/reports/reports.routes.ts`
- Modify: `apps/api/src/modules/reports/reports.service.ts`
- Modify (fix breakage): `apps/api/tests/integration/reports.test.ts`
- Modify (fix breakage): `apps/api/tests/integration/cli-243-dental-analytics.test.ts`
- Modify (fix breakage): `apps/api/tests/integration/ds12-a-series.test.ts`
- Modify (fix breakage): `apps/api/tests/integration/ds12-a-comparison.test.ts`
- Test: `apps/api/tests/integration/cli-389-reports-audit.test.ts` (new)

- [ ] **Step 1: Write the failing test**
  Create `apps/api/tests/integration/cli-389-reports-audit.test.ts` with the dependency-wiring smoke assertion (full per-endpoint assertions land in Tasks 2-3, but this first test proves the service can even accept `audit` and record one entry — start with `revenue`, since it exercises `getDb(c)` + `deps.audit`):

  ```ts
  /**
   * CLI-389 — reports.service.ts o'qish funksiyalari audit_log'ga 'viewed'/'exported'
   * yozuvi qo'shishini tasdiqlaydi. REAL DB + real audit logger.
   *
   * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-389-reports`
   */
  import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
  import { auditLog, cashierTransactions, tenants, users } from '@dental/db-schema';
  import { and, eq, isNull, sql } from 'drizzle-orm';
  import type { Context } from 'hono';
  import type { DbOrTx } from '../../src/db/client.ts';
  import { db } from '../../src/db/client.ts';
  import { createAuditLogger } from '../../src/lib/audit-logger.ts';
  import { createReportsService } from '../../src/modules/reports/reports.service.ts';

  const audit = createAuditLogger({ db });
  const service = createReportsService({ audit });

  let tenantId: string;
  let userId: string;

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
      .values({ phone: '+998900000389', passwordHash: 'x', fullName: 'Owner' })
      .returning({ id: users.id });
    if (!owner) throw new Error('owner insert failed');
    userId = owner.id;

    const [tenant] = await db
      .insert(tenants)
      .values({ name: 'Reports Clinic', slug: 'reports-clinic', ownerUserId: userId })
      .returning({ id: tenants.id });
    if (!tenant) throw new Error('tenant insert failed');
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  });

  describe('Reports — o‘qish audit (CLI-389)', () => {
    test('revenue(): audit_log’da action=viewed/resourceType=report/resourceId=null/after.report=revenue', async () => {
      await db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        await service.revenue(ctx(tx), { from: '2026-01-01', to: '2026-01-31' });
      });

      const rows = await db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return tx
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.action, 'viewed'),
              eq(auditLog.resourceType, 'report'),
              isNull(auditLog.resourceId),
            ),
          );
      });
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const after = rows[rows.length - 1]?.after as { report?: string } | null;
      expect(after?.report).toBe('revenue');
    });
  });
  ```

  Note: this references `cashierTransactions` import defensively for later tasks' fixture needs — if unused after Task 1, drop it to keep the file lint-clean at each commit (biome will flag unused imports).

- [ ] **Step 2: Run test to verify it fails**
  ```bash
  cd apps/api && bun test --env-file=../../.env cli-389-reports
  ```
  Expect a TypeScript error (`createReportsService` takes 0 arguments) or a runtime failure (`deps.audit` undefined) — confirming the dependency truly isn't wired yet.

- [ ] **Step 3: Write minimal implementation**
  In `apps/api/src/modules/reports/reports.service.ts`:
  - Add `import type { AuditLogger } from '../../lib/audit-logger.ts';`
  - Change `export const createReportsService = () => {` to `export const createReportsService = (deps: { audit: AuditLogger }) => {`
  - Inside `revenue(...)`, right before its `return { total, ... }`, add:
    ```ts
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'report',
      resourceId: null,
      after: { report: 'revenue', from, to, branchId: branchId ?? null },
    });
    ```
    (`from`/`to`/`branchId` are already destructured in `revenue`'s signature.)

  In `apps/api/src/modules/reports/reports.routes.ts`:
  - Add `import type { AuditLogger } from '../../lib/audit-logger.ts';`
  - Change `export const reportsRoutes = (deps: { db: Database }) => {` to `export const reportsRoutes = (deps: { db: Database; audit: AuditLogger }) => {`
  - Change `const service = createReportsService();` to `const service = createReportsService({ audit: deps.audit });`

  In `apps/api/src/app.ts:132`:
  - Change `app.route('/api/reports', reportsRoutes({ db }));` to `app.route('/api/reports', reportsRoutes({ db, audit }));`

  Fix the 4 now-broken call sites (add a local `noopAudit`, matching `cashier-list-daterange.test.ts`'s convention):
  - `apps/api/tests/integration/reports.test.ts:19`
  - `apps/api/tests/integration/cli-243-dental-analytics.test.ts:26`
  - `apps/api/tests/integration/ds12-a-series.test.ts:16`
  - `apps/api/tests/integration/ds12-a-comparison.test.ts:16`

  Each gets, near its existing `const service = createReportsService();` line:
  ```ts
  import type { AuditLogger } from '../../src/lib/audit-logger.ts';
  // ...
  const noopAudit = { record: async () => {} } as unknown as AuditLogger;
  const service = createReportsService({ audit: noopAudit });
  ```
  (Adjust the relative import path to match each file's existing import style — check each file's other `../../src/...` imports for the exact prefix already in use.)

- [ ] **Step 4: Run test to verify it passes**
  ```bash
  cd apps/api && bun test --env-file=../../.env cli-389-reports
  cd apps/api && bun test --env-file=../../.env reports.test
  cd apps/api && bun test --env-file=../../.env cli-243-dental-analytics
  cd apps/api && bun test --env-file=../../.env ds12-a-series
  cd apps/api && bun test --env-file=../../.env ds12-a-comparison
  bun run typecheck
  ```
  All must pass/be clean.

- [ ] **Step 5: Commit**
  ```
  fix(api): wire audit dependency into reportsRoutes (CLI-389)
  ```

---

### Task 2: Add `'exported'` audit to `1c-export`

**Files:**
- Modify: `apps/api/src/modules/reports/reports.service.ts` (`oneCExport`)
- Test: `apps/api/tests/integration/cli-389-reports-audit.test.ts` (extend)

- [ ] **Step 1: Write the failing test**
  Add to the `describe` block in `cli-389-reports-audit.test.ts`. This test needs at least one `cashierTransactions` row so `oneCExport` returns a non-empty array (to assert `rowCount` meaningfully) — insert one `completed` `payment` transaction in a `beforeAll`-style setup or inline within the test using a `db.transaction` with `SET LOCAL app.current_tenant_id`:

  ```ts
  test('oneCExport(): action=exported, after.report=1c_export, after.rowCount=natija uzunligi', async () => {
    let txId: string;
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const [row] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          type: 'payment',
          status: 'completed',
          paymentMethod: 'cash',
          totalAmount: '100000',
          paidAmount: '100000',
        })
        .returning({ id: cashierTransactions.id });
      if (!row) throw new Error('tx insert failed');
      txId = row.id;
    });

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const rows = await service.oneCExport(ctx(tx), { from: '2026-01-01', to: '2026-12-31' });
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    const auditRows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'exported'),
            eq(auditLog.resourceType, 'report'),
            isNull(auditLog.resourceId),
          ),
        );
    });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    const after = auditRows[auditRows.length - 1]?.after as {
      report?: string;
      rowCount?: number;
    } | null;
    expect(after?.report).toBe('1c_export');
    expect(after?.rowCount).toBeGreaterThanOrEqual(1);
    // §4 — natija tarkibi (patientName/amount/receiptNumber) after'da bo'lmasligi kerak.
    expect(JSON.stringify(after)).not.toContain('patientName');
    expect(JSON.stringify(after)).not.toContain('receiptNumber');
  });
  ```

  Check `cashierTransactions` schema's required columns (`branchId` nullable? `receiptNumber` nullable?) against `@dental/db-schema` before finalizing the insert — adjust the `.values({...})` to satisfy any NOT NULL constraints not listed above.

- [ ] **Step 2: Run test to verify it fails**
  ```bash
  cd apps/api && bun test --env-file=../../.env cli-389-reports
  ```
  Expect failure: no `'exported'`/`report` audit row exists yet.

- [ ] **Step 3: Write minimal implementation**
  In `reports.service.ts`, inside `oneCExport(...)`, right before its `return rows.map(...)`, add:
  ```ts
  await deps.audit.record(c, {
    action: 'exported',
    resourceType: 'report',
    resourceId: null,
    after: { report: '1c_export', from, to, branchId: branchId ?? null, rowCount: rows.length },
  });
  ```
  (`rows` here is the raw Drizzle result before `.map(...)` — reuse it, don't recompute.)

- [ ] **Step 4: Run test to verify it passes**
  ```bash
  cd apps/api && bun test --env-file=../../.env cli-389-reports
  bun run typecheck
  ```

- [ ] **Step 5: Commit**
  ```
  feat(api): audit-log 1c-export as 'exported' (CLI-389)
  ```

---

### Task 3: Add `'viewed'` audit to the 5 remaining aggregate endpoints (`appointmentStats`, `doctorWorkload`, `planCompletion`, `dentalAnalytics` — `revenue` already done in Task 1)

**Files:**
- Modify: `apps/api/src/modules/reports/reports.service.ts` (`appointmentStats`, `doctorWorkload`, `planCompletion`, `dentalAnalytics`)
- Test: `apps/api/tests/integration/cli-389-reports-audit.test.ts` (extend)

- [ ] **Step 1: Write the failing test**
  Add 4 more `test()` blocks to `cli-389-reports-audit.test.ts`, one per method, each asserting `action='viewed'`, `resourceType='report'`, `resourceId=null`, and the right `after.report` value. `doctorWorkload` additionally asserts `after.rowCount` is a number (it returns an array); the other 3 assert `after` has no `rowCount` key (single-object reports, per spec §3.4):

  ```ts
  test('appointmentStats(): after.report=appointment_stats', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.appointmentStats(ctx(tx), { from: '2026-01-01', to: '2026-01-31' });
    });
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'viewed'), eq(auditLog.resourceType, 'report')));
    });
    const match = rows.find((r) => (r.after as { report?: string })?.report === 'appointment_stats');
    expect(match).toBeTruthy();
  });

  test('doctorWorkload(): after.report=doctor_workload, after.rowCount is a number', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.doctorWorkload(ctx(tx), { from: '2026-01-01', to: '2026-01-31' });
    });
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'viewed'), eq(auditLog.resourceType, 'report')));
    });
    const match = rows.find((r) => (r.after as { report?: string })?.report === 'doctor_workload');
    expect(match).toBeTruthy();
    expect(typeof (match?.after as { rowCount?: number })?.rowCount).toBe('number');
  });

  test('planCompletion(): after.report=plan_completion, no branchId key (tenant-wide by-design)', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.planCompletion(ctx(tx), { from: '2026-01-01', to: '2026-01-31' });
    });
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'viewed'), eq(auditLog.resourceType, 'report')));
    });
    const match = rows.find((r) => (r.after as { report?: string })?.report === 'plan_completion');
    expect(match).toBeTruthy();
  });

  test('dentalAnalytics(): after.report=dental_analytics', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.dentalAnalytics(ctx(tx), { from: '2026-01-01', to: '2026-01-31' });
    });
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'viewed'), eq(auditLog.resourceType, 'report')));
    });
    const match = rows.find((r) => (r.after as { report?: string })?.report === 'dental_analytics');
    expect(match).toBeTruthy();
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  ```bash
  cd apps/api && bun test --env-file=../../.env cli-389-reports
  ```
  Expect failures for all 4 new assertions (no matching audit rows yet).

- [ ] **Step 3: Write minimal implementation**
  In `reports.service.ts`, before each method's `return`, add:

  `appointmentStats(...)` (destructures `from, to, branchId`):
  ```ts
  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'report',
    resourceId: null,
    after: { report: 'appointment_stats', from, to, branchId: branchId ?? null },
  });
  ```

  `doctorWorkload(...)` (destructures `from, to, branchId`; has `rows` in scope before `.map(...)`):
  ```ts
  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'report',
    resourceId: null,
    after: { report: 'doctor_workload', from, to, branchId: branchId ?? null, rowCount: rows.length },
  });
  ```

  `planCompletion(...)` (destructures only `{ from, to }` — no `branchId` param used, per the existing tenant-wide-by-design comment at lines 319-320):
  ```ts
  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'report',
    resourceId: null,
    after: { report: 'plan_completion', from, to },
  });
  ```

  `dentalAnalytics(...)` (destructures `from, to, branchId`):
  ```ts
  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'report',
    resourceId: null,
    after: { report: 'dental_analytics', from, to, branchId: branchId ?? null },
  });
  ```

- [ ] **Step 4: Run test to verify it passes**
  ```bash
  cd apps/api && bun test --env-file=../../.env cli-389-reports
  bun run typecheck
  bun run --filter @dental/api test
  ```
  Full `reports` test suite + typecheck must be clean.

- [ ] **Step 5: Commit**
  ```
  feat(api): audit-log remaining report read endpoints as 'viewed' (CLI-389)
  ```

---

## Self-review

- **Task granularity:** Task 1 is the unavoidable "wire the dependency + fix 4 breakages" bundle (can't be split smaller without leaving the codebase in a non-compiling state between commits) plus the first audited method (`revenue`) as its proof; Tasks 2-3 are pure additive per-method audit calls with no shared-file collision risk if run sequentially.
- **Order:** `oneCExport` (Task 2) is isolated before the other 4 (Task 3) because it's the ticket's named priority (High, explicitly called out) and uses a distinct `action` (`'exported'`) — worth its own commit for a clean audit trail of "the security-sensitive one landed first."
- **Test data realism:** Task 2's `cashierTransactions` insert must be checked against the actual Drizzle schema (`@dental/db-schema`) for required NOT NULL columns beyond what's listed — the plan flags this explicitly rather than guessing a fixture that might not compile.
- **Risk not covered by this plan:** `apps/web` currently has no UI surfacing `/api/reports/1c-export` calls beyond existing report screens (out of scope — this ticket is backend-only per the spec's scope section). No route/permission changes — `report.view` middleware is untouched, only observability is added.
