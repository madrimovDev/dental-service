/**
 * FX-24 (LA-40) — bron so'rovi muddati tugaganda (24 soat YOKI so'ralgan slot o'tganda)
 * bemorga Telegram xabari; o'tgan slotni tasdiqlash 409 `booking_request.expired` (so'rov
 * abadiy `pending` qolmaydi). REAL DB + real route (JWT, RLS) + real messenger (fetch mock) +
 * cheklangan rol (Receptionist, `@owner` EMAS).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-24-booking-expiry-notify.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { ROLE_TEMPLATES } from '@dental/core';
import {
  bookingRequests,
  branches,
  patients,
  roles,
  tenantSettings,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createAdminDb, db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { encryptSecret } from '../../src/lib/crypto.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { createPatientMessenger } from '../../src/lib/telegram/notify.ts';
import { expireAndNotifyStaleBookingRequests } from '../../src/modules/booking-requests/index.ts';
import { grantTenantWide } from './_grant-scope.ts';

const secretPath = `${import.meta.dir}/.fx-24-secret-test.txt`;
process.env.MESSAGING_SECRET_PATH = secretPath;
const { createApp } = await import('../../src/app.ts');

type FetchCall = { url: string; body: string };
let fetchCalls: FetchCall[] = [];
const realFetch = globalThis.fetch;
const tgCalls = () => fetchCalls.filter((c) => c.url.includes('api.telegram.org'));

const CHAT_1 = '7001';
const CHAT_2 = '7002';
let tenantA: string;
let tenantB: string;
let branchA: string;
let branchB: string;
let patient1: string;
let patient2: string;
let patientB: string;
let doctorId: string;
let recepId: string;
let token: string;

const call = (method: string, path: string, body?: unknown) =>
  createApp().request(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const seed = (o: {
  tenantId?: string;
  branchId?: string;
  patientId?: string;
  start: Date;
  createdAt?: Date;
}) =>
  withTenant(o.tenantId ?? tenantA, async (tx) => {
    const [r] = await tx
      .insert(bookingRequests)
      .values({
        tenantId: o.tenantId ?? tenantA,
        branchId: o.branchId ?? branchA,
        patientId: o.patientId ?? patient1,
        doctorId,
        requestedStart: o.start,
        createdAt: o.createdAt,
      })
      .returning({ id: bookingRequests.id });
    return r!.id;
  });

const statusOf = (id: string, tenantId = tenantA) =>
  withTenant(tenantId, async (tx) => {
    const [r] = await tx.select().from(bookingRequests).where(eq(bookingRequests.id, id));
    return r!.status;
  });

const HOUR = 3_600_000;

beforeAll(async () => {
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), body: typeof init?.body === 'string' ? init.body : '' });
    return new Response(JSON.stringify({ result: { message_id: 7 } }), { status: 200 });
  }) as unknown as typeof fetch;

  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const us = await db
    .insert(users)
    .values([
      { phone: '+998900002401', passwordHash: 'x', fullName: 'Owner' },
      { phone: '+998900002402', passwordHash: 'x', fullName: 'Recep' },
      { phone: '+998900002403', passwordHash: 'x', fullName: 'Doktor' },
    ])
    .returning({ id: users.id });
  recepId = us[1]!.id;
  doctorId = us[2]!.id;
  const ts = await db
    .insert(tenants)
    .values([
      { name: 'A', slug: 'fx24-a', ownerUserId: us[0]!.id, defaultLanguage: 'uz' },
      { name: 'B', slug: 'fx24-b', ownerUserId: us[0]!.id, defaultLanguage: 'uz' },
    ])
    .returning({ id: tenants.id });
  tenantA = ts[0]!.id;
  tenantB = ts[1]!.id;

  await withTenant(tenantA, async (tx) => {
    const [b] = await tx.insert(branches).values({ tenantId: tenantA, name: 'Br' }).returning();
    branchA = b!.id;
    const [role] = await tx
      .insert(roles)
      .values({ tenantId: tenantA, name: 'Doctor', isPractitioner: true })
      .returning();
    await tx.insert(userAssignments).values({
      userId: doctorId,
      tenantId: tenantA,
      roleId: role!.id,
      branchId: null,
      isActive: true,
      acceptedAt: new Date(),
    });
    await grantTenantWide(tx as never, tenantA, recepId, [
      'appointment.view',
      'appointment.create',
    ]);
    const ps = await tx
      .insert(patients)
      .values([
        { tenantId: tenantA, fullName: 'Bemor 1', phone: '+998901002401', telegramChatId: CHAT_1 },
        {
          tenantId: tenantA,
          fullName: 'Bemor 2',
          phone: '+998901002402',
          telegramChatId: CHAT_2,
          preferredLanguage: 'ru',
        },
      ])
      .returning({ id: patients.id });
    patient1 = ps[0]!.id;
    patient2 = ps[1]!.id;
    await tx.insert(tenantSettings).values({
      tenantId: tenantA,
      integrationSettings: { telegram: { botTokenEnc: encryptSecret('fx24-token') } },
    });
  });
  await withTenant(tenantB, async (tx) => {
    const [b] = await tx.insert(branches).values({ tenantId: tenantB, name: 'BB' }).returning();
    branchB = b!.id;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: tenantB, fullName: 'B bemor', phone: '+998901002409' })
      .returning();
    patientB = p!.id;
  });

  const tpl = ROLE_TEMPLATES.find((t) => t.templateKey === 'receptionist')!;
  ({ token } = await signAccess({
    sub: recepId,
    atid: tenantA,
    abid: null,
    perms: [...tpl.permissions] as string[],
    roleKey: 'receptionist',
    lang: 'uz',
  }));
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  if (existsSync(secretPath)) rmSync(secretPath);
});

beforeEach(() => {
  fetchCalls = [];
});

describe('FX-24 — bron so‘rovi muddati tugashi bemorga xabar qiladi', () => {
  test('24 soatdan eski pending: list (lazy expiry) → expired + bemorga xabar (bir marta)', async () => {
    const id = await seed({
      start: new Date(Date.now() + 48 * HOUR),
      createdAt: new Date(Date.now() - 25 * HOUR),
    });
    const res = await call('GET', '/api/booking-requests?status=pending');
    expect(res.status).toBe(200);
    expect(await statusOf(id)).toBe('expired');
    const tg = tgCalls();
    expect(tg).toHaveLength(1);
    expect(tg[0]!.url).toContain('fx24-token');
    expect(tg[0]!.body).toContain(`"chat_id":"${CHAT_1}"`);
    expect(tg[0]!.body).toContain('muddati o‘tdi');

    // Qayta list — qayta xabar yo'q (idempotent).
    await call('GET', '/api/booking-requests?status=pending');
    expect(tgCalls()).toHaveLength(1);
  });

  test('so‘ralgan slot o‘tib ketgan (yangi so‘rov): list expired qiladi va xabar yuboradi', async () => {
    const id = await seed({ start: new Date(Date.now() - 2 * HOUR) });
    await call('GET', '/api/booking-requests?status=pending');
    expect(await statusOf(id)).toBe('expired');
    expect(tgCalls()).toHaveLength(1);
  });

  test('o‘tgan slotni confirm: 409 booking_request.expired, so‘rov expired, bemorga xabar', async () => {
    const id = await seed({ start: new Date(Date.now() - 30 * 60_000), patientId: patient2 });
    const res = await call('POST', `/api/booking-requests/${id}/confirm`, {});
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'booking_request.expired',
    );
    expect(await statusOf(id)).toBe('expired');
    const tg = tgCalls();
    expect(tg).toHaveLength(1);
    expect(tg[0]!.body).toContain(`"chat_id":"${CHAT_2}"`);
    expect(tg[0]!.body).toContain('истек'); // bemor tili ru
  });

  test('taymer yo‘li (admin conn, barcha tenantlar): expired + faqat sozlangan tenant bemoriga xabar', async () => {
    const mine = await seed({
      start: new Date(Date.now() + 5 * HOUR),
      createdAt: new Date(Date.now() - 26 * HOUR),
    });
    const other = await seed({
      tenantId: tenantB,
      branchId: branchB,
      patientId: patientB,
      start: new Date(Date.now() + 5 * HOUR),
      createdAt: new Date(Date.now() - 26 * HOUR),
    });
    const fresh = await seed({ start: new Date(Date.now() + 5 * HOUR) });
    const admin = createAdminDb();
    try {
      const n = await expireAndNotifyStaleBookingRequests(admin.db, createPatientMessenger());
      expect(n).toBe(2);
    } finally {
      await admin.client.end({ timeout: 5 });
    }
    expect(await statusOf(mine)).toBe('expired');
    expect(await statusOf(other, tenantB)).toBe('expired');
    expect(await statusOf(fresh)).toBe('pending');
    // B tenantda bot yo'q → jim; A tenantda bitta xabar.
    expect(tgCalls()).toHaveLength(1);
    expect(tgCalls()[0]!.body).toContain(`"chat_id":"${CHAT_1}"`);
    await withTenant(tenantA, (tx) =>
      tx.delete(bookingRequests).where(eq(bookingRequests.id, fresh)),
    );
  });
});
