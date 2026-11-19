/**
 * FX-16 (LA-37) — reja 'completed' qilinganda bajarilmagan accepted bosqich qolmasin
 * (REAL DB, pul). Xato InvalidTransitionError subklassi → routes 400.
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

type StageStatusT = 'pending' | 'in_progress' | 'completed' | 'skipped';
type AcceptanceT = 'proposed' | 'accepted' | 'rejected';

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000016', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner');
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX16 Clinic', slug: 'fx16-clinic', ownerUserId: owner.id })
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
    const mkPlan = async (title: string) => {
      const [plan] = await tx
        .insert(treatmentPlans)
        .values({
          tenantId,
          patientId: patient.id,
          doctorId: owner.id,
          title,
          status: 'in_progress',
        })
        .returning({ id: treatmentPlans.id });
      if (!plan) throw new Error('plan');
      return plan.id;
    };
    const mkStage = async (
      planId: string,
      seq: number,
      status: StageStatusT,
      acceptance: AcceptanceT,
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
    ids.planA = await mkPlan('A: completed + pending accepted');
    await mkStage(ids.planA, 1, 'completed', 'accepted');
    ids.pendingA = await mkStage(ids.planA, 2, 'pending', 'accepted');
    ids.planB = await mkPlan('B: in_progress accepted');
    ids.inProgB = await mkStage(ids.planB, 1, 'in_progress', 'accepted');
    ids.planC = await mkPlan('C: hammasi hal qilingan');
    await mkStage(ids.planC, 1, 'completed', 'accepted');
    await mkStage(ids.planC, 2, 'skipped', 'accepted');
    await mkStage(ids.planC, 3, 'pending', 'rejected');
    await mkStage(ids.planC, 4, 'pending', 'proposed');
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const planStatus = (id: string) =>
  inTenant(async (tx) => {
    const [p] = await tx
      .select({ status: treatmentPlans.status })
      .from(treatmentPlans)
      .where(eq(treatmentPlans.id, id));
    return p?.status;
  });

describe('FX-16 — reja completed guard', () => {
  test('pending+accepted bosqichli rejani completed qilish RAD', async () => {
    await expect(
      inTenant((tx) =>
        plansService.updatePlan(ctx(tx, tenantId), ids.planA as string, { status: 'completed' }),
      ),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(await planStatus(ids.planA as string)).toBe('in_progress');
  });

  test('in_progress+accepted bosqichli rejani completed qilish RAD', async () => {
    await expect(
      inTenant((tx) =>
        plansService.updatePlan(ctx(tx, tenantId), ids.planB as string, { status: 'completed' }),
      ),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(await planStatus(ids.planB as string)).toBe('in_progress');
  });

  test("bosqichni skipped qilgach reja completed bo'ladi", async () => {
    await inTenant((tx) =>
      plansService.updateStage(ctx(tx, tenantId), ids.pendingA as string, { status: 'skipped' }),
    );
    const r = await inTenant((tx) =>
      plansService.updatePlan(ctx(tx, tenantId), ids.planA as string, { status: 'completed' }),
    );
    expect(r?.status).toBe('completed');
  });

  test("completed/skipped/rejected/proposed bosqichlar rejani to'sqinlamaydi", async () => {
    const r = await inTenant((tx) =>
      plansService.updatePlan(ctx(tx, tenantId), ids.planC as string, { status: 'completed' }),
    );
    expect(r?.status).toBe('completed');
  });
});
