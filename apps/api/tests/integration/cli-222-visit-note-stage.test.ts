/**
 * C5 (CLI-222) — visit-note ↔ stage linkage REAL DB.
 * Tasdiqlaydi:
 *   1) stageId bilan vizit yozuvi saqlansa → o'sha bosqich status='completed' (C2 guard).
 *   2) skipped→completed RAD (InvalidTransitionError) — orphan yozuv yaratilmaydi.
 *   3) Epic B recall hook hamon fire bo'ladi (bosqich completed bo'lganda).
 *
 * Ishga tushirish (yolg'iz — TRUNCATE poygasi):
 *   cd apps/api && bun test tests/integration/cli-222-visit-note-stage.test.ts --env-file=../../.env
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

// Recall hook spy — completed bo'lganda chaqirilganini kuzatamiz (B coexistence).
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
          : k === 'accessClaims'
            ? { perms: ['@owner'] }
            : k === 'user'
              ? { id: undefined }
              : undefined,
  }) as unknown as Context;

let tenantId: string;
let ownerId: string;
let patientId: string;
let pendingStageId: string;
let skippedStageId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000040', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Visit Stage Clinic', slug: 'visit-stage-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    await tx.insert(branches).values({ tenantId, name: 'Branch 1' });

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Visit Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: ownerId, title: 'Reja', status: 'in_progress' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');

    const [pending] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan.id,
        sequence: 1,
        serviceName: 'Pending',
        cost: '100000',
        status: 'pending',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    const [skipped] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan.id,
        sequence: 2,
        serviceName: 'Skipped',
        cost: '50000',
        status: 'skipped',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    if (!pending || !skipped) throw new Error('stage insert failed');
    pendingStageId = pending.id;
    skippedStageId = skipped.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('C5 — visit-note stage linkage', () => {
  test('stageId bilan vizit → bosqich completed + recall fire', async () => {
    recallCalls.length = 0;
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const note = await visitService.create(ctx(tx, tenantId), {
        patientId,
        doctorId: ownerId,
        stageId: pendingStageId,
        assessmentDiagnoses: [],
        performedServices: [],
      });
      expect(note?.stageId).toBe(pendingStageId);

      // Bosqich status='completed' bo'ldi (C2 guard ichida).
      const [stage] = await tx
        .select({ status: treatmentStages.status, completedAt: treatmentStages.completedAt })
        .from(treatmentStages)
        .where(eq(treatmentStages.id, pendingStageId));
      expect(stage?.status).toBe('completed');
      expect(stage?.completedAt).not.toBeNull();
    });
    // Epic B recall hook fire bo'ldi (coexistence).
    expect(recallCalls).toContain(pendingStageId);
  });

  test("skipped bosqich → completed RAD (guard); orphan yozuv yo'q", async () => {
    recallCalls.length = 0;
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return visitService.create(ctx(tx, tenantId), {
          patientId,
          doctorId: ownerId,
          stageId: skippedStageId,
          assessmentDiagnoses: [],
          performedServices: [],
        });
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);

    // skipped bosqich o'zgarmadi + vizit yozuvi yaratilmadi (transaction rollback).
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const [stage] = await tx
        .select({ status: treatmentStages.status })
        .from(treatmentStages)
        .where(eq(treatmentStages.id, skippedStageId));
      expect(stage?.status).toBe('skipped');
      const orphans = await tx
        .select({ id: visitNotes.id })
        .from(visitNotes)
        .where(eq(visitNotes.stageId, skippedStageId));
      expect(orphans.length).toBe(0);
    });
    expect(recallCalls).not.toContain(skippedStageId);
  });

  test("stageId'siz vizit → bosqich tegmaydi", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const note = await visitService.create(ctx(tx, tenantId), {
        patientId,
        doctorId: ownerId,
        assessmentDiagnoses: [],
        performedServices: [],
      });
      expect(note?.stageId).toBeNull();
    });
  });
});
