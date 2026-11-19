/**
 * FX-71 + FX-25r — ko'p tayinlovli foydalanuvchida rol (JWT `roleKey`) va standart filial
 * deterministik bo'lishi kerak: ORDER BY yo'q edi, natija bazaning fizik tartibiga (qaysi
 * tayinlov avval qo'shilgani) bog'liq edi. Endi: klinika miqyosidagi (branchId=null) tayinlov
 * avval, so'ng createdAt, id. Real DB + real HTTP (login → switch-workspace).
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, roles, tenants, userAssignments, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { verifyAccess } from '../../src/lib/jwt.ts';
import { hashPassword } from '../../src/lib/password.ts';
import { closeRateLimitRedis } from '../../src/lib/rate-limit.ts';

const IP = `10.71.0.${Math.floor(Math.random() * 250 + 1)}`;
const PW = 'OrderPass123!';
let tenantId: string;
let mainBranch: string;
let secondBranch: string;
let doctorRole: string;
let recepRole: string;

const call = (token: string | null, method: string, path: string, body?: unknown) =>
  createApp().request(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': IP,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const switchTo = async (phone: string, branchId?: string) => {
  const l = await call(null, 'POST', '/auth/login', { phone, password: PW });
  const ld = ((await l.json()) as { data: { accessToken: string; refreshToken: string } }).data;
  const sw = await call(ld.accessToken, 'POST', '/auth/switch-workspace', {
    tenantId,
    ...(branchId ? { branchId } : {}),
    refreshToken: ld.refreshToken,
  });
  expect(sw.status).toBe(200);
  const sd = ((await sw.json()) as { data: { accessToken: string } }).data;
  return verifyAccess(sd.accessToken);
};

const withTx = <T>(fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const assignOne = (userId: string, roleId: string, branchId: string | null) =>
  withTx((tx) =>
    tx.insert(userAssignments).values({
      tenantId,
      userId,
      roleId,
      branchId,
      isActive: true,
      acceptedAt: new Date(),
    }),
  );

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const hash = await hashPassword(PW);
  const us = await db
    .insert(users)
    .values([
      { phone: '+998900071001', passwordHash: hash, fullName: 'Owner' },
      { phone: '+998900071002', passwordHash: hash, fullName: 'Avval filial, keyin klinika' },
      { phone: '+998900071003', passwordHash: hash, fullName: 'Avval klinika, keyin filial' },
    ])
    .returning({ id: users.id });
  const [owner, u1, u2] = us;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX71 Clinic', slug: 'fx71-clinic', ownerUserId: owner!.id })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await withTx(async (tx) => {
    const [m] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Bosh', createdAt: new Date('2026-01-01') })
      .returning({ id: branches.id });
    const [s] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Ikkinchi', createdAt: new Date('2026-02-01') })
      .returning({ id: branches.id });
    mainBranch = m!.id;
    secondBranch = s!.id;
    const [d] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Doctor', templateKey: 'doctor', isTemplate: false })
      .returning({ id: roles.id });
    const [r] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Receptionist', templateKey: 'receptionist', isTemplate: false })
      .returning({ id: roles.id });
    doctorRole = d!.id;
    recepRole = r!.id;
  });
  // Tartib ataylab har xil: fizik (qo'shilish) tartibi tayinlov turiga bog'liq bo'lmasin.
  await assignOne(u1!.id, doctorRole, secondBranch);
  await assignOne(u1!.id, recepRole, null);
  await assignOne(u2!.id, recepRole, null);
  await assignOne(u2!.id, doctorRole, secondBranch);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await closeRateLimitRedis();
});

describe('FX-71/FX-25r — deterministik rol va standart filial', () => {
  for (const [label, phone] of [
    ['avval filial tayinlovi qo`shilgan', '+998900071002'],
    ['avval klinika tayinlovi qo`shilgan', '+998900071003'],
  ] as const) {
    test(`${label}: filialsiz switch → klinika tayinlovi ustun (eng eski filial)`, async () => {
      const claims = await switchTo(phone);
      expect(claims.abid).toBe(mainBranch);
      expect(claims.roleKey).toBe('receptionist');
    });
    test(`${label}: ikkala tayinlov mos filialda → roleKey klinika tayinlovidan`, async () => {
      const claims = await switchTo(phone, secondBranch);
      expect(claims.abid).toBe(secondBranch);
      expect(claims.roleKey).toBe('receptionist');
    });
  }
});
