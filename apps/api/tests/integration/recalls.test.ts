/**
 * Epic B (Recall / Revisit) integratsiya testlari — real DB + RLS.
 * B3 (CRUD), B4 (auto-create + idempotentlik), B5 (rebook-close).
 *
 * Bitta faylni ALOHIDA ishlating (TRUNCATE race — to'liq parallel suite emas):
 *   cd apps/api && bun test tests/integration/recalls.test.ts --env-file=../../.env
 */
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { branches, patients, recalls, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createRecallsService } from '../../src/modules/recalls/recalls.service.ts';

let tenantId: string;
let ownerId: string;
let branchId: string;
let patientId: string;

const ctx = (tx: DbOrTx, tId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tId
          : k === 'user'
            ? { id: ownerId }
            : k === 'accessClaims'
              ? { perms: ['@owner'] }
              : undefined,
  }) as unknown as Context;

const run = <T>(tId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tId}'`));
    return fn(ctx(tx, tId));
  });

const noopAudit = { record: async () => {} };
const svc = createRecallsService({ audit: noopAudit });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000090', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'R', slug: 'r-recall', ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [b] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B' })
      .returning({ id: branches.id });
    branchId = b!.id;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Ali Valiyev', phone: '+998901112233' })
      .returning({ id: patients.id });
    patientId = p!.id;
  });
});

const clearRecalls = () =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.delete(recalls);
  });

describe('B3 recalls CRUD', () => {
  beforeEach(clearRecalls);

  test('create → list (dashboard) → patient join (name/phone)', async () => {
    const created = await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'manual', dueDate: '2026-06-01' }),
    );
    expect(created).not.toBeNull();
    expect(created!.status).toBe('pending');
    expect(created!.source).toBe('manual');
    expect(created!.patientName).toBe('Ali Valiyev');
    expect(created!.patientPhone).toBe('+998901112233');

    // Dashboard default — pending + due <= date.
    const list = await run(tenantId, (c) => svc.list(c, { date: '2026-06-21' }));
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(created!.id);
  });

  test('list status filter — contacted excluded by default pending filter', async () => {
    await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'manual', dueDate: '2026-06-01' }),
    );
    const created = await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'preventive', dueDate: '2026-06-02' }),
    );
    await run(tenantId, (c) => svc.markContacted(c, created!.id, {}));

    const pendingOnly = await run(tenantId, (c) => svc.list(c, { date: '2026-06-21' }));
    expect(pendingOnly.length).toBe(1);
    const contactedOnly = await run(tenantId, (c) =>
      svc.list(c, { date: '2026-06-21', status: 'contacted' }),
    );
    expect(contactedOnly.length).toBe(1);
    expect(contactedOnly[0]!.id).toBe(created!.id);
  });

  test('markContacted → status=contacted, attempts++ , lastContactedAt set', async () => {
    const created = await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'manual', dueDate: '2026-06-01' }),
    );
    const r = await run(tenantId, (c) =>
      svc.markContacted(c, created!.id, { notes: 'qo‘ng‘iroq' }),
    );
    expect(r!.status).toBe('contacted');
    expect(r!.contactAttempts).toBe(1);
    expect(r!.lastContactedAt).not.toBeNull();
    expect(r!.notes).toBe('qo‘ng‘iroq');
  });

  test('update status=scheduled → closedBy/closedAt set, scheduledAppointmentId stored', async () => {
    const created = await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'manual', dueDate: '2026-06-01' }),
    );
    const apptId = crypto.randomUUID();
    const r = await run(tenantId, (c) =>
      svc.update(c, created!.id, { status: 'scheduled', scheduledAppointmentId: apptId }),
    );
    expect(r!.status).toBe('scheduled');
    expect(r!.scheduledAppointmentId).toBe(apptId);
    expect(r!.closedBy).toBe(ownerId);
    expect(r!.closedAt).not.toBeNull();
  });

  test('listByPatient returns all statuses', async () => {
    const a = await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'manual', dueDate: '2026-06-01' }),
    );
    await run(tenantId, (c) => svc.update(c, a!.id, { status: 'dismissed' }));
    await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'preventive', dueDate: '2026-07-01' }),
    );
    const all = await run(tenantId, (c) => svc.listByPatient(c, patientId));
    expect(all.length).toBe(2);
  });

  test('getById of missing → null', async () => {
    const r = await run(tenantId, (c) => svc.getById(c, crypto.randomUUID()));
    expect(r).toBeNull();
  });
});
