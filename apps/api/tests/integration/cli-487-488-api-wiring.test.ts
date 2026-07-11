/**
 * CLI-487/488 — API-wiring (WRITE path) REAL DB.
 *
 * Product-decision "qur": lab-gate + odontogram auto-update backend mantiq'i CLI-487/488'da
 * qurilgan edi, LEKIN `labOrderId`/`resultingToothState` ustunlari API'da OCHILMAGAN edi
 * (faqat raw-tx bilan seed qilinardi → featurelar jonli ishlamas edi — "dormant").
 *
 * Bu test WRITE yo'lini tasdiqlaydi (read-logikani cli-487 / cli-488 allaqachon qamragan):
 *   1) updateStageSchema `labOrderId` + `resultingToothState`'ni qabul qiladi.
 *   2) updateStage `labOrderId`'ni persist qiladi (bog'lash API orqali).
 *   3) updateStage `resultingToothState`'ni persist qiladi.
 *   4) ownership guard: boshqa bemorning lab-order'i → CrossEntityError('mismatch');
 *      mavjud bo'lmagan → 'not_found'.
 *   5) effective-gate: lab-linksiz bosqichga in_progress lab bog'lab + completed BIR
 *      chaqiruvda → StageLabPendingError (yangi link ham gate'ga tushadi).
 *   6) `labOrderId: null` → uzish; keyin completed RUXSAT (gate yo'q).
 *
 * ⚠️ Yagona DB — serial verify ishlatadi.
 *   cd apps/api && bun test tests/integration/cli-487-488-api-wiring.test.ts --env-file=../../.env
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
import { CrossEntityError } from '../../src/lib/ownership.ts';
import { updateStageSchema } from '../../src/modules/clinical/treatment-plans/treatment-plans.schema.ts';
import { createTreatmentPlansService } from '../../src/modules/clinical/treatment-plans/treatment-plans.service.ts';
import { StageLabPendingError } from '../../src/modules/clinical/treatment-plans/treatment-plans.transitions.ts';

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

const withTx = <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

let tenantId: string;
let ownerId: string;
let patientAId: string;
let labDeliveredId: string; // patient A, delivered
let labInProgressId: string; // patient A, in_progress
let labOtherPatientId: string; // patient B (SHU tenant) → mismatch guard
let stageLinkId: string; // link/persist testlari uchun
let stageStateId: string; // resultingToothState persist testi
let stageEffectiveId: string; // link+complete bir chaqiruvda
let stageUnlinkId: string; // unlink testi (delivered lab bilan boshlaydi)

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
    .values({ name: 'API Wiring Clinic', slug: 'api-wiring-clinic-488', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await withTx(tenantId, async (tx) => {
    await tx.insert(branches).values({ tenantId, name: 'Branch 1' });

    const [patientA] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor A' })
      .returning({ id: patients.id });
    const [patientB] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor B' })
      .returning({ id: patients.id });
    if (!patientA || !patientB) throw new Error('patient insert failed');
    patientAId = patientA.id;

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({
        tenantId,
        patientId: patientAId,
        doctorId: ownerId,
        title: 'Reja',
        status: 'in_progress',
      })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');

    const mkLab = async (patientId: string, status: 'in_progress' | 'delivered') => {
      const [l] = await tx
        .insert(labOrders)
        .values({
          tenantId,
          patientId,
          doctorId: ownerId,
          labName: 'Lab',
          orderType: 'crown',
          items: [{ description: 'Crown' }],
          status,
        })
        .returning({ id: labOrders.id });
      if (!l) throw new Error('lab insert failed');
      return l.id;
    };
    labDeliveredId = await mkLab(patientAId, 'delivered');
    labInProgressId = await mkLab(patientAId, 'in_progress');
    labOtherPatientId = await mkLab(patientB.id, 'delivered');

    const mkStage = async (seq: number, toothNumbers: number[] | null) => {
      const [s] = await tx
        .insert(treatmentStages)
        .values({
          treatmentPlanId: plan.id,
          sequence: seq,
          serviceName: `Stage ${seq}`,
          cost: '100000',
          status: 'pending',
          acceptance: 'accepted',
          toothNumbers,
        })
        .returning({ id: treatmentStages.id });
      if (!s) throw new Error('stage insert failed');
      return s.id;
    };
    stageLinkId = await mkStage(1, null);
    stageStateId = await mkStage(2, [26]);
    stageEffectiveId = await mkStage(3, null);
    stageUnlinkId = await mkStage(4, null);
  });

  // stageUnlink delivered lab bilan boshlaydi (unlink testida uzamiz)
  await withTx(tenantId, (tx) =>
    plansService.updateStage(ctx(tx, tenantId), stageUnlinkId, { labOrderId: labDeliveredId }),
  );
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-487/488 — API-wiring (write path)', () => {
  test('1) updateStageSchema labOrderId + resultingToothState qabul qiladi', () => {
    const parsed = updateStageSchema.parse({
      labOrderId: labDeliveredId,
      resultingToothState: 'crown',
    });
    expect(parsed.labOrderId).toBe(labDeliveredId);
    expect(parsed.resultingToothState).toBe('crown');
    // null → uzish; noto'g'ri enum → rad.
    expect(updateStageSchema.parse({ labOrderId: null }).labOrderId).toBeNull();
    expect(() => updateStageSchema.parse({ resultingToothState: 'bogus' })).toThrow();
  });

  test('2) updateStage labOrderId persist qiladi (API orqali bog’lash)', async () => {
    await withTx(tenantId, async (tx) => {
      const updated = await plansService.updateStage(ctx(tx, tenantId), stageLinkId, {
        labOrderId: labDeliveredId,
      });
      expect(updated?.labOrderId).toBe(labDeliveredId);
      const [row] = await tx
        .select({ labOrderId: treatmentStages.labOrderId })
        .from(treatmentStages)
        .where(eq(treatmentStages.id, stageLinkId));
      expect(row?.labOrderId).toBe(labDeliveredId);
    });
  });

  test('3) updateStage resultingToothState persist qiladi', async () => {
    await withTx(tenantId, async (tx) => {
      const updated = await plansService.updateStage(ctx(tx, tenantId), stageStateId, {
        resultingToothState: 'crown',
      });
      expect(updated?.resultingToothState).toBe('crown');
    });
  });

  test('4) ownership guard: boshqa bemor lab → mismatch; mavjud emas → not_found', async () => {
    await expect(
      withTx(tenantId, (tx) =>
        plansService.updateStage(ctx(tx, tenantId), stageLinkId, {
          labOrderId: labOtherPatientId,
        }),
      ),
    ).rejects.toMatchObject({ name: 'CrossEntityError', reason: 'mismatch' });

    await expect(
      withTx(tenantId, (tx) =>
        plansService.updateStage(ctx(tx, tenantId), stageLinkId, {
          labOrderId: '00000000-0000-0000-0000-000000000000',
        }),
      ),
    ).rejects.toBeInstanceOf(CrossEntityError);
  });

  test('5) effective-gate: yangi in_progress lab bog’lab + completed bir chaqiruvda → blok', async () => {
    await expect(
      withTx(tenantId, (tx) =>
        plansService.updateStage(ctx(tx, tenantId), stageEffectiveId, {
          labOrderId: labInProgressId,
          status: 'completed',
        }),
      ),
    ).rejects.toBeInstanceOf(StageLabPendingError);
    // Bloklangach DB'da pending qoladi.
    await withTx(tenantId, async (tx) => {
      const [row] = await tx
        .select({ status: treatmentStages.status })
        .from(treatmentStages)
        .where(eq(treatmentStages.id, stageEffectiveId));
      expect(row?.status).toBe('pending');
    });
  });

  test('6) labOrderId: null → uzish; keyin completed RUXSAT (gate yo’q)', async () => {
    await withTx(tenantId, async (tx) => {
      const unlinked = await plansService.updateStage(ctx(tx, tenantId), stageUnlinkId, {
        labOrderId: null,
      });
      expect(unlinked?.labOrderId).toBeNull();
      const completed = await plansService.updateStage(ctx(tx, tenantId), stageUnlinkId, {
        status: 'completed',
      });
      expect(completed?.status).toBe('completed');
    });
  });
});
