/**
 * FT-04.3 (D-2) — bemorning doimiy chegirmasi (`patients.default_discount_percent`).
 *
 *  - Tahrir: `patient.edit` (yoki yaratishda `patient.create`) + `discount.give`;
 *    `discount.give`siz → 403 `discount.forbidden`, qiymat o'zgarmaydi.
 *  - Yangi reja bosqichi: `cost = round(price × (1 − pct/100))`, `list_price` va
 *    `discount_percent` bosqichda snapshot; mavjud bosqichlar retroaktiv o'zgarmaydi.
 *  - POS: bemor chegirmasi `discount.give`siz kassirda ham aynan qo'llanadi; boshqa summa — 403.
 *
 * REAL DB + REAL HTTP (createApp) + real `user_assignments` + REAL cheklangan rollar
 * (`@owner` EMAS).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/ft-04-patient-default-discount.test.ts
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  auditLog,
  branches,
  cashierTransactions,
  patients,
  permissions,
  rolePermissions,
  roles,
  servicePrices,
  services,
  tenantSettings,
  tenants,
  treatmentPlans,
  treatmentStages,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

/** Registrator (chegirmasiz): bemorni yaratadi/tahrirlaydi, lekin `discount.give` yo'q. */
const REG_PERMS = ['patient.view', 'patient.create', 'patient.edit', 'patient.view_pii'];
const RECEPTION_PERMS = [
  ...(ROLE_TEMPLATES.find((t) => t.templateKey === 'receptionist')?.permissions ?? []),
] as string[];
/** Kassir (chegirmasiz): faqat kassa — `discount.give` YO'Q. */
const KASSIR_PERMS = ['cashier.view', 'cashier.create_transaction'];
/** Doktor shablon permset'i — `discount.give` YO'Q (D-2: snapshot avtomatik). */
const DOCTOR_PERMS = [
  ...(ROLE_TEMPLATES.find((t) => t.templateKey === 'doctor')?.permissions ?? []),
] as string[];

const app = createApp();

let tenantId: string;
let branchId: string;
let patientId: string;
let svcId: string;
let doctorUserId: string;
const tok: Record<string, string> = {};

