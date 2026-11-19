/**
 * FX-27 (LA-35, CF-11) — bosqich yaratilganda `resultingToothState` (REAL DB).
 *
 * Avval: createTreatmentPlanSchema stage'ida `resultingToothState` yo'q edi (faqat PATCH),
 * web hech qachon yubormasdi — CLI-488 odontogramma sinxroni foydalanuvchi uchun 'uxlab yotardi'.
 * Endi: create'da saqlanadi; bosqich completed bo'lganda tish snapshot'i yangi holatga o'tadi.
 *
 *   cd apps/api && bun test tests/integration/fx-27-stage-resulting-tooth-state.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  patients,
  tenants,
  toothCharts,
  toothStates,
  treatmentPlans,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { desc, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createToothChartsService } from '../../src/modules/clinical/tooth-charts/tooth-charts.service.ts';
import { createTreatmentPlanSchema } from '../../src/modules/clinical/treatment-plans/treatment-plans.schema.ts';
import { createTreatmentPlansService } from '../../src/modules/clinical/treatment-plans/treatment-plans.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const toothService = createToothChartsService({ audit: noopAudit });
const plansService = createTreatmentPlansService({
  audit: noopAudit,
  toothChart: { recordStageCompletion: toothService.recordStageCompletion },
});

let tenantId: string;
let ownerId: string;
let patientId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: ownerId }
            : undefined,
  }) as unknown as Context;

const inTenant = <T>(fn: (tx: DbOrTx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const latestStates = () =>
  inTenant(async (tx) => {
    const [chart] = await tx
      .select({ id: toothCharts.id })
      .from(toothCharts)
      .where(eq(toothCharts.patientId, patientId))
      .orderBy(desc(toothCharts.createdAt))
      .limit(1);
    if (!chart) return [];
    return tx
      .select({
        toothNumber: toothStates.toothNumber,
        surface: toothStates.surface,
        state: toothStates.state,
      })
      .from(toothStates)
      .where(eq(toothStates.toothChartId, chart.id));
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000027', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX27 Clinic', slug: 'fx27-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;
  await inTenant(async (tx) => {
    await tx.insert(branches).values({ tenantId, name: 'Branch 1' });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'FX27 Bemor' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;
    // Oldingi snapshot: 16-tish 'caries'.
    const [chart] = await tx
      .insert(toothCharts)
      .values({ tenantId, patientId, isPrimaryDentition: false })
      .returning({ id: toothCharts.id });
    if (!chart) throw new Error('chart insert failed');
    await tx
      .insert(toothStates)
      .values([{ toothChartId: chart.id, toothNumber: 16, surface: 'whole', state: 'caries' }]);
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-27 — create-stage resultingToothState → odontogramma', () => {
  test('schema stage.resultingToothState qabul qiladi (yaroqsiz qiymat rad)', () => {
    const base = {
      patientId: crypto.randomUUID(),
      doctorId: crypto.randomUUID(),
      title: 'Reja',
    };
    const ok = createTreatmentPlanSchema.safeParse({
      ...base,
      stages: [{ serviceName: 'Plomba', cost: 0, resultingToothState: 'filling' }],
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.stages[0]?.resultingToothState).toBe('filling');
    const bad = createTreatmentPlanSchema.safeParse({
      ...base,
      stages: [{ serviceName: 'Plomba', cost: 0, resultingToothState: 'nonsense' }],
    });
    expect(bad.success).toBe(false);
  });

  test('create saqlaydi; bosqich completed → 16-tish snapshot\'i "filling"', async () => {
    const plan = await inTenant((tx) =>
      plansService.createPlan(ctx(tx), {
        patientId,
        doctorId: ownerId,
        title: 'Plomba',
        stages: [
          {
            serviceName: 'Plomba 16',
            toothNumbers: [16],
            estimatedVisits: 1,
            cost: 100000,
            resultingToothState: 'filling',
          },
        ],
      }),
    );
    const stage = plan.stages[0];
    if (!stage) throw new Error('no stage');
    expect(stage.resultingToothState).toBe('filling');

    // Bosqichni qabul qilib, rejani davolanishga o'tkazamiz va yakunlaymiz.
    await inTenant((tx) =>
      tx
        .update(treatmentPlans)
        .set({ status: 'in_progress' })
        .where(eq(treatmentPlans.id, plan.id)),
    );
    await inTenant((tx) => plansService.updateStage(ctx(tx), stage.id, { acceptance: 'accepted' }));
    await inTenant((tx) => plansService.completeStage(ctx(tx), stage.id, { source: 'plan' }));

    const states = await latestStates();
    expect(states.filter((s) => s.toothNumber === 16)).toEqual([
      { toothNumber: 16, surface: 'whole', state: 'filling' },
    ]);
  });

  test('resultingToothState berilmasa → null, snapshot o`zgarmaydi', async () => {
    const plan = await inTenant((tx) =>
      plansService.createPlan(ctx(tx), {
        patientId,
        doctorId: ownerId,
        title: 'Tozalash',
        stages: [{ serviceName: 'Tozalash', toothNumbers: [16], estimatedVisits: 1, cost: 0 }],
      }),
    );
    const stage = plan.stages[0];
    if (!stage) throw new Error('no stage');
    expect(stage.resultingToothState).toBeNull();
    const rows = await inTenant((tx) =>
      tx.select().from(treatmentStages).where(eq(treatmentStages.id, stage.id)),
    );
    expect(rows[0]?.resultingToothState).toBeNull();
  });
});
