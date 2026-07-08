/**
 * L12 (audit 2026-07-06) — treatment-plans/lab-orders `create()` avval
 * `ownership.ts` validatorini ishlatmasdi: noto'g'ri/mavjud bo'lmagan
 * `patientId` bilan `POST /treatment-plans` yoki `POST /lab-orders` chaqirilsa,
 * FK constraint bevosita Postgres xatosi sifatida chiqib, xom 500 qaytardi
 * (xavfsizlik teshigi EMAS — RLS baribir tenant izolyatsiyasini saqlaydi —
 * lekin toza 400 o'rniga noaniq 500).
 *
 * Fix: `visit-notes.service.ts`dagi pattern (CLI-421) bo'yicha
 * `createOwnershipValidator().assertPatientExists` `treatment-plans.service.ts::
 * createPlan` va `lab-orders.service.ts::create`ga qo'shildi; routes
 * `CrossEntityError` ni 400 `ownership.not_found`ga aylantiradi.
 *
 * Real `createApp()` + real HTTP + real DB (tenant/owner seed, patient YO'Q —
 * mavjud bo'lmagan random UUID patientId ataylab yuboriladi).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env treatment-plans-lab-orders-ownership`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

let tenantId: string;
let ownerId: string;
let ownerToken: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900004120', passwordHash: 'x', fullName: 'Owner L12' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'L12 Clinic', slug: 'l12-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  const { token } = await signAccess({
    sub: ownerId,
    atid: tenantId,
    abid: null,
    perms: ['@owner'],
    roleKey: null,
    lang: 'uz',
  });
  ownerToken = token;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('L12 — treatment-plans/lab-orders create() ownership validation', () => {
  test("POST /api/treatment-plans — mavjud bo'lmagan patientId → 400 ownership.not_found (500 EMAS)", async () => {
    const app = createApp();
    const res = await app.request('/api/treatment-plans', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        patientId: crypto.randomUUID(),
        doctorId: ownerId,
        title: 'L12 Test Reja',
        stages: [],
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('ownership.not_found');
  });

  test("POST /api/lab-orders — mavjud bo'lmagan patientId → 400 ownership.not_found (500 EMAS)", async () => {
    const app = createApp();
    const res = await app.request('/api/lab-orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        patientId: crypto.randomUUID(),
        doctorId: ownerId,
        labName: 'L12 Lab',
        orderType: 'crown',
        items: [{ description: 'Crown 26' }],
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('ownership.not_found');
  });
});
