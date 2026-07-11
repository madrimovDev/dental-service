/**
 * CLI-488 — odontogramma auto-update on stage completed (REAL DB).
 *
 * Feature: bosqich 'completed' bo'lganda `stage.toothNumbers` uchun yangi immutable
 * tooth_chart snapshot yoziladi (`stage.resultingToothState` holati bilan). Snapshot
 * shakli (00-DESIGN-DECISIONS.md CLI-488): oldingi eng so'nggi snapshot holatini
 * KO'CHIRIB, ta'sirlangan tishlarning BARCHA oldingi surface-holatlarini tashlab,
 * yangi 'whole' holat bilan qoplaydi → getLatest izchil qoladi.
 *
 * Tasdiqlaydi:
 *   1) toothNumbers=[26] + resultingToothState='crown' stage completed → yangi snapshot;
 *      tish 26 whole='crown', oldingi tish 11 holati KO'CHIRILADI, tish 26'ning eski
 *      surface-holatlari (whole=caries, M=filling) TASHLANADI.
 *   2) resultingToothState=null stage completed → snapshot yaratilmaydi (no-op).
 *   3) toothNumbers=null stage completed → snapshot yaratilmaydi (no-op).
 *   4) allaqachon completed bosqichni qayta PATCH → yangi snapshot yo'q (idempotent).
 *
 * resultingToothState/toothNumbers backend-only — test raw tx bilan seed qiladi.
 *
 * ⚠️ Faza-1'da ISHGA TUSHIRILMAYDI (yagona DB — serial verify ishlatadi).
 *   cd apps/api && bun test tests/integration/cli-488-odontogram-autoupdate.test.ts --env-file=../../.env
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

let crownStageId: string; // toothNumbers=[26], resultingToothState='crown'
let noStateStageId: string; // toothNumbers=[27], resultingToothState=null
let noToothStageId: string; // toothNumbers=null, resultingToothState='filling'

async function snapshotCount(): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const rows = await tx
      .select({ id: toothCharts.id })
      .from(toothCharts)
      .where(eq(toothCharts.patientId, patientId));
    return rows.length;
  });
}

async function latestStates(): Promise<{ toothNumber: number; surface: string; state: string }[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
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
}

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000488', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Odontogram Clinic', slug: 'odontogram-clinic-488', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.insert(branches).values({ tenantId, name: 'Branch 1' });

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Odontogram Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;

    // Oldingi snapshot: tish 11 whole=healthy, tish 26 whole=caries + 26 M=filling.
    const [chart] = await tx
      .insert(toothCharts)
      .values({ tenantId, patientId, isPrimaryDentition: false })
      .returning({ id: toothCharts.id });
    if (!chart) throw new Error('chart insert failed');
    await tx.insert(toothStates).values([
      { toothChartId: chart.id, toothNumber: 11, surface: 'whole', state: 'healthy' },
      { toothChartId: chart.id, toothNumber: 26, surface: 'whole', state: 'caries' },
      { toothChartId: chart.id, toothNumber: 26, surface: 'M', state: 'filling' },
    ]);

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: ownerId, title: 'Reja', status: 'in_progress' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');

    const [crown] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan.id,
        sequence: 1,
        serviceName: 'Crown 26',
        cost: '100000',
        status: 'pending',
        acceptance: 'accepted',
        toothNumbers: [26],
        resultingToothState: 'crown',
      })
      .returning({ id: treatmentStages.id });
    const [noState] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan.id,
        sequence: 2,
        serviceName: 'No state',
        cost: '50000',
        status: 'pending',
        acceptance: 'accepted',
        toothNumbers: [27],
        resultingToothState: null,
      })
      .returning({ id: treatmentStages.id });
    const [noTooth] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan.id,
        sequence: 3,
        serviceName: 'No tooth',
        cost: '50000',
        status: 'pending',
        acceptance: 'accepted',
        toothNumbers: null,
        resultingToothState: 'filling',
      })
      .returning({ id: treatmentStages.id });
    if (!crown || !noState || !noTooth) throw new Error('stage insert failed');
    crownStageId = crown.id;
    noStateStageId = noState.id;
    noToothStageId = noTooth.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-488 — odontogram auto-update on stage completed', () => {
  test('1) crown stage completed → yangi snapshot (26=crown, 11 ko`chirildi, 26 eski tashlandi)', async () => {
    expect(await snapshotCount()).toBe(1); // faqat seed snapshot

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const updated = await plansService.updateStage(ctx(tx), crownStageId, {
        status: 'completed',
      });
      expect(updated?.status).toBe('completed');
    });

    expect(await snapshotCount()).toBe(2); // yangi snapshot yaratildi

    const states = await latestStates();
    // Tish 11 ko'chirildi (carry-forward).
    expect(states).toContainEqual({ toothNumber: 11, surface: 'whole', state: 'healthy' });
    // Tish 26 yangi 'whole'='crown' (overlay).
    expect(states).toContainEqual({ toothNumber: 26, surface: 'whole', state: 'crown' });
    // Tish 26'ning eski surface-holatlari TASHLANDI (caries whole + filling M yo'q).
    const tooth26 = states.filter((s) => s.toothNumber === 26);
    expect(tooth26).toHaveLength(1);
    expect(tooth26[0]?.state).toBe('crown');
    expect(states.some((s) => s.toothNumber === 26 && s.state === 'filling')).toBe(false);
  });

  test('2) resultingToothState=null stage completed → snapshot yaratilmaydi', async () => {
    const before = await snapshotCount();
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const updated = await plansService.updateStage(ctx(tx), noStateStageId, {
        status: 'completed',
      });
      expect(updated?.status).toBe('completed');
    });
    expect(await snapshotCount()).toBe(before); // o'zgarmadi
  });

  test('3) toothNumbers=null stage completed → snapshot yaratilmaydi', async () => {
    const before = await snapshotCount();
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const updated = await plansService.updateStage(ctx(tx), noToothStageId, {
        status: 'completed',
      });
      expect(updated?.status).toBe('completed');
    });
    expect(await snapshotCount()).toBe(before); // o'zgarmadi
  });

  test('4) allaqachon completed bosqichni qayta PATCH → yangi snapshot yo`q (idempotent)', async () => {
    const before = await snapshotCount();
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await plansService.updateStage(ctx(tx), crownStageId, { status: 'completed' });
    });
    expect(await snapshotCount()).toBe(before); // early-return → hook fire etmadi
  });
});
