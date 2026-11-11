/**
 * UI-D4 — vizit yozuvi sahifasi backend'i (REAL HTTP, real createApp(), real DB).
 *
 * Tasdiqlaydi (Doctor / Receptionist REAL rol shablonlari permset'i bilan, `@owner` EMAS):
 *   1) P12 regressiya: PATCH bitta maydon bilan boshqa maydonlarni (tashxis, xizmat,
 *      reja, erkin matn) bo'shatmaydi.
 *   2) «Imzolash»: signedAt/signedBy yoziladi, audit 'signed'; qayta imzolash 409;
 *      imzodan keyin PATCH 409 `visit_note.signed`.
 *   3) metadata: allergiya override sababi saqlanadi va keyingi PATCH uni ezmaydi.
 *   4) Ruxsat: Receptionist (medical_record.edit yo'q) imzolay olmaydi (403);
 *      boshqa tenant shifokori noma'lum yozuvni imzolay olmaydi (404).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env tests/integration/ui-d4-visit-note.test.ts`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { auditLog, patients, tenants, users } from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const permsOf = (key: string): string[] => {
  const tpl = ROLE_TEMPLATES.find((t) => t.templateKey === key);
  if (!tpl) throw new Error(`role template ${key} yo'q`);
  return [...tpl.permissions] as string[];
};

let tenantId: string;
let otherTenantId: string;
let doctorId: string;
let otherDoctorId: string;
let patientId: string;
let doctorToken: string;
let receptionistToken: string;
let otherTenantToken: string;

const DX = ['11111111-1111-4111-8111-111111111111'];
const SVC = ['22222222-2222-4222-8222-222222222222'];

const call = (token: string, method: string, path: string, body?: unknown) =>
  createApp().request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const createNote = async (extra: Record<string, unknown> = {}) => {
  const res = await call(doctorToken, 'POST', '/visit-notes', {
    patientId,
    doctorId,
    subjective: 'Shikoyat',
    objective: "Ko'rik",
    plan: 'Reja matni',
    freeNotes: 'Erkin izoh',
    assessmentDiagnoses: DX,
    performedServices: SVC,
    ...extra,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: Record<string, any> }).data;
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [doc] = await db
    .insert(users)
    .values({ phone: '+998900004401', passwordHash: 'x', fullName: 'Dr D4' })
    .returning({ id: users.id });
  const [doc2] = await db
    .insert(users)
    .values({ phone: '+998900004402', passwordHash: 'x', fullName: 'Dr Other' })
    .returning({ id: users.id });
  if (!doc || !doc2) throw new Error('user insert failed');
  doctorId = doc.id;
  otherDoctorId = doc2.id;

  const [t1] = await db
    .insert(tenants)
    .values({ name: 'D4 Clinic', slug: 'd4-clinic', ownerUserId: doctorId })
    .returning({ id: tenants.id });
  const [t2] = await db
    .insert(tenants)
    .values({ name: 'D4 Other', slug: 'd4-other', ownerUserId: otherDoctorId })
    .returning({ id: tenants.id });
  if (!t1 || !t2) throw new Error('tenant insert failed');
  tenantId = t1.id;
  otherTenantId = t2.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor D4' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;
  });

  const mint = async (sub: string, atid: string, perms: string[]) =>
    (await signAccess({ sub, atid, abid: null, perms, roleKey: null, lang: 'uz' })).token;
  doctorToken = await mint(doctorId, tenantId, permsOf('doctor'));
  receptionistToken = await mint(doctorId, tenantId, permsOf('receptionist'));
  otherTenantToken = await mint(otherDoctorId, otherTenantId, permsOf('doctor'));
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('UI-D4 — P12: PATCH bitta maydon boshqa maydonlarni bo‘shatmaydi', () => {
  test('faqat subjective yuborilsa tashxis/xizmat/reja/izoh saqlanadi', async () => {
    const note = await createNote();
    const res = await call(doctorToken, 'PATCH', `/visit-notes/${note.id}`, {
      subjective: 'Yangilangan shikoyat',
    });
    expect(res.status).toBe(200);
    const after = ((await res.json()) as { data: Record<string, any> }).data;
    expect(after.subjective).toBe('Yangilangan shikoyat');
    expect(after.assessmentDiagnoses).toEqual(DX);
    expect(after.performedServices).toEqual(SVC);
    expect(after.plan).toBe('Reja matni');
    expect(after.freeNotes).toBe('Erkin izoh');
    expect(after.objective).toBe("Ko'rik");
  });

  test('aniq bo‘sh massiv yuborilsa (ataylab) tozalanadi', async () => {
    const note = await createNote();
    const res = await call(doctorToken, 'PATCH', `/visit-notes/${note.id}`, {
      assessmentDiagnoses: [],
    });
    expect(res.status).toBe(200);
    const after = ((await res.json()) as { data: Record<string, any> }).data;
    expect(after.assessmentDiagnoses).toEqual([]);
    expect(after.performedServices).toEqual(SVC);
  });
});

describe('UI-D4 — imzolash', () => {
  test('imzolash → signedAt/signedBy; qayta imzolash 409; imzodan keyin PATCH 409', async () => {
    const note = await createNote();
    expect(note.signedAt).toBeNull();

    const sign = await call(doctorToken, 'POST', `/visit-notes/${note.id}/sign`);
    expect(sign.status).toBe(200);
    const signed = ((await sign.json()) as { data: Record<string, any> }).data;
    expect(signed.signedAt).toBeTruthy();
    expect(signed.signedBy).toBe(doctorId);

    const again = await call(doctorToken, 'POST', `/visit-notes/${note.id}/sign`);
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe(
      'visit_note.already_signed',
    );

    const patch = await call(doctorToken, 'PATCH', `/visit-notes/${note.id}`, {
      subjective: "Imzodan keyin o'zgartirish",
    });
    expect(patch.status).toBe(409);
    expect(((await patch.json()) as { error: { code: string } }).error.code).toBe(
      'visit_note.signed',
    );

    // Yozuv o'zgarmagan.
    const got = await call(doctorToken, 'GET', `/visit-notes/${note.id}`);
    const data = ((await got.json()) as { data: Record<string, any> }).data;
    expect(data.subjective).toBe('Shikoyat');
    expect(data.signedAt).toBeTruthy();
  });

  test('audit_log: signed yozuvi tushadi', async () => {
    const note = await createNote();
    await call(doctorToken, 'POST', `/visit-notes/${note.id}/sign`);
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.resourceType, 'visit_note'),
            eq(auditLog.resourceId, note.id),
            eq(auditLog.action, 'signed'),
          ),
        );
    });
    expect(rows).toHaveLength(1);
  });

  test('Receptionist (medical_record.edit yo‘q) imzolay olmaydi → 403', async () => {
    const note = await createNote();
    const res = await call(receptionistToken, 'POST', `/visit-notes/${note.id}/sign`);
    expect(res.status).toBe(403);
  });

  test('boshqa tenant shifokori bu yozuvni imzolay olmaydi → 404 (RLS)', async () => {
    const note = await createNote();
    const res = await call(otherTenantToken, 'POST', `/visit-notes/${note.id}/sign`);
    expect(res.status).toBe(404);
  });
});

describe('UI-D4 — metadata (allergiya override sababi, keyingi tashrif)', () => {
  const override = {
    drug: 'Amoksitsillin 500 mg',
    group: 'penicillin',
    allergen: 'Penitsillin',
    reason: 'benefit_outweighs_risk',
  };

  test('override sababi saqlanadi va keyingi PATCH uni ezmaydi', async () => {
    const note = await createNote({ allergyOverrides: [override] });
    expect(note.metadata.allergyOverrides).toEqual([override]);

    const res = await call(doctorToken, 'PATCH', `/visit-notes/${note.id}`, { nextVisit: '2w' });
    expect(res.status).toBe(200);
    const after = ((await res.json()) as { data: Record<string, any> }).data;
    expect(after.metadata.nextVisit).toBe('2w');
    expect(after.metadata.allergyOverrides).toEqual([override]);
  });

  test('yangi override mavjudlarga qo‘shiladi (drug bo‘yicha), dublikat yangilanadi', async () => {
    const note = await createNote({ allergyOverrides: [override] });
    const other = { ...override, drug: 'Ampitsillin', reason: 'patient_informed' };
    const res = await call(doctorToken, 'PATCH', `/visit-notes/${note.id}`, {
      allergyOverrides: [other, { ...override, reason: 'patient_informed' }],
    });
    expect(res.status).toBe(200);
    const list = ((await res.json()) as { data: Record<string, any> }).data.metadata
      .allergyOverrides as Array<{ drug: string; reason: string }>;
    expect(list).toHaveLength(2);
    expect(list.find((x) => x.drug === override.drug)?.reason).toBe('patient_informed');
  });

  test('metadata berilmagan yozuvda null qaytadi, 500 emas', async () => {
    const note = await createNote();
    expect(note.metadata).toBeNull();
  });
});
