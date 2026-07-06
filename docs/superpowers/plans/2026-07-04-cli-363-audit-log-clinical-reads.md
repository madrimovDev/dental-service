# CLI-363 — Klinik o'qishlar audit_log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `medical_record.view` bilan himoyalangan uchta klinik modul (tooth-charts, visit-notes, treatment-plans)ning o'qish funksiyalari (`list`/`getLatest`/`get`/`listPlans`/`getPlan`) `action: 'viewed'` audit yozuvi qo'shadi — CLAUDE.md §3.10 ("sensitive read... audit_log'ga yoziladi, lekin tarkibi emas, faqat ko'rilgani") talabini qondirish uchun.

**Architecture:** Har uch service faylida mavjud bir-qatorli arrow-function delegatsiya (`const x = (c, ...) => repo.x(c, ...)`) `async` funksiyaga aylantiriladi: repo chaqiriladi, natija saqlanadi, `deps.audit.record(c, {...})` chaqiriladi, keyin natija qaytariladi. Bitta-yozuvli `get`-tur funksiyalar `patients.service.ts`'ning `getMedicalRecord` naqshini aynan takrorlaydi (faqat `action`/`resourceType`/`resourceId`, hech qanday `before`/`after` — topilmasa audit ham yo'q). Ko'p-yozuvli `list`-tur funksiyalar har doim log qiladi, `after: { count }` (yoki `{ patientId, count }`) bilan.

**Tech Stack:** Bun, `apps/api/src/lib/audit-logger.ts` (`AuditLogger.record(c, entry: AuditEntry)`), Drizzle, PostgreSQL (real DB integration test), `bun:test` (`bun test --env-file=../../.env`, NOT vitest).

## Global Constraints

- Audit `'viewed'` chaqiruvlari **faqat identifying metadata** yozadi — hech qachon klinik tarkib (SOAP matni, tooth states, stage narxi) `before`/`after`'ga kirmaydi (CLAUDE.md §3.10).
- Repo qatlami (`*.repository.ts`) o'zgarmaydi — audit chaqiruvi faqat `*.service.ts` qatlamida qo'shiladi (RFC-0009 qatlam ajratuvi: repository "biznes mantiqsiz").
- Mavjud mutation audit chaqiruvlari (`create`/`update`/`updatePlan`/`setConsent`/`updateStage`) o'zgarmaydi.
- Mavjud testlar (`clinical.test.ts` va h.k.) `noopAudit` stub bilan ishlaydi — yangi `await deps.audit.record(...)` chaqiruvlari ularni buzmasligi kerak (noop har doim resolve bo'ladi).
- Test konvensiyasi: audit predmet bo'lgan yangi testlar **real** `createAuditLogger({ db })` ishlatadi (mock/spy YO'Q) + `auditLog` jadvalidan to'g'ridan-to'g'ri select bilan tasdiqlaydi — `medical-record-history.test.ts` aynan shu naqsh.

---

### Task 1: `tooth-charts.service.ts` — `list`/`getLatest` audit

**Files:**
- Modify: `apps/api/src/modules/clinical/tooth-charts/tooth-charts.service.ts:9-10`
- Test: `apps/api/tests/integration/cli-363-tooth-charts-audit.test.ts` (yangi)

**Interfaces:**
- Consumes: `AuditLogger.record(c: Context, entry: { action: string; resourceType: string; resourceId?: string | null; before?: unknown; after?: unknown; tenantIdOverride?: string | null }): Promise<void>` (`apps/api/src/lib/audit-logger.ts:24-34`).
- Produces: `list(c, patientId)` va `getLatest(c, patientId)` xatti-harakati o'zgarmaydi (bir xil qaytariladigan qiymat), qo'shimcha yon-effekt: audit yozuvi.

- [ ] **Step 1: Write the failing test**

`apps/api/tests/integration/cli-363-tooth-charts-audit.test.ts`:
```ts
/**
 * CLI-363 — tooth-charts.service.ts o'qish funksiyalari (list/getLatest) audit_log'ga
 * 'viewed' yozuvi qo'shishini tasdiqlaydi (CLAUDE.md §3.10). REAL DB + real audit logger.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-363-tooth-charts`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, patients, tenants, toothCharts, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createToothChartsService } from '../../src/modules/clinical/tooth-charts/tooth-charts.service.ts';

const audit = createAuditLogger({ db });
const service = createToothChartsService({ audit });

