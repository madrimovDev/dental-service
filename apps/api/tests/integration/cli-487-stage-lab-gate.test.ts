/**
 * CLI-487 — lab-order ↔ stage completion gate (REAL DB).
 *
 * Feature: `treatment_stages.lab_order_id` (ixtiyoriy). Bosqichni 'completed' qilishda
 * bog'langan lab-order 'delivered' bo'lishi shart — aks holda StageLabPendingError
 * (InvalidTransitionError subklassi → routes 400 `stage.invalid_transition`).
 *
 * Tasdiqlaydi:
 *   1) lab-linked stage, lab-order 'in_progress' → completed BLOKLANADI.
 *   2) lab-linked stage, lab-order 'delivered' → completed RUXSAT.
 *   3) lab-linksiz stage → completed RUXSAT (gate yo'q — regressiya himoyasi).
 *   4) bloklangan bosqich DB'da 'pending' qoladi (persist'dan oldin blok).
 *
 * lab_order_id backend-only (bu round API'da set qilinmaydi) — test raw tx bilan seed
 * qiladi (cli-415 pretsedenti).
 *
 * ⚠️ Faza-1'da ISHGA TUSHIRILMAYDI (yagona DB — serial verify ishlatadi).
 *   cd apps/api && bun test tests/integration/cli-487-stage-lab-gate.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  labOrders,
  patients,
  tenants,
  treatmentPlans,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createTreatmentPlansService } from '../../src/modules/clinical/treatment-plans/treatment-plans.service.ts';
import {
  InvalidTransitionError,
  StageLabPendingError,
} from '../../src/modules/clinical/treatment-plans/treatment-plans.transitions.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const plansService = createTreatmentPlansService({ audit: noopAudit });

const ctx = (tx: DbOrTx, tenantId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: undefined }
            : undefined,
  }) as unknown as Context;

let tenantId: string;
let ownerId: string;
let patientId: string;
let stagePendingLabId: string; // lab in_progress → blok
let stageDeliveredLabId: string; // lab delivered → ruxsat
let stageNoLabId: string; // lab yo'q → ruxsat

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000487', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Lab Gate Clinic', slug: 'lab-gate-clinic-487', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.insert(branches).values({ tenantId, name: 'Branch 1' });

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Lab Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: ownerId, title: 'Reja', status: 'in_progress' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');

    const [labInProgress] = await tx
      .insert(labOrders)
      .values({
        tenantId,
        patientId,
        doctorId: ownerId,
        labName: 'Lab A',
        orderType: 'crown',
        items: [{ description: 'Crown 26' }],
        status: 'in_progress',
      })
      .returning({ id: labOrders.id });
    const [labDelivered] = await tx
      .insert(labOrders)
      .values({
        tenantId,
        patientId,
        doctorId: ownerId,
        labName: 'Lab B',
        orderType: 'crown',
        items: [{ description: 'Crown 27' }],
        status: 'delivered',
      })
      .returning({ id: labOrders.id });
    if (!labInProgress || !labDelivered) throw new Error('lab insert failed');

    const mkStage = async (seq: number, labOrderId: string | null) => {
      const [s] = await tx
        .insert(treatmentStages)
        .values({
          treatmentPlanId: plan.id,
          sequence: seq,
          serviceName: `Stage ${seq}`,
          cost: '100000',
          status: 'pending',
          acceptance: 'accepted',
          labOrderId,
        })
        .returning({ id: treatmentStages.id });
      if (!s) throw new Error('stage insert failed');
      return s.id;
    };

    stagePendingLabId = await mkStage(1, labInProgress.id);
    stageDeliveredLabId = await mkStage(2, labDelivered.id);
    stageNoLabId = await mkStage(3, null);
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-487 — lab-order gate on stage completion', () => {
  test('1) lab in_progress → stage completed BLOKLANADI (StageLabPendingError)', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return plansService.updateStage(ctx(tx, tenantId), stagePendingLabId, {
          status: 'completed',
        });
      }),
    ).rejects.toBeInstanceOf(StageLabPendingError);
    // Subklass ekanini ham tasdiqlaymiz (routes catch InvalidTransitionError).
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return plansService.updateStage(ctx(tx, tenantId), stagePendingLabId, {
          status: 'completed',
        });
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  test('2) bloklangan bosqich DB`da pending qoladi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const [s] = await tx
        .select({ status: treatmentStages.status })
        .from(treatmentStages)
        .where(eq(treatmentStages.id, stagePendingLabId));
      expect(s?.status).toBe('pending');
    });
  });

  test('3) lab delivered → stage completed RUXSAT', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const updated = await plansService.updateStage(ctx(tx, tenantId), stageDeliveredLabId, {
        status: 'completed',
      });
      expect(updated?.status).toBe('completed');
    });
  });

  test('4) lab-linksiz stage → completed RUXSAT (gate yo`q)', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const updated = await plansService.updateStage(ctx(tx, tenantId), stageNoLabId, {
        status: 'completed',
      });
      expect(updated?.status).toBe('completed');
    });
  });
});
