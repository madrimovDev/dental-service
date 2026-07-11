/**
 * CLI-481 — visit-note stage RE-POINT phantom-completed + orphan recall (REAL DB).
 *
 * Muammo (audit 2026-07-10): visit-note UPDATE yangi `stageId` berilsa faqat YANGI
 * bosqichni `completed` qiladi (+ uning recall'ini fire qiladi); ESKI bosqich
 * `completed` (terminal) qolib ketadi — endi hech bir vizit unga ishora qilmaydi
 * (phantom-completed) va uning auto-recall'i orphan bo'ladi. Bitta re-point ikkita
 * completed bosqich + ikkita recall yaratadi.
 *
 * FIX (blok): bir vizit yozuvi allaqachon bir bosqichni `completed` qilgan bo'lsa
 * (`before.stageId` non-null), uni BOSHQA bosqichga (yoki null'ga) qayta yo'naltirish
 * RAD etiladi (VisitStageRepointError → InvalidTransitionError → routes 400). Eski
 * bosqich legitim `completed` bo'lib qoladi, phantom/orphan yaratilmaydi.
 *
 * Tasdiqlaydi:
 *   1) stageId=A bilan vizit → A `completed`, A-recall fire.
 *   2) shu vizitni stageId=B ga re-point → InvalidTransitionError (blok).
 *   3) B `pending` qoladi (phantom completed EMAS), B-recall fire ETMAYDI.
 *   4) vizit hamon stageId=A (o'zgarmaydi).
 *
 * ⚠️ Faza-1'da ISHGA TUSHIRILMAYDI (yagona DB — serial verify ishlatadi).
 *   cd apps/api && bun test tests/integration/cli-481-visit-repoint.test.ts --env-file=../../.env
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
let stageAId: string;
let stageBId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000481', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Repoint Clinic', slug: 'repoint-clinic-481', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.insert(branches).values({ tenantId, name: 'Branch 1' });

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Repoint Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: ownerId, title: 'Reja', status: 'in_progress' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');

    const [a] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan.id,
        sequence: 1,
        serviceName: 'Stage A',
        cost: '100000',
        status: 'pending',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    const [b] = await tx
      .insert(treatmentStages)
      .values({
        treatmentPlanId: plan.id,
        sequence: 2,
        serviceName: 'Stage B',
        cost: '120000',
        status: 'pending',
        acceptance: 'accepted',
      })
      .returning({ id: treatmentStages.id });
    if (!a || !b) throw new Error('stage insert failed');
    stageAId = a.id;
    stageBId = b.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-481 — visit re-point blocked (no phantom completed, no orphan recall)', () => {
  let noteId: string;

  test('1) stageId=A bilan vizit → A completed + A-recall fire', async () => {
    recallCalls.length = 0;
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const note = await visitService.create(ctx(tx, tenantId), {
        patientId,
        doctorId: ownerId,
        stageId: stageAId,
        assessmentDiagnoses: [],
        performedServices: [],
      });
      if (!note) throw new Error('create failed');
      noteId = note.id;
      expect(note.stageId).toBe(stageAId);
    });
    expect(recallCalls).toContain(stageAId);
  });

  test('2) shu vizitni stageId=B ga re-point → InvalidTransitionError (blok)', async () => {
    recallCalls.length = 0;
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return visitService.update(ctx(tx, tenantId), noteId, { stageId: stageBId });
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  test('3) B pending qoladi (phantom completed EMAS), B-recall fire etmaydi', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const [stageB] = await tx
        .select({ status: treatmentStages.status })
        .from(treatmentStages)
        .where(eq(treatmentStages.id, stageBId));
      expect(stageB?.status).toBe('pending');
    });
    expect(recallCalls).not.toContain(stageBId);
  });

  test('4) vizit hamon stageId=A (o`zgarmaydi)', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const [note] = await tx
        .select({ stageId: visitNotes.stageId })
        .from(visitNotes)
        .where(eq(visitNotes.id, noteId));
      expect(note?.stageId).toBe(stageAId);
    });
  });
});
