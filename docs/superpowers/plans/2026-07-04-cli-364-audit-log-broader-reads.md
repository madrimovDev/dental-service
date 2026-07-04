# CLI-364 — Konsent/retsept/lab-order/rasm o'qishlari audit_log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `consent.service.ts` (`consent.view`), `prescriptions.service.ts` (`prescription.view`), `lab-orders.service.ts` (`lab_order.view`), `patient-images.service.ts` (`patient_image.view`)ning o'qish funksiyalari `action: 'viewed'` audit yozuvi qo'shadi — CLI-363'da o'rnatilgan naqshni davom ettirib, CLAUDE.md §3.10 gap'ini qolgan klinik modullarda ham yopish.

**Architecture:** CLI-363 bilan bir xil yondashuv: bitta-yozuvli `get`/`getTemplate` funksiyalar `patients.service.ts`'ning `getMedicalRecord` naqshini takrorlaydi (topilsa — `action`/`resourceType`/`resourceId`, `before`/`after` yo'q); ko'p-yozuvli `list`/`listTemplates`/`listForms`/`overdue` funksiyalar har doim log qiladi (`after: { count, patientId? }`). `patient-images.service.ts`'da audit `presignedGetUrl` chaqiruvidan OLDIN yoziladi — signed URL audit yozuviga kirmaydi.

**Tech Stack:** Bun, `apps/api/src/lib/audit-logger.ts` (`AuditLogger.record(c, entry: AuditEntry)`), Drizzle, PostgreSQL (real DB integration test), `bun:test` (`bun test --env-file=../../.env`, NOT vitest).

## Global Constraints

- Audit `'viewed'` chaqiruvlari **faqat identifying metadata** yozadi. `consentForms.bodyText`, `prescriptions.items`, `labOrders.items`/`notes`, `patientImages.objectKey`/`originalFilename`/signed `url` — HECH BIRI audit yozuviga kirmaydi (CLAUDE.md §3.10).
- Repo qatlami yo'q bu to'rt modulda (inline Drizzle service ichida) — audit chaqiruvi to'g'ridan-to'g'ri `*.service.ts` ichidagi mavjud select bloklariga qo'shiladi, query mantig'i o'zgarmaydi.
- Mavjud mutation audit chaqiruvlari (`createTemplate`/`updateTemplate`/`signForm`/`create`/`update`/`remove`/`upload`/`updateMetadata`) o'zgarmaydi.
- Mavjud testlar (`patient-images-visit-link.test.ts` — `noopAudit` bilan) yangi audit chaqiruvidan keyin ham yashil qolishi shart.
- Test konvensiyasi: audit predmet bo'lgan yangi testlar **real** `createAuditLogger({ db })` ishlatadi (mock/spy YO'Q) + `auditLog` jadvalidan to'g'ridan-to'g'ri select bilan tasdiqlaydi.

---

### Task 1: `consent.service.ts` — `listTemplates`/`getTemplate`/`listForms` audit

**Files:**
- Modify: `apps/api/src/modules/consent/consent.service.ts:10-26,87-96`
- Test: `apps/api/tests/integration/cli-364-consent-audit.test.ts` (yangi)

**Interfaces:**
- Consumes: `AuditLogger.record(c: Context, entry: { action: string; resourceType: string; resourceId?: string | null; before?: unknown; after?: unknown; tenantIdOverride?: string | null }): Promise<void>` (`apps/api/src/lib/audit-logger.ts:24-34`).
- Produces: `listTemplates`, `getTemplate`, `listForms` xatti-harakati o'zgarmaydi, audit yon-effekti qo'shiladi.

- [ ] **Step 1: Write the failing test**

`apps/api/tests/integration/cli-364-consent-audit.test.ts`:
```ts
/**
 * CLI-364 — consent.service.ts o'qish funksiyalari (listTemplates/getTemplate/listForms)
 * audit_log'ga 'viewed' yozuvi qo'shishini tasdiqlaydi. REAL DB + real audit logger.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-364-consent`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  auditLog,
  consentForms,
  consentTemplates,
  patients,
  tenants,
  users,
} from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createConsentService } from '../../src/modules/consent/consent.service.ts';

const audit = createAuditLogger({ db });
const service = createConsentService({ audit });

