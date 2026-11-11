/**
 * UI-D2 `POST /api/patients/{id}/medical-record/confirm` (REAL HTTP + REAL DB + REAL rol permset, @owner EMAS).
 *  - Doctor (`medical_record.edit`): tasdiqlaydi -> `confirmedAt` + `confirmedBy`, audit `confirmed`; GET shuni qaytaradi.
 *  - Nurse (`medical_record.view` bor, `edit` YO'Q) -> 403 va yozuv O'ZGARMAYDI.
 *  - Receptionist (`medical_record.*` yo'q) -> 403 (GET ham 403 — karta klinik ma'lumotni ochmaydi).
 *  - Boshqa tenant doktori -> 404 (RLS), bemor yozuvi tegilmaydi.
 *  - Tasdiqdan keyingi PATCH `confirmedAt`ni o'chirmaydi (anamnez matni o'zgaradi, tasdiq vaqti saqlanadi).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env ui-d2-anamnesis-confirm`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { auditLog, medicalRecords, patients, tenants, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const permsFor = (k: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === k);
  if (!t) throw new Error(`template ${k}`);
  return [...t.permissions];
};

let tenantA: string;
let tenantB: string;
let doctorId: string;
let nurseId: string;
let receptionId: string;
let otherDoctorId: string;
let patientId: string;

const tokenFor = async (sub: string, tenant: string, roleKey: string) =>
  (
    await signAccess({
      sub,
      atid: tenant,
      abid: null,
      perms: permsFor(roleKey),
      roleKey,
      lang: 'uz',
    })
  ).token;

const confirm = (token: string, id = patientId) =>
  createApp().request(`/api/patients/${id}/medical-record/confirm`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });

const getMedical = (token: string) =>
  createApp().request(`/api/patients/${patientId}/medical`, {
    headers: { authorization: `Bearer ${token}` },
  });

// db roli RLS ostida — tenant kontekstini o'zimiz o'rnatamiz (SET LOCAL).
const asTenantA = <T>(
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantA}'`));
    return fn(tx);
  });

const recordRow = () =>
  asTenantA(async (tx) => {
    const [r] = await tx
      .select()
      .from(medicalRecords)
      .where(eq(medicalRecords.patientId, patientId));
    return r!;
  });

const confirmedAudits = () =>
  asTenantA((tx) =>
    tx
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.resourceType, 'medical_record'), eq(auditLog.action, 'confirmed'))),
  );

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const ins = await db
    .insert(users)
    .values([
      { phone: '+998900006101', passwordHash: 'x', fullName: 'Owner A' },
      { phone: '+998900006102', passwordHash: 'x', fullName: 'Doctor A' },
      { phone: '+998900006103', passwordHash: 'x', fullName: 'Nurse A' },
      { phone: '+998900006104', passwordHash: 'x', fullName: 'Reception A' },
      { phone: '+998900006105', passwordHash: 'x', fullName: 'Owner B' },
      { phone: '+998900006106', passwordHash: 'x', fullName: 'Doctor B' },
    ])
    .returning({ id: users.id });
  const [ownerA, d, n, r, ownerB, dB] = ins;
  if (!ownerA || !d || !n || !r || !ownerB || !dB) throw new Error('users');
  doctorId = d.id;
  nurseId = n.id;
  receptionId = r.id;
  otherDoctorId = dB.id;
  const [ta] = await db
    .insert(tenants)
    .values({ name: 'D2 A', slug: 'ui-d2-a', ownerUserId: ownerA.id })
    .returning({ id: tenants.id });
  const [tb] = await db
    .insert(tenants)
    .values({ name: 'D2 B', slug: 'ui-d2-b', ownerUserId: ownerB.id })
    .returning({ id: tenants.id });
  tenantA = ta!.id;
  tenantB = tb!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantA}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: tenantA, fullName: 'Bemor D2' })
      .returning({ id: patients.id });
    patientId = p!.id;
    await tx.insert(medicalRecords).values({
      tenantId: tenantA,
      patientId,
      anamnez: 'Asl anamnez',
      allergies: [{ type: 'medication', substance: 'Penitsillin', severity: 'severe' }],
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('UI-D2 anamnez tasdig’i', () => {
  test('boshlang’ich holatda confirmedAt/confirmedBy null', async () => {
    const res = await getMedical(await tokenFor(doctorId, tenantA, 'doctor'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { confirmedAt: string | null } };
    expect(body.data.confirmedAt).toBeNull();
  });

  test('Nurse (medical_record.edit yo’q) -> 403, yozuv o’zgarmaydi', async () => {
    const res = await confirm(await tokenFor(nurseId, tenantA, 'nurse'));
    expect(res.status).toBe(403);
    expect((await recordRow()).confirmedAt).toBeNull();
  });

  test('Receptionist -> 403 (tasdiq ham, o’qish ham)', async () => {
    const token = await tokenFor(receptionId, tenantA, 'receptionist');
    expect((await confirm(token)).status).toBe(403);
    expect((await getMedical(token)).status).toBe(403);
    expect((await recordRow()).confirmedAt).toBeNull();
  });

  test('boshqa tenant doktori -> 404 (RLS), yozuv tegilmaydi', async () => {
    const res = await confirm(await tokenFor(otherDoctorId, tenantB, 'doctor'));
    expect(res.status).toBe(404);
    expect((await recordRow()).confirmedAt).toBeNull();
  });

  test('mavjud bo’lmagan bemor -> 404', async () => {
    const res = await confirm(
      await tokenFor(doctorId, tenantA, 'doctor'),
      '00000000-0000-4000-8000-000000000000',
    );
    expect(res.status).toBe(404);
  });

  test('Doctor tasdiqlaydi -> confirmedAt/confirmedBy, audit `confirmed`, GET qaytaradi', async () => {
    const token = await tokenFor(doctorId, tenantA, 'doctor');
    const before = Date.now();
    const res = await confirm(token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { confirmedAt: string; confirmedBy: string; anamnez: string };
    };
    expect(body.data.confirmedBy).toBe(doctorId);
    expect(new Date(body.data.confirmedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(body.data.anamnez).toBe('Asl anamnez');

    const row = await recordRow();
    expect(row.confirmedBy).toBe(doctorId);
    expect(row.confirmedAt).not.toBeNull();

    const audits = await confirmedAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.userId).toBe(doctorId);
    expect(audits[0]?.resourceId).toBe(row.id);

    const again = (await (await getMedical(token)).json()) as {
      data: { confirmedAt: string; confirmedBy: string };
    };
    expect(again.data.confirmedAt).toBe(body.data.confirmedAt);
    expect(again.data.confirmedBy).toBe(doctorId);
  });

  test('keyingi PATCH confirmedAt’ni o’chirmaydi; tarix (`updated`) tasdiqni diff qilmaydi', async () => {
    const token = await tokenFor(doctorId, tenantA, 'doctor');
    const patch = await createApp().request(`/api/patients/${patientId}/medical`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ anamnez: 'Yangi anamnez' }),
    });
    expect(patch.status).toBe(200);
    const row = await recordRow();
    expect(row.anamnez).toBe('Yangi anamnez');
    expect(row.confirmedAt).not.toBeNull();
    expect(row.confirmedBy).toBe(doctorId);
  });

  test('takroriy tasdiq vaqtni yangilaydi, ikkinchi audit yozadi', async () => {
    const token = await tokenFor(doctorId, tenantA, 'doctor');
    const first = (await recordRow()).confirmedAt!;
    await Bun.sleep(15);
    expect((await confirm(token)).status).toBe(200);
    const second = (await recordRow()).confirmedAt!;
    expect(second.getTime()).toBeGreaterThan(first.getTime());
    const audits = await confirmedAudits();
    expect(audits).toHaveLength(2);
  });
});
