/**
 * CLI-415 — bosqich status-mashinasi parent PLAN statusiga bo'ysunadi (REAL DB).
 * Tasdiqlaydi:
 *   1) cancelled planda bosqichni completed qilish → InvalidTransitionError; recall YO'Q.
 *   2) completed planda bosqich acceptance o'zgartirish → InvalidTransitionError.
 *   3) draft planda bosqich completed → InvalidTransitionError.
 *   4) draft planda bosqich skipped → OK.
 *   5) in_progress planda bosqich completed → OK + recall fire (mavjud xulq saqlanadi).
 *   6) completeStageForVisit (visit-note) cancelled planda → RAD (orphan yozuv yo'q).
 *
 * ⚠️ Infra DOWN paytida YOZILGAN, LEKIN ISHGA TUSHIRILMAGAN.
 * Ishga tushirish (yolg'iz — TRUNCATE poygasi):
 *   cd apps/api && bun test tests/integration/cli-415-stage-plan-guard.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  patients,
  tenants,
  treatmentPlans,
  treatmentStages,
  users,
  visitNotes,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createTreatmentPlansService } from '../../src/modules/clinical/treatment-plans/treatment-plans.service.ts';
import { InvalidTransitionError } from '../../src/modules/clinical/treatment-plans/treatment-plans.transitions.ts';
import { createVisitNotesService } from '../../src/modules/clinical/visit-notes/visit-notes.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;

const recallCalls: string[] = [];
const recallSpy = {
  autoCreateFromStage: async (_c: Context, args: { sourceStageId: string }) => {
    recallCalls.push(args.sourceStageId);
  },
};

const plansService = createTreatmentPlansService({ audit: noopAudit, recall: recallSpy });
const visitService = createVisitNotesService({
  audit: noopAudit,
  completeStage: { completeStageForVisit: plansService.completeStageForVisit },
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

let tenantId: string;
let ownerId: string;
let patientId: string;
// Plans by status
let cancelledStageId: string;
let completedPlanStageId: string;
let draftStageId: string;
let draftStage2Id: string;
let activeStageId: string;

async function seedPlan(
  tx: DbOrTx,
  status: 'draft' | 'in_progress' | 'cancelled' | 'completed',
  stageCount = 1,
): Promise<string[]> {
  const [plan] = await tx
    .insert(treatmentPlans)
    .values({ tenantId, patientId, doctorId: ownerId, title: `Plan ${status}`, status })
    .returning({ id: treatmentPlans.id });
  if (!plan) throw new Error('plan insert failed');
  const ids: string[] = [];
  for (let i = 0; i < stageCount; i++) {
    const [stage] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan.id,
        sequence: i + 1,
        serviceName: `Stage ${i}`,
        cost: '100000',
        status: 'pending',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    if (!stage) throw new Error('stage insert failed');
    ids.push(stage.id);
  }
  return ids;
}

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000415', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Stage Guard Clinic', slug: 'stage-guard-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.insert(branches).values({ tenantId, name: 'Branch 1' });
    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Guard Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;

    [cancelledStageId] = await seedPlan(tx, 'cancelled');
    [completedPlanStageId] = await seedPlan(tx, 'completed');
    const draftIds = await seedPlan(tx, 'draft', 2);
    draftStageId = draftIds[0]!;
    draftStage2Id = draftIds[1]!;
    [activeStageId] = await seedPlan(tx, 'in_progress');
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-415 — stage transition guarded by plan status', () => {
  test('cancelled plan: stage → completed RAD, recall yo`q', async () => {
    recallCalls.length = 0;
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return plansService.updateStage(ctx(tx, tenantId), cancelledStageId, {
          status: 'completed',
        });
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(recallCalls).not.toContain(cancelledStageId);
  });

  test('completed plan: stage acceptance change RAD', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return plansService.updateStage(ctx(tx, tenantId), completedPlanStageId, {
          acceptance: 'rejected',
        });
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  test('draft plan: stage → completed RAD', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return plansService.updateStage(ctx(tx, tenantId), draftStageId, { status: 'completed' });
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  test('draft plan: stage → skipped OK', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const updated = await plansService.updateStage(ctx(tx, tenantId), draftStage2Id, {
        status: 'skipped',
      });
      expect(updated?.status).toBe('skipped');
    });
  });

  test('in_progress plan: stage → completed OK + recall fire', async () => {
    recallCalls.length = 0;
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const updated = await plansService.updateStage(ctx(tx, tenantId), activeStageId, {
        status: 'completed',
      });
      expect(updated?.status).toBe('completed');
    });
    expect(recallCalls).toContain(activeStageId);
  });

  test('completeStageForVisit on cancelled plan → RAD, orphan yozuv yo`q', async () => {
    recallCalls.length = 0;
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return visitService.create(ctx(tx, tenantId), {
          patientId,
          doctorId: ownerId,
          stageId: cancelledStageId,
          assessmentDiagnoses: [],
          performedServices: [],
        });
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const orphans = await tx
        .select({ id: visitNotes.id })
        .from(visitNotes)
        .where(eq(visitNotes.stageId, cancelledStageId));
      expect(orphans.length).toBe(0);
    });
  });
});
