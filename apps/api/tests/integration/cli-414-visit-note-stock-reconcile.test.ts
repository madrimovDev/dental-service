/**
 * CLI-414 — visit-note UPDATE reconciliation WIRING (REAL DB).
 *
 * ⚠️ SCOPE NOTE: this test verifies ONLY the visit-notes.service.ts plumbing —
 * that `update()` calls the injected `reconcileStock` hook with the correct
 * (before, after, visitNoteId) args exactly when `input.performedServices !==
 * undefined`, and does NOT call it when the field is omitted. The multiset-diff
 * arithmetic and actual stock movement writes are `stock.service.ts`'s
 * `reconcileForServices` implementation — STOCK agent's responsibility, NOT
 * exercised here (a spy stands in for it). See
 * `docs/audit-fixes/CLI-414-visit-note-stock-reconciliation.md` §3 for the
 * full semantics table this hook is expected to implement once wired for real
 * in `clinical.routes.ts` (currently a documented optional-cast — see that
 * file's CLI-414 comment).
 *
 * ⚠️ Infra DOWN paytida YOZILGAN, LEKIN ISHGA TUSHIRILMAGAN.
 *   cd apps/api && bun test tests/integration/cli-414-visit-note-stock-reconcile.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patients, services, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createVisitNotesService } from '../../src/modules/clinical/visit-notes/visit-notes.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;

type ReconcileCall = { before: string[]; after: string[]; visitNoteId: string };
let reconcileCalls: ReconcileCall[] = [];
const reconcileSpy = async (
  _c: Context,
  before: string[],
  after: string[],
  visitNoteId: string,
) => {
  reconcileCalls.push({ before, after, visitNoteId });
};

const service = createVisitNotesService({ audit: noopAudit, reconcileStock: reconcileSpy });

const ctx = (tx: DbOrTx, tenantId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db' ? tx : k === 'activeTenantId' ? tenantId : k === 'user' ? undefined : undefined,
  }) as unknown as Context;

let tenantId: string;
let ownerId: string;
let patientId: string;
let serviceXId: string;
let serviceYId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000414', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Reconcile Clinic', slug: 'reconcile-clinic-414', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Reconcile Bemor' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;

    const [sx] = await tx
      .insert(services)
      .values({ tenantId, code: 'SVC-X-414', nameUz: 'X', nameRu: 'X' })
      .returning({ id: services.id });
    const [sy] = await tx
      .insert(services)
      .values({ tenantId, code: 'SVC-Y-414', nameUz: 'Y', nameRu: 'Y' })
      .returning({ id: services.id });
    if (!sx || !sy) throw new Error('service insert failed');
    serviceXId = sx.id;
    serviceYId = sy.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-414 — visit-notes update() reconcileStock wiring', () => {
  test('performedServices provided → reconcileStock called with (before, after, id)', async () => {
    reconcileCalls = [];
    const noteId = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const note = await service.create(ctx(tx, tenantId), {
        patientId,
        doctorId: ownerId,
        assessmentDiagnoses: [],
        performedServices: [serviceXId],
      });
      if (!note) throw new Error('create failed');
      return note.id;
    });

    reconcileCalls = []; // create() uses deductStock, not reconcileStock — reset before update
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.update(ctx(tx, tenantId), noteId, {
        performedServices: [serviceXId, serviceYId],
      });
    });

    expect(reconcileCalls.length).toBe(1);
    expect(reconcileCalls[0]?.before).toEqual([serviceXId]);
    expect(reconcileCalls[0]?.after).toEqual([serviceXId, serviceYId]);
    expect(reconcileCalls[0]?.visitNoteId).toBe(noteId);
  });

  test('performedServices OMITTED (undefined) → reconcileStock NOT called', async () => {
    const noteId = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const note = await service.create(ctx(tx, tenantId), {
        patientId,
        doctorId: ownerId,
        assessmentDiagnoses: [],
        performedServices: [serviceXId],
      });
      if (!note) throw new Error('create failed');
      return note.id;
    });

    reconcileCalls = [];
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.update(ctx(tx, tenantId), noteId, { subjective: 'no service change' });
    });

    expect(reconcileCalls.length).toBe(0);
  });

  test('performedServices explicitly cleared ([]) → reconcileStock called with after=[]', async () => {
    const noteId = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const note = await service.create(ctx(tx, tenantId), {
        patientId,
        doctorId: ownerId,
        assessmentDiagnoses: [],
        performedServices: [serviceXId],
      });
      if (!note) throw new Error('create failed');
      return note.id;
    });

    reconcileCalls = [];
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.update(ctx(tx, tenantId), noteId, { performedServices: [] });
    });

    expect(reconcileCalls.length).toBe(1);
    expect(reconcileCalls[0]?.before).toEqual([serviceXId]);
    expect(reconcileCalls[0]?.after).toEqual([]);
  });
});
