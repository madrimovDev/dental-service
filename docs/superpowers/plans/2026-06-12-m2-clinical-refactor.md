# M2 clinical modul refactor (CLI-99) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/api/src/modules/clinical/` monolit `clinical.service.ts` (356q, 4 concern) ni 4 mustaqil sub-domen papkaga (treatment-plans · visit-notes · tooth-charts · diagnoses), har biri RFC-0009 6-fayl arxitekturasida — tashqi xulq (API path, javob shakli, RLS) o'zgarmasdan.

**Architecture:** "Create-only" parallel fan-out — Wave 1 da 4 agent FAQAT o'z `clinical/<sub-domain>/*` fayllarini yaratadi, umumiy fayllarga tegmaydi (git konflikt nolga teng, worktree shart emas). Wave 2 da bitta writer aggregator routes/index ni ulaydi + eski monolit o'chiradi. Refactor'dan OLDIN (Wave 0) clinical integration smoke test yoziladi (safety net).

**Tech Stack:** Bun + Hono (plain, zod-openapi EMAS) + Drizzle + Zod 4 + Postgres RLS. Test: `bun:test`, real DB, `--env-file=../../.env`.

---

## Fayl strukturasi (target)

```
apps/api/src/modules/clinical/
├── clinical.routes.ts          # Wave 2: aggregator (4 sub-route mount, path'lar O'ZGARMAYDI)
├── index.ts                    # Wave 2: public eksport
├── treatment-plans/            # Wave 1, Agent A
│   ├── treatment-plans.routes.ts
│   ├── treatment-plans.service.ts
│   ├── treatment-plans.repository.ts
│   ├── treatment-plans.mapper.ts
│   ├── treatment-plans.schema.ts
│   └── index.ts
├── visit-notes/                # Wave 1, Agent B  (xuddi shu 6 fayl)
├── tooth-charts/               # Wave 1, Agent C  (xuddi shu 6 fayl)
└── diagnoses/                  # Wave 1, Agent D  (xuddi shu 6 fayl)
```

**O'chiriladi (Wave 2):** `clinical.service.ts`, `clinical.schema.ts` (mazmuni sub-domenlarga ko'chgach).

**Invariantlar (har task'da saqlanadi):**
- API path'lari verbatim: `/diagnoses`, `/treatment-plans`, `/treatment-plans/:id`, `/treatment-stages/:id`, `/visit-notes`, `/visit-notes/:id`, `/patients/:patientId/tooth-charts`, `/patients/:patientId/tooth-charts/latest`, `/tooth-charts`.
- `clinicalRoutes({ db, audit })` signaturasi o'zgarmaydi (`app.ts:67` ulanish nuqtasi).
- JSON javob shakli o'zgarmaydi (api-client qo'lda, hardcoded).
- RLS: `getDb(c)` RLS-bound sub-domenlarda; `diagnoses` `deps.db` to'g'ridan-to'g'ri (platform-level); `createPlan`/`createToothChart` ichidagi `db.transaction()` + `set_config` verbatim.

---

## Wave 0 — Safety net (BLOCKING, fan-out'dan oldin)

### Task 0: clinical integration smoke test

**Files:**
- Create: `apps/api/tests/integration/clinical.test.ts`

Bu test MAVJUD `clinical.service.ts` ustida yoziladi va **refactor'dan oldin yashil bo'lishi shart**. U before/after invariant net'i — Wave 1/2 dan keyin AYNAN shu test (o'zgarmasdan) yana yashil bo'lishi kerak.

- [ ] **Step 1: Test faylini yozish**

`apps/api/tests/integration/clinical.test.ts`:

```ts
/**
 * Clinical smoke test (CLI-99 refactor safety net) — 4 sub-domenning asosiy
 * service operatsiyalarini REAL DB'da tekshiradi. Refactor'dan OLDIN yashil bo'lishi shart;
 * refactor'dan KEYIN o'zgarmasdan yana yashil bo'lishi kerak (before/after invariant).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env clinical`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { diagnoses, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createClinicalService } from '../../src/modules/clinical/clinical.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createClinicalService({ audit: noopAudit, db });

const ctx = (tx: DbOrTx, tenantId: string, userId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: userId }
            : undefined,
  }) as unknown as Context;

const run = <T>(tenantId: string, userId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx, tenantId, userId));
  });

let tenantAId: string;
let tenantBId: string;
let doctorAId: string;
let patientAId: string;
let diagnosisId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [ownerA] = await db
    .insert(users)
    .values({ phone: '+998900000050', passwordHash: 'x', fullName: 'Doctor A' })
    .returning({ id: users.id });
  doctorAId = ownerA!.id;
  const [ownerB] = await db
    .insert(users)
    .values({ phone: '+998900000051', passwordHash: 'x', fullName: 'Owner B' })
    .returning({ id: users.id });

  const [tenantA] = await db
    .insert(tenants)
    .values({ name: 'CA', slug: 'ca-clinic', ownerUserId: doctorAId })
    .returning({ id: tenants.id });
  tenantAId = tenantA!.id;
  const [tenantB] = await db
    .insert(tenants)
    .values({ name: 'CB', slug: 'cb-clinic', ownerUserId: ownerB!.id })
    .returning({ id: tenants.id });
  tenantBId = tenantB!.id;

  // Bemorni RLS-tx ichida yaratamiz (patients tenant-scoped).
  patientAId = await run(tenantAId, doctorAId, async (c) => {
    const scoped = c.get('db') as DbOrTx;
    const { patients } = await import('@dental/db-schema');
    const [p] = await scoped
      .insert(patients)
      .values({ tenantId: tenantAId, firstName: 'Test', lastName: 'Bemor', phone: '+998901112233' })
      .returning({ id: patients.id });
    return p!.id;
  });

  // Diagnoses — platform-level katalog (RLS yo'q), to'g'ridan-to'g'ri db.
  const [dg] = await db
    .insert(diagnoses)
    .values({ code: 'K02.1', nameUz: 'Kariyes', nameRu: 'Кариес' })
    .returning({ id: diagnoses.id });
  diagnosisId = dg!.id;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await db.execute(sql`DELETE FROM diagnoses WHERE code = 'K02.1'`);
});

