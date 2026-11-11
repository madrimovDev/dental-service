/**
 * FU-24 Bemorlar (REAL DB, HTTP): Qarzdorlar filtri, «Keyingi tashrif» ustuni, Excel import.
 *
 * Ruxsat real shablon permset bilan sinaladi (Receptionist / Tenant Admin / Branch Manager),
 * `@owner` bilan EMAS:
 *  - `?debt=true` — faqat balansi > 0 (qarz) bemorlar, sahifalash `meta.total` filtrlangan;
 *  - `nextAppointmentAt` — eng yaqin KELAJAK faol yozilish; `appointment.view`siz `null`;
 *  - `POST /patients/import` — `patient.import` (Receptionist 403), dublikat telefon → skipped,
 *    xato qator butun importni buzmaydi, 1001 qator → 400, formula-injection rad, dryRun yozmaydi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env fu24-patients-import`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  appointments,
  auditLog,
  branches,
  cashierTransactions,
  patients,
  tenants,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
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
let branchId: string;
let ids: { debtor: string; payer: string; booked: string; cancelledOnly: string };
let tokens: { reception: string; receptionNoAppt: string; admin: string; manager: string };

const tokenFor = async (perms: string[]) =>
  (
    await signAccess({
      sub: actorId,
      atid: tenantId,
      abid: null,
      perms,
      roleKey: null,
      lang: 'uz',
    })
  ).token;

const app = createApp();
const api = (path: string, token: string, init: RequestInit = {}) =>
  app.request(`/api/patients${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
const importRows = (rows: unknown[], token: string, dryRun = false) =>
  api('/import', token, { method: 'POST', body: JSON.stringify({ rows, dryRun }) });

type ImportBody = {
  data: {
    dryRun: boolean;
    created: number;
    skippedDuplicate: number;
    errorCount: number;
    results: { row: number; status: string; code?: string }[];
  };
};

const countPatients = () =>
  withTenant(tenantId, async (tx) => (await tx.select().from(patients)).length);

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [actor] = await db
    .insert(users)
    .values({ phone: '+998900000241', passwordHash: 'x', fullName: 'Actor FU24' })
    .returning({ id: users.id });
  if (!actor) throw new Error('user insert failed');
  actorId = actor.id;

  const [a, b] = await db
    .insert(tenants)
    .values([
      { name: 'FU24 A', slug: 'fu24-a', ownerUserId: actorId },
      { name: 'FU24 B', slug: 'fu24-b', ownerUserId: actorId },
    ])
    .returning({ id: tenants.id });
  if (!a || !b) throw new Error('tenant insert failed');
  tenantId = a.id;
  otherTenantId = b.id;

  await withTenant(tenantId, async (tx) => {
    const [br] = await tx.insert(branches).values({ tenantId, name: 'Main' }).returning();
    if (!br) throw new Error('branch failed');
    branchId = br.id;
    const [debtor, payer, booked, cancelledOnly] = await tx
      .insert(patients)
      .values([
        { tenantId, fullName: 'Qarzdor Bemor', phone: '+998901110001' },
        { tenantId, fullName: 'Toliq Tolagan', phone: '+998901110002' },
        { tenantId, fullName: 'Yozilgan Bemor', phone: '+998901110003' },
        { tenantId, fullName: 'Bekor Qilingan', phone: '+998901110004' },
      ])
      .returning({ id: patients.id });
    if (!debtor || !payer || !booked || !cancelledOnly) throw new Error('seed failed');
    ids = {
      debtor: debtor.id,
      payer: payer.id,
      booked: booked.id,
      cancelledOnly: cancelledOnly.id,
    };
    // Plansiz kassa: qarz = totalAmount - paidAmount.
    await tx.insert(cashierTransactions).values([
      {
        tenantId,
        branchId,
        patientId: debtor.id,
        totalAmount: '500000',
        paidAmount: '100000',
        paymentMethod: 'cash',
      },
      {
        tenantId,
        branchId,
        patientId: payer.id,
        totalAmount: '200000',
        paidAmount: '200000',
        paymentMethod: 'cash',
      },
    ]);
    const day = 24 * 3600 * 1000;
    const at = (d: number) => new Date(Date.now() + d * day);
    await tx.insert(appointments).values([
      // Eng yaqin KELAJAK faol yozilish (3 kun) + uzoqroq (10 kun) + o'tgan (-2 kun).
      {
        tenantId,
        branchId,
        patientId: booked.id,
        doctorId: actorId,
        startTime: at(10),
        endTime: new Date(at(10).getTime() + 1800_000),
      },
      {
        tenantId,
        branchId,
        patientId: booked.id,
        doctorId: actorId,
        startTime: at(3),
        endTime: new Date(at(3).getTime() + 1800_000),
        status: 'confirmed',
      },
      {
        tenantId,
        branchId,
        patientId: booked.id,
        doctorId: actorId,
        startTime: at(-2),
        endTime: new Date(at(-2).getTime() + 1800_000),
        status: 'completed',
      },
      // Faqat bekor qilingan kelajak yozilish — «keyingi tashrif» hisoblanmaydi.
      {
        tenantId,
        branchId,
        patientId: cancelledOnly.id,
        doctorId: actorId,
        startTime: at(2),
        endTime: new Date(at(2).getTime() + 1800_000),
        status: 'cancelled',
      },
    ]);
  });
  // Boshqa tenantda bir xil telefon — dublikat hisoblanmasligi kerak (RLS).
  await withTenant(otherTenantId, (tx) =>
    tx
      .insert(patients)
      .values({ tenantId: otherTenantId, fullName: 'B Tenant', phone: '+998909990001' }),
  );

  const reception = permsOf('Receptionist');
  tokens = {
    reception: await tokenFor(reception),
    receptionNoAppt: await tokenFor(reception.filter((p) => !p.startsWith('appointment.'))),
    admin: await tokenFor(permsOf('Tenant Admin')),
    manager: await tokenFor(permsOf('Branch Manager')),
  };
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

type ListBody = {
  data: {
    data: { id: string; nextAppointmentAt?: string | null }[];
    meta: { total: number };
  };
};

describe('FU-24 Qarzdorlar filtri', () => {
  test('?debt=true faqat balansi > 0 bemorlarni qaytaradi, meta.total filtrlangan', async () => {
    const res = await api('?debt=true', tokens.reception);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListBody;
    expect(body.data.data.map((p) => p.id)).toEqual([ids.debtor]);
    expect(body.data.meta.total).toBe(1);
  });

  test('debt filtri berilmasa — hamma (qarzdor ham, qarzsiz ham)', async () => {
    const body = (await (await api('?pageSize=50', tokens.reception)).json()) as ListBody;
    expect(body.data.meta.total).toBe(4);
  });

  test('?debt=false — filtr yo‘q (string "false" true bo‘lib qolmaydi)', async () => {
    const body = (await (await api('?debt=false', tokens.reception)).json()) as ListBody;
    expect(body.data.meta.total).toBe(4);
  });
});

describe('FU-24 «Keyingi tashrif» (nextAppointmentAt)', () => {
  test('appointment.view bilan — eng yaqin kelajak faol yozilish', async () => {
    const body = (await (await api('?pageSize=50', tokens.reception)).json()) as ListBody;
    const byId = new Map(body.data.data.map((p) => [p.id, p.nextAppointmentAt ?? null]));
    const next = byId.get(ids.booked);
    expect(next).toBeTruthy();
    const diffDays = (new Date(next as string).getTime() - Date.now()) / (24 * 3600 * 1000);
    expect(diffDays).toBeGreaterThan(2.9);
    expect(diffDays).toBeLessThan(3.1);
    // Faqat bekor qilingan / yozilishsiz bemorlar → null.
    expect(byId.get(ids.cancelledOnly)).toBeNull();
    expect(byId.get(ids.debtor)).toBeNull();
  });

  test('appointment.view yo‘q (Receptionist minus appointment.*) → null', async () => {
    const body = (await (await api('?pageSize=50', tokens.receptionNoAppt)).json()) as ListBody;
    for (const p of body.data.data) expect(p.nextAppointmentAt ?? null).toBeNull();
  });
});

describe('FU-24 Excel import', () => {
  test('Receptionist (patient.import yo‘q) → 403, hech narsa yozilmaydi', async () => {
    const before = await countPatients();
    const res = await importRows(
      [{ fullName: 'Yangi Bemor', phone: '901230000' }],
      tokens.reception,
    );
    expect(res.status).toBe(403);
    expect(await countPatients()).toBe(before);
  });

  test('Tenant Admin va Branch Manager importga ega (shablon)', () => {
    for (const name of ['Tenant Admin', 'Branch Manager']) {
      expect(permsOf(name)).toContain('patient.import');
    }
    expect(permsOf('Receptionist')).not.toContain('patient.import');
  });

  test('yangi / dublikat (bazada + faylda) / xato qatorlar — qolganlari import qilinadi', async () => {
    const before = await countPatients();
    const res = await importRows(
      [
        {
          fullName: 'Yangi Birinchi',
          phone: '90 777 00 01',
          dateOfBirth: '1990-05-01',
          gender: 'male',
        },
        { fullName: 'Mavjud Telefon', phone: '+998 90 111 00 01' }, // bazada bor (Qarzdor Bemor)
        { fullName: 'Yangi Ikkinchi', phone: '+998907770002' },
        { fullName: 'Fayl Ichida Takror', phone: '907770002' }, // faylda 3-qator bilan bir xil
        { fullName: 'X', phone: '+998907770003' }, // ism juda qisqa
        { fullName: 'Noto‘g‘ri Telefon', phone: '123' },
        { fullName: 'Kelajak Tug‘ilgan', phone: '+998907770004', dateOfBirth: '2999-01-01' },
        { fullName: 'Noto‘g‘ri Jins', phone: '+998907770005', gender: 'robot' },
        { fullName: 'Telefonsiz Bemor' },
        { fullName: 'Boshqa Tenant Telefoni', phone: '+998909990001' }, // RLS: dublikat EMAS
      ],
      tokens.admin,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportBody;
    expect(body.data.dryRun).toBe(false);
    expect(body.data.created).toBe(4); // 1, 3, 9 (telefonsiz), 10
    expect(body.data.skippedDuplicate).toBe(2);
    expect(body.data.errorCount).toBe(4);
    const status = new Map(body.data.results.map((r) => [r.row, r.status]));
    expect(status.get(1)).toBe('created');
    expect(status.get(2)).toBe('skipped_duplicate');
    expect(status.get(3)).toBe('created');
    expect(status.get(4)).toBe('skipped_duplicate');
    expect(status.get(5)).toBe('error');
    expect(status.get(6)).toBe('error');
    expect(status.get(7)).toBe('error');
    expect(status.get(8)).toBe('error');
    expect(status.get(9)).toBe('created');
    expect(status.get(10)).toBe('created');
    expect(await countPatients()).toBe(before + 4);

    // Telefon kanonik saqlandi; medical record avtomatik yaratildi.
    const saved = await withTenant(tenantId, (tx) =>
      tx.select().from(patients).where(eq(patients.fullName, 'Yangi Birinchi')),
    );
    expect(saved[0]?.phone).toBe('+998907770001');
    const mr = await withTenant(tenantId, (tx) =>
      tx.execute(
        sql`SELECT count(*)::int AS n FROM medical_records WHERE patient_id = ${saved[0]?.id}`,
      ),
    );
    expect((mr[0] as { n: number }).n).toBe(1);
  });

  test('qayta import (idempotent): hammasi dublikat, yangi bemor yaratilmaydi', async () => {
    const before = await countPatients();
    const res = await importRows(
      [
        { fullName: 'Yangi Birinchi', phone: '+998907770001' },
        { fullName: 'Yangi Ikkinchi', phone: '+998907770002' },
      ],
      tokens.manager,
    );
    const body = (await res.json()) as ImportBody;
    expect(body.data.created).toBe(0);
    expect(body.data.skippedDuplicate).toBe(2);
    expect(await countPatients()).toBe(before);
  });

  test('dryRun hisoblaydi, lekin yozmaydi', async () => {
    const before = await countPatients();
    const res = await importRows(
      [{ fullName: 'Faqat Korish', phone: '+998907771111' }, { fullName: 'Y' }],
      tokens.admin,
      true,
    );
    const body = (await res.json()) as ImportBody;
    expect(body.data.dryRun).toBe(true);
    expect(body.data.created).toBe(1);
    expect(body.data.errorCount).toBe(1);
    expect(await countPatients()).toBe(before);
  });

  test('1001 qator → 400; bo‘sh ro‘yxat → 400; 1000 qator ruxsat', async () => {
    const big = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        fullName: `Ommaviy Bemor ${i}`,
        phone: `+99891${String(5000000 + i).padStart(7, '0')}`,
      }));
    expect((await importRows(big(1001), tokens.admin)).status).toBe(400);
    expect((await importRows([], tokens.admin)).status).toBe(400);
    const before = await countPatients();
    const ok = await importRows(big(1000), tokens.admin);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as ImportBody).data.created).toBe(1000);
    expect(await countPatients()).toBe(before + 1000);
  });

  test('formula-injection: =,+,-,@ bilan boshlangan matn qatori rad etiladi', async () => {
    const before = await countPatients();
    const res = await importRows(
      [
        { fullName: '=HYPERLINK("http://evil","x")', phone: '+998907772001' },
        { fullName: '@SUM(1+1)', phone: '+998907772002' },
        { fullName: 'Oddiy Ism', phone: '+998907772003', address: '-2+3+cmd|calc' },
        { fullName: 'Toza Bemor', phone: '+998907772004', address: 'Toshkent, Chilonzor' },
      ],
      tokens.admin,
    );
    const body = (await res.json()) as ImportBody;
    expect(body.data.created).toBe(1);
    expect(body.data.errorCount).toBe(3);
    expect(
      body.data.results.filter((r) => r.status === 'error').every((r) => r.code === 'unsafe_value'),
    ).toBe(true);
    expect(await countPatients()).toBe(before + 1);
  });

  test('bitta audit yozuvi (patient / import, soni bilan) — har bemor uchun alohida emas', async () => {
    const rows = await withTenant(tenantId, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.action, 'imported')),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.resourceType === 'patient')).toBe(true);
    const first = rows.find((r) => (r.after as { created?: number } | null)?.created === 4);
    expect(first).toBeTruthy();
  });
});
