/**
 * FU-41 — shifokor belgisi `roles.is_practitioner` (permission emas). Branch Manager
 * endi filial shablonlarining superset'i (`medical_record.edit` bor), lekin yozilish
 * shifokorlar ro'yxatiga TUSHMASLIGI kerak. REAL HTTP (`createApp()`) + real DB;
 * shablonlar haqiqiy `provisionTenantInTx` yo'li bilan seed qilinadi (shablon
 * bayrog'i → rol qatori), ruxsat REAL cheklangan permset (Receptionist) bilan sinaladi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fu41-practitioner-flag.test.ts`
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { PERMISSIONS, ROLE_TEMPLATES } from '@dental/core';
import { permissions as permissionsTable, roles, userAssignments, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { provisionTenantInTx } from '../../src/modules/auth/auth.service.ts';

const templatePerms = (key: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === key);
  if (!t) throw new Error(`template not found: ${key}`);
  return [...t.permissions];
};

let tenantId: string;
let ownerId: string;
let ownerToken: string;
let receptionistToken: string;
const userIds: Record<string, string> = {};

const tokenFor = async (userId: string, perms: string[]) =>
  (await signAccess({ sub: userId, atid: tenantId, abid: null, perms, roleKey: 'x', lang: 'uz' }))
    .token;

const call = (token: string, method: string, path: string, body?: unknown) =>
  createApp().request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const assign = (userId: string, roleId: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx
      .insert(userAssignments)
      .values({ userId, tenantId, roleId, isActive: true, acceptedAt: new Date() });
  });

const roleIdByKey = async (key: string): Promise<string> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [r] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.templateKey, key));
    if (!r) throw new Error(`role ${key} not seeded`);
    return r.id;
  });

const mkUser = async (phone: string, fullName: string) => {
  const [u] = await db
    .insert(users)
    .values({ phone, passwordHash: 'x', fullName })
    .returning({ id: users.id });
  if (!u) throw new Error('user insert failed');
  return u.id;
};

const doctorNames = async (): Promise<string[]> => {
  const res = await call(receptionistToken, 'GET', '/appointments/doctors');
  expect(res.status).toBe(200);
  const body = (await res.json()) as { data: { id: string; name: string }[] };
  return body.data.map((d) => d.name);
};

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
  const res = await db.transaction((tx) =>
    provisionTenantInTx(tx, {
      tenantName: 'FU41 Clinic',
      ownerPhone: '+998900041000',
      ownerFullName: 'Owner FU41',
      ownerPassword: 'Passw0rd!x',
      defaultLanguage: 'uz',
    }),
  );
  tenantId = res.tenantId;
  ownerId = res.userId;
  ownerToken = await tokenFor(ownerId, ['@owner']);
  receptionistToken = await tokenFor(
    await mkUser('+998900041009', 'Recep'),
    templatePerms('receptionist'),
  );

  for (const [key, phone, name] of [
    ['doctor', '+998900041001', 'Doc Solo'],
    ['doctor_assistant', '+998900041002', 'Doc Assist'],
    ['branch_manager', '+998900041003', 'Manager Bm'],
    ['nurse', '+998900041004', 'Nurse N'],
    ['tenant_admin', '+998900041005', 'Admin A'],
  ] as const) {
    userIds[key] = await mkUser(phone, name);
    await assign(userIds[key] as string, await roleIdByKey(key));
  }
});

describe('FU-41 shifokor belgisi', () => {
  test('shablon seed: faqat doctor va doctor_assistant is_practitioner=true', async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx
        .select({ key: roles.templateKey, p: roles.isPractitioner })
        .from(roles)
        .where(eq(roles.isSystem, true));
    });
    const flagged = rows.filter((r) => r.p).map((r) => r.key);
    expect([...flagged].sort()).toEqual(['doctor', 'doctor_assistant']);
  });

  test('Branch Manager (medical_record.edit bor) shifokorlar ro‘yxatida YO‘Q; Doctor bor', async () => {
    // BM superset ekanini ham qulflaymiz — aks holda test ma'nosiz.
    expect(templatePerms('branch_manager')).toContain('medical_record.edit');
    const names = await doctorNames();
    expect(names).toContain('Doc Solo');
    expect(names).toContain('Doc Assist');
    expect(names).not.toContain('Manager Bm');
    expect(names).not.toContain('Admin A');
    expect(names).not.toContain('Nurse N');
  });

  test('custom rol isPractitioner:true bilan shifokor ro‘yxatida; PATCH bilan o‘chirilsa — yo‘q', async () => {
    const created = await call(ownerToken, 'POST', '/roles', {
      name: 'Ortodont',
      permissions: ['medical_record.edit', 'patient.view'],
      isPractitioner: true,
    });
    expect(created.status).toBe(201);
    const role = ((await created.json()) as { data: { id: string; isPractitioner: boolean } }).data;
    expect(role.isPractitioner).toBe(true);

    const uid = await mkUser('+998900041010', 'Orto Doc');
    await assign(uid, role.id);
    expect(await doctorNames()).toContain('Orto Doc');

    const patched = await call(ownerToken, 'PATCH', `/roles/${role.id}`, { isPractitioner: false });
    expect(patched.status).toBe(200);
    expect(await doctorNames()).not.toContain('Orto Doc');
  });

  test('isPractitioner default false: medical_record.edit bor, belgisiz custom rol — ro‘yxatda yo‘q', async () => {
    const created = await call(ownerToken, 'POST', '/roles', {
      name: 'Klinik belgisiz',
      permissions: ['medical_record.edit'],
    });
    expect(created.status).toBe(201);
    const role = ((await created.json()) as { data: { id: string; isPractitioner: boolean } }).data;
    expect(role.isPractitioner).toBe(false);
    const uid = await mkUser('+998900041011', 'No Flag');
    await assign(uid, role.id);
    expect(await doctorNames()).not.toContain('No Flag');
  });
});
