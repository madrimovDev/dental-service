/**
 * FX-14 (LA-33, D-9) — bosqich yakunlanishi vizit IMZOSIDA (REAL DB).
 *
 * Avval: vizit qoralamasini saqlash bosqichni darhol `completed` (terminal) + recall qilardi;
 * qoralama tashlansa ham bosqich yopiq qolardi, ko'p vizitli bosqichni birinchi vizitda yopardi.
 * Endi: qoralama bosqichni `in_progress` qiladi; `sign()` `completes_stage=true` bo'lsa
 * (default) yopadi, `false` bo'lsa bosqich `in_progress` qoladi (oraliq vizit).
 *
 *   cd apps/api && bun test tests/integration/fx-14-visit-sign-completes-stage.test.ts --env-file=../../.env
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
  InvalidTransitionError,
  StageNotAcceptedError,
} from '../../src/modules/clinical/treatment-plans/treatment-plans.transitions.ts';
import { updateVisitNoteSchema } from '../../src/modules/clinical/visit-notes/visit-notes.schema.ts';
import {
  createVisitNotesService,
  VisitStageRepointError,
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
            ? { id: undefined }
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
    .values({ phone: '+998900000014', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX14 Clinic', slug: 'fx14-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;
  await inTenant(async (tx) => {
    await tx.insert(branches).values({ tenantId, name: 'Branch 1' });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'FX14 Bemor' })
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

describe('FX-14 — qoralama bosqichni yopmaydi, imzo yopadi', () => {
  test('qoralama → in_progress (completed EMAS, recall yo`q); imzo → completed + recall', async () => {
    recallCalls.length = 0;
    const stageId = await mkStage({});
    const note = await draft(stageId);
    expect(await stageStatus(stageId)).toBe('in_progress');
    expect(recallCalls).not.toContain(stageId);
    expect(note.completesStage).toBe(true);

    await sign(note.id);
    expect(await stageStatus(stageId)).toBe('completed');
    expect(recallCalls.filter((x) => x === stageId)).toHaveLength(1);
  });

  test('ko`p vizitli: completes_stage=false imzolansa ham bosqich in_progress; yakunlovchi vizit yopadi', async () => {
    recallCalls.length = 0;
    const stageId = await mkStage({});
    const first = await draft(stageId, { completesStage: false });
    expect(first.completesStage).toBe(false);
    await sign(first.id);
    expect(await stageStatus(stageId)).toBe('in_progress');
    expect(recallCalls).not.toContain(stageId);

    const last = await draft(stageId);
    expect(await stageStatus(stageId)).toBe('in_progress');
    await sign(last.id);
    expect(await stageStatus(stageId)).toBe('completed');
  });

  test('qoralama update: stageId keyin biriktirilsa ham faqat in_progress; completesStage PATCH', async () => {
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
    await inTenant((tx) =>
      visitService.update(ctx(tx), note.id, { stageId, completesStage: false }),
    );
    expect(await stageStatus(stageId)).toBe('in_progress');
    await sign(note.id);
    expect(await stageStatus(stageId)).toBe('in_progress');
  });

  test('allaqachon completed bosqichga keyingi vizit: qoralama va imzo xato bermaydi (idempotent)', async () => {
    const stageId = await mkStage({});
    const a = await draft(stageId);
    await sign(a.id);
    const b = await draft(stageId);
    await sign(b.id);
    expect(await stageStatus(stageId)).toBe('completed');
  });

  test('skipped bosqich: qoralama RAD (400 sinfi), orphan yozuv yo`q', async () => {
    const stageId = await mkStage({ status: 'skipped' });
    const before = await inTenant(async (tx) => (await tx.select().from(visitNotes)).length);
    await expect(draft(stageId)).rejects.toBeInstanceOf(InvalidTransitionError);
    const after = await inTenant(async (tx) => (await tx.select().from(visitNotes)).length);
    expect(after).toBe(before);
  });

  test('imzo paytida bosqich accepted emas → StageNotAcceptedError, vizit imzolanmaydi (rollback)', async () => {
    const stageId = await mkStage({});
    const note = await draft(stageId);
    await inTenant((tx) =>
      tx
        .update(treatmentStages)
        .set({ acceptance: 'proposed' })
        .where(eq(treatmentStages.id, stageId)),
    );
    await expect(sign(note.id)).rejects.toBeInstanceOf(StageNotAcceptedError);
    expect(await noteSigned(note.id)).toBeNull();
    expect(await stageStatus(stageId)).toBe('in_progress');
  });

  test('review: bog`langan qoralamani rejasiz qilib bo`lmaydi — null 400 (schema) va service RAD; bosqich saqlanadi', async () => {
    const stageId = await mkStage({});
    const note = await draft(stageId);
    // HTTP qatlami: PATCH { stageId: null } validatsiyadan o'tmaydi (400).
    expect(updateVisitNoteSchema.safeParse({ stageId: null }).success).toBe(false);
    // Service qatlami (schema chetlab o'tilsa ham): tozalash = qayta yo'naltirish → RAD.
    await expect(
      inTenant((tx) =>
        visitService.update(ctx(tx), note.id, { stageId: null as unknown as string }),
      ),
    ).rejects.toBeInstanceOf(VisitStageRepointError);
    // completesStage=false — «bu vizit bosqichni yopmaydi» yo'li ishlaydi.
    await inTenant((tx) => visitService.update(ctx(tx), note.id, { completesStage: false }));
    const [row] = await inTenant((tx) =>
      tx
        .select({ stageId: visitNotes.stageId, completesStage: visitNotes.completesStage })
        .from(visitNotes)
        .where(eq(visitNotes.id, note.id)),
    );
    expect(row).toEqual({ stageId, completesStage: false });
    await sign(note.id);
    expect(await stageStatus(stageId)).toBe('in_progress');
  });
});
