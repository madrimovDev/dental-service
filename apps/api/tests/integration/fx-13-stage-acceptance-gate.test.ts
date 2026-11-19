/**
 * X-3 + FX-13 (LA-36, D-11) — bosqichni yakunlashning yagona yo'li + acceptance gate (REAL DB).
 *
 * Bosqich 'completed' bo'lishi uchun effektiv acceptance 'accepted' bo'lishi shart
 * (proposed/rejected → StageNotAcceptedError, InvalidTransitionError subklassi → routes 400).
 * Ikkala yo'l (updateStage va visit-notes `completeStageForVisit`) bitta funksiyadan o'tadi.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
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
  StageNotAcceptedError,
} from '../../src/modules/clinical/treatment-plans/treatment-plans.transitions.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const recallCalls: string[] = [];
const plansService = createTreatmentPlansService({
  audit: noopAudit,
  recall: {
    autoCreateFromStage: async (_c, args) => {
      recallCalls.push(args.sourceStageId);
    },
  },
});

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

const inTenant = <T>(fn: (tx: DbOrTx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

let tenantId: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000013', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner');
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX13 Clinic', slug: 'fx13-clinic', ownerUserId: owner.id })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant');
  tenantId = tenant.id;

  await inTenant(async (tx) => {
    await tx.insert(branches).values({ tenantId, name: 'B1' });
    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient');
    const [plan] = await tx
      .insert(treatmentPlans)
      .values({
        tenantId,
        patientId: patient.id,
        doctorId: owner.id,
        title: 'Reja',
        status: 'accepted',
      })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan');
    const mk = async (seq: number, acceptance: 'proposed' | 'accepted' | 'rejected') => {
      const [s] = await tx
        .insert(treatmentStages)
        .values({
          treatmentPlanId: plan.id,
          sequence: seq,
          serviceName: `S${seq}`,
          cost: '100000',
          status: 'pending',
          acceptance,
        })
        .returning({ id: treatmentStages.id });
      if (!s) throw new Error('stage');
      return s.id;
    };
    ids.proposed = await mk(1, 'proposed');
    ids.rejected = await mk(2, 'rejected');
    ids.accepted = await mk(3, 'accepted');
    ids.visitProposed = await mk(4, 'proposed');
    ids.together = await mk(5, 'proposed');
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const statusOf = (id: string) =>
  inTenant(async (tx) => {
    const [s] = await tx
      .select({ status: treatmentStages.status })
      .from(treatmentStages)
      .where(eq(treatmentStages.id, id));
    return s?.status;
  });

describe('X-3 + FX-13 — acceptance gate', () => {
  test('proposed bosqich → completed RAD (StageNotAcceptedError ⊂ InvalidTransitionError)', async () => {
    const attempt = () =>
      inTenant((tx) =>
        plansService.updateStage(ctx(tx, tenantId), ids.proposed as string, {
          status: 'completed',
        }),
      );
    await expect(attempt()).rejects.toBeInstanceOf(StageNotAcceptedError);
    await expect(attempt()).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(await statusOf(ids.proposed as string)).toBe('pending');
  });

  test('rejected bosqich → completed RAD', async () => {
    await expect(
      inTenant((tx) =>
        plansService.updateStage(ctx(tx, tenantId), ids.rejected as string, {
          status: 'completed',
        }),
      ),
    ).rejects.toBeInstanceOf(StageNotAcceptedError);
    expect(await statusOf(ids.rejected as string)).toBe('pending');
  });

  test('vizit yo`li (completeStageForVisit) ham proposed bosqichni RAD etadi', async () => {
    await expect(
      inTenant((tx) =>
        plansService.completeStageForVisit(ctx(tx, tenantId), ids.visitProposed as string),
      ),
    ).rejects.toBeInstanceOf(StageNotAcceptedError);
    expect(await statusOf(ids.visitProposed as string)).toBe('pending');
  });

  test('rad etilgan urinishda recall yaratilmaydi', () => {
    expect(recallCalls).toHaveLength(0);
  });

  test('bir PATCH da acceptance=accepted + status=completed → ruxsat (effektiv acceptance)', async () => {
    const updated = await inTenant((tx) =>
      plansService.updateStage(ctx(tx, tenantId), ids.together as string, {
        status: 'completed',
        acceptance: 'accepted',
      }),
    );
    expect(updated?.status).toBe('completed');
  });

  test('accepted bosqich → completed RUXSAT, recall hook bir marta', async () => {
    const before = recallCalls.length;
    const updated = await inTenant((tx) =>
      plansService.completeStageForVisit(ctx(tx, tenantId), ids.accepted as string),
    );
    expect(updated?.status).toBe('completed');
    expect(recallCalls.length).toBe(before + 1);
  });
});
