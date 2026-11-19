/**
 * FX-131 (LC-09) — `/expenses` ekrani `expense.view` bilan ochiladi, lekin kategoriya
 * ro'yxati (`GET /expense-categories`) `expense.manage` talab qilardi → faqat-ko'ruvchida
 * nom ustuni bo'sh. Endi o'qish `expense.view` bilan; yozish `expense.manage` da qoladi.
 * REAL HTTP + real DB + cheklangan permset.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-131-expense-categories-view.test.ts`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { expenseCategories, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

let tenantId: string;
let userId: string;

const call = async (perms: string[], method: string, path: string, body?: unknown) => {
  const { token } = await signAccess({
    sub: userId,
    atid: tenantId,
    abid: null,
    perms,
    roleKey: 'x',
    lang: 'uz',
  });
  return createApp().request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900131001', passwordHash: 'x', fullName: 'U131' })
    .returning({ id: users.id });
  userId = u!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX131', slug: 'fx131', ownerUserId: userId })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.insert(expenseCategories).values({ tenantId, name: 'Ijara', nameRu: 'Аренда' });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-131 — kategoriya ro`yxati expense.view bilan', () => {
  test('expense.view (manage yo`q) — 200 va kategoriyalar', async () => {
    const res = await call(['expense.view'], 'GET', '/expense-categories');
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { name: string }[] };
    expect(data.map((c) => c.name)).toEqual(['Ijara']);
  });

  test('ruxsatsiz — 403', async () => {
    const res = await call(['patient.view'], 'GET', '/expense-categories');
    expect(res.status).toBe(403);
  });

  test('expense.view bilan yaratish — hali 403 (yozish expense.manage)', async () => {
    const res = await call(['expense.view'], 'POST', '/expense-categories', {
      name: 'Yangi',
      nameRu: 'Новая',
    });
    expect(res.status).toBe(403);
  });
});
