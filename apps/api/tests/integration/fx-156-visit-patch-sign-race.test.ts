/**
 * FX-156 (LC-34) — PATCH vizit imzo poygasida yon ta'sirsiz 409 (REAL DB, ikki parallel tranzaksiya).
 * Avval: `update()` find (qulfsiz) → bosqichni `in_progress` qilish → `repo.update` tartibida edi;
 * find↔update orasida boshqa tranzaksiya imzolasa, `VisitNoteSignedError` (409) tashlanardi, lekin
 * rlsMiddleware 4xx'ni COMMIT qiladi → bosqich o'zgarishi saqlanib qolardi. Endi find `FOR UPDATE`.
 *
 *   cd apps/api && bun test tests/integration/fx-156-visit-patch-sign-race.test.ts --env-file=../../.env --timeout 30000
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
import {
  createVisitNotesService,
  VisitNoteSignedError,
} from '../../src/modules/clinical/visit-notes/visit-notes.service.ts';

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
const visitService = createVisitNotesService({
  audit: noopAudit,
  completeStage: {
    completeStageForVisit: plansService.completeStageForVisit,
    startStageForVisit: plansService.startStageForVisit,
  },
});

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

let tenantId: string;
let ownerId: string;
let patientId: string;
let planId: string;
let seq = 0;

const mkStage = (over: { status?: 'pending' | 'skipped'; acceptance?: 'accepted' | 'proposed' }) =>
  inTenant(async (tx) => {
    seq += 1;
    const [s] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: planId,
        sequence: seq,
        serviceName: `Stage ${seq}`,
        cost: '100000',
        status: over.status ?? 'pending',
        acceptance: over.acceptance ?? 'accepted',
      })
      .returning({ id: treatmentStages.id });
    if (!s) throw new Error('stage insert failed');
    return s.id;
  });

const stageStatus = (id: string) =>
  inTenant(async (tx) => {
    const [s] = await tx
      .select({ status: treatmentStages.status })
      .from(treatmentStages)
      .where(eq(treatmentStages.id, id));
    return s?.status;
  });

const noteSigned = (id: string) =>
  inTenant(async (tx) => {
    const [n] = await tx
      .select({ signedAt: visitNotes.signedAt })
      .from(visitNotes)
      .where(eq(visitNotes.id, id));
    return n?.signedAt ?? null;
  });

const draft = (stageId: string, extra: { completesStage?: boolean } = {}) =>
  inTenant(async (tx) => {
    const n = await visitService.create(ctx(tx), {
      patientId,
      doctorId: ownerId,
      stageId,
      assessmentDiagnoses: [],
      performedServices: [],
      ...extra,
    });
    if (!n) throw new Error('create failed');
    return n;
  });

const sign = (id: string) => inTenant((tx) => visitService.sign(ctx(tx), id));

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000156', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX156 Clinic', slug: 'fx156-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;
  await inTenant(async (tx) => {
    await tx.insert(branches).values({ tenantId, name: 'Branch 1' });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'FX156 Bemor' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;
    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: ownerId, title: 'Reja', status: 'in_progress' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    planId = plan.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('FX-156 — PATCH ↔ imzo poygasi', () => {
  test("imzo PATCH'dan oldin commit bo'lsa: 409, bosqich o'zgarmaydi", async () => {
    const stageId = await mkStage({});
    const note = await inTenant(async (tx) => {
      const n = await visitService.create(ctx(tx), {
        patientId,
        doctorId: ownerId,
        assessmentDiagnoses: [],
        performedServices: [],
      });
      if (!n) throw new Error('create failed');
      return n;
    });

    let releaseSign!: () => void;
    const hold = new Promise<void>((r) => {
      releaseSign = r;
    });
    let signStarted!: () => void;
    const started = new Promise<void>((r) => {
      signStarted = r;
    });
    // S: imzolaydi, lekin hali COMMIT qilmaydi (qator qulfi ushlab turiladi).
    const signTx = db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await visitService.sign(ctx(tx), note.id);
      signStarted();
      await hold;
    });
    await started;

    // P: PATCH (bosqich biriktirish) — rlsMiddleware kabi: 4xx xatoda ham COMMIT.
    const patchTx = db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      try {
        await visitService.update(ctx(tx), note.id, { stageId });
        return null;
      } catch (e) {
        return e;
      }
    });
    await sleep(400);
    releaseSign();
    await signTx;
    const err = await patchTx;

    expect(err).toBeInstanceOf(VisitNoteSignedError);
    expect(await stageStatus(stageId)).toBe('pending');
  });
});
