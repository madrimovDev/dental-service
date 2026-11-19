/**
 * FX-76 (LB) — rasm / lab-order fayli diskdan FAQAT commit'dan keyin o'chadi.
 * Tx rollback bo'lsa, DB qatori ham, fayl ham joyida qoladi.
 * REAL DB (RLS) + real lokal storage adapteri.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env fx-76`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  labOrderFiles,
  labOrders,
  patientImages,
  patients,
  tenants,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { type AfterCommitFn, runAfterCommit } from '../../src/db/after-commit.ts';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';

const uploadsDir = await mkdtemp(join(tmpdir(), 'fx-76-uploads-'));
process.env.UPLOADS_DIR = uploadsDir;

const { uploadObject, deleteObject } = await import('../../src/lib/s3.ts');
const { createPatientImagesService } = await import(
  '../../src/modules/patient-images/patient-images.service.ts'
);
const { createLabOrdersService } = await import(
  '../../src/modules/lab-orders/lab-orders.service.ts'
);

const audit = createAuditLogger({ db });
const imagesService = createPatientImagesService({ audit });
const labService = createLabOrdersService({ audit });

let tenantId: string;
let userId: string;
let patientId: string;
let labOrderId: string;

const ctx = (tx: DbOrTx, after: AfterCommitFn[]): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: userId }
            : k === 'accessClaims'
              ? { perms: ['@owner'] }
              : k === 'afterCommit'
                ? after
                : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const withTenant = <T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const fileExists = (key: string): Promise<boolean> => Bun.file(join(uploadsDir, key)).exists();

class Rollback extends Error {}

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900000076', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!u) throw new Error('user insert failed');
  userId = u.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX76', slug: 'fx-76', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!t) throw new Error('tenant insert failed');
  tenantId = t.id;
  await withTenant(async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;
    const [o] = await tx
      .insert(labOrders)
      .values({
        tenantId,
        patientId,
        doctorId: userId,
        labName: 'Lab',
        orderType: 'crown',
        items: [{ description: 'x' }],
      })
      .returning({ id: labOrders.id });
    if (!o) throw new Error('lab order insert failed');
    labOrderId = o.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await rm(uploadsDir, { recursive: true, force: true });
});

const seedImage = async (key: string) => {
  await uploadObject({ key, body: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' });
  const [row] = await withTenant((tx) =>
    tx
      .insert(patientImages)
      .values({
        tenantId,
        patientId,
        type: 'xray_periapical' as const,
        objectKey: key,
        originalFilename: 'a.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 3,
      })
      .returning({ id: patientImages.id }),
  );
  if (!row) throw new Error('image insert failed');
  expect(await fileExists(key)).toBe(true);
  return row.id;
};

const seedLabFile = async (key: string) => {
  await uploadObject({ key, body: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' });
  const [row] = await withTenant((tx) =>
    tx
      .insert(labOrderFiles)
      .values({
        tenantId,
        labOrderId,
        objectKey: key,
        originalFilename: 'a.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 3,
      })
      .returning({ id: labOrderFiles.id }),
  );
  if (!row) throw new Error('lab file insert failed');
  expect(await fileExists(key)).toBe(true);
  return row.id;
};

describe('FX-76 fayl o‘chirish commit’dan keyin', () => {
  test('patient image: tx rollback → fayl ham, qator ham joyida', async () => {
    const key = `tenants/${tenantId}/img-rollback.jpg`;
    const id = await seedImage(key);
    const after: AfterCommitFn[] = [];
    await expect(
      withTenant(async (tx) => {
        await imagesService.remove(ctx(tx, after), id);
        throw new Rollback('boom'); // tx rollback — afterCommit hech qachon ishlamaydi
      }),
    ).rejects.toBeInstanceOf(Rollback);

    expect(await fileExists(key)).toBe(true);
    const rows = await withTenant((tx) =>
      tx.select({ id: patientImages.id }).from(patientImages).where(eq(patientImages.id, id)),
    );
    expect(rows.length).toBe(1);
  });

  test('patient image: commit → afterCommit ishlagach fayl o‘chadi (oldin emas)', async () => {
    const key = `tenants/${tenantId}/img-commit.jpg`;
    const id = await seedImage(key);
    const after: AfterCommitFn[] = [];
    await withTenant((tx) => imagesService.remove(ctx(tx, after), id));
    expect(await fileExists(key)).toBe(true); // hali ishga tushmagan
    await runAfterCommit(after);
    expect(await fileExists(key)).toBe(false);
  });

  test('lab file: tx rollback → fayl ham, qator ham joyida', async () => {
    const key = `tenants/${tenantId}/lab-rollback.jpg`;
    const id = await seedLabFile(key);
    const after: AfterCommitFn[] = [];
    await expect(
      withTenant(async (tx) => {
        await labService.removeFile(ctx(tx, after), labOrderId, id);
        throw new Rollback('boom');
      }),
    ).rejects.toBeInstanceOf(Rollback);

    expect(await fileExists(key)).toBe(true);
    const rows = await withTenant((tx) =>
      tx.select({ id: labOrderFiles.id }).from(labOrderFiles).where(eq(labOrderFiles.id, id)),
    );
    expect(rows.length).toBe(1);
  });

  test('lab file: commit → afterCommit ishlagach fayl o‘chadi (oldin emas)', async () => {
    const key = `tenants/${tenantId}/lab-commit.jpg`;
    const id = await seedLabFile(key);
    const after: AfterCommitFn[] = [];
    await withTenant((tx) => labService.removeFile(ctx(tx, after), labOrderId, id));
    expect(await fileExists(key)).toBe(true);
    await runAfterCommit(after);
    expect(await fileExists(key)).toBe(false);
  });

  test('sanity: deleteObject mavjud bo‘lmagan faylda yiqilmaydi', async () => {
    await deleteObject(`tenants/${tenantId}/nope.jpg`).catch(() => {});
  });
});