// biome-ignore lint/suspicious/noExplicitAny: test javob shakli
type Res = { status: number; json: any };
const call = async (
  who: string,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
) => {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      'Content-Type': 'application/json',
      'x-real-ip': `10.75.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) } as Res;
};

const inTenant = <T>(fn: (tx: typeof db) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx as unknown as typeof db);
  });

const patientDiscount = async (id: string) =>
  inTenant(async (tx) => {
    const [row] = await tx
      .select({ pct: patients.defaultDiscountPercent })
      .from(patients)
      .where(eq(patients.id, id));
    return row?.pct ?? null;
  });

beforeAll(async () => {
  // Lane bazasi: 0070 bayonotlari idempotent — yangi ustunlar mavjud bo'lishi uchun qayta yuradi.
  const admin = createAdminDb();
  const stmts = readFileSync(
    new URL('../../drizzle/0070_ft04_discount.sql', import.meta.url),
    'utf8',
  )
    .split('--> statement-breakpoint')
    .map((s) =>
      s
        .split('\n')
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((s) => s.length > 0);
  for (const stmt of stmts) await admin.db.execute(sql.raw(stmt));

  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const mk = async (phone: string) =>
    (
      await db
        .insert(users)
        .values({ phone, passwordHash: 'x', fullName: phone })
        .returning({ id: users.id })
    )[0]!.id;
  const owner = await mk('+998900075201');
  const reg = await mk('+998900075202');
  const reception = await mk('+998900075203');
  doctorUserId = await mk('+998900075204');
  const kassir = await mk('+998900075205');

  for (const code of [
    ...new Set([...REG_PERMS, ...RECEPTION_PERMS, ...DOCTOR_PERMS, ...KASSIR_PERMS]),
  ]) {
    await db
      .insert(permissions)
      .values({ code, category: code.split('.')[0] ?? 'x' })
      .onConflictDoNothing();
  }
  const permIds = async (codes: string[]) =>
    db.select({ id: permissions.id }).from(permissions).where(inArray(permissions.code, codes));
  const regPermRows = await permIds(REG_PERMS);
  const receptionPermRows = await permIds(RECEPTION_PERMS);
  const doctorPermRows = await permIds(DOCTOR_PERMS);
  const kassirPermRows = await permIds(KASSIR_PERMS);

  tenantId = (
    await db
      .insert(tenants)
      .values({ name: 'FT04 Doimiy', slug: 'ft-04-doimiy', ownerUserId: owner })
      .returning({ id: tenants.id })
  )[0]!.id;

  await inTenant(async (tx) => {
    const [br] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Asosiy' })
      .returning({ id: branches.id });
    branchId = br!.id;
    const [regRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Registrator (chegirmasiz)' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(regPermRows.map((p) => ({ roleId: regRole!.id, permissionId: p.id })));
    const [recRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Receptionist', isSystem: true, templateKey: 'receptionist' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(receptionPermRows.map((p) => ({ roleId: recRole!.id, permissionId: p.id })));
    const [docRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Doctor', isSystem: true, templateKey: 'doctor' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(doctorPermRows.map((p) => ({ roleId: docRole!.id, permissionId: p.id })));
    const [kassirRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Kassir (chegirmasiz)' })
      .returning({ id: roles.id });
    await tx
      .insert(rolePermissions)
      .values(kassirPermRows.map((p) => ({ roleId: kassirRole!.id, permissionId: p.id })));
    await tx.insert(userAssignments).values([
      { tenantId, userId: reg, branchId, roleId: regRole!.id },
      { tenantId, userId: reception, branchId, roleId: recRole!.id },
      { tenantId, userId: doctorUserId, branchId, roleId: docRole!.id },
      { tenantId, userId: kassir, branchId, roleId: kassirRole!.id },
    ]);
    const [svc] = await tx
      .insert(services)
      .values({ tenantId, code: 'FT043-S', nameUz: 'Plomba' })
      .returning({ id: services.id });
    svcId = svc!.id;
    await tx.insert(servicePrices).values({ serviceId: svcId, branchId, price: '200000' });
    const [pt] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor Doimiy' })
      .returning({ id: patients.id });
    patientId = pt!.id;
  });

  const sign = async (userId: string, perms: string[]) =>
    (
      await signAccess({
        sub: userId,
        atid: tenantId,
        abid: branchId,
        perms,
        roleKey: null,
        lang: 'uz',
      })
    ).token;
  expect(RECEPTION_PERMS).toContain('discount.give');
  expect(RECEPTION_PERMS).not.toContain('@owner');
  expect(DOCTOR_PERMS).toContain('medical_record.edit');
  expect(DOCTOR_PERMS).not.toContain('discount.give');
  tok.reg = await sign(reg, REG_PERMS);
  tok.reception = await sign(reception, RECEPTION_PERMS);
  tok.doctor = await sign(doctorUserId, DOCTOR_PERMS);
  tok.kassir = await sign(kassir, KASSIR_PERMS);
});

describe('FT-04.3 — patients.default_discount_percent tahriri (patient.edit + discount.give)', () => {
  test("Registrator (discount.give'siz): PATCH defaultDiscountPercent → 403, qiymat o'zgarmaydi", async () => {
    const r = await call('reg', 'PATCH', `/api/patients/${patientId}`, {
      defaultDiscountPercent: 10,
    });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('discount.forbidden');
    expect(await patientDiscount(patientId)).toBeNull();
  });

  test('Registrator: chegirmaga tegmaydigan PATCH → 200 (boshqa maydonlar ruxsat)', async () => {
    const r = await call('reg', 'PATCH', `/api/patients/${patientId}`, { notes: 'izoh' });
    expect(r.status).toBe(200);
    expect(r.json.data.defaultDiscountPercent).toBeNull();
  });

  test('Receptionist (discount.give bor): PATCH 10 → 200, DTO va DB da 10.00', async () => {
    const r = await call('reception', 'PATCH', `/api/patients/${patientId}`, {
      defaultDiscountPercent: 10,
    });
    expect(r.status).toBe(200);
    expect(r.json.data.defaultDiscountPercent).toBe('10.00');
    expect(await patientDiscount(patientId)).toBe('10.00');

    const got = await call('reception', 'GET', `/api/patients/${patientId}`);
    expect(got.json.data.defaultDiscountPercent).toBe('10.00');
  });

  test('100 dan katta yoki manfiy foiz → 400', async () => {
    for (const v of [100.5, -1]) {
      const r = await call('reception', 'PATCH', `/api/patients/${patientId}`, {
        defaultDiscountPercent: v,
      });
      expect(r.status).toBe(400);
    }
    expect(await patientDiscount(patientId)).toBe('10.00');
  });

  test('Registrator: yaratishda defaultDiscountPercent → 403, bemor yaratilmaydi', async () => {
    const r = await call('reg', 'POST', '/api/patients', {
      fullName: 'Yangi Chegirmali',
      defaultDiscountPercent: 5,
    });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('discount.forbidden');
    const rows = await inTenant((tx) =>
      tx
        .select({ id: patients.id })
        .from(patients)
        .where(eq(patients.fullName, 'Yangi Chegirmali')),
    );
    expect(rows).toHaveLength(0);
  });

  test('Receptionist: yaratishda 7.5 → 201, 7.50 saqlanadi', async () => {
    const r = await call('reception', 'POST', '/api/patients', {
      fullName: 'Yangi Chegirmali',
      defaultDiscountPercent: 7.5,
    });
    expect(r.status).toBe(201);
    expect(r.json.data.defaultDiscountPercent).toBe('7.50');
  });

  test('Receptionist: null bilan tozalash → 200, null', async () => {
    const r = await call('reception', 'PATCH', `/api/patients/${patientId}`, {
      defaultDiscountPercent: null,
    });
    expect(r.status).toBe(200);
    expect(r.json.data.defaultDiscountPercent).toBeNull();
    // keyingi testlar uchun qayta 10%
    await call('reception', 'PATCH', `/api/patients/${patientId}`, { defaultDiscountPercent: 10 });
  });
});

describe('FT-04.3 — yangi reja bosqichi: cost snapshot (list_price, discount_percent)', () => {
  /** Katalog xizmati (server narxi 200 000) + erkin bosqich (client cost 55 555). */
  const planBody = (pid: string) => ({
    patientId: pid,
    doctorId: doctorUserId,
    title: 'Reja FT-04.3',
    stages: [
      { serviceId: svcId, serviceName: 'Plomba', cost: 1, estimatedVisits: 1 },
      { serviceName: 'Erkin ish', cost: 55_555, estimatedVisits: 1 },
    ],
  });

  const stagesOf = (planId: string) =>
    inTenant((tx) =>
      tx
        .select({
          cost: treatmentStages.cost,
          listPrice: treatmentStages.listPrice,
          discountPercent: treatmentStages.discountPercent,
        })
        .from(treatmentStages)
        .where(eq(treatmentStages.treatmentPlanId, planId))
        .orderBy(treatmentStages.sequence),
    );

  let planId: string;

  test("Doktor (discount.give'siz), bemor 10%: cost netto, list_price va foiz snapshot", async () => {
    expect(await patientDiscount(patientId)).toBe('10.00');
    const r = await call('doctor', 'POST', '/api/treatment-plans', planBody(patientId));
    expect(r.status).toBe(201);
    planId = r.json.data.id;
    // 200 000 × 0.9 = 180 000; 55 555 × 0.9 = 49 999.5 → round = 50 000.
    expect(Number(r.json.data.totalCost)).toBe(230_000);
    expect(r.json.data.stages.map((s: { cost: string }) => s.cost)).toEqual([
      '180000.00',
      '50000.00',
    ]);
    expect(r.json.data.stages[0].listPrice).toBe('200000.00');
    expect(r.json.data.stages[0].discountPercent).toBe('10.00');
    expect(await stagesOf(planId)).toEqual([
      { cost: '180000.00', listPrice: '200000.00', discountPercent: '10.00' },
      { cost: '50000.00', listPrice: '55555.00', discountPercent: '10.00' },
    ]);
  });

  test('smeta: bosqich narxi netto, list narx va chegirma foizi ko‘rinadi', async () => {
    const r = await call('doctor', 'GET', `/api/treatment-plans/${planId}/estimate`);
    expect(r.status).toBe(200);
    expect(r.json.data.totalCost).toBe(230_000);
    expect(r.json.data.stages[0]).toMatchObject({
      cost: 180_000,
      listPrice: 200_000,
      discountPercent: 10,
    });
  });

  test('qabul qilingan reja → bemor qarzi netto (230 000, brutto 255 555 emas)', async () => {
    await inTenant(async (tx) => {
      await tx
        .update(treatmentPlans)
        .set({ status: 'accepted' })
        .where(eq(treatmentPlans.id, planId));
      await tx
        .update(treatmentStages)
        .set({ acceptance: 'accepted' })
        .where(eq(treatmentStages.treatmentPlanId, planId));
    });
    const r = await call('reception', 'GET', `/api/patients/${patientId}/balance`);
    expect(r.status).toBe(200);
    expect(r.json.data.planDebt).toBe(230_000);
  });

  test('chegirmasiz bemor: cost = narx, discount_percent null, list_price saqlanadi', async () => {
    const created = await call('reception', 'POST', '/api/patients', { fullName: 'Bemor Oddiy' });
    expect(created.status).toBe(201);
    const r = await call('doctor', 'POST', '/api/treatment-plans', planBody(created.json.data.id));
    expect(r.status).toBe(201);
    expect(await stagesOf(r.json.data.id)).toEqual([
      { cost: '200000.00', listPrice: '200000.00', discountPercent: null },
      { cost: '55555.00', listPrice: '55555.00', discountPercent: null },
    ]);
  });

  test("D-2: chegirma o'zgarsa mavjud bosqichlar retroaktiv o'zgarmaydi", async () => {
    const r = await call('reception', 'PATCH', `/api/patients/${patientId}`, {
      defaultDiscountPercent: 25,
    });
    expect(r.status).toBe(200);
    expect(await stagesOf(planId)).toEqual([
      { cost: '180000.00', listPrice: '200000.00', discountPercent: '10.00' },
      { cost: '50000.00', listPrice: '55555.00', discountPercent: '10.00' },
    ]);
    const bal = await call('reception', 'GET', `/api/patients/${patientId}/balance`);
    expect(bal.json.data.planDebt).toBe(230_000);
    await call('reception', 'PATCH', `/api/patients/${patientId}`, { defaultDiscountPercent: 10 });
  });
});

describe("FT-04.3 — POS: bemorning doimiy chegirmasi discount.give'siz kassirda ham", () => {
  /** Xizmat narxi 200 000 (server narxi; client unitPrice e'tiborsiz — CLI-443). */
  const payBody = (pid: string, discount: number, extra: Record<string, unknown> = {}) => ({
    branchId,
    patientId: pid,
    items: [{ serviceId: svcId, quantity: 1, unitPrice: 1, serviceName: 'Plomba' }],
    discount,
    paidAmount: 200_000 - discount,
    paymentMethod: 'cash',
    ...extra,
  });
  const txCount = () =>
    inTenant(
      async (tx) =>
        (await tx.select({ id: cashierTransactions.id }).from(cashierTransactions)).length,
    );

  let plainPatientId: string;
  beforeAll(async () => {
    expect(await patientDiscount(patientId)).toBe('10.00');
    const created = await call('reception', 'POST', '/api/patients', {
      fullName: 'Bemor POS Oddiy',
    });
    plainPatientId = created.json.data.id;
  });

  test('Kassir: bemor 10% → aynan 20 000 chegirma → 201, foiz 10.00, audit manbasi patient_default', async () => {
    const r = await call('kassir', 'POST', '/api/cashier/transactions', payBody(patientId, 20_000));
    expect(r.status).toBe(201);
    expect(Number(r.json.data.totalAmount)).toBe(180_000);
    expect(r.json.data.discountPercent).toBe('10.00');
    const rows = await inTenant((tx) =>
      tx
        .select({ after: auditLog.after })
        .from(auditLog)
        .where(eq(auditLog.resourceId, r.json.data.id)),
    );
    expect(rows[0]?.after).toMatchObject({
      discount: 20_000,
      discountPercent: '10.00',
      discountSource: 'patient_default',
    });
  });

  test("Kassir: bemor 10%, lekin boshqa summa (30 000) → 403 discount.forbidden, yozuv yo'q", async () => {
    const before = await txCount();
    const r = await call('kassir', 'POST', '/api/cashier/transactions', payBody(patientId, 30_000));
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('discount.forbidden');
    expect(await txCount()).toBe(before);
  });

  test('Kassir: chegirmasiz bemorga chegirma → 403 (FT-04.2 gate saqlanadi)', async () => {
    const before = await txCount();
    const r = await call(
      'kassir',
      'POST',
      '/api/cashier/transactions',
      payBody(plainPatientId, 20_000),
    );
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('discount.forbidden');
    expect(await txCount()).toBe(before);
  });

  test('Receptionist (discount.give): bemor 10% bo‘lsa ham boshqa summa → 201, manba manual', async () => {
    const r = await call(
      'reception',
      'POST',
      '/api/cashier/transactions',
      payBody(patientId, 30_000),
    );
    expect(r.status).toBe(201);
    expect(r.json.data.discountPercent).toBe('15.00');
    const rows = await inTenant((tx) =>
      tx
        .select({ after: auditLog.after })
        .from(auditLog)
        .where(eq(auditLog.resourceId, r.json.data.id)),
    );
    expect(rows[0]?.after).toMatchObject({ discountSource: 'manual' });
  });
});

describe('FT-04.3 (review) — doimiy chegirma tenant chegarasi (max_discount_percent) bilan', () => {
  /** Tenant Admin shablon permset'i (`tenant_settings.edit`) — chegarani faqat u o'zgartiradi. */
  const ADMIN_PERMS = [
    ...(ROLE_TEMPLATES.find((t) => t.templateKey === 'tenant_admin')?.permissions ?? []),
  ] as string[];
  let capPatientId: string;

  const setCap = (max: number) =>
    inTenant(async (tx) => {
      await tx
        .insert(tenantSettings)
        .values({ tenantId, maxDiscountPercent: max })
        .onConflictDoUpdate({ target: tenantSettings.tenantId, set: { maxDiscountPercent: max } });
    });

  beforeAll(async () => {
    expect(ADMIN_PERMS).toContain('tenant_settings.edit');
    expect(ADMIN_PERMS).not.toContain('@owner');
    const [admin] = await db
      .insert(users)
      .values({ phone: '+998900075206', passwordHash: 'x', fullName: 'Admin' })
      .returning({ id: users.id });
    for (const code of ADMIN_PERMS) {
      await db
        .insert(permissions)
        .values({ code, category: code.split('.')[0] ?? 'x' })
        .onConflictDoNothing();
    }
    const adminPermRows = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(inArray(permissions.code, ADMIN_PERMS));
    await inTenant(async (tx) => {
      const [role] = await tx
        .insert(roles)
        .values({ tenantId, name: 'Tenant Admin', isSystem: true, templateKey: 'tenant_admin' })
        .returning({ id: roles.id });
      await tx
        .insert(rolePermissions)
        .values(adminPermRows.map((p) => ({ roleId: role!.id, permissionId: p.id })));
      await tx
        .insert(userAssignments)
        .values({ tenantId, userId: admin!.id, branchId, roleId: role!.id });
      const [pt] = await tx
        .insert(patients)
        .values({ tenantId, fullName: 'Bemor Chegara' })
        .returning({ id: patients.id });
      capPatientId = pt!.id;
    });
    tok.admin = (
      await signAccess({
        sub: admin!.id,
        atid: tenantId,
        abid: branchId,
        perms: ADMIN_PERMS,
        roleKey: null,
        lang: 'uz',
      })
    ).token;
    await setCap(10);
  });

  test("Receptionist: chegara 10 → PATCH 100 (va 15) → 400 patient.discount_exceeds_max, o'zgarmaydi", async () => {
    for (const v of [100, 15, 10.01]) {
      const r = await call('reception', 'PATCH', `/api/patients/${capPatientId}`, {
        defaultDiscountPercent: v,
      });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('patient.discount_exceeds_max');
    }
    expect(await patientDiscount(capPatientId)).toBeNull();
  });

  test('Receptionist: chegara 10 → yaratishda 50 → 400, bemor yaratilmaydi', async () => {
    const r = await call('reception', 'POST', '/api/patients', {
      fullName: 'Chegaradan Oshgan',
      defaultDiscountPercent: 50,
    });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('patient.discount_exceeds_max');
    const rows = await inTenant((tx) =>
      tx
        .select({ id: patients.id })
        .from(patients)
        .where(eq(patients.fullName, 'Chegaradan Oshgan')),
    );
    expect(rows).toHaveLength(0);
  });

  test('Receptionist: chegara 10 → PATCH 10 → 200 (chegarada ruxsat)', async () => {
    const r = await call('reception', 'PATCH', `/api/patients/${capPatientId}`, {
      defaultDiscountPercent: 10,
    });
    expect(r.status).toBe(200);
    expect(await patientDiscount(capPatientId)).toBe('10.00');
  });

  test('Bosqich snapshot: bemor 25% (chegara pasaytirilishidan oldingi qiymat), chegara 10 → cost ≥ narx × 0.9', async () => {
    // Chegaradan oshgan holatni to'g'ridan-to'g'ri yaratamiz (masalan, eski ma'lumot / poyga).
    await inTenant((tx) =>
      tx
        .update(patients)
        .set({ defaultDiscountPercent: '25.00' })
        .where(eq(patients.id, capPatientId)),
    );
    const r = await call('doctor', 'POST', '/api/treatment-plans', {
      patientId: capPatientId,
      doctorId: doctorUserId,
      title: 'Reja chegara',
      stages: [{ serviceId: svcId, serviceName: 'Plomba', cost: 1, estimatedVisits: 1 }],
    });
    expect(r.status).toBe(201);
    expect(r.json.data.stages[0].cost).toBe('180000.00');
    expect(r.json.data.stages[0].listPrice).toBe('200000.00');
    expect(r.json.data.stages[0].discountPercent).toBe('10.00');
    expect(Number(r.json.data.totalCost)).toBe(180_000);
  });

  test("POS: bemor 25%, chegara 10, kassir (discount.give'siz) — chegaradagi avto chegirma (20 000) → 201", async () => {
    const r = await call('kassir', 'POST', '/api/cashier/transactions', {
      branchId,
      patientId: capPatientId,
      items: [{ serviceId: svcId, quantity: 1, unitPrice: 1, serviceName: 'Plomba' }],
      discount: 20_000,
      paidAmount: 180_000,
      paymentMethod: 'cash',
    });
    expect(r.status).toBe(201);
    expect(r.json.data.discountPercent).toBe('10.00');
  });

  test('Tenant Admin: chegarani 5 ga tushiradi → chegaradan oshgan bemor chegirmalari 5.00 ga tushadi', async () => {
    await setCap(100);
    await inTenant((tx) =>
      tx
        .update(patients)
        .set({ defaultDiscountPercent: '25.00' })
        .where(eq(patients.id, capPatientId)),
    );
    const r = await call('admin', 'PATCH', '/api/tenant-settings', { maxDiscountPercent: 5 });
    expect(r.status).toBe(200);
    expect(r.json.data.maxDiscountPercent).toBe(5);
    expect(await patientDiscount(capPatientId)).toBe('5.00');
    // Chegaradan past bemor chegirmasi o'zgarmaydi; chegara 0 → chegirma olib tashlanadi.
    await inTenant((tx) =>
      tx
        .update(patients)
        .set({ defaultDiscountPercent: '3.00' })
        .where(eq(patients.id, capPatientId)),
    );
    expect(
      (await call('admin', 'PATCH', '/api/tenant-settings', { maxDiscountPercent: 4 })).status,
    ).toBe(200);
    expect(await patientDiscount(capPatientId)).toBe('3.00');
    expect(
      (await call('admin', 'PATCH', '/api/tenant-settings', { maxDiscountPercent: 0 })).status,
    ).toBe(200);
    expect(await patientDiscount(capPatientId)).toBeNull();
    await setCap(100);
  });
});
