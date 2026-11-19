/**
 * FX-130 (LC-08) — maosh `user.view` bilan ochiq edi; `salary.view` o'lik edi. Endi
 * `GET/PUT /users/{id}/profile` javobida `baseSalary`/`commissionPercent` faqat `salary.view`
 * (yoki payroll.view/manage, @owner) bilan ko'rinadi, aks holda niqoblanadi ('0.00').
 * `cashier.void`, `notification.view/manage` hech qaerda tekshirilmasdi — katalog va
 * shablonlardan olib tashlandi. REAL HTTP + real DB + cheklangan permset (@owner emas).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-130-salary-dead-perms.test.ts`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PERMISSIONS, ROLE_TEMPLATES } from '@dental/core';
import {
  permissions as permissionsTable,
  roles,
  staffProfiles,
  tenants,
  userAssignments,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

let tenantId: string;
let ownerId: string;
let viewerId: string;
let targetId: string;

const tokenFor = async (userId: string, perms: string[]) =>
  (
    await signAccess({
      sub: userId,
      atid: tenantId,
      abid: null,
      perms,
      roleKey: 'x',
      lang: 'uz',
    })
  ).token;

const call = (token: string, method: string, path: string, body?: unknown) =>
  createApp().request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const withTx = <T>(fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
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
  const mk = async (phone: string, fullName: string) => {
    const [u] = await db
      .insert(users)
      .values({ phone, passwordHash: 'x', fullName })
      .returning({ id: users.id });
    if (!u) throw new Error('user insert failed');
    return u.id;
  };
  ownerId = await mk('+998900130001', 'OwnerFx130');
  viewerId = await mk('+998900130002', 'Viewer');
  targetId = await mk('+998900130003', 'Target');
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX130', slug: 'fx130', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await withTx(async (tx) => {
    const [r] = await tx.insert(roles).values({ tenantId, name: 'R' }).returning({ id: roles.id });
    await tx.insert(userAssignments).values({
      userId: targetId,
      tenantId,
      roleId: r!.id,
      branchId: null,
      isActive: true,
      acceptedAt: new Date(),
    });
    await tx.insert(staffProfiles).values({
      tenantId,
      userId: targetId,
      specialty: 'Ortodont',
      baseSalary: '7500000',
      commissionPercent: '12.50',
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-130 — profil maoshi salary.view bilan', () => {
  test('user.view (salary.view yo`q) — maosh niqoblanadi, boshqa maydonlar ko`rinadi', async () => {
    const token = await tokenFor(viewerId, ['user.view']);
    const res = await call(token, 'GET', `/users/${targetId}/profile`);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Record<string, string> };
    expect(data.specialty).toBe('Ortodont');
    expect(data.baseSalary).toBe('0.00');
    expect(data.commissionPercent).toBe('0.00');
  });

  test('user.view + salary.view — haqiqiy maosh', async () => {
    const token = await tokenFor(viewerId, ['user.view', 'salary.view']);
    const res = await call(token, 'GET', `/users/${targetId}/profile`);
    const { data } = (await res.json()) as { data: Record<string, string> };
    expect(data.baseSalary).toBe('7500000.00');
    expect(data.commissionPercent).toBe('12.50');
  });

  test('@owner — haqiqiy maosh', async () => {
    const token = await tokenFor(ownerId, ['@owner']);
    const res = await call(token, 'GET', `/users/${targetId}/profile`);
    const { data } = (await res.json()) as { data: Record<string, string> };
    expect(data.baseSalary).toBe('7500000.00');
  });

  test('PUT: user.manage + payroll.manage (salary.view yo`q) — o`zi yozgan qiymatni ko`radi', async () => {
    const token = await tokenFor(viewerId, ['user.manage', 'payroll.manage']);
    const res = await call(token, 'PUT', `/users/${targetId}/profile`, {
      baseSalary: 8000000,
      commissionPercent: 10,
    });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Record<string, string> };
    expect(data.baseSalary).toBe('8000000.00');
  });
});

describe('FX-130 — o`lik permission kodlari', () => {
  const DEAD = ['cashier.void', 'notification.view', 'notification.manage'];
  test('katalogda va rol shablonlarida yo`q; salary.view hali bor', () => {
    const codes = new Set(PERMISSIONS.map((p) => p.code as string));
    for (const code of DEAD) expect(codes.has(code)).toBe(false);
    expect(codes.has('salary.view')).toBe(true);
    for (const tpl of ROLE_TEMPLATES) {
      for (const code of DEAD)
        expect((tpl.permissions as readonly string[]).includes(code)).toBe(false);
    }
  });
});
