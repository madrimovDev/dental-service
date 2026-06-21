/**
 * CLI-190 — Visit-note template CRUD + visibility + RLS izolyatsiya (M9).
 *
 * Tekshiradi (REAL DB, RLS-bound transaction'lar — service+repository qatlami):
 *   - CRUD: create / list / update / delete ishlaydi
 *   - isShared visibility: A'ning SHARED template'i B (xuddi shu tenant)'ga ko'rinadi;
 *     A'ning PRIVATE (isShared=false) template'i B'ga KO'RINMAYDI
 *   - Mutation owner-scoping: B A'ning template'ini update/delete qila OLMAYDI (null → 404)
 *   - RLS tenant izolyatsiyasi: 2-tenant 1-tenant template'larini KO'RMAYDI
 *
 * Diskriminator: visibility USER-scoped, shuning uchun BIR tenantda IKKI user kerak.
 * Permission emas, query filtri sinaladi (@owner buni maskalay olmaydi).
 *
 * Talab: Postgres running, DATABASE_URL .env'da, migration + RLS DDL apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-190`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createVisitNoteTemplatesService } from '../../src/modules/clinical/visit-notes/visit-note-templates.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createVisitNoteTemplatesService({ audit: noopAudit });

const ctx = (tx: DbOrTx, tenantId: string, userId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: userId }
            : undefined,
  }) as unknown as Context;

/** Har `run` — RLS uchun SET LOCAL bilan tenant-scoped (commit qilinadigan) tx. */
const run = <T>(tenantId: string, userId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx, tenantId, userId));
  });

let tenantA: string;
let tenantB: string;
let doctorA: string; // tenant A doctor 1 (template owner)
let doctorB: string; // tenant A doctor 2 (other doctor, same tenant)
let ownerB: string; // tenant B owner (cross-tenant)

beforeAll(async () => {
  const [uA] = await db
    .insert(users)
    .values({ phone: '+998900000190', passwordHash: 'x', fullName: 'Doctor A' })
    .returning({ id: users.id });
  const [uB] = await db
    .insert(users)
    .values({ phone: '+998900000191', passwordHash: 'x', fullName: 'Doctor B' })
    .returning({ id: users.id });
  const [uC] = await db
    .insert(users)
    .values({ phone: '+998900000192', passwordHash: 'x', fullName: 'Owner B' })
    .returning({ id: users.id });
  if (!uA || !uB || !uC) throw new Error('seed failed: users');
  doctorA = uA.id;
  doctorB = uB.id;
  ownerB = uC.id;

  const [tA] = await db
    .insert(tenants)
    .values({ name: 'Clinic A', slug: 'clinic-a-190', ownerUserId: doctorA })
    .returning({ id: tenants.id });
  const [tB] = await db
    .insert(tenants)
    .values({ name: 'Clinic B', slug: 'clinic-b-190', ownerUserId: ownerB })
    .returning({ id: tenants.id });
  if (!tA || !tB) throw new Error('seed failed: tenants');
  tenantA = tA.id;
  tenantB = tB.id;
});

afterAll(async () => {
  if (tenantA) await db.execute(sql`DELETE FROM tenants WHERE id = ${tenantA}`);
  if (tenantB) await db.execute(sql`DELETE FROM tenants WHERE id = ${tenantB}`);
  for (const id of [doctorA, doctorB, ownerB]) {
    if (id) await db.execute(sql`DELETE FROM users WHERE id = ${id}`);
  }
});

