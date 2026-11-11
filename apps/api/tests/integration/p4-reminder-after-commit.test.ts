/**
 * P4 — afterCommit: eslatma side-effect'lari faqat COMMIT'dan keyin va best-effort.
 * Real DB (dental_app, FORCE RLS) + real Redis + real BullMQ Queue.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/p4-reminder-after-commit.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { patients, tenants, users } from '@dental/db-schema';
import { Queue } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { AFTER_COMMIT_TIMEOUT_MS, onAfterCommit } from '../../src/db/after-commit.ts';
import { db } from '../../src/db/client.ts';
import { getDb } from '../../src/db/scoped.ts';
import { reminderJobId } from '../../src/lib/reminder-job-id.ts';
import { createReminderScheduler } from '../../src/lib/reminder-scheduler.ts';
import { errorHandler } from '../../src/middleware/error-handler.ts';
import { rlsMiddleware } from '../../src/middleware/rls.ts';

let tenantId: string;
let ownerId: string;
const queue = new Queue('reminders-p4-test', { connection: { url: process.env.REDIS_URL } });
const scheduler = createReminderScheduler(queue);
// Haqiqiy o'lik Redis: hech narsa tinglamaydigan port. BullMQ bunda reject qilmaydi, osilib qoladi.
const deadQueue = new Queue('reminders-p4-dead', { connection: { url: 'redis://localhost:6399' } });
deadQueue.on('error', () => {});
const deadScheduler = createReminderScheduler(deadQueue);

const insertRow = async (c: Parameters<typeof getDb>[0], name: string) => {
  await getDb(c).insert(patients).values({ tenantId, fullName: name, phone: '+998901234567' });
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

const apptId = {
  commit: randomUUID(),
  rollback: randomUUID(),
  remove: randomUUID(),
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
  app.get('/commit', async (c) => {
    await insertRow(c, 'p4-commit');
    await onAfterCommit(c, () => scheduler.enqueueReminder(tenantId, apptId.commit, 60_000));
    return c.json({ ok: true });
  });
  app.get('/rollback', async (c) => {
    await insertRow(c, 'p4-rollback');
    await onAfterCommit(c, () => scheduler.enqueueReminder(tenantId, apptId.rollback, 60_000));
    throw new Error('boom');
  });
  app.get('/throws', async (c) => {
    await insertRow(c, 'p4-throws');
    await onAfterCommit(c, async () => {
      throw new Error('redis down');
    });
    return c.json({ ok: true });
  });
  app.get('/redis-down', async (c) => {
    await insertRow(c, 'p4-redis-down');
    await onAfterCommit(c, () => deadScheduler.enqueueReminder(tenantId, randomUUID(), 60_000));
    return c.json({ ok: true });
  });
  app.get('/remove', async (c) => {
    await insertRow(c, 'p4-remove');
    await onAfterCommit(c, () => scheduler.removeReminder(apptId.remove));
    return c.json({ ok: true });
  });
  return app;
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000092', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'P4', slug: 'p4-after-commit', ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await queue.obliterate({ force: true });
  await queue.close();
  await deadQueue.close().catch(() => {});
});

describe('P4 afterCommit', () => {
  const app = buildApp();

  test('commit enqueues after commit', async () => {
    const res = await app.request('/commit');
    expect(res.status).toBe(200);
    expect(await queue.getJob(reminderJobId(apptId.commit))).toBeTruthy();
    expect(await rowCount('p4-commit')).toBe(1);
  });

  test('rollback skips side-effect', async () => {
    const res = await app.request('/rollback');
    expect(res.status).toBe(500);
    expect(await queue.getJob(reminderJobId(apptId.rollback))).toBeFalsy();
    expect(await rowCount('p4-rollback')).toBe(0);
  });

  test('side-effect throws -> 200 and row committed', async () => {
    const res = await app.request('/throws');
    expect(res.status).toBe(200);
    expect(await rowCount('p4-throws')).toBe(1);
  });

  test('real dead Redis -> bounded response time, 200 and row committed', async () => {
    const t0 = Date.now();
    const res = await app.request('/redis-down');
    const elapsed = Date.now() - t0;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(AFTER_COMMIT_TIMEOUT_MS + 3000);
    expect(await rowCount('p4-redis-down')).toBe(1);
  });

  test('removeReminder after commit', async () => {
    await scheduler.enqueueReminder(tenantId, apptId.remove, 60_000);
    expect(await queue.getJob(reminderJobId(apptId.remove))).toBeTruthy();
    const res = await app.request('/remove');
    expect(res.status).toBe(200);
    expect(await queue.getJob(reminderJobId(apptId.remove))).toBeFalsy();
  });
});
