import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditService } from '../../src/modules/audit/audit.service.ts';

const service = createAuditService();
const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db' ? tx : k === 'accessClaims' ? { perms: ['@owner'] } : undefined,
  }) as unknown as Context;

let tenantId: string;
let userId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000099', passwordHash: 'x', fullName: 'Activity User' })
    .returning({ id: users.id });
  userId = owner!.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'ActivityClin', slug: 'activity-clin', ownerUserId: userId })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  // Insert 20 audit rows (> limit of 15), with before/after JSON set
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    const rows = Array.from({ length: 20 }, (_, i) => ({
      tenantId,
      userId,
      action: i % 2 === 0 ? 'created' : 'updated',
      resourceType: 'patient',
      resourceId: '00000000-0000-0000-0000-000000000001' as string | null,
      before: { name: `Before ${i}` } as unknown,
      after: { name: `After ${i}` } as unknown,
      createdAt: new Date(Date.now() - i * 60_000), // each 1 min apart
    }));

    await tx.insert(auditLog).values(rows);
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const run = <T>(fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx));
  });

describe('ds12-a — activity feed (audit recent, metadata-only)', () => {
  test('recent: metadata-only, before/after YOQ, DESC, limit 15', async () => {
    const rows = await run((c) => service.recent(c, 15));

    // Results returned
    expect(rows.length).toBeGreaterThan(0);
    // Limit honored — no more than 15 (we inserted 20)
    expect(rows.length).toBeLessThanOrEqual(15);
    expect(rows.length).toBe(15);

    // SECURITY: no before/after in any row
    for (const r of rows) {
      expect(r).not.toHaveProperty('before');
      expect(r).not.toHaveProperty('after');
    }

    // DESC order: first row is newest
    expect(new Date(rows[0]!.createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(rows[rows.length - 1]!.createdAt).getTime(),
    );
  });

  test('recent: actorName populated from users JOIN', async () => {
    const rows = await run((c) => service.recent(c, 5));
    // All rows should have actorName = 'Activity User' (userId is set for all)
    for (const r of rows) {
      expect(r.actorName).toBe('Activity User');
    }
  });

  test('recent: default limit = 15', async () => {
    const rows = await run((c) => service.recent(c));
    expect(rows.length).toBe(15);
  });

  test('recent: custom limit honored', async () => {
    const rows = await run((c) => service.recent(c, 5));
    expect(rows.length).toBe(5);
  });

  test('recent: required fields present (id, action, resourceType, createdAt)', async () => {
    const rows = await run((c) => service.recent(c, 1));
    const row = rows[0]!;
    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('action');
    expect(row).toHaveProperty('resourceType');
    expect(row).toHaveProperty('createdAt');
    expect(row).toHaveProperty('actorName');
    expect(row).toHaveProperty('resourceId');
  });

  test('recent: actorName null when userId is null', async () => {
    // Insert a row with no userId
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await tx.insert(auditLog).values({
        tenantId,
        userId: null,
        action: 'login',
        resourceType: 'auth',
        before: null,
        after: null,
        createdAt: new Date(Date.now() + 100_000), // newest
      });
    });

    const rows = await run((c) => service.recent(c, 1));
    expect(rows[0]!.actorName).toBeNull();
  });
});
