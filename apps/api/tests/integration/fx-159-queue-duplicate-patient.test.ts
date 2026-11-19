/**
 * FX-159 — Walk-in ticket bemorning yozilishidan mustaqil edi: bir bemorga shu filialda
 * ikkita ochiq (waiting/in_progress) ticket berilardi. Endi 409 `queue.duplicate_ticket`.
 * REAL HTTP + REAL DB + REAL rol permset (receptionist; @owner EMAS).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env fx-159-queue-duplicate-patient`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { branches, patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { seedRoleForUser } from './fx-m2-helpers.ts';

const permsFor = (k: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === k);
  if (!t) throw new Error(`template ${k}`);
  return [...t.permissions];
};

let tenantId: string;
let branchId: string;
let otherBranchId: string;
let patientA: string;
let patientB: string;
let token: string;

const req = (method: string, path: string, body?: unknown) =>
  createApp().request(path, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const ins = await db
    .insert(users)
    .values([
      { phone: '+998900015901', passwordHash: 'x', fullName: 'Owner' },
      { phone: '+998900015902', passwordHash: 'x', fullName: 'Reception' },
    ])
    .returning({ id: users.id });
  const [owner, r] = ins;
  if (!owner || !r) throw new Error('users');
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX159', slug: 'fx-159', ownerUserId: owner.id })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [b1, b2] = await tx
      .insert(branches)
      .values([
        { tenantId, name: 'B1' },
        { tenantId, name: 'B2' },
      ])
      .returning();
    branchId = b1!.id;
    otherBranchId = b2!.id;
    const [pa, pb] = await tx
      .insert(patients)
      .values([
        { tenantId, fullName: 'Bemor A' },
        { tenantId, fullName: 'Bemor B' },
      ])
      .returning({ id: patients.id });
    patientA = pa!.id;
    patientB = pb!.id;
  });
  await seedRoleForUser(tenantId, r.id, null, permsFor('receptionist'));
  token = (
    await signAccess({
      sub: r.id,
      atid: tenantId,
      abid: null,
      perms: permsFor('receptionist'),
      roleKey: 'receptionist',
      lang: 'uz',
    })
  ).token;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-159 bir bemorga bitta ochiq ticket', () => {
  test('ochiq ticketli bemorga ikkinchi walk-in 409 queue.duplicate_ticket', async () => {
    const first = await req('POST', '/api/queue', { branchId, patientId: patientA });
    expect(first.status).toBe(201);
    const second = await req('POST', '/api/queue', { branchId, patientId: patientA });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: { code: string } };
    expect(body.error.code).toBe('queue.duplicate_ticket');
  });

  test('parallel ikki walk-in: faqat bittasi yaratiladi', async () => {
    const [x, y] = await Promise.all([
      req('POST', '/api/queue', { branchId, patientId: patientB }),
      req('POST', '/api/queue', { branchId, patientId: patientB }),
    ]);
    expect([x.status, y.status].sort()).toEqual([201, 409]);
  });

  test('boshqa filialda, yoki bemorsiz walk-in bloklanmaydi', async () => {
    expect(
      (await req('POST', '/api/queue', { branchId: otherBranchId, patientId: patientA })).status,
    ).toBe(201);
    expect((await req('POST', '/api/queue', { branchId })).status).toBe(201);
    expect((await req('POST', '/api/queue', { branchId })).status).toBe(201);
  });

  test('yopilgan (missed) ticketdan keyin bemor qayta navbatga olinadi', async () => {
    const t = await req('POST', '/api/queue', { branchId: otherBranchId, patientId: patientB });
    expect(t.status).toBe(201);
    const id = ((await t.json()) as { data: { id: string } }).data.id;
    expect((await req('PATCH', `/api/queue/${id}/status`, { status: 'missed' })).status).toBe(200);
    expect(
      (await req('POST', '/api/queue', { branchId: otherBranchId, patientId: patientB })).status,
    ).toBe(201);
  });
});