describe('CLI-190 visit-note templates — CRUD', () => {
  test('create returns row with tenant + createdBy from context', async () => {
    const row = await run(tenantA, doctorA, (c) =>
      service.create(c, {
        name: 'Standart korik',
        category: 'umumiy',
        template: { subjective: 'Shikoyat', plan: 'Reja' },
        isShared: false,
      }),
    );
    expect(row).not.toBeNull();
    expect(row?.tenantId).toBe(tenantA);
    expect(row?.createdBy).toBe(doctorA);
    expect(row?.name).toBe('Standart korik');
    expect(row?.template.subjective).toBe('Shikoyat');
  });

  test('owner can update own template', async () => {
    const created = await run(tenantA, doctorA, (c) =>
      service.create(c, { name: 'Edit me', template: {}, isShared: false }),
    );
    const updated = await run(tenantA, doctorA, (c) =>
      service.update(c, created!.id, { name: 'Edited' }),
    );
    expect(updated?.name).toBe('Edited');
  });

  test('empty PATCH is a no-op — returns row unchanged (no Drizzle SET {} throw)', async () => {
    const created = await run(tenantA, doctorA, (c) =>
      service.create(c, { name: 'No-op', template: { plan: 'keep' }, isShared: false }),
    );
    const updated = await run(tenantA, doctorA, (c) => service.update(c, created!.id, {}));
    expect(updated).not.toBeNull();
    expect(updated?.name).toBe('No-op');
    expect(updated?.template.plan).toBe('keep');
  });

  test('owner can delete own template', async () => {
    const created = await run(tenantA, doctorA, (c) =>
      service.create(c, { name: 'Delete me', template: {}, isShared: false }),
    );
    const removed = await run(tenantA, doctorA, (c) => service.remove(c, created!.id));
    expect(removed?.id).toBe(created!.id);
    const after = await run(tenantA, doctorA, (c) => service.list(c));
    expect(after.some((r) => r.id === created!.id)).toBe(false);
  });
});

describe('CLI-190 visit-note templates — isShared visibility (two users, same tenant)', () => {
  test('A SHARED template visible to B; A PRIVATE template NOT visible to B', async () => {
    const shared = await run(tenantA, doctorA, (c) =>
      service.create(c, { name: 'Shared tpl', template: {}, isShared: true }),
    );
    const priv = await run(tenantA, doctorA, (c) =>
      service.create(c, { name: 'Private tpl', template: {}, isShared: false }),
    );

    const bList = await run(tenantA, doctorB, (c) => service.list(c));
    const bIds = bList.map((r) => r.id);
    expect(bIds).toContain(shared!.id); // shared → visible to other doctor
    expect(bIds).not.toContain(priv!.id); // private → invisible to other doctor

    // A sees both (owner)
    const aList = await run(tenantA, doctorA, (c) => service.list(c));
    const aIds = aList.map((r) => r.id);
    expect(aIds).toContain(shared!.id);
    expect(aIds).toContain(priv!.id);
  });

  test('B cannot update or delete A template (owner-scoped mutation → 404/null)', async () => {
    const aTpl = await run(tenantA, doctorA, (c) =>
      service.create(c, { name: 'A only', template: {}, isShared: true }),
    );
    const upd = await run(tenantA, doctorB, (c) =>
      service.update(c, aTpl!.id, { name: 'hijacked' }),
    );
    expect(upd).toBeNull(); // not owner → route returns 404
    const del = await run(tenantA, doctorB, (c) => service.remove(c, aTpl!.id));
    expect(del).toBeNull();
    // still intact + unchanged
    const stillThere = await run(tenantA, doctorA, (c) => service.list(c));
    expect(stillThere.find((r) => r.id === aTpl!.id)?.name).toBe('A only');
  });
});

describe('CLI-190 visit-note templates — RLS tenant isolation', () => {
  test('tenant B does NOT see tenant A templates (even shared)', async () => {
    await run(tenantA, doctorA, (c) =>
      service.create(c, { name: 'A tenant shared', template: {}, isShared: true }),
    );
    const bList = await run(tenantB, ownerB, (c) => service.list(c));
    expect(bList.every((r) => r.tenantId === tenantB)).toBe(true);
    expect(bList.some((r) => r.name === 'A tenant shared')).toBe(false);
  });
});
