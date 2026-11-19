/**
 * FX-15 (LA-32) — bajarilgan (completed) bosqich qarzi acceptance o'zgartirish yoki
 * planni bekor qilish bilan o'chib ketmasligi (REAL DB, pul).
 * Xatolar InvalidTransitionError subklassi → routes 400.
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
import { computePlanBalance } from '../../src/modules/cashier/cashier.billing.ts';
import { createTreatmentPlansService } from '../../src/modules/clinical/treatment-plans/treatment-plans.service.ts';
import { InvalidTransitionError } from '../../src/modules/clinical/treatment-plans/treatment-plans.transitions.ts';

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
const inTenant = <T>(fn: (tx: DbOrTx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const ids: Record<string, string> = {};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000015', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner');
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX15 Clinic', slug: 'fx15-clinic', ownerUserId: owner.id })
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
    const mkPlan = async (title: string, status: 'in_progress' | 'accepted') => {
      const [plan] = await tx
        .insert(treatmentPlans)
        .values({ tenantId, patientId: patient.id, doctorId: owner.id, title, status })
        .returning({ id: treatmentPlans.id });
      if (!plan) throw new Error('plan');
      return plan.id;
    };
    const mkStage = async (
      planId: string,
      seq: number,
      status: 'pending' | 'completed',
      acceptance: 'proposed' | 'accepted',
    ) => {
      const [s] = await tx
        .insert(treatmentStages)
        .values({
          treatmentPlanId: planId,
          sequence: seq,
          serviceName: `S${seq}`,
          cost: '100000',
          status,
          acceptance,
        })
        .returning({ id: treatmentStages.id });
      if (!s) throw new Error('stage');
      return s.id;
    };
    ids.planA = await mkPlan('A: completed bosqichli', 'in_progress');
    ids.doneStage = await mkStage(ids.planA, 1, 'completed', 'accepted');
    ids.planB = await mkPlan('B: faqat pending', 'accepted');
    ids.pendingStage = await mkStage(ids.planB, 1, 'pending', 'accepted');
    ids.planC = await mkPlan('C: completed, ruxsat berilgan amallar', 'in_progress');
    ids.doneStageC = await mkStage(ids.planC, 1, 'completed', 'accepted');
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const stageRow = (id: string) =>
  inTenant(async (tx) => {
    const [s] = await tx.select().from(treatmentStages).where(eq(treatmentStages.id, id));
    return s;
  });
const planStatus = (id: string) =>
  inTenant(async (tx) => {
    const [p] = await tx
      .select({ status: treatmentPlans.status })
      .from(treatmentPlans)
      .where(eq(treatmentPlans.id, id));
    return p?.status;
  });

describe('FX-15 — completed bosqich himoyasi', () => {
  test('completed bosqich acceptance accepted→rejected RAD', async () => {
    await expect(
      inTenant((tx) =>
        plansService.updateStage(ctx(tx, tenantId), ids.doneStage as string, {
          acceptance: 'rejected',
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect((await stageRow(ids.doneStage as string))?.acceptance).toBe('accepted');
  });

  test('completed bosqich acceptance accepted→proposed RAD', async () => {
    await expect(
      inTenant((tx) =>
        plansService.updateStage(ctx(tx, tenantId), ids.doneStage as string, {
          acceptance: 'proposed',
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect((await stageRow(ids.doneStage as string))?.acceptance).toBe('accepted');
  });

  test('completed bosqich: idempotent accepted→accepted va notes ruxsat', async () => {
    const r = await inTenant((tx) =>
      plansService.updateStage(ctx(tx, tenantId), ids.doneStageC as string, {
        acceptance: 'accepted',
        notes: 'izoh',
      }),
    );
    expect(r?.acceptance).toBe('accepted');
    expect(r?.notes).toBe('izoh');
  });

  test('completed bosqichli rejani bekor qilish RAD — bajarilgan ish qarzi saqlanadi', async () => {
    await expect(
      inTenant((tx) =>
        plansService.updatePlan(ctx(tx, tenantId), ids.planA as string, { status: 'cancelled' }),
      ),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(await planStatus(ids.planA as string)).toBe('in_progress');

    const stage = await stageRow(ids.doneStage as string);
    const bal = computePlanBalance(
      [
        {
          id: stage?.id as string,
          serviceName: 'S1',
          cost: stage?.cost as string,
          status: stage?.status,
          acceptance: stage?.acceptance,
        },
      ],
      [],
      await planStatus(ids.planA as string),
    );
    expect(bal.balance).toBe(100000);
  });

  test('completed bosqichsiz rejani bekor qilish ishlaydi', async () => {
    const r = await inTenant((tx) =>
      plansService.updatePlan(ctx(tx, tenantId), ids.planB as string, { status: 'cancelled' }),
    );
    expect(r?.status).toBe('cancelled');
  });

  test('completed bosqichli rejani completed qilish ishlaydi', async () => {
    const r = await inTenant((tx) =>
      plansService.updatePlan(ctx(tx, tenantId), ids.planC as string, { status: 'completed' }),
    );
    expect(r?.status).toBe('completed');
  });
});
