/**
 * FT-01.4 (CF-10) — tish tarixi: `GET /patients/{id}/images?tooth=NN` (`tooth_numbers @> ARRAY[NN]`),
 * FDI validatori (rasm yuklash/tahriri, vizit yozuvi), `visit_notes.tooth_numbers` (0069).
 * REAL HTTP `createApp()` + real DB (RLS). Tokenlar REAL shablon permset'lari bilan (`@owner` EMAS):
 * Doctor (`patient_image.view` + `medical_record.edit`), Receptionist (`patient_image.view` yo'q → 403).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/ft-01-tooth-history.test.ts
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { PERMISSIONS, ROLE_TEMPLATES } from '@dental/core';
import {
  branches,
  patientImages,
  patients,
  permissions as permissionsTable,
  roles,
  userAssignments,
  users,
  visitNotes,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { provisionTenantInTx } from '../../src/modules/auth/auth.service.ts';

const templatePerms = (key: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === key);
  if (!t) throw new Error(`template not found: ${key}`);
  return [...t.permissions];
};

let tenantId: string;
let branchId: string;
let patientId: string;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};

const inTenant = <T>(fn: (tx: typeof db) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx as unknown as typeof db);
  });

const randomIp = () =>
  `10.204.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

const call = (token: string, method: string, path: string, body?: unknown) =>
  createApp().request(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-real-ip': randomIp(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const errCode = async (res: Response) =>
  ((await res.json()) as { error?: { code?: string } }).error?.code;

type ImageDto = { id: string; originalFilename: string; toothNumbers: number[] | null };

const insertImage = (name: string, toothNumbers: number[] | null) =>
  inTenant(async (tx) => {
    const [row] = await tx
      .insert(patientImages)
      .values({
        tenantId,
        patientId,
        type: 'xray_periapical',
        objectKey: `k/${name}`,
        originalFilename: name,
        contentType: 'image/jpeg',
        sizeBytes: 10,
        toothNumbers,
      })
      .returning({ id: patientImages.id });
    return row!.id;
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  for (const p of PERMISSIONS) {
    await db
      .insert(permissionsTable)
      .values({
        code: p.code,
        category: p.category,
        descriptionUz: p.descriptionUz,
        descriptionRu: p.descriptionRu,
      })
      .onConflictDoNothing();
  }
  const res = await db.transaction((tx) =>
    provisionTenantInTx(tx, {
      tenantName: 'FT01 Tooth',
      ownerPhone: '+998900204000',
      ownerFullName: 'Owner FT01d',
      ownerPassword: 'Passw0rd!x',
      defaultLanguage: 'uz',
    }),
  );
  tenantId = res.tenantId;
  branchId = await inTenant(async (tx) => {
    const [b] = await tx.select({ id: branches.id }).from(branches).limit(1);
    if (!b) throw new Error('no branch provisioned');
    return b.id;
  });

  for (const [key, phone, name] of [
    ['doctor', '+998900204001', 'Doc FT01d'],
    ['receptionist', '+998900204002', 'Reg FT01d'],
  ] as const) {
    const [u] = await db
      .insert(users)
      .values({ phone, passwordHash: 'x', fullName: name })
      .returning({ id: users.id });
    if (!u) throw new Error('user insert failed');
    ids[key] = u.id;
    await inTenant(async (tx) => {
      const [r] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.templateKey, key));
      if (!r) throw new Error(`role ${key} not seeded`);
      await tx.insert(userAssignments).values({
        userId: u.id,
        tenantId,
        branchId,
        roleId: r.id,
        isActive: true,
        acceptedAt: new Date(),
      });
    });
    tokens[key] = (
      await signAccess({
        sub: u.id,
        atid: tenantId,
        abid: branchId,
        perms: templatePerms(key),
        roleKey: key,
        lang: 'uz',
      })
    ).token;
  }

  patientId = await inTenant(async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor Tish' })
      .returning({ id: patients.id });
    return p!.id;
  });

  await insertImage('only16.jpg', [16]);
  await insertImage('16and17.jpg', [16, 17]);
  await insertImage('only26.jpg', [26]);
  await insertImage('none.jpg', null);
});

describe('FT-01.4 — GET /patients/{id}/images?tooth=NN', () => {
  test('Doctor: tooth=16 → faqat 16 tishli rasmlar', async () => {
    expect(templatePerms('doctor')).toContain('patient_image.view');
    const res = await call(
      tokens.doctor as string,
      'GET',
      `/patients/${patientId}/images?tooth=16`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ImageDto[] };
    expect(body.data.map((i) => i.originalFilename).sort()).toEqual(['16and17.jpg', 'only16.jpg']);
  });

  test('Doctor: filtrsiz → barcha 4 rasm (mavjud xulq saqlanadi)', async () => {
    const res = await call(tokens.doctor as string, 'GET', `/patients/${patientId}/images`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: ImageDto[] }).data).toHaveLength(4);
  });

  test('tooth=19 (FDI emas) → 400', async () => {
    const res = await call(
      tokens.doctor as string,
      'GET',
      `/patients/${patientId}/images?tooth=19`,
    );
    expect(res.status).toBe(400);
  });

  test('Receptionist (patient_image.view yo‘q) → 403', async () => {
    expect(templatePerms('receptionist')).not.toContain('patient_image.view');
    const res = await call(
      tokens.receptionist as string,
      'GET',
      `/patients/${patientId}/images?tooth=16`,
    );
    expect(res.status).toBe(403);
  });
});

const upload = (token: string, toothNumbers: string) => {
  const fd = new FormData();
  fd.append('file', new File([new Uint8Array([1, 2, 3])], 'x.jpg', { type: 'image/jpeg' }));
  fd.append('patientId', patientId);
  fd.append('type', 'xray_periapical');
  fd.append('toothNumbers', toothNumbers);
  return createApp().request('/api/patient-images', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'x-real-ip': randomIp() },
    body: fd,
  });
};

const imageCount = async () =>
  (
    await inTenant((tx) =>
      tx.select().from(patientImages).where(eq(patientImages.patientId, patientId)),
    )
  ).length;

describe('FT-01.4 — rasm tishlari FDI validatori', () => {
  test('yuklash: «16, 19» (19 FDI emas) → 400 image.invalid_metadata, rasm yozilmaydi', async () => {
    expect(templatePerms('doctor')).toContain('patient_image.upload');
    const before = await imageCount();
    const res = await upload(tokens.doctor as string, '16, 19');
    expect(res.status).toBe(400);
    expect(await errCode(res)).toBe('image.invalid_metadata');
    expect(await imageCount()).toBe(before);
  });

  test('yuklash: «16, 17» → 201, tishlar saqlanadi', async () => {
    const res = await upload(tokens.doctor as string, '16, 17');
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: ImageDto };
    expect(body.data.toothNumbers).toEqual([16, 17]);
  });

  test('tahrir: toothNumbers [99] → 400, o‘zgarmaydi', async () => {
    const id = await insertImage('patch.jpg', [11]);
    const res = await call(tokens.doctor as string, 'PATCH', `/patient-images/${id}`, {
      toothNumbers: [99],
    });
    expect(res.status).toBe(400);
    const [row] = await inTenant((tx) =>
      tx.select().from(patientImages).where(eq(patientImages.id, id)),
    );
    expect(row?.toothNumbers).toEqual([11]);
  });
});

type VisitNoteDto = { id: string; toothNumbers: number[] | null };

describe('FT-01.4 — visit_notes.tooth_numbers (0069)', () => {
  test('Doctor: yaratish toothNumbers [16, 85] → saqlanadi va DTO’da qaytadi', async () => {
    expect(templatePerms('doctor')).toContain('medical_record.edit');
    const res = await call(tokens.doctor as string, 'POST', '/visit-notes', {
      patientId,
      doctorId: ids.doctor,
      subjective: 'Og‘riq',
      toothNumbers: [16, 85],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: VisitNoteDto };
    expect(body.data.toothNumbers).toEqual([16, 85]);
    const [row] = await inTenant((tx) =>
      tx.select().from(visitNotes).where(eq(visitNotes.id, body.data.id)),
    );
    expect(row?.toothNumbers).toEqual([16, 85]);
  });

  test('tishsiz yaratish → toothNumbers null', async () => {
    const res = await call(tokens.doctor as string, 'POST', '/visit-notes', {
      patientId,
      doctorId: ids.doctor,
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { data: VisitNoteDto }).data.toothNumbers).toBeNull();
  });

  test('yaratish toothNumbers [19] (FDI emas) → 400', async () => {
    const res = await call(tokens.doctor as string, 'POST', '/visit-notes', {
      patientId,
      doctorId: ids.doctor,
      toothNumbers: [19],
    });
    expect(res.status).toBe(400);
  });

  test('PATCH toothNumbers [11] → yangilanadi; [49] → 400', async () => {
    const created = await call(tokens.doctor as string, 'POST', '/visit-notes', {
      patientId,
      doctorId: ids.doctor,
      toothNumbers: [16],
    });
    const id = ((await created.json()) as { data: VisitNoteDto }).data.id;
    const ok = await call(tokens.doctor as string, 'PATCH', `/visit-notes/${id}`, {
      toothNumbers: [11],
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { data: VisitNoteDto }).data.toothNumbers).toEqual([11]);
    const bad = await call(tokens.doctor as string, 'PATCH', `/visit-notes/${id}`, {
      toothNumbers: [49],
    });
    expect(bad.status).toBe(400);
  });

  test('Receptionist (medical_record.edit yo‘q) → 403', async () => {
    expect(templatePerms('receptionist')).not.toContain('medical_record.edit');
    const res = await call(tokens.receptionist as string, 'POST', '/visit-notes', {
      patientId,
      doctorId: ids.doctor,
      toothNumbers: [16],
    });
    expect(res.status).toBe(403);
  });
});
