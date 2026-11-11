/**
 * P1 — rlsMiddleware: xato (c.error) yoki 5xx javobda tranzaksiya ROLLBACK,
 * `fail()` bilan qaytarilgan 4xx esa COMMIT (qasddan). Real DB, real cheklangan
 * rol (DATABASE_URL = dental_app, FORCE RLS).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/p1-rls-rollback.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { fail, ok } from '@dental/core';
import { patients, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { db } from '../../src/db/client.ts';
import { getDb } from '../../src/db/scoped.ts';
import { errorHandler } from '../../src/middleware/error-handler.ts';
import { rlsMiddleware } from '../../src/middleware/rls.ts';

let tenantId: string;
let ownerId: string;

const insertRow = async (c: Parameters<typeof getDb>[0], name: string) => {
  await getDb(c).insert(patients).values({ tenantId, fullName: name, phone: '+998901234567' });
};

const buildApp = () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    c.set('activeTenantId', tenantId);
    c.set('user', { id: ownerId } as never);
    await next();
  });
  app.use('*', rlsMiddleware(db));
  app.get('/throw', async (c) => {
    await insertRow(c, 'p1-throw');
    throw new Error('boom');
  });
  app.get('/return500', async (c) => {
    await insertRow(c, 'p1-return500');
    return c.json(fail('x', 'x'), 500);
  });
  app.get('/http400', async (c) => {
    await insertRow(c, 'p1-http400');
    throw new HTTPException(400, { message: 'bad' });
  });
  app.get('/fail409', async (c) => {
    await insertRow(c, 'p1-fail409');
    return c.json(fail('conflict', 'c'), 409);
  });
  app.get('/ok', async (c) => {
    await insertRow(c, 'p1-ok');
    return c.json(ok({}), 200);
  });
  return app;
};

const rowCount = (name: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
    const rows = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.fullName, name));
    return rows.length;
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000091', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'P1', slug: 'p1-rollback', ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('P1 rlsMiddleware rollback', () => {
  const app = buildApp();

  test('throw -> 500 and rolled back', async () => {
    const res = await app.request('/throw');
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('internal_error');
    expect(await rowCount('p1-throw')).toBe(0);
  });

  test('returns 500 without throwing -> rolled back', async () => {
    const res = await app.request('/return500');
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('x');
    expect(await rowCount('p1-return500')).toBe(0);
  });

  test('thrown HTTPException 400 -> rolled back', async () => {
    const res = await app.request('/http400');
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe('bad');
    expect(await rowCount('p1-http400')).toBe(0);
  });

  test('returned 409 -> committed', async () => {
    const res = await app.request('/fail409');
    expect(res.status).toBe(409);
    expect(await rowCount('p1-fail409')).toBe(1);
  });

  test('200 -> committed', async () => {
    const res = await app.request('/ok');
    expect(res.status).toBe(200);
    expect(await rowCount('p1-ok')).toBe(1);
  });
});
