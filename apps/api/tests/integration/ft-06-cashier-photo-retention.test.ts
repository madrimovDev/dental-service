/**
 * FT-06.3 — kassa rasmi 90 kunlik retention (REAL DB + REAL fayl-tizimi + REAL Redis/BullMQ).
 *  - 90 kundan eski qator + fayl o'chadi; yangi (89 kun) ikkalasi saqlanadi;
 *  - rasmsiz (skipped) eski qator ham o'chadi; fayli allaqachon yo'q eski qator ham o'chadi;
 *  - fayl o'chirish xato bersa qator SAQLANADI (keyingi kun qayta uriniladi), boshqa qatorlar davom etadi;
 *  - cross-tenant: ikkala tenant qatorlari bitta sweep'da tozalanadi (admin ulanish);
 *  - scheduler (real Redis) idempotent: bitta repeatable job, Toshkent 03:00.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/ft-06-cashier-photo-retention.test.ts`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  branches,
  cashierTransactionPhotos,
  cashierTransactions,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createAdminDb, db } from '../../src/db/client.ts';
import {
  CASHIER_PHOTO_RETENTION_CRON,
  processCashierPhotoRetention,
  registerCashierPhotoRetentionScheduler,
} from '../../src/lib/cashier-photo-retention.ts';
import { cashierPhotoQueue } from '../../src/lib/queue.ts';
import { createLocalStorageAdapter } from '../../src/lib/storage.ts';

const dir = await mkdtemp(join(tmpdir(), 'ft063-ret-'));
const storage = createLocalStorageAdapter(dir);
const admin = createAdminDb();
const DAY = 86_400_000;
const now = new Date('2026-11-20T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);

const tenantIds: string[] = [];
const txIds: string[] = [];

const mkTx = async (tenantId: string, branchId: string) => {
  const [t] = await admin.db
    .insert(cashierTransactions)
    .values({
      tenantId,
      branchId,
      totalAmount: '1',
      paidAmount: '1',
      paymentMethod: 'cash',
    })
    .returning({ id: cashierTransactions.id });
  return t?.id ?? '';
};

const keyOf = (tenantId: string, txId: string, name: string) =>
  `tenants/${tenantId}/cashier-photos/${txId}/${name}.jpg`;

const rows = () => admin.db.select().from(cashierTransactionPhotos);

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900006351', passwordHash: 'x', fullName: 'Ret' })
    .returning({ id: users.id });
  const ts = await db
    .insert(tenants)
    .values([
      { name: 'R1', slug: 'ft063-r1', ownerUserId: u?.id ?? '' },
      { name: 'R2', slug: 'ft063-r2', ownerUserId: u?.id ?? '' },
    ])
    .returning({ id: tenants.id });
  for (const t of ts) {
    tenantIds.push(t.id);
    const [b] = await admin.db
      .insert(branches)
      .values({ tenantId: t.id, name: 'B' })
      .returning({ id: branches.id });
    for (let i = 0; i < 4; i++) txIds.push(await mkTx(t.id, b?.id ?? ''));
  }
});

afterAll(async () => {
  for (const r of await cashierPhotoQueue.getRepeatableJobs()) {
    await cashierPhotoQueue.removeRepeatableByKey(r.key);
  }
  await cashierPhotoQueue.close();
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end({ timeout: 5 });
  await rm(dir, { recursive: true, force: true });
});

describe('FT-06.3 retention sweep', () => {
  test('90 kundan eskisi o‘chadi (fayl + qator), yangisi saqlanadi; skipped/yo‘q fayl ham; cross-tenant', async () => {
    const [t1, t2] = tenantIds as [string, string];
    const [a1, a2, a3, a4, b1, b2] = txIds as string[] as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const data = Buffer.from('x');
    const fresh = keyOf(t1, a1, 'fresh');
    const old1 = keyOf(t1, a2, 'old');
    const oldNoFile = keyOf(t1, a3, 'gone'); // diskda hech qachon yozilmagan
    const old2 = keyOf(t2, b1, 'old2');
    for (const k of [fresh, old1, old2]) await storage.save(k, data);

    await admin.db.insert(cashierTransactionPhotos).values([
      { tenantId: t1, transactionId: a1, objectKey: fresh, capturedAt: ago(89) },
      { tenantId: t1, transactionId: a2, objectKey: old1, capturedAt: ago(91) },
      { tenantId: t1, transactionId: a3, objectKey: oldNoFile, capturedAt: ago(120) },
      { tenantId: t1, transactionId: a4, skippedReason: 'no_camera', capturedAt: ago(100) },
      { tenantId: t2, transactionId: b1, objectKey: old2, capturedAt: ago(95) },
      { tenantId: t2, transactionId: b2, skippedReason: 'error', capturedAt: ago(10) },
    ]);

    const res = await processCashierPhotoRetention({ adminDb: admin.db, storage, now });
    expect(res).toEqual({ deleted: 4, failed: 0 });

    const left = await rows();
    expect(left.map((r) => r.transactionId).sort()).toEqual([a1, b2].sort());
    expect(await storage.exists(fresh)).toBe(true);
    expect(await storage.exists(old1)).toBe(false);
    expect(await storage.exists(old2)).toBe(false);

    // Idempotent — qayta yurgizilganda hech narsa o'zgarmaydi.
    expect(await processCashierPhotoRetention({ adminDb: admin.db, storage, now })).toEqual({
      deleted: 0,
      failed: 0,
    });
  });

  test('fayl o‘chirish xato bersa qator SAQLANADI, qolganlari davom etadi', async () => {
    const t2 = tenantIds[1] as string;
    const b3 = txIds[6] as string;
    const b4 = txIds[7] as string;
    const locked = keyOf(t2, b3, 'locked');
    const fine = keyOf(t2, b4, 'fine');
    await storage.save(locked, Buffer.from('x'));
    await storage.save(fine, Buffer.from('x'));
    await admin.db.insert(cashierTransactionPhotos).values([
      { tenantId: t2, transactionId: b3, objectKey: locked, capturedAt: ago(100) },
      { tenantId: t2, transactionId: b4, objectKey: fine, capturedAt: ago(100) },
    ]);
    const failing = {
      ...storage,
      remove: async (key: string) => {
        if (key === locked) throw new Error('EACCES');
        return storage.remove(key);
      },
    };
    const res = await processCashierPhotoRetention({ adminDb: admin.db, storage: failing, now });
    expect(res).toEqual({ deleted: 1, failed: 1 });
    const ids = (await rows()).map((r) => r.transactionId);
    expect(ids).toContain(b3);
    expect(ids).not.toContain(b4);
    expect(await storage.exists(locked)).toBe(true);
    expect(await storage.exists(fine)).toBe(false);
  });
});

describe('FT-06.3 retention scheduler (real Redis)', () => {
  test('repeatable job bir marta (idempotent), Toshkent 03:00', async () => {
    await registerCashierPhotoRetentionScheduler();
    await registerCashierPhotoRetentionScheduler();
    const jobs = (await cashierPhotoQueue.getRepeatableJobs()).filter(
      (j) => j.pattern === CASHIER_PHOTO_RETENTION_CRON,
    );
    expect(jobs).toHaveLength(1);
    expect(CASHIER_PHOTO_RETENTION_CRON).toBe('0 22 * * *'); // 22:00 UTC = 03:00 Asia/Tashkent
  });
});