describe('clinical smoke — real DB', () => {
  test('diagnoses — platform katalog qaytadi (RLS yo\'q)', async () => {
    const list = await service.listDiagnoses();
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((d) => d.code === 'K02.1')).toBe(true);
  });

  test('treatment-plan create → get (stages bilan, RLS tx)', async () => {
    const created = await run(tenantAId, doctorAId, (c) =>
      service.createPlan(c, {
        patientId: patientAId,
        doctorId: doctorAId,
        title: 'Reja 1',
        stages: [
          { serviceName: 'Plomba', estimatedVisits: 1, cost: 100000 },
        ],
      }),
    );
    expect(created).not.toBeNull();
    expect(created!.title).toBe('Reja 1');
    expect(created!.stages).toHaveLength(1);
    expect(created!.totalCost).toBe('100000');
  });

  test('visit-note create (deductStock yon ta\'sirsiz — DI ixtiyoriy)', async () => {
    const note = await run(tenantAId, doctorAId, (c) =>
      service.createVisitNote(c, {
        patientId: patientAId,
        doctorId: doctorAId,
        assessmentDiagnoses: [diagnosisId],
        performedServices: [],
        subjective: 'Og\'riq',
      }),
    );
    expect(note).toBeTruthy();
    expect(note!.subjective).toBe('Og\'riq');
  });

  test('tooth-chart create → latest (states bilan, RLS tx)', async () => {
    const chart = await run(tenantAId, doctorAId, (c) =>
      service.createToothChart(c, {
        patientId: patientAId,
        isPrimaryDentition: false,
        states: [{ toothNumber: 11, surface: 'whole', state: 'caries', diagnosisId }],
      }),
    );
    expect(chart.states).toHaveLength(1);
    const latest = await run(tenantAId, doctorAId, (c) =>
      service.getLatestToothChart(c, patientAId),
    );
    expect(latest!.id).toBe(chart.id);
  });

  test('RLS scope — tenant B bemor A rejalarini ko\'rmaydi', async () => {
    const plans = await run(tenantBId, doctorAId, (c) => service.listPlans(c, patientAId));
    expect(plans).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Testni ishga tushirib, yashil ekanini tasdiqlash**

Run: `cd apps/api && bun test --env-file=../../.env clinical`
Expected: PASS — 5 test (diagnoses, treatment-plan, visit-note, tooth-chart, RLS scope).

> ⚠️ Agar bemor/diagnoz schema maydonlari (`firstName`/`lastName`/`phone`, `diagnoses.code/nameUz/nameRu`) mos kelmasa — `packages/db-schema/src/tables/patients.ts` va `.../diagnoses.ts` ni o'qib, insert qiymatlarini moslang. Test YASHIL bo'lmaguncha Wave 1 ga o'tilmaydi.

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/integration/clinical.test.ts
git commit -m "test(clinical): refactor safety net — 4 sub-domen smoke (CLI-99)"
```

---

## Wave 1 — Parallel create-only (4 agent)

Har agent **mustaqil** (subagent-driven-development bilan dispatch qilinadi). Har biri FAQAT o'z papkasidagi 6 faylni yaratadi. **Umumiy fayllarga (`clinical.routes.ts`, `clinical/index.ts`, `clinical.service.ts`, `clinical.schema.ts`, `app.ts`) TEGMAYDI.** Agentlar oxirida **commit qilmaydi** — Wave 2 integratsiyadan keyin bitta commit.

> Har 4 task'ni dispatch qilishdan oldin agent prompt'iga quyidagi **umumiy qoidalar** qo'shiladi:
> - Faqat o'z `clinical/<sub-domain>/` papkangizdagi fayllarni yarating. Boshqa hech narsani tahrirlamang yoki o'chirmang.
> - Eski `apps/api/src/modules/clinical/clinical.service.ts` va `clinical.schema.ts` ni FAQAT o'qing (mantiqning manbasi). Ularni o'zgartirmang.
> - Drizzle import'lar: `@dental/db-schema`. `getDb(c)`: `../../db/scoped.ts` (sub-papkadan `../../../db/scoped.ts`). `Database` tipi: `../../../db/client.ts`. `AuditLogger`: `../../../lib/audit-logger.ts`.
> - Zod 4 sintaksis (`z.uuid()`, `z.iso.datetime()`) — mavjud `clinical.schema.ts` dan ko'chiring.
> - Javob shaklini O'ZGARTIRMANG (api-client qo'lda). Mapping faqat hozirgi shaklni qayta hosil qiladi.

### Task 1 (Agent A): treatment-plans sub-domen

**Files (create):**
- `apps/api/src/modules/clinical/treatment-plans/treatment-plans.schema.ts`
- `apps/api/src/modules/clinical/treatment-plans/treatment-plans.repository.ts`
- `apps/api/src/modules/clinical/treatment-plans/treatment-plans.mapper.ts`
- `apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts`
- `apps/api/src/modules/clinical/treatment-plans/treatment-plans.routes.ts`
- `apps/api/src/modules/clinical/treatment-plans/index.ts`

**Manba:** `clinical.service.ts:45-169` (listPlans, getPlan, createPlan, updatePlan, updateStage) + `clinical.schema.ts:3-38`. Route'lar: `clinical.routes.ts:46-79`.

⚠️ **RLS:** `createPlan` ichidagi `db.transaction()` + `tx.execute(sql\`SELECT set_config('app.current_tenant_id', ${tenantId}, true)\`)` repository'ga **verbatim** ko'chiriladi. Qolgan operatsiyalar `getDb(c)`.

- [ ] **Step 1: `treatment-plans.schema.ts`** — `clinical.schema.ts:3-38` dagi `createTreatmentPlanSchema`, `updateTreatmentPlanSchema`, `updateStageSchema` + tiplarini verbatim ko'chir.

```ts
import { z } from 'zod';

export const createTreatmentPlanSchema = z.object({
  patientId: z.uuid(),
  doctorId: z.uuid(),
  title: z.string().min(2).max(200),
  notes: z.string().max(2000).optional(),
  stages: z
    .array(
      z.object({
        serviceId: z.uuid().optional(),
        serviceName: z.string().min(1).max(200),
        toothNumbers: z.array(z.coerce.number().int()).optional(),
        estimatedVisits: z.coerce.number().int().positive().default(1),
        estimatedDurationMinutes: z.coerce.number().int().positive().optional(),
        cost: z.coerce.number().nonnegative(),
        notes: z.string().max(500).optional(),
      }),
    )
    .default([]),
});
export type CreateTreatmentPlanInput = z.infer<typeof createTreatmentPlanSchema>;

export const updateTreatmentPlanSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  notes: z.string().max(2000).optional(),
  status: z
    .enum(['draft', 'presented', 'accepted', 'in_progress', 'completed', 'cancelled'])
    .optional(),
});
export type UpdateTreatmentPlanInput = z.infer<typeof updateTreatmentPlanSchema>;

export const updateStageSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'skipped']).optional(),
  notes: z.string().max(500).optional(),
});
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
```

- [ ] **Step 2: `treatment-plans.repository.ts`** — sof ma'lumotga kirish (Drizzle, biznes mantiqsiz, auditsiz).

```ts
import { treatmentPlans, treatmentStages } from '@dental/db-schema';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../../db/scoped.ts';

export const createTreatmentPlansRepository = () => {
  async function listPlans(c: Context, patientId?: string) {
    const db = getDb(c);
    const filters = [];
    if (patientId) filters.push(eq(treatmentPlans.patientId, patientId));
    return db
      .select()
      .from(treatmentPlans)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(treatmentPlans.createdAt));
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

  /** RLS-tx: set_config verbatim ko'chirilgan (createPlan dan). */
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

  return { listPlans, getPlanWithStages, insertPlanWithStages, findPlan, updatePlan, updateStage };
};
```

- [ ] **Step 3: `treatment-plans.mapper.ts`** — trivial CRUD: javob = DB row (hozirgi shakl). Identity passthrough; faqat tip aniqligi uchun.

```ts
import type { treatmentPlans, treatmentStages } from '@dental/db-schema';

type PlanRow = typeof treatmentPlans.$inferSelect;
type StageRow = typeof treatmentStages.$inferSelect;

/** Hozirgi javob shakli: plan + stages. Mapping qo'shilmaydi (api-client invariant). */
export const toPlanDto = (plan: PlanRow & { stages: StageRow[] }) => plan;
export const toStageDto = (stage: StageRow) => stage;
```

- [ ] **Step 4: `treatment-plans.service.ts`** — biznes mantiq + audit orkestratsiya (repository + mapper).

```ts
import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { createTreatmentPlansRepository } from './treatment-plans.repository.ts';
import type {
  CreateTreatmentPlanInput,
  UpdateStageInput,
  UpdateTreatmentPlanInput,
} from './treatment-plans.schema.ts';

export const createTreatmentPlansService = (deps: { audit: AuditLogger }) => {
  const repo = createTreatmentPlansRepository();

  const listPlans = (c: Context, patientId?: string) => repo.listPlans(c, patientId);
  const getPlan = (c: Context, id: string) => repo.getPlanWithStages(c, id);

  async function createPlan(c: Context, input: CreateTreatmentPlanInput) {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const totalCost = input.stages.reduce((sum, s) => sum + s.cost, 0);
    const totalVisits = input.stages.reduce((sum, s) => sum + s.estimatedVisits, 0);

    const plan = await repo.insertPlanWithStages(
      c,
      tenantId,
      {
        tenantId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        title: input.title,
        totalCost: String(totalCost),
        totalVisits,
        notes: input.notes ?? null,
      },
      (planId) =>
        input.stages.map((s, i) => ({
          treatmentPlanId: planId,
          sequence: i + 1,
          serviceId: s.serviceId ?? null,
          serviceName: s.serviceName,
          toothNumbers: s.toothNumbers ?? null,
          estimatedVisits: s.estimatedVisits,
          estimatedDurationMinutes: s.estimatedDurationMinutes ?? null,
          cost: String(s.cost),
          notes: s.notes ?? null,
        })),
    );

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'treatment_plan',
      resourceId: plan.id,
      after: { totalCost, totalVisits, stages: input.stages.length },
    });
    return plan;
  }

  async function updatePlan(c: Context, id: string, input: UpdateTreatmentPlanInput) {
    const before = await repo.findPlan(c, id);
    if (!before) return null;
    const updated = await repo.updatePlan(c, id, input);
    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'treatment_plan',
        resourceId: id,
        before,
        after: updated,
      });
    }
    return updated;
  }

  async function updateStage(c: Context, stageId: string, input: UpdateStageInput) {
    const patch: Record<string, unknown> = {};
    if (input.status) {
      patch.status = input.status;
      if (input.status === 'completed') patch.completedAt = new Date();
    }
    if (input.notes !== undefined) patch.notes = input.notes;
    const updated = await repo.updateStage(c, stageId, patch);
    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'treatment_stage',
        resourceId: stageId,
        after: { status: input.status },
      });
    }
    return updated;
  }

  return { listPlans, getPlan, createPlan, updatePlan, updateStage };
};

export type TreatmentPlansService = ReturnType<typeof createTreatmentPlansService>;
```

- [ ] **Step 5: `treatment-plans.routes.ts`** — sub-router. Mount-prefiks YO'Q (aggregator beradi). Middleware (auth/rls) aggregatorda — bu yerda faqat route'lar. Path'lar: `/treatment-plans`, `/treatment-plans/:id`, `/treatment-stages/:id`.

```ts
import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { requirePermission } from '../../../middleware/require-permission.ts';
import {
  createTreatmentPlanSchema,
  updateStageSchema,
  updateTreatmentPlanSchema,
} from './treatment-plans.schema.ts';
import { createTreatmentPlansService } from './treatment-plans.service.ts';

export const treatmentPlansRoutes = (deps: { audit: AuditLogger }) => {
  const app = new Hono();
  const service = createTreatmentPlansService(deps);

  app.get('/treatment-plans', requirePermission('medical_record.view'), async (c) => {
    const patientId = c.req.query('patientId') ?? undefined;
    return c.json(ok(await service.listPlans(c, patientId)));
  });

  app.post('/treatment-plans', requirePermission('medical_record.edit'), async (c) => {
    const body = createTreatmentPlanSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const plan = await service.createPlan(c, body.data);
    return c.json(ok(plan), 201);
  });

  app.get('/treatment-plans/:id', requirePermission('medical_record.view'), async (c) => {
    const plan = await service.getPlan(c, c.req.param('id'));
    if (!plan) return c.json(fail('plan.not_found', 'Plan not found'), 404);
    return c.json(ok(plan));
  });

  app.patch('/treatment-plans/:id', requirePermission('medical_record.edit'), async (c) => {
    const body = updateTreatmentPlanSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const plan = await service.updatePlan(c, c.req.param('id'), body.data);
    if (!plan) return c.json(fail('plan.not_found', 'Plan not found'), 404);
    return c.json(ok(plan));
  });

  app.patch('/treatment-stages/:id', requirePermission('medical_record.edit'), async (c) => {
    const body = updateStageSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const stage = await service.updateStage(c, c.req.param('id'), body.data);
    if (!stage) return c.json(fail('stage.not_found', 'Stage not found'), 404);
    return c.json(ok(stage));
  });

  return app;
};
```

- [ ] **Step 6: `index.ts`**

```ts
export { treatmentPlansRoutes } from './treatment-plans.routes.ts';
export * from './treatment-plans.schema.ts';
```

- [ ] **Step 7: Typecheck (faqat shu sub-domen import xatolari)**

Run: `cd apps/api && bunx tsc --noEmit 2>&1 | grep treatment-plans || echo "no treatment-plans errors"`
Expected: `no treatment-plans errors` (aggregator hali ulanmagani uchun boshqa joyda xato bo'lishi normal — faqat shu papka toza bo'lsin).

> Agent commit QILMAYDI. Wave 2 da yagona commit.

### Task 2 (Agent B): visit-notes sub-domen

**Files (create):** `clinical/visit-notes/visit-notes.{schema,repository,mapper,service,routes}.ts` + `index.ts`

**Manba:** `clinical.service.ts:171-257` (listVisitNotes, getVisitNote, createVisitNote, updateVisitNote) + `clinical.schema.ts:40-56`. Route'lar: `clinical.routes.ts:81-106`.

⚠️ **`deductStock` DI:** `createVisitNote` ichida `deps.deductStock?.(c, input.performedServices ?? [], note.id)` chaqiriladi (ombor BOM chiqimi, RLS tx-bound). Bu DI dep **service**'da saqlanadi (repository'da emas — yon ta'sir). Service factory `deductStock?` ni qabul qiladi.

- [ ] **Step 1: `visit-notes.schema.ts`** — `clinical.schema.ts:40-56` verbatim.

```ts
import { z } from 'zod';

export const createVisitNoteSchema = z.object({
  patientId: z.uuid(),
  doctorId: z.uuid(),
  appointmentId: z.uuid().optional(),
  visitDate: z.iso.datetime().optional(),
  subjective: z.string().max(5000).optional(),
  objective: z.string().max(5000).optional(),
  assessmentDiagnoses: z.array(z.uuid()).default([]),
  plan: z.string().max(5000).optional(),
  performedServices: z.array(z.uuid()).default([]),
  freeNotes: z.string().max(5000).optional(),
});
export type CreateVisitNoteInput = z.infer<typeof createVisitNoteSchema>;

export const updateVisitNoteSchema = createVisitNoteSchema.partial().omit({ patientId: true });
export type UpdateVisitNoteInput = z.infer<typeof updateVisitNoteSchema>;
```

- [ ] **Step 2: `visit-notes.repository.ts`**

```ts
import { visitNotes } from '@dental/db-schema';
import { and, desc, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../../db/scoped.ts';

export const createVisitNotesRepository = () => {
  async function list(c: Context, patientId?: string) {
    const db = getDb(c);
    const filters = [];
    if (patientId) filters.push(eq(visitNotes.patientId, patientId));
    return db
      .select()
      .from(visitNotes)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(visitNotes.visitDate));
  }

  async function find(c: Context, id: string) {
    const db = getDb(c);
    const [note] = await db.select().from(visitNotes).where(eq(visitNotes.id, id));
    return note ?? null;
  }

  async function insert(c: Context, values: typeof visitNotes.$inferInsert) {
    const db = getDb(c);
    const [note] = await db.insert(visitNotes).values(values).returning();
    return note ?? null;
  }

  async function update(c: Context, id: string, patch: Partial<typeof visitNotes.$inferInsert>) {
    const db = getDb(c);
    const [updated] = await db
      .update(visitNotes)
      .set(patch)
      .where(eq(visitNotes.id, id))
      .returning();
    return updated ?? null;
  }

  return { list, find, insert, update };
};
```

- [ ] **Step 3: `visit-notes.mapper.ts`**

```ts
import type { visitNotes } from '@dental/db-schema';

type VisitNoteRow = typeof visitNotes.$inferSelect;

/** Javob = DB row (api-client invariant). */
export const toVisitNoteDto = (note: VisitNoteRow) => note;
```

- [ ] **Step 4: `visit-notes.service.ts`** — `deductStock?` DI saqlanadi.

```ts
import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { createVisitNotesRepository } from './visit-notes.repository.ts';
import type { CreateVisitNoteInput, UpdateVisitNoteInput } from './visit-notes.schema.ts';

export const createVisitNotesService = (deps: {
  audit: AuditLogger;
  deductStock?: (c: Context, serviceIds: string[], visitNoteId: string) => Promise<void>;
}) => {
  const repo = createVisitNotesRepository();

  const list = (c: Context, patientId?: string) => repo.list(c, patientId);
  const get = (c: Context, id: string) => repo.find(c, id);

  async function create(c: Context, input: CreateVisitNoteInput) {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const note = await repo.insert(c, {
      tenantId,
      patientId: input.patientId,
      doctorId: input.doctorId,
      appointmentId: input.appointmentId ?? null,
      visitDate: input.visitDate ? new Date(input.visitDate) : new Date(),
      subjective: input.subjective ?? null,
      objective: input.objective ?? null,
      assessmentDiagnoses: input.assessmentDiagnoses,
      plan: input.plan ?? null,
      performedServices: input.performedServices,
      freeNotes: input.freeNotes ?? null,
    });

    if (note) {
      // BOM bo'yicha ombor chiqimi (DI) — shu request-tx ichida (RLS tx-bound).
      await deps.deductStock?.(c, input.performedServices ?? [], note.id);
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'visit_note',
        resourceId: note.id,
        after: { patientId: input.patientId, hasSubjective: !!input.subjective },
      });
    }
    return note;
  }

  async function update(c: Context, id: string, input: UpdateVisitNoteInput) {
    const before = await repo.find(c, id);
    if (!before) return null;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.doctorId) patch.doctorId = input.doctorId;
    if (input.appointmentId !== undefined) patch.appointmentId = input.appointmentId;
    if (input.visitDate) patch.visitDate = new Date(input.visitDate);
    if (input.subjective !== undefined) patch.subjective = input.subjective;
    if (input.objective !== undefined) patch.objective = input.objective;
    if (input.assessmentDiagnoses) patch.assessmentDiagnoses = input.assessmentDiagnoses;
    if (input.plan !== undefined) patch.plan = input.plan;
    if (input.performedServices) patch.performedServices = input.performedServices;
    if (input.freeNotes !== undefined) patch.freeNotes = input.freeNotes;

    const updated = await repo.update(c, id, patch);
    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'visit_note',
        resourceId: id,
        before,
        after: updated,
      });
    }
    return updated;
  }

  return { list, get, create, update };
};

export type VisitNotesService = ReturnType<typeof createVisitNotesService>;
```

- [ ] **Step 5: `visit-notes.routes.ts`** — service `deductStock` ni qabul qiladi (aggregator DI orqali uzatadi). Path'lar: `/visit-notes`, `/visit-notes/:id`.

```ts
import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { requirePermission } from '../../../middleware/require-permission.ts';
import { createVisitNotesService } from './visit-notes.service.ts';
import { createVisitNoteSchema, updateVisitNoteSchema } from './visit-notes.schema.ts';

export const visitNotesRoutes = (deps: {
  audit: AuditLogger;
  deductStock?: (c: Context, serviceIds: string[], visitNoteId: string) => Promise<void>;
}) => {
  const app = new Hono();
  const service = createVisitNotesService(deps);

  app.get('/visit-notes', requirePermission('medical_record.view'), async (c) => {
    const patientId = c.req.query('patientId') ?? undefined;
    return c.json(ok(await service.list(c, patientId)));
  });

  app.post('/visit-notes', requirePermission('medical_record.edit'), async (c) => {
    const body = createVisitNoteSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const note = await service.create(c, body.data);
    return c.json(ok(note), 201);
  });

  app.get('/visit-notes/:id', requirePermission('medical_record.view'), async (c) => {
    const note = await service.get(c, c.req.param('id'));
    if (!note) return c.json(fail('note.not_found', 'Note not found'), 404);
    return c.json(ok(note));
  });

  app.patch('/visit-notes/:id', requirePermission('medical_record.edit'), async (c) => {
    const body = updateVisitNoteSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const note = await service.update(c, c.req.param('id'), body.data);
    if (!note) return c.json(fail('note.not_found', 'Note not found'), 404);
    return c.json(ok(note));
  });

  return app;
};
```

- [ ] **Step 6: `index.ts`**

```ts
export { visitNotesRoutes } from './visit-notes.routes.ts';
export * from './visit-notes.schema.ts';
```

- [ ] **Step 7: Typecheck** — `cd apps/api && bunx tsc --noEmit 2>&1 | grep visit-notes || echo "no visit-notes errors"`. Agent commit qilmaydi.

### Task 3 (Agent C): tooth-charts sub-domen

**Files (create):** `clinical/tooth-charts/tooth-charts.{schema,repository,mapper,service,routes}.ts` + `index.ts`

**Manba:** `clinical.service.ts:259-337` (listToothCharts, getLatestToothChart, createToothChart) + `clinical.schema.ts:58-90`. Route'lar: `clinical.routes.ts:108-132`.

⚠️ **RLS:** `createToothChart` ichidagi `db.transaction()` + `set_config` verbatim. `c.get('user')` (createdBy) saqlanadi.

- [ ] **Step 1: `tooth-charts.schema.ts`** — `clinical.schema.ts:58-90` verbatim (TOOTH_SURFACE/TOOTH_STATE enum'lari bilan).

```ts
import { z } from 'zod';

const TOOTH_SURFACE = z.enum(['whole', 'M', 'D', 'B', 'L', 'O', 'I']);
const TOOTH_STATE = z.enum([
  'healthy',
  'caries',
  'filling',
  'crown',
  'implant',
  'missing',
  'root_canal',
  'to_extract',
  'temporary',
  'veneer',
]);

export const createToothChartSchema = z.object({
  patientId: z.uuid(),
  visitNoteId: z.uuid().optional(),
  isPrimaryDentition: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
  states: z
    .array(
      z.object({
        toothNumber: z.coerce.number().int().min(11).max(85),
        surface: TOOTH_SURFACE.default('whole'),
        state: TOOTH_STATE,
        diagnosisId: z.uuid().optional(),
        notes: z.string().max(500).optional(),
      }),
    )
    .default([]),
});
export type CreateToothChartInput = z.infer<typeof createToothChartSchema>;
```

- [ ] **Step 2: `tooth-charts.repository.ts`**

```ts
import { toothCharts, toothStates } from '@dental/db-schema';
import { desc, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../../db/scoped.ts';

export const createToothChartsRepository = () => {
  async function list(c: Context, patientId: string) {
    const db = getDb(c);
    return db
      .select()
      .from(toothCharts)
      .where(eq(toothCharts.patientId, patientId))
      .orderBy(desc(toothCharts.createdAt));
  }

  async function getLatestWithStates(c: Context, patientId: string) {
    const db = getDb(c);
    const [chart] = await db
      .select()
      .from(toothCharts)
      .where(eq(toothCharts.patientId, patientId))
      .orderBy(desc(toothCharts.createdAt))
      .limit(1);
    if (!chart) return null;
    const states = await db
      .select()
      .from(toothStates)
      .where(eq(toothStates.toothChartId, chart.id));
    return { ...chart, states };
  }

  /** RLS-tx: set_config verbatim (createToothChart dan). */
  async function insertChartWithStates(
    c: Context,
    tenantId: string,
    chartValues: typeof toothCharts.$inferInsert,
    stateValues: (chartId: string) => (typeof toothStates.$inferInsert)[],
  ) {
    const db = getDb(c);
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
      const [chart] = await tx.insert(toothCharts).values(chartValues).returning();
      if (!chart) throw new Error('Chart insert failed');
      const states = stateValues(chart.id);
      if (states.length > 0) await tx.insert(toothStates).values(states);
      const fullStates = await tx
        .select()
        .from(toothStates)
        .where(eq(toothStates.toothChartId, chart.id));
      return { ...chart, states: fullStates };
    });
  }

  return { list, getLatestWithStates, insertChartWithStates };
};
```

- [ ] **Step 3: `tooth-charts.mapper.ts`**

```ts
import type { toothCharts, toothStates } from '@dental/db-schema';

type ChartRow = typeof toothCharts.$inferSelect;
type StateRow = typeof toothStates.$inferSelect;

/** Javob = chart + states (api-client invariant). */
export const toToothChartDto = (chart: ChartRow & { states: StateRow[] }) => chart;
```

- [ ] **Step 4: `tooth-charts.service.ts`**

```ts
import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { createToothChartsRepository } from './tooth-charts.repository.ts';
import type { CreateToothChartInput } from './tooth-charts.schema.ts';

export const createToothChartsService = (deps: { audit: AuditLogger }) => {
  const repo = createToothChartsRepository();

  const list = (c: Context, patientId: string) => repo.list(c, patientId);
  const getLatest = (c: Context, patientId: string) => repo.getLatestWithStates(c, patientId);

  async function create(c: Context, input: CreateToothChartInput) {
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    const chart = await repo.insertChartWithStates(
      c,
      tenantId,
      {
        tenantId,
        patientId: input.patientId,
        visitNoteId: input.visitNoteId ?? null,
        isPrimaryDentition: input.isPrimaryDentition,
        notes: input.notes ?? null,
        createdBy: user?.id ?? null,
      },
      (chartId) =>
        input.states.map((s) => ({
          toothChartId: chartId,
          toothNumber: s.toothNumber,
          surface: s.surface,
          state: s.state,
          diagnosisId: s.diagnosisId ?? null,
          notes: s.notes ?? null,
        })),
    );

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'tooth_chart',
      resourceId: chart.id,
      after: { patientId: input.patientId, stateCount: input.states.length },
    });
    return chart;
  }

  return { list, getLatest, create };
};

export type ToothChartsService = ReturnType<typeof createToothChartsService>;
```

- [ ] **Step 5: `tooth-charts.routes.ts`** — Path'lar: `/patients/:patientId/tooth-charts`, `/patients/:patientId/tooth-charts/latest`, `/tooth-charts`.

```ts
import { ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { requirePermission } from '../../../middleware/require-permission.ts';
import { createToothChartsService } from './tooth-charts.service.ts';
import { createToothChartSchema } from './tooth-charts.schema.ts';

export const toothChartsRoutes = (deps: { audit: AuditLogger }) => {
  const app = new Hono();
  const service = createToothChartsService(deps);

  app.get(
    '/patients/:patientId/tooth-charts',
    requirePermission('medical_record.view'),
    async (c) => {
      return c.json(ok(await service.list(c, c.req.param('patientId'))));
    },
  );

  app.get(
    '/patients/:patientId/tooth-charts/latest',
    requirePermission('medical_record.view'),
    async (c) => {
      const chart = await service.getLatest(c, c.req.param('patientId'));
      if (!chart) return c.json(ok(null));
      return c.json(ok(chart));
    },
  );

  app.post('/tooth-charts', requirePermission('medical_record.edit'), async (c) => {
    const body = createToothChartSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const chart = await service.create(c, body.data);
    return c.json(ok(chart), 201);
  });

  return app;
};
```

- [ ] **Step 6: `index.ts`**

```ts
export { toothChartsRoutes } from './tooth-charts.routes.ts';
export * from './tooth-charts.schema.ts';
```

- [ ] **Step 7: Typecheck** — `cd apps/api && bunx tsc --noEmit 2>&1 | grep tooth-charts || echo "no tooth-charts errors"`. Agent commit qilmaydi.

### Task 4 (Agent D): diagnoses sub-domen

**Files (create):** `clinical/diagnoses/diagnoses.{schema,repository,mapper,service,routes}.ts` + `index.ts`

**Manba:** `clinical.service.ts:29-43` (listDiagnoses) + route `clinical.routes.ts:40-44`.

⚠️ **PLATFORM-LEVEL (RLS YO'Q):** diagnoses — platform katalogi. Repository `deps.db` ni **to'g'ridan-to'g'ri** ishlatadi, `getDb(c)` EMAS, `Context` EMAS, tenant-scoped EMAS. Service/repository `db: Database` ni qabul qiladi (aggregator uzatadi). Buni RLS-bound qilish katalogni buzadi.

- [ ] **Step 1: `diagnoses.schema.ts`** — query-only modul (body schema yo'q). Search query tipini eksport.

```ts
import { z } from 'zod';

export const listDiagnosesQuerySchema = z.object({
  search: z.string().optional(),
});
export type ListDiagnosesQuery = z.infer<typeof listDiagnosesQuerySchema>;
```

- [ ] **Step 2: `diagnoses.repository.ts`** — `deps.db` to'g'ridan-to'g'ri (platform-level, RLS yo'q).

```ts
import { diagnoses } from '@dental/db-schema';
import { asc, sql } from 'drizzle-orm';
import type { Database } from '../../../db/client.ts';

export const createDiagnosesRepository = (deps: { db: Database }) => {
  async function list(search?: string) {
    if (search) {
      const term = `%${search.toLowerCase()}%`;
      return deps.db
        .select()
        .from(diagnoses)
        .where(
          sql`lower(${diagnoses.code}) like ${term} OR lower(${diagnoses.nameUz}) like ${term} OR lower(${diagnoses.nameRu}) like ${term}`,
        )
        .orderBy(asc(diagnoses.code))
        .limit(100);
    }
    return deps.db.select().from(diagnoses).orderBy(asc(diagnoses.code));
  }

  return { list };
};
```

- [ ] **Step 3: `diagnoses.mapper.ts`**

```ts
import type { diagnoses } from '@dental/db-schema';

type DiagnosisRow = typeof diagnoses.$inferSelect;

/** Javob = DB row (api-client invariant). */
export const toDiagnosisDto = (d: DiagnosisRow) => d;
```

- [ ] **Step 4: `diagnoses.service.ts`** — `db` DI (platform-level, audit/RLS yo'q).

```ts
import type { Database } from '../../../db/client.ts';
import { createDiagnosesRepository } from './diagnoses.repository.ts';

export const createDiagnosesService = (deps: { db: Database }) => {
  const repo = createDiagnosesRepository(deps);
  const list = (search?: string) => repo.list(search);
  return { list };
};

export type DiagnosesService = ReturnType<typeof createDiagnosesService>;
```

- [ ] **Step 5: `diagnoses.routes.ts`** — `db` DI. Path: `/diagnoses`. (Read-only, RLS middleware bo'lsa-da, service `deps.db` ishlatadi — platform katalog.)

```ts
import { ok } from '@dental/core';
import { Hono } from 'hono';
import type { Database } from '../../../db/client.ts';
import { requirePermission } from '../../../middleware/require-permission.ts';
import { createDiagnosesService } from './diagnoses.service.ts';

export const diagnosesRoutes = (deps: { db: Database }) => {
  const app = new Hono();
  const service = createDiagnosesService(deps);

  app.get('/diagnoses', requirePermission('medical_record.view'), async (c) => {
    const search = c.req.query('search') ?? undefined;
    return c.json(ok(await service.list(search)));
  });

  return app;
};
```

- [ ] **Step 6: `index.ts`**

```ts
export { diagnosesRoutes } from './diagnoses.routes.ts';
export * from './diagnoses.schema.ts';
```

- [ ] **Step 7: Typecheck** — `cd apps/api && bunx tsc --noEmit 2>&1 | grep diagnoses || echo "no diagnoses errors"`. Agent commit qilmaydi.

---

## Wave 2 — Integratsiya (bitta writer, Wave 1 dan keyin)

### Task 5: Aggregator ulash + eski monolit o'chirish

**Files:**
- Modify: `apps/api/src/modules/clinical/clinical.routes.ts` (to'liq qayta yoziladi — aggregator)
- Modify: `apps/api/src/modules/clinical/index.ts`
- Delete: `apps/api/src/modules/clinical/clinical.service.ts`
- Delete: `apps/api/src/modules/clinical/clinical.schema.ts`

- [ ] **Step 1: `clinical.routes.ts` ni aggregator sifatida qayta yozish**

Aggregator: auth+rls middleware (avvalgidek), stock DI (avvalgidek) — visit-notes'ga `deductStock` uzatadi; diagnoses'ga `deps.db` uzatadi. 4 sub-router'ni mount qiladi (prefiks yo'q — sub-router'lar to'liq path'ni o'zi beradi).

```ts
import { Hono } from 'hono';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { createStockService } from '../stock/stock.service.ts';
import { diagnosesRoutes } from './diagnoses/index.ts';
import { toothChartsRoutes } from './tooth-charts/index.ts';
import { treatmentPlansRoutes } from './treatment-plans/index.ts';
import { visitNotesRoutes } from './visit-notes/index.ts';

/**
 * Clinical aggregator — 4 sub-domenni bitta modul ostida birlashtiradi:
 *   /api/diagnoses (read-only, platform katalog)
 *   /api/treatment-plans (CRUD + stages)
 *   /api/visit-notes (CRUD, BOM ombor chiqimi)
 *   /api/tooth-charts (snapshot create + read)
 */
export const clinicalRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  // Ombor chiqim hook'i DI — vizit yaratilganda BOM material yechiladi (cycle yo'q).
  const stockService = createStockService({ audit: deps.audit });

  app.route('/', diagnosesRoutes({ db: deps.db }));
  app.route('/', treatmentPlansRoutes({ audit: deps.audit }));
  app.route('/', visitNotesRoutes({ audit: deps.audit, deductStock: stockService.deductForServices }));
  app.route('/', toothChartsRoutes({ audit: deps.audit }));

  return app;
};
```

> ⚠️ **Path tekshiruvi:** sub-router'lar `app.route('/', ...)` bilan mount qilingani uchun ularning ichidagi to'liq path'lar (`/diagnoses`, `/treatment-plans`, ...) o'zgarmaydi. Hono'da `app.route('/', sub)` sub'ning path'larini prefikssiz ulaydi.

- [ ] **Step 2: `clinical/index.ts` ni yangilash**

```ts
export { clinicalRoutes } from './clinical.routes.ts';
export * from './diagnoses/index.ts';
export * from './treatment-plans/index.ts';
export * from './visit-notes/index.ts';
export * from './tooth-charts/index.ts';
```

- [ ] **Step 3: Eski monolit fayllarni o'chirish**

```bash
cd apps/api && rm src/modules/clinical/clinical.service.ts src/modules/clinical/clinical.schema.ts
```

- [ ] **Step 4: Smoke test importini yangilash**

`tests/integration/clinical.test.ts` Wave 0 da `createClinicalService` ni eski monolitdan import qiladi — endi u o'chirildi. Testni **4 sub-domen service'iga** moslab yangilang. `createClinicalService` import qatorini o'chirib, sub-service'larni import qiling va `service.*` chaqiruvlarni mos sub-service'ga yo'naltiring:

```ts
import { createDiagnosesService } from '../../src/modules/clinical/diagnoses/diagnoses.service.ts';
import { createToothChartsService } from '../../src/modules/clinical/tooth-charts/tooth-charts.service.ts';
import { createTreatmentPlansService } from '../../src/modules/clinical/treatment-plans/treatment-plans.service.ts';
import { createVisitNotesService } from '../../src/modules/clinical/visit-notes/visit-notes.service.ts';

const diagnosesSvc = createDiagnosesService({ db });
const plansSvc = createTreatmentPlansService({ audit: noopAudit });
const notesSvc = createVisitNotesService({ audit: noopAudit });
const chartsSvc = createToothChartsService({ audit: noopAudit });
```

Test chaqiruvlarini moslang: `service.listDiagnoses()` → `diagnosesSvc.list()`; `service.createPlan` → `plansSvc.createPlan`; `service.listPlans` → `plansSvc.listPlans`; `service.createVisitNote` → `notesSvc.create`; `service.createToothChart` → `chartsSvc.create`; `service.getLatestToothChart` → `chartsSvc.getLatest`. Assertion'lar va kutilgan natijalar O'ZGARMAYDI (before/after invariant).

- [ ] **Step 5: Typecheck — toza bo'lishi shart**

Run: `cd apps/api && bunx tsc --noEmit`
Expected: 0 xato. (Agar `app.ts` clinical importida xato bo'lsa — `app.ts:14` `clinicalRoutes` ni `./modules/clinical/index.ts` dan import qiladi, bu o'zgarmadi, demak xato bo'lmasligi kerak.)

- [ ] **Step 6: Smoke test — yashil bo'lishi shart (before/after invariant)**

Run: `cd apps/api && bun test --env-file=../../.env clinical`
Expected: PASS — Wave 0 dagi xuddi shu 5 test, endi sub-domen service'lar ustida. Natijalar bir xil.

- [ ] **Step 7: Boshqa regresiya yo'qligini tekshirish**

Run: `cd apps/api && bun test --env-file=../../.env`
Expected: barcha integration testlar yashil (clinical refactor boshqa modullarga ta'sir qilmagan).

- [ ] **Step 8: Commit (Wave 1 + Wave 2 birga)**

```bash
cd /home/madrimov/Projects/dental-service
git add apps/api/src/modules/clinical apps/api/tests/integration/clinical.test.ts
git commit -m "refactor(clinical): monolit → 4 sub-domen 6-fayl arxitektura (CLI-99)

clinical.service.ts (356q, 4 concern) → treatment-plans/visit-notes/
tooth-charts/diagnoses sub-papkalar, har biri RFC-0009 6-fayl. API path'lar
va javob shakli o'zgarmadi (smoke test invariant). diagnoses platform-level
(deps.db), createPlan/createToothChart RLS tx+set_config verbatim ko'chirildi.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Wave 3 — Yakuniy (M2 yopilishi)

### Task 6: Linear status + M2 yopilishi

- [ ] **Step 1: CLI-99 → Done** (Linear MCP yoki UI orqali).
- [ ] **Step 2: CLI-94 → Done** (kod tugagan, PR #16 merged).
- [ ] **Step 3: CLI-93 epic holatini tekshirish** — barcha sub-issue Done bo'lsa epic'ni yopish.
- [ ] **Step 4: M2 milestone progress'ini tasdiqlash** (100% ga yaqin bo'lishi kerak).

> **defaultLanguage** — DEFERRED (design §8). Bu task'da QILINMAYDI. Kerak bo'lsa keyingi milestone'da alohida issue.

---

## Self-review (reja muallifi)

- **Spec coverage:** §2 CLI-99 → Wave 1+2 ✓; §3 sub-papka layout → fayl strukturasi ✓; §4 create-only → Wave 1 qoidalari ✓; §5 safety net → Wave 0 ✓; §6 RLS constraint'lar → Task 1/3 (tx+set_config), Task 4 (diagnoses platform-level) ✓; §7 integratsiya gate → Task 5 Step 5-7 ✓; §8 defaultLanguage deferred + CLI-94 close → Wave 3 ✓.
- **Placeholder scan:** Har step to'liq kod yoki aniq komanda. "Moslang" ko'rsatmalari (Task 0 Step 2, Task 5 Step 4) aniq nima qilishni ko'rsatadi.
- **Type consistency:** Service metod nomlari sub-domenlar bo'yicha izchil (plans: listPlans/getPlan/createPlan/updatePlan/updateStage; notes: list/get/create/update; charts: list/getLatest/create; diagnoses: list). Aggregator DI: plans/charts `{ audit }`, notes `{ audit, deductStock }`, diagnoses `{ db }`. Smoke test (Task 5 Step 4) shu nomlarga moslangan.
