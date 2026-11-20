/**
 * FT-06.2 — bemor avatari `PATCH /api/patients/{id}/photo` (REAL DB, RLS, HTTP).
 *
 * Ruxsat real shablon permset bilan (Receptionist = patient.edit bor; Accountant = yo'q), `@owner` EMAS:
 *  - `patient.edit`siz → 403, `photo_url` o'zgarmaydi;
 *  - boshqa bemorning rasmi / `face_photo` bo'lmagan tur / boshqa tenant rasmi → 400, `photo_url` o'zgarmaydi;
 *  - to'g'ri `face_photo` → `photo_url` = `/uploads/...` (serve URL), audit yoziladi;
 *  - `imageId: null` → avatar tozalanadi (rasm qatori saqlanadi).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env ft-06-patient-photo`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { auditLog, patientImages, patients, tenants, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const permsOf = (name: string): string[] => {
  const tpl = ROLE_TEMPLATES.find((r) => r.name === name);
  if (!tpl) throw new Error(`template yo'q: ${name}`);
  return [...tpl.permissions];
};

const withTenant = <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

let tenantId: string;
let otherTenantId: string;
let actorId: string;
let patientId: string;
let otherPatientId: string;
let faceId: string;
let otherPatientFaceId: string;
let xrayId: string;
let foreignFaceId: string;
let tokens: { reception: string; accountant: string };

const tokenFor = async (perms: string[]) =>
  (await signAccess({ sub: actorId, atid: tenantId, abid: null, perms, roleKey: null, lang: 'uz' }))
    .token;

const app = createApp();
const setPhoto = (body: unknown, token: string, id = patientId) =>
  app.request(`/api/patients/${id}/photo`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const photoUrl = () =>
  withTenant(tenantId, async (tx) => {
    const [p] = await tx
      .select({ photoUrl: patients.photoUrl })
      .from(patients)
      .where(eq(patients.id, patientId));
    return p?.photoUrl ?? null;
  });

const img = (tid: string, pid: string, type: 'face_photo' | 'xray_panoramic', key: string) => ({
  tenantId: tid,
  patientId: pid,
  type,
  objectKey: `tenants/${tid}/patients/${pid}/${key}.jpg`,
  originalFilename: `${key}.jpg`,
  contentType: 'image/jpeg',
  sizeBytes: 100,
});

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [actor] = await db
    .insert(users)
    .values({ phone: '+998900000606', passwordHash: 'x', fullName: 'Actor FT06' })
    .returning({ id: users.id });
  if (!actor) throw new Error('user insert failed');
  actorId = actor.id;
  const ts = await db
    .insert(tenants)
    .values([
      { name: 'FT06', slug: 'ft06', ownerUserId: actorId },
      { name: 'FT06b', slug: 'ft06b', ownerUserId: actorId },
    ])
    .returning({ id: tenants.id });
  if (!ts[0] || !ts[1]) throw new Error('tenant insert failed');
  tenantId = ts[0].id;
  otherTenantId = ts[1].id;

  await withTenant(tenantId, async (tx) => {
    const ps = await tx
      .insert(patients)
      .values([
        { tenantId, fullName: 'Bemor 1' },
        { tenantId, fullName: 'Bemor 2' },
      ])
      .returning({ id: patients.id });
    if (!ps[0] || !ps[1]) throw new Error('patient insert failed');
    patientId = ps[0].id;
    otherPatientId = ps[1].id;
    const imgs = await tx
      .insert(patientImages)
      .values([
        img(tenantId, patientId, 'face_photo', 'face'),
        img(tenantId, otherPatientId, 'face_photo', 'face2'),
        img(tenantId, patientId, 'xray_panoramic', 'xray'),
      ])
      .returning({ id: patientImages.id, key: patientImages.objectKey });
    faceId = imgs.find((i) => i.key.endsWith('/face.jpg'))?.id ?? '';
    otherPatientFaceId = imgs.find((i) => i.key.endsWith('/face2.jpg'))?.id ?? '';
    xrayId = imgs.find((i) => i.key.endsWith('/xray.jpg'))?.id ?? '';
  });
  await withTenant(otherTenantId, async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: otherTenantId, fullName: 'Begona' })
      .returning({ id: patients.id });
    if (!p) throw new Error('foreign patient failed');
    const [i] = await tx
      .insert(patientImages)
      .values(img(otherTenantId, p.id, 'face_photo', 'foreign'))
      .returning({ id: patientImages.id });
    foreignFaceId = i?.id ?? '';
  });

  tokens = {
    reception: await tokenFor(permsOf('Receptionist')),
    accountant: await tokenFor(permsOf('Accountant')),
  };
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FT-06.2 PATCH /patients/{id}/photo', () => {
  test('Accountant (patient.edit yo‘q) → 403, photo_url o‘zgarmaydi', async () => {
    const res = await setPhoto({ imageId: faceId }, tokens.accountant);
    expect(res.status).toBe(403);
    expect(await photoUrl()).toBeNull();
  });

  test.each([
    ['boshqa bemorning face_photo’si', () => otherPatientFaceId],
    ['face_photo bo‘lmagan tur (rentgen)', () => xrayId],
    ['boshqa tenant rasmi (RLS)', () => foreignFaceId],
    ['mavjud bo‘lmagan UUID', () => '00000000-0000-4000-8000-000000000000'],
  ])('%s → 400, photo_url o‘zgarmaydi', async (_n, id) => {
    const res = await setPhoto({ imageId: id() }, tokens.reception);
    expect(res.status).toBe(400);
    expect(await photoUrl()).toBeNull();
  });

  test('noto‘g‘ri UUID shakli → 400', async () => {
    expect((await setPhoto({ imageId: 'abc' }, tokens.reception)).status).toBe(400);
  });

  test('boshqa tenant bemori → 404', async () => {
    const res = await setPhoto({ imageId: faceId }, tokens.reception, crypto.randomUUID());
    expect(res.status).toBe(404);
  });

  test('to‘g‘ri face_photo → photo_url = serve URL, DTO va audit', async () => {
    const res = await setPhoto({ imageId: faceId }, tokens.reception);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; photoUrl: string | null } };
    const expected = `/uploads/${encodeURIComponent(`tenants/${tenantId}/patients/${patientId}/face.jpg`)}`;
    expect(body.data.photoUrl).toBe(expected);
    expect(await photoUrl()).toBe(expected);
    const audits = await withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'photo_updated'), eq(auditLog.resourceId, patientId))),
    );
    expect(audits).toHaveLength(1);
  });

  test('imageId: null → avatar tozalanadi, rasm qatori saqlanadi', async () => {
    const res = await setPhoto({ imageId: null }, tokens.reception);
    expect(res.status).toBe(200);
    expect(await photoUrl()).toBeNull();
    const rows = await withTenant(tenantId, (tx) =>
      tx.select({ id: patientImages.id }).from(patientImages).where(eq(patientImages.id, faceId)),
    );
    expect(rows).toHaveLength(1);
  });
});