let tenantId: string;
let userId: string;
let patientId: string;
let templateId: string;

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
    .values({ phone: '+998900000070', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Consent Clinic', slug: 'consent-clinic', ownerUserId: userId })
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

    const [template] = await tx
      .insert(consentTemplates)
      .values({ tenantId, type: 'treatment', title: 'Shablon', bodyUz: 'matn' })
      .returning({ id: consentTemplates.id });
    if (!template) throw new Error('template insert failed');
    templateId = template.id;

    await tx.insert(consentForms).values({
      tenantId,
      patientId,
      type: 'treatment',
      title: 'Imzo',
      bodyText: 'matn',
      language: 'uz',
      signedByUserId: userId,
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Consent — o‘qish audit (CLI-364)', () => {
  test('listTemplates(): audit_log’da action=viewed/resourceType=consent_template', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.listTemplates(ctx(tx));
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.action, 'viewed'), eq(auditLog.resourceType, 'consent_template')),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('getTemplate(): topilgan shablon uchun resourceId=template.id', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.getTemplate(ctx(tx), templateId);
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'viewed'),
          eq(auditLog.resourceType, 'consent_template'),
          eq(auditLog.resourceId, templateId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('listForms(): audit_log’da resourceType=consent_form/resourceId=patientId', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.listForms(ctx(tx), patientId);
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'viewed'),
          eq(auditLog.resourceType, 'consent_form'),
          eq(auditLog.resourceId, patientId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bun test --env-file=../../.env cli-364-consent
```
Uchala test FAIL (0 audit qatori).

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/consent/consent.service.ts`da `listTemplates`/`getTemplate`/`listForms`ni almashtiring:
```ts
async function listTemplates(c: Context, type?: string, activeOnly = true) {
  const db = getDb(c);
  const filters = [];
  if (type) filters.push(eq(consentTemplates.type, type as 'treatment'));
  if (activeOnly) filters.push(eq(consentTemplates.isActive, true));
  const rows = await db
    .select()
    .from(consentTemplates)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(consentTemplates.createdAt));

  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'consent_template',
    resourceId: null,
    after: { type: type ?? null, count: rows.length },
  });
  return rows;
}

async function getTemplate(c: Context, id: string) {
  const db = getDb(c);
  const [row] = await db.select().from(consentTemplates).where(eq(consentTemplates.id, id));
  if (row) {
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'consent_template',
      resourceId: id,
    });
  }
  return row ?? null;
}
```
va (bo'lim "===== Signed forms ====="):
```ts
async function listForms(c: Context, patientId?: string) {
  const db = getDb(c);
  const filters = [];
  if (patientId) filters.push(eq(consentForms.patientId, patientId));
  const rows = await db
    .select()
    .from(consentForms)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(consentForms.signedAt));

  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'consent_form',
    resourceId: patientId ?? null,
    after: { patientId: patientId ?? null, count: rows.length },
  });
  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bun test --env-file=../../.env cli-364-consent
```
Uchala test PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/consent/consent.service.ts apps/api/tests/integration/cli-364-consent-audit.test.ts
git commit -m "fix(api): audit-log consent reads (CLI-364)"
```

---

### Task 2: `prescriptions.service.ts` — `list`/`get` audit

**Files:**
- Modify: `apps/api/src/modules/prescriptions/prescriptions.service.ts:9-24`
- Test: `apps/api/tests/integration/cli-364-prescriptions-audit.test.ts` (yangi)

**Interfaces:**
- Consumes: `AuditLogger.record` (bir xil signature).
- Produces: `list(c, patientId?)`, `get(c, id)` xatti-harakati o'zgarmaydi.

- [ ] **Step 1: Write the failing test**

`apps/api/tests/integration/cli-364-prescriptions-audit.test.ts`:
```ts
/**
 * CLI-364 — prescriptions.service.ts o'qish funksiyalari (list/get) audit_log'ga
 * 'viewed' yozuvi qo'shishini tasdiqlaydi. REAL DB + real audit logger.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-364-prescriptions`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, patients, prescriptions, tenants, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createPrescriptionsService } from '../../src/modules/prescriptions/prescriptions.service.ts';

const audit = createAuditLogger({ db });
const service = createPrescriptionsService({ audit });

let tenantId: string;
let userId: string;
let patientId: string;
let prescriptionId: string;

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
    .values({ phone: '+998900000071', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Rx Clinic', slug: 'rx-clinic', ownerUserId: userId })
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

    const [rx] = await tx
      .insert(prescriptions)
      .values({
        tenantId,
        patientId,
        doctorId: userId,
        items: [{ medicationName: 'Amoxicillin', dosage: '500mg', frequency: '3x/kun' }],
      })
      .returning({ id: prescriptions.id });
    if (!rx) throw new Error('prescription insert failed');
    prescriptionId = rx.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Prescriptions — o‘qish audit (CLI-364)', () => {
  test('list(): audit_log’da action=viewed/resourceType=prescription/resourceId=patientId', async () => {
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
          eq(auditLog.resourceType, 'prescription'),
          eq(auditLog.resourceId, patientId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('get(): topilgan retsept uchun resourceId=prescription.id', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.get(ctx(tx), prescriptionId);
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'viewed'),
          eq(auditLog.resourceType, 'prescription'),
          eq(auditLog.resourceId, prescriptionId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bun test --env-file=../../.env cli-364-prescriptions
```
Ikkala test FAIL.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/prescriptions/prescriptions.service.ts:9-24` ni almashtiring:
```ts
async function list(c: Context, patientId?: string) {
  const db = getDb(c);
  const filters = [];
  if (patientId) filters.push(eq(prescriptions.patientId, patientId));
  const rows = await db
    .select()
    .from(prescriptions)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(prescriptions.issuedDate));

  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'prescription',
    resourceId: patientId ?? null,
    after: { patientId: patientId ?? null, count: rows.length },
  });
  return rows;
}

async function get(c: Context, id: string) {
  const db = getDb(c);
  const [row] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
  if (row) {
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'prescription',
      resourceId: id,
    });
  }
  return row ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bun test --env-file=../../.env cli-364-prescriptions
```
Ikkala test PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/prescriptions/prescriptions.service.ts apps/api/tests/integration/cli-364-prescriptions-audit.test.ts
git commit -m "fix(api): audit-log prescriptions reads (CLI-364)"
```

---

### Task 3: `lab-orders.service.ts` — `list`/`overdue`/`get` audit

**Files:**
- Modify: `apps/api/src/modules/lab-orders/lab-orders.service.ts:17-60`
- Test: `apps/api/tests/integration/cli-364-lab-orders-audit.test.ts` (yangi)

**Interfaces:**
- Consumes: `AuditLogger.record` (bir xil signature).
- Produces: `list(c, query: ListLabOrdersQuery)` — `{data, meta}`; `overdue(c)` — massiv; `get(c, id)` — bitta yozuv yoki `null`. Xatti-harakat o'zgarmaydi.

- [ ] **Step 1: Write the failing test**

`apps/api/tests/integration/cli-364-lab-orders-audit.test.ts`:
```ts
/**
 * CLI-364 — lab-orders.service.ts o'qish funksiyalari (list/overdue/get) audit_log'ga
 * 'viewed' yozuvi qo'shishini tasdiqlaydi. REAL DB + real audit logger.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-364-lab-orders`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, labOrders, patients, tenants, users } from '@dental/db-schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createLabOrdersService } from '../../src/modules/lab-orders/lab-orders.service.ts';

const audit = createAuditLogger({ db });
const service = createLabOrdersService({ audit });

let tenantId: string;
let userId: string;
let patientId: string;
let labOrderId: string;

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
    .values({ phone: '+998900000072', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Lab Clinic', slug: 'lab-clinic', ownerUserId: userId })
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

    const [order] = await tx
      .insert(labOrders)
      .values({
        tenantId,
        patientId,
        doctorId: userId,
        labName: 'Lab A',
        orderType: 'crown',
        items: [{ description: 'Crown 26' }],
      })
      .returning({ id: labOrders.id });
    if (!order) throw new Error('lab order insert failed');
    labOrderId = order.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Lab orders — o‘qish audit (CLI-364)', () => {
  test('list(): audit_log’da action=viewed/resourceType=lab_order/resourceId=patientId', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.list(ctx(tx), { patientId, page: 1, pageSize: 20 });
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'viewed'),
          eq(auditLog.resourceType, 'lab_order'),
          eq(auditLog.resourceId, patientId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('overdue(): tenant-wide chaqiruv audit yozadi (resourceId=null)', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.overdue(ctx(tx));
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'viewed'),
          eq(auditLog.resourceType, 'lab_order'),
          isNull(auditLog.resourceId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('get(): topilgan buyurtma uchun resourceId=labOrder.id', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.get(ctx(tx), labOrderId);
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'viewed'),
          eq(auditLog.resourceType, 'lab_order'),
          eq(auditLog.resourceId, labOrderId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bun test --env-file=../../.env cli-364-lab-orders
```
Uchala test FAIL.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/lab-orders/lab-orders.service.ts:17-60` ni almashtiring:
```ts
async function list(c: Context, query: ListLabOrdersQuery) {
  const db = getDb(c);
  const offset = (query.page - 1) * query.pageSize;

  const filters = [];
  if (query.patientId) filters.push(eq(labOrders.patientId, query.patientId));
  if (query.status) filters.push(eq(labOrders.status, query.status));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [data, totalRows] = await Promise.all([
    db
      .select()
      .from(labOrders)
      .where(where)
      .orderBy(desc(labOrders.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ total: count() }).from(labOrders).where(where),
  ]);
  const total = totalRows[0]?.total ?? 0;

  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'lab_order',
    resourceId: query.patientId ?? null,
    after: { patientId: query.patientId ?? null, count: data.length },
  });

  return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
}

async function overdue(c: Context) {
  const db = getDb(c);
  const rows = await db
    .select()
    .from(labOrders)
    .where(
      and(
        lt(labOrders.expectedDate, new Date()),
        notInArray(labOrders.status, ['delivered', 'cancelled']),
      ),
    )
    .orderBy(labOrders.expectedDate);

  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'lab_order',
    resourceId: null,
    after: { overdue: true, count: rows.length },
  });
  return rows;
}

async function get(c: Context, id: string) {
  const db = getDb(c);
  const [row] = await db.select().from(labOrders).where(eq(labOrders.id, id));
  if (row) {
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'lab_order',
      resourceId: id,
    });
  }
  return row ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bun test --env-file=../../.env cli-364-lab-orders
```
Uchala test PASS. Regressiya: `bun test --env-file=../../.env cli-243-dental-analytics` yashil qolishi shart (lab-orders ma'lumotlariga bog'liq bo'lishi mumkin).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/lab-orders/lab-orders.service.ts apps/api/tests/integration/cli-364-lab-orders-audit.test.ts
git commit -m "fix(api): audit-log lab-orders reads (CLI-364)"
```

---

### Task 4: `patient-images.service.ts` — `list`/`get` audit (content-free)

**Files:**
- Modify: `apps/api/src/modules/patient-images/patient-images.service.ts:32-58`
- Test: `apps/api/tests/integration/cli-364-patient-images-audit.test.ts` (yangi)

**Interfaces:**
- Consumes: `AuditLogger.record` (bir xil signature).
- Produces: `list(c, patientId, visitNoteId?)`, `get(c, id)` xatti-harakati o'zgarmaydi (signed `url` bilan qaytaradi). Audit yozuvida `url`/`objectKey` YO'Q (§4 global constraint).

- [ ] **Step 1: Write the failing test**

`apps/api/tests/integration/cli-364-patient-images-audit.test.ts`:
```ts
/**
 * CLI-364 — patient-images.service.ts o'qish funksiyalari (list/get) audit_log'ga
 * 'viewed' yozuvi qo'shishini tasdiqlaydi (url/objectKey audit'ga kirmaydi).
 * REAL DB + real audit logger.
 *
 * Talab: Postgres + S3 env (presign offline, patient-images-visit-link.test.ts bilan bir xil).
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-364-patient-images`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, patientImages, patients, tenants, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { createPatientImagesService } from '../../src/modules/patient-images/patient-images.service.ts';

const audit = createAuditLogger({ db });
const service = createPatientImagesService({ audit });

let tenantId: string;
let userId: string;
let patientId: string;
let imageId: string;

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
    .values({ phone: '+998900000073', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Image Clinic 2', slug: 'image-clinic-2', ownerUserId: userId })
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

    const [img] = await tx
      .insert(patientImages)
      .values({
        tenantId,
        patientId,
        type: 'intraoral_photo',
        objectKey: 'k/secret.jpg',
        originalFilename: 'secret.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 100,
      })
      .returning({ id: patientImages.id });
    if (!img) throw new Error('image insert failed');
    imageId = img.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Patient images — o‘qish audit (CLI-364)', () => {
  test('list(): audit_log’da action=viewed/resourceType=patient_image, url/objectKey YO‘Q', async () => {
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
          eq(auditLog.resourceType, 'patient_image'),
          eq(auditLog.resourceId, patientId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const serialized = JSON.stringify(rows[0]?.after ?? {});
    expect(serialized).not.toContain('secret.jpg');
    expect(serialized).not.toContain('k/secret.jpg');
  });

  test('get(): topilgan rasm uchun resourceId=image.id, tarkib audit’ga kirmaydi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.get(ctx(tx), imageId);
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'viewed'),
          eq(auditLog.resourceType, 'patient_image'),
          eq(auditLog.resourceId, imageId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.after).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bun test --env-file=../../.env cli-364-patient-images
```
Ikkala test FAIL (0 audit qatori).

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/patient-images/patient-images.service.ts:32-58` ni almashtiring:
```ts
async function list(c: Context, patientId: string, visitNoteId?: string) {
  const db = getDb(c);
  const rows = await db
    .select()
    .from(patientImages)
    .where(
      visitNoteId
        ? and(eq(patientImages.patientId, patientId), eq(patientImages.visitNoteId, visitNoteId))
        : eq(patientImages.patientId, patientId),
    )
    .orderBy(desc(patientImages.createdAt));

  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'patient_image',
    resourceId: patientId,
    after: { patientId, visitNoteId: visitNoteId ?? null, count: rows.length },
  });

  // Sign URLs for client preview
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      url: await presignedGetUrl(row.objectKey),
    })),
  );
}

async function get(c: Context, id: string) {
  const db = getDb(c);
  const [row] = await db.select().from(patientImages).where(eq(patientImages.id, id));
  if (!row) return null;

  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'patient_image',
    resourceId: id,
  });

  return { ...row, url: await presignedGetUrl(row.objectKey) };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bun test --env-file=../../.env cli-364-patient-images
```
Ikkala test PASS. Regressiya: `bun test --env-file=../../.env patient-images-visit-link` (`noopAudit` bilan) yashil qolishi shart.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/patient-images/patient-images.service.ts apps/api/tests/integration/cli-364-patient-images-audit.test.ts
git commit -m "fix(api): audit-log patient-images reads, content-free (CLI-364)"
```

---

## Self-review

- **Placeholder tekshiruvi:** har to'rt task'da audit chaqiruvi CLI-363'dagi aynan bir xil naqshni ishlatadi (`patients.service.ts`'dan olingan); `<placeholder>`/`TODO` yo'q.
- **Tip izchilligi:** `AuditEntry.resourceId?: string | null` — `patientId ?? null`, `query.patientId ?? null`, `type ?? null` — barchasi `string | null`. `after: unknown` — obyekt literal mos.
- **Query mantig'i o'zgarmadi:** har funksiyada mavjud `select`/`where`/`orderBy`/`limit`/`offset` bloklari aynan saqlanadi, faqat natija olingandan keyin (return'dan oldin) audit chaqiruvi qo'shiladi.
- **`patient-images` maxsus talab:** Task 4'da audit `after` maydonida `url`/`objectKey`/`originalFilename` YO'Q ekanligi test darajasida aniq tekshiriladi (`serialized).not.toContain(...)`) — bu §4 global constraint'ning eng yuqori xavfli qismi, shuning uchun boshqa modullardan farqli aniq negative-assertion qo'shilgan.
- **Regressiya xatari:** `patient-images-visit-link.test.ts` (`noopAudit`) Task 4'da aniq eslatilgan; `cli-243-dental-analytics` Task 3'da eslatilgan (lab-orders bog'liqligi).
- **Test fayl nomlari** noyob (`cli-364-<modul>-audit.test.ts`), CLI-363 fayllari bilan to'qnashmaydi.
