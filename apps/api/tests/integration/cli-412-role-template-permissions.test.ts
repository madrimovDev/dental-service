/**
 * CLI-412 (C1, CRITICAL) — M5 klinik permissionlari (prescription/consent/lab_order/
 * patient_image) hech qanday rol shablonida yo'q edi (owner `@owner` dan tashqari).
 *
 * Bu test REAL HTTP round-trip (`createApp()`) + REAL rol shabloni permset'lari
 * (`@dental/core` `ROLE_TEMPLATES`'dan, `@owner` sentinel EMAS) bilan ishlaydi —
 * `cli-153`/`cli-441` precedentiga mos: rolga xos endpoint doim real permset bilan
 * sinaladi, faqat owner emas ("@owner permission kamchiliklarini yashiradi").
 *
 *  - Doctor permset → POST /api/prescriptions → 201 (avval 403 edi).
 *  - Technician permset → GET /api/lab-orders → 200 (avval 403 edi).
 *  - Receptionist permset → POST /api/prescriptions VA GET /api/lab-orders → HALI HAM
 *    403 (ular ro'yxatda yo'q — CLI-412 matritsasi bo'yicha qasddan).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-412-role-template-permissions`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const permsFor = (templateKey: string): string[] => {
  const template = ROLE_TEMPLATES.find((t) => t.templateKey === templateKey);
  if (!template) throw new Error(`template not found: ${templateKey}`);
  return [...template.permissions];
};

const doctorPerms = permsFor('doctor');
const technicianPerms = permsFor('technician');
const receptionistPerms = permsFor('receptionist');

let tenantId: string;
let ownerId: string;
let patientId: string;
let doctorToken: string;
let technicianToken: string;
let receptionistToken: string;

const tokenFor = async (userId: string, perms: string[], roleKey: string) => {
  const { token } = await signAccess({
    sub: userId,
    atid: tenantId,
    abid: null,
    perms,
    roleKey,
    lang: 'uz',
  });
  return token;
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900004120', passwordHash: 'x', fullName: 'Owner412' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI412 Clinic', slug: 'cli412-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  // Actor userlar — @owner EMAS, faqat rol shabloni permset'i bilan chaqiradi.
  // audit_log.user_id FK talab qiladi, shuning uchun haqiqiy `users` qatorlari kerak
  // (lekin `user_assignments` — kerak emas, chunki doctorId=ownerId owner carve-out orqali).
  const [doctorActor] = await db
    .insert(users)
    .values({ phone: '+998900004121', passwordHash: 'x', fullName: 'DoctorActor412' })
    .returning({ id: users.id });
  const [technicianActor] = await db
    .insert(users)
    .values({ phone: '+998900004122', passwordHash: 'x', fullName: 'TechnicianActor412' })
    .returning({ id: users.id });
  const [receptionistActor] = await db
    .insert(users)
    .values({ phone: '+998900004123', passwordHash: 'x', fullName: 'ReceptionistActor412' })
    .returning({ id: users.id });
  if (!doctorActor || !technicianActor || !receptionistActor)
    throw new Error('actor insert failed');

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor412' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;
  });

  doctorToken = await tokenFor(doctorActor.id, doctorPerms, 'doctor');
  technicianToken = await tokenFor(technicianActor.id, technicianPerms, 'technician');
  receptionistToken = await tokenFor(receptionistActor.id, receptionistPerms, 'receptionist');
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-412 — real rol permset (NOT @owner) bilan M5 endpoint natijasi', () => {
  test('sanity: Doctor/Technician/Receptionist permset @owner sentinelga ega EMAS', () => {
    expect(doctorPerms).not.toContain('@owner');
    expect(technicianPerms).not.toContain('@owner');
    expect(receptionistPerms).not.toContain('@owner');
  });

  test('Doctor permset: POST /api/prescriptions → 201 (avval 403 edi)', async () => {
    const app = createApp();
    const res = await app.request('/api/prescriptions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${doctorToken}`,
      },
      body: JSON.stringify({
        patientId,
        doctorId: ownerId,
        items: [{ medicationName: 'Amoxicillin', dosage: '500mg', frequency: '3x/kun' }],
      }),
    });
    expect(res.status).toBe(201);
  });

  test('Technician permset: GET /api/lab-orders → 200 (avval 403 edi)', async () => {
    const app = createApp();
    const res = await app.request('/api/lab-orders', {
      headers: { authorization: `Bearer ${technicianToken}` },
    });
    expect(res.status).toBe(200);
  });

  test('Receptionist permset: POST /api/prescriptions → HALI HAM 403 (ro‘yxatda yo‘q)', async () => {
    const app = createApp();
    const res = await app.request('/api/prescriptions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${receptionistToken}`,
      },
      body: JSON.stringify({
        patientId,
        doctorId: ownerId,
        items: [{ medicationName: 'Amoxicillin', dosage: '500mg', frequency: '3x/kun' }],
      }),
    });
    expect(res.status).toBe(403);
  });

  test('Receptionist permset: GET /api/lab-orders → HALI HAM 403 (ro‘yxatda yo‘q)', async () => {
    const app = createApp();
    const res = await app.request('/api/lab-orders', {
      headers: { authorization: `Bearer ${receptionistToken}` },
    });
    expect(res.status).toBe(403);
  });
});
