/**
 * CLI-457 — navbat tiket raqami race condition. `queue.service.ts::create()`
 * `MAX(queueNumber)+1`ni qulfsiz hisoblaydi; `ticketDate` mikrosekund-aniq
 * `defaultNow()` bo'lgani uchun `UNIQUE(tenantId,branchId,ticketDate,queueNumber)`
 * hech qachon to'qnashmaydi — parallel so'rovlar bir xil queueNumber olishi mumkin.
 *
 * Bitta faylni ALOHIDA ishlating (TRUNCATE race):
 *   cd apps/api && bun test tests/integration/queue-ticket-race.test.ts --env-file=../../.env
 */
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { branches, patients, queueTickets, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createQueueService } from '../../src/modules/queue/queue.service.ts';

let tenantId: string;
let ownerId: string;
let branchId: string;
let patientId: string;

const ctx = (tx: DbOrTx, tId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db' ? tx : k === 'activeTenantId' ? tId : k === 'user' ? { id: ownerId } : undefined,
  }) as unknown as Context;

const run = <T>(tId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tId}'`));
    return fn(ctx(tx, tId));
  });

const noopAudit = { record: async () => {} };
const queue = createQueueService({ audit: noopAudit });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000457', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Q-Race', slug: 'q-race', ownerUserId: ownerId, defaultLanguage: 'uz' })
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
      .values({ tenantId, fullName: 'Race Patient' })
      .returning({ id: patients.id });
    patientId = p!.id;
  });
});

beforeEach(async () => {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.execute(sql`DELETE FROM queue_tickets`);
  });
});

describe('CLI-457 queue ticket number race condition', () => {
  test('N concurrent walk-in creates → N distinct sequential queue numbers', async () => {
    const N = 20;
    // allSettled — qulfsiz race ikki shaklda namoyon bo'lishi mumkin: (a) jim
    // duplikat queueNumber (odatiy holat — mikrosekund-aniq ticketDate tufayli
    // unique constraint deyarli hech qachon to'qnashmaydi) yoki (b) tasodifiy
    // transaction-timestamp to'qnashuvi bilan 23505 xato. Ikkalasi ham tuzatilmagan
    // holatda assertion'larni buzadi (rad etilgan promise YOKI duplikat raqamlar).
    const settled = await Promise.allSettled(
      Array.from({ length: N }, () =>
        run(tenantId, (c) => queue.create(c, { branchId, patientId })),
      ),
    );

    const fulfilled = settled.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(N);

    const numbers = fulfilled
      .map((r) => (r as PromiseFulfilledResult<{ queueNumber: number }>).value.queueNumber)
      .sort((a, b) => a - b);
    const distinct = new Set(numbers);

    expect(distinct.size).toBe(N);
    expect(numbers).toEqual(Array.from({ length: N }, (_, i) => i + 1));

    // DB darajasida ham tasdiqlaymiz — jadvalda aynan N qator, N ta distinct raqam.
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select({ queueNumber: queueTickets.queueNumber })
        .from(queueTickets)
        .where(sql`${queueTickets.branchId} = ${branchId}`);
    });
    expect(rows.length).toBe(N);
    expect(new Set(rows.map((r) => r.queueNumber)).size).toBe(N);
  });
});
