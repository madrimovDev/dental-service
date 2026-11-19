/**
 * FX-111 (LB-20) — imzolangan vizit yozuviga biriktirilgan rasm o'chirilmaydi/tahrirlanmaydi.
 * REAL DB (RLS) + real audit logger. Imzolanmagan vizit / bog'lanmagan rasm — avvalgidek.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env fx-111`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { auditLog, patientImages, patients, tenants, users, visitNotes } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import {
  createPatientImagesService,
  ImageLockedError,
} from '../../src/modules/patient-images/patient-images.service.ts';

const service = createPatientImagesService({ audit: createAuditLogger({ db }) });

let tenantId: string;
let userId: string;
let patientId: string;
let signedImageId: string;
let draftImageId: string;
let freeImageId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: userId }
            : k === 'accessClaims'
              ? { perms: ['patient_image.upload'] }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const withTenant = <T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const imageRow = (key: string, visitNoteId: string | null) => ({
  tenantId,
  patientId,
  type: 'xray_periapical' as const,
  objectKey: `k/${key}.jpg`,
  originalFilename: `${key}.jpg`,
  contentType: 'image/jpeg',
  sizeBytes: 100,
  visitNoteId,
});

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900000111', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!u) throw new Error('user insert failed');
  userId = u.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'Img Lock', slug: 'img-lock', ownerUserId: userId })
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
    const [signed] = await tx
      .insert(visitNotes)
      .values({ tenantId, patientId, doctorId: userId, signedAt: new Date() })
      .returning({ id: visitNotes.id });
    const [draft] = await tx
      .insert(visitNotes)
      .values({ tenantId, patientId, doctorId: userId })
      .returning({ id: visitNotes.id });
    if (!signed || !draft) throw new Error('visit note insert failed');
    const imgs = await tx
      .insert(patientImages)
      .values([imageRow('signed', signed.id), imageRow('draft', draft.id), imageRow('free', null)])
      .returning({ id: patientImages.id, key: patientImages.objectKey });
    signedImageId = imgs.find((i) => i.key === 'k/signed.jpg')?.id ?? '';
    draftImageId = imgs.find((i) => i.key === 'k/draft.jpg')?.id ?? '';
    freeImageId = imgs.find((i) => i.key === 'k/free.jpg')?.id ?? '';
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const exists = (id: string) =>
  withTenant(async (tx) => {
    const rows = await tx
      .select({ id: patientImages.id })
      .from(patientImages)
      .where(eq(patientImages.id, id));
    return rows.length > 0;
  });

describe('FX-111 imzolangan vizitga bog‘langan rasm', () => {
  test('remove(): ImageLockedError, qator saqlanadi, audit "deleted" yo‘q', async () => {
    await expect(withTenant((tx) => service.remove(ctx(tx), signedImageId))).rejects.toBeInstanceOf(
      ImageLockedError,
    );
    expect(await exists(signedImageId)).toBe(true);
    const deleted = await withTenant((tx) =>
      tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'deleted'), eq(auditLog.resourceId, signedImageId))),
    );
    expect(deleted).toHaveLength(0);
  });

  test('updateMetadata(): ImageLockedError, sarlavha o‘zgarmaydi', async () => {
    await expect(
      withTenant((tx) => service.updateMetadata(ctx(tx), signedImageId, { title: 'Boshqa' })),
    ).rejects.toBeInstanceOf(ImageLockedError);
    const [row] = await withTenant((tx) =>
      tx.select().from(patientImages).where(eq(patientImages.id, signedImageId)),
    );
    expect(row?.title).toBeNull();
  });

  test('imzolanmagan vizitga bog‘langan rasm — o‘chiriladi (avvalgi xulq)', async () => {
    const removed = await withTenant((tx) => service.remove(ctx(tx), draftImageId));
    expect(removed?.id).toBe(draftImageId);
    expect(await exists(draftImageId)).toBe(false);
  });

  test('vizitga bog‘lanmagan rasm — tahrirlanadi va o‘chiriladi', async () => {
    const upd = await withTenant((tx) =>
      service.updateMetadata(ctx(tx), freeImageId, { title: 'Yangi' }),
    );
    expect(upd?.title).toBe('Yangi');
    const removed = await withTenant((tx) => service.remove(ctx(tx), freeImageId));
    expect(removed?.id).toBe(freeImageId);
  });
});