let tenantId: string;
let userId: string;
let patientId: string;
let chartId: string;

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
    .values({ phone: '+998900000060', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Tooth Clinic', slug: 'tooth-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;

    const [chart] = await tx
      .insert(toothCharts)
      .values({ tenantId, patientId, isPrimaryDentition: false })
      .returning({ id: toothCharts.id });
    if (!chart) throw new Error('chart insert failed');
    chartId = chart.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Tooth charts — o‘qish audit (CLI-363)', () => {
  test('list(): chaqirilganda audit_log’da action=viewed yozuvi paydo bo‘ladi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.list(ctx(tx), patientId);
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'viewed'),
          eq(auditLog.resourceType, 'tooth_chart'),
          eq(auditLog.resourceId, patientId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('getLatest(): topilgan snapshot uchun audit_log’da resourceId=chart.id yozuvi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.getLatest(ctx(tx), patientId);
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'viewed'),
          eq(auditLog.resourceType, 'tooth_chart'),
          eq(auditLog.resourceId, chartId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bun test --env-file=../../.env cli-363-tooth-charts
```
Ikkala test ham FAIL bo'lishi kerak (`rows.length` — 0, chunki `list`/`getLatest` hali audit yozmaydi).

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/clinical/tooth-charts/tooth-charts.service.ts:9-10` ni almashtiring:
```ts
const list = async (c: Context, patientId: string) => {
  const rows = await repo.list(c, patientId);
  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'tooth_chart',
    resourceId: patientId,
    after: { count: rows.length },
  });
  return rows;
};

const getLatest = async (c: Context, patientId: string) => {
  const chart = await repo.getLatestWithStates(c, patientId);
  if (chart) {
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'tooth_chart',
      resourceId: chart.id,
    });
  }
  return chart;
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bun test --env-file=../../.env cli-363-tooth-charts
```
Ikkala test PASS. Regressiya tekshiruvi: `bun test --env-file=../../.env clinical` (mavjud `clinical.test.ts`, `noopAudit` bilan) ham yashil qolishi shart.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/clinical/tooth-charts/tooth-charts.service.ts apps/api/tests/integration/cli-363-tooth-charts-audit.test.ts
git commit -m "fix(api): audit-log tooth-charts reads (CLI-363)"
```

---

### Task 2: `visit-notes.service.ts` — `list`/`get` audit

**Files:**
- Modify: `apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts:22-23`
- Test: `apps/api/tests/integration/cli-363-visit-notes-audit.test.ts` (yangi)

**Interfaces:**
- Consumes: `AuditLogger.record` (bir xil signature, Task 1 bilan).
- Produces: `list(c, patientId?)` — tenant-wide yoki patient-filtered; `get(c, id)` — bitta yozuv yoki `null`. Xatti-harakat o'zgarmaydi, faqat audit yon-effekti qo'shiladi.

- [ ] **Step 1: Write the failing test**

`apps/api/tests/integration/cli-363-visit-notes-audit.test.ts`:
```ts
/**
 * CLI-363 — visit-notes.service.ts o'qish funksiyalari (list/get) audit_log'ga
 * 'viewed' yozuvi qo'shishini tasdiqlaydi. REAL DB + real audit logger.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-363-visit-notes`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, patients, tenants, users, visitNotes } from '@dental/db-schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createVisitNotesService } from '../../src/modules/clinical/visit-notes/visit-notes.service.ts';

const audit = createAuditLogger({ db });
const service = createVisitNotesService({ audit });

let tenantId: string;
let userId: string;
let patientId: string;
let noteId: string;

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
    .values({ phone: '+998900000061', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Visit Clinic', slug: 'visit-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;

    const [note] = await tx
      .insert(visitNotes)
      .values({ tenantId, patientId, doctorId: userId })
      .returning({ id: visitNotes.id });
    if (!note) throw new Error('visit note insert failed');
    noteId = note.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Visit notes — o‘qish audit (CLI-363)', () => {
  test('list(): chaqirilganda audit_log’da action=viewed yozuvi paydo bo‘ladi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.list(ctx(tx), patientId);
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'viewed'),
          eq(auditLog.resourceType, 'visit_note'),
          eq(auditLog.resourceId, patientId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('list(no patientId): tenant-wide chaqiruv ham audit yozadi (resourceId=null)', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.list(ctx(tx));
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'viewed'),
          eq(auditLog.resourceType, 'visit_note'),
          isNull(auditLog.resourceId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('get(): topilgan yozuv uchun audit_log’da resourceId=note.id yozuvi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.get(ctx(tx), noteId);
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'viewed'),
          eq(auditLog.resourceType, 'visit_note'),
          eq(auditLog.resourceId, noteId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bun test --env-file=../../.env cli-363-visit-notes
```
Uchala test FAIL (0 audit qatori).

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts:22-23` ni almashtiring:
```ts
const list = async (c: Context, patientId?: string) => {
  const rows = await repo.list(c, patientId);
  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'visit_note',
    resourceId: patientId ?? null,
    after: { patientId: patientId ?? null, count: rows.length },
  });
  return rows;
};

const get = async (c: Context, id: string) => {
  const note = await repo.find(c, id);
  if (note) {
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'visit_note',
      resourceId: id,
    });
  }
  return note;
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bun test --env-file=../../.env cli-363-visit-notes
```
Uchala test PASS. Regressiya: `bun test --env-file=../../.env clinical` va `bun test --env-file=../../.env cli-222-visit-note-stage` yashil qolishi shart (`visit-notes.service.ts`'ni ishlatadi).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts apps/api/tests/integration/cli-363-visit-notes-audit.test.ts
git commit -m "fix(api): audit-log visit-notes reads (CLI-363)"
```

---

### Task 3: `treatment-plans.service.ts` — `listPlans`/`getPlan` audit

**Files:**
- Modify: `apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts:49-50`
- Test: `apps/api/tests/integration/cli-363-treatment-plans-audit.test.ts` (yangi)

**Interfaces:**
- Consumes: `AuditLogger.record` (bir xil signature).
- Produces: `listPlans(c, query: ListPlansQuery)` — `{data, meta}`; `getPlan(c, id)` — plan+stages yoki `null`. Xatti-harakat o'zgarmaydi.

- [ ] **Step 1: Write the failing test**

`apps/api/tests/integration/cli-363-treatment-plans-audit.test.ts`:
```ts
/**
 * CLI-363 — treatment-plans.service.ts o'qish funksiyalari (listPlans/getPlan)
 * audit_log'ga 'viewed' yozuvi qo'shishini tasdiqlaydi. REAL DB + real audit logger.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-363-treatment-plans`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, patients, tenants, treatmentPlans, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createTreatmentPlansService } from '../../src/modules/clinical/treatment-plans/treatment-plans.service.ts';

const audit = createAuditLogger({ db });
const service = createTreatmentPlansService({ audit });

let tenantId: string;
let userId: string;
let patientId: string;
let planId: string;

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
    .values({ phone: '+998900000062', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Plan Clinic', slug: 'plan-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: userId, title: 'Reja' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    planId = plan.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Treatment plans — o‘qish audit (CLI-363)', () => {
  test('listPlans(): chaqirilganda audit_log’da action=viewed yozuvi paydo bo‘ladi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.listPlans(ctx(tx), { patientId, page: 1, pageSize: 20 });
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'viewed'),
          eq(auditLog.resourceType, 'treatment_plan'),
          eq(auditLog.resourceId, patientId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('getPlan(): topilgan reja uchun audit_log’da resourceId=plan.id yozuvi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.getPlan(ctx(tx), planId);
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'viewed'),
          eq(auditLog.resourceType, 'treatment_plan'),
          eq(auditLog.resourceId, planId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bun test --env-file=../../.env cli-363-treatment-plans
```
Ikkala test FAIL.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts:49-50` ni almashtiring:
```ts
const listPlans = async (c: Context, query: ListPlansQuery) => {
  const result = await repo.listPlans(c, query);
  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'treatment_plan',
    resourceId: query.patientId ?? null,
    after: { patientId: query.patientId ?? null, count: result.data.length },
  });
  return result;
};

const getPlan = async (c: Context, id: string) => {
  const plan = await repo.getPlanWithStages(c, id);
  if (plan) {
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'treatment_plan',
      resourceId: id,
    });
  }
  return plan;
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bun test --env-file=../../.env cli-363-treatment-plans
```
Ikkala test PASS. Regressiya: `bun test --env-file=../../.env clinical`, `cli-223-plan-estimate`, `cli-222-visit-note-stage` yashil qolishi shart (barchasi `treatment-plans.service.ts`'ni ishlatadi/`recall` DI orqali chaqiradi).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts apps/api/tests/integration/cli-363-treatment-plans-audit.test.ts
git commit -m "fix(api): audit-log treatment-plans reads (CLI-363)"
```

---

## Self-review

- **Placeholder tekshiruvi:** har uchala task'da audit chaqiruvi aynan mavjud `patients.service.ts` naqshidan olingan (`action`/`resourceType`/`resourceId`, bitta-yozuvli funksiyalarda `before`/`after` yo'q); hech qanday `TODO`/`<placeholder>` yo'q.
- **Tip izchilligi:** `AuditEntry.resourceId?: string | null` — `patientId ?? null` va `query.patientId ?? null` ikkalasi ham `string | null` beradi, tip mos. `after: unknown` — obyekt literal `{ count, patientId }` mos.
- **Repo funksiya signature'lari** (`repo.list`, `repo.getLatestWithStates`, `repo.find`, `repo.listPlans`, `repo.getPlanWithStages`) o'qilgan koddan aynan olingan — o'zgartirilmaydi, faqat service qatlamida wrap qilinadi.
- **Regressiya xatari:** mavjud `noopAudit`-based testlar (`clinical.test.ts`, `cli-222-visit-note-stage.test.ts`, `cli-223-plan-estimate.test.ts`) — yangi audit chaqiruvlari ularni buzmasligi har Task'ning Step 4'ida aniq eslatilgan.
- **Test fayl nomlari** noyob (`cli-363-<modul>-audit.test.ts`) — mavjud fayllar bilan to'qnashmaydi.
