import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { tenants, users } from '@dental/db-schema';
import { createNoOpChannel } from '@dental/notifications';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createNotificationsService } from '../../src/modules/notifications/notifications.service.ts';

// SMS yuborilmaydi (smsTo'siz test), NoOp baribir ulanadi.
const service = createNotificationsService({ sms: createNoOpChannel(() => {}) });

const ctx = (tx: DbOrTx, tenantId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'accessClaims'
            ? { perms: ['@owner'] }
            : undefined,
  }) as unknown as Context;

let tenantA: string;
let tenantB: string;
let userA: string;
let userB: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [u1] = await db
    .insert(users)
    .values({ phone: '+998900000030', passwordHash: 'x', fullName: 'A' })
    .returning({ id: users.id });
  userA = u1!.id;
  const [u2] = await db
    .insert(users)
    .values({ phone: '+998900000031', passwordHash: 'x', fullName: 'B' })
    .returning({ id: users.id });
  userB = u2!.id;

  const [t1] = await db
    .insert(tenants)
    .values({ name: 'A', slug: 'a-clinic', ownerUserId: userA })
    .returning({ id: tenants.id });
  tenantA = t1!.id;
  const [t2] = await db
    .insert(tenants)
    .values({ name: 'B', slug: 'b-clinic', ownerUserId: userB })
    .returning({ id: tenants.id });
  tenantB = t2!.id;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

/** Tenant-scoped tx ichida service chaqirish (HTTP konteksti taqlidi). */
const run = <T>(tenantId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx, tenantId));
  });

describe('notifications — real DB', () => {
  test('notifyInTx insert qiladi (tx + tenantId explicit)', async () => {
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantA}'`));
      return service.notifyInTx(tx, tenantA, {
        userId: userA,
        type: 'system',
        title: 'Salom',
        body: 'Tana',
      });
    });
    expect(row?.id).toBeTruthy();
    expect(row?.tenantId).toBe(tenantA);
    expect(row?.userId).toBe(userA);
    expect(row?.title).toBe('Salom');
    expect(row?.readAt).toBeNull();
  });

  test("list + unreadCount: feed va o'qilmagan soni", async () => {
    // userA uchun yana 2 ta qo'shamiz (jami 3)
    await run(tenantA, (c) => service.notify(c, { userId: userA, type: 'system', title: 'Ikki' }));
    await run(tenantA, (c) => service.notify(c, { userId: userA, type: 'system', title: 'Uch' }));

    const feed = await run(tenantA, (c) => service.list(c, userA, { page: 1, pageSize: 20 }));
    expect(feed.data.length).toBe(3);
    expect(feed.meta.total).toBe(3);
    expect(feed.unreadCount).toBe(3);
    // desc(createdAt) — eng yangisi birinchi
    expect(feed.data[0]?.title).toBe('Uch');

    const unread = await run(tenantA, (c) => service.unreadCount(c, userA));
    expect(unread).toBe(3);
  });

  test("markRead: bitta o'qilgan; userId guard", async () => {
    const feed = await run(tenantA, (c) => service.list(c, userA, { page: 1, pageSize: 20 }));
    const target = feed.data[0]!;

    const updated = await run(tenantA, (c) => service.markRead(c, target.id, userA));
    expect(updated?.readAt).not.toBeNull();

    const after = await run(tenantA, (c) => service.unreadCount(c, userA));
    expect(after).toBe(2);

    // boshqa user (userB) bu row'ga tegolmaydi → null
    const cross = await run(tenantA, (c) => service.markRead(c, target.id, userB));
    expect(cross).toBeNull();
  });

  test("markAllRead: barchasi o'qilgan", async () => {
    const res = await run(tenantA, (c) => service.markAllRead(c, userA));
    expect(res.count).toBe(2);
    const unread = await run(tenantA, (c) => service.unreadCount(c, userA));
    expect(unread).toBe(0);
  });

  test("RLS: tenant B userA feed'ini ko'rmaydi", async () => {
    // tenantB konteksti — userA ning notification'lari ko'rinmaydi (tenant scope)
    const feed = await run(tenantB, (c) => service.list(c, userA, { page: 1, pageSize: 20 }));
    expect(feed.data.length).toBe(0);
    expect(feed.meta.total).toBe(0);
    expect(feed.unreadCount).toBe(0);
  });
});
