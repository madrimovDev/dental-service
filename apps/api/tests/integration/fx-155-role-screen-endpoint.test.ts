/**
 * FX-155 review — ekran↔endpoint bo'shlig'i, rol bo'yicha (REAL HTTP `createApp()` + real DB).
 * Shablonlar haqiqiy `provisionTenantInTx` bilan seed qilinadi, tokenlar REAL shablon
 * permset'lari bilan (`@owner` EMAS).
 *
 * Branch Manager va Tenant Admin `prescription.manage`/`medical_record.edit` ga ega, lekin
 * shifokor emas (`is_practitioner=false`) — o'z nomidan yozuv yaratsa server 400
 * `ownership.not_practitioner` qaytaradi. Shuning uchun web «Yangi retsept»/«Yangi vizit»ni
 * `GET /auth/me` dagi `assignments[].isPractitioner` bayrog'iga qarab yashiradi; Tenant Admin
 * `*.on_behalf` bilan shifokor tanlagichidan (`GET /appointments/doctors`) tanlab yozadi.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-155-role-screen-endpoint.test.ts
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { PERMISSIONS, ROLE_TEMPLATES } from '@dental/core';
import {
  patients,
  permissions as permissionsTable,
  roles,
  userAssignments,
  users,
} from '@dental/db-schema';
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
let patientId: string;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};

const inTenant = <T>(fn: (tx: typeof db) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx as unknown as typeof db);
  });

const call = (token: string, method: string, path: string, body?: unknown) =>
  createApp().request(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      // Rate-limit bucket'lari to'qnashmasin (cli-226/477 darsi).
      'x-real-ip': `10.155.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const rxBody = (doctorId: string) => ({
  patientId,
  doctorId,
  items: [{ medicationName: 'Paracetamol', dosage: '500mg', frequency: '2x', durationDays: 3 }],
  // Bemor allergiyasi kiritilmagan — server noma'lum allergiyani bloklamaydi, faqat to'qnashuvni.
});

const errCode = async (res: Response) =>
  ((await res.json()) as { error?: { code?: string } }).error?.code;

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
      tenantName: 'FX155 Roles',
      ownerPhone: '+998900155000',
      ownerFullName: 'Owner 155',
      ownerPassword: 'Passw0rd!x',
      defaultLanguage: 'uz',
    }),
  );
  tenantId = res.tenantId;

  for (const [key, phone, name] of [
    ['doctor', '+998900155001', 'Doc 155'],
    ['branch_manager', '+998900155002', 'Manager 155'],
    ['tenant_admin', '+998900155003', 'Admin 155'],
  ] as const) {
    const [u] = await db
      .insert(users)
      .values({ phone, passwordHash: 'x', fullName: name })
      .returning({ id: users.id });
    if (!u) throw new Error('user insert failed');
    ids[key] = u.id;
    await inTenant(async (tx) => {
      const [r] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.templateKey, key));
      if (!r) throw new Error(`role ${key} not seeded`);
      await tx
        .insert(userAssignments)
        .values({ userId: u.id, tenantId, roleId: r.id, isActive: true, acceptedAt: new Date() });
    });
    tokens[key] = (
      await signAccess({
        sub: u.id,
        atid: tenantId,
        abid: null,
        perms: templatePerms(key),
        roleKey: key,
        lang: 'uz',
      })
    ).token;
  }
  patientId = await inTenant(async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor 155R' })
      .returning({ id: patients.id });
    return p!.id;
  });
});

describe('FX-155 review — GET /auth/me shifokor belgisi (web yaratish tugmasini shunga qarab ko‘rsatadi)', () => {
  test.each([
    ['doctor', true],
    ['branch_manager', false],
    ['tenant_admin', false],
  ] as const)('%s → assignments[].isPractitioner = %p', async (key, expected) => {
    const res = await call(tokens[key] as string, 'GET', '/auth/me');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { assignments: { tenantId: string; isPractitioner?: boolean }[] };
    };
    const mine = body.data.assignments.filter((a) => a.tenantId === tenantId);
    expect(mine.length).toBe(1);
    expect(mine[0]?.isPractitioner).toBe(expected);
  });
});

describe('FX-155 review — retsept, real shablon permset bilan', () => {
  test('Branch Manager o‘z nomidan → 400 ownership.not_practitioner (UI yashiradi)', async () => {
    expect(templatePerms('branch_manager')).toContain('prescription.manage');
    const res = await call(
      tokens.branch_manager as string,
      'POST',
      '/prescriptions',
      rxBody(ids.branch_manager as string),
    );
    expect(res.status).toBe(400);
    expect(await errCode(res)).toBe('ownership.not_practitioner');
  });

  test('Branch Manager shifokor nomidan → 403 (on_behalf yo‘q)', async () => {
    const res = await call(
      tokens.branch_manager as string,
      'POST',
      '/prescriptions',
      rxBody(ids.doctor as string),
    );
    expect(res.status).toBe(403);
    expect(await errCode(res)).toBe('prescription.on_behalf_forbidden');
  });

  test('Tenant Admin tanlagich manbasini o‘qiy oladi va shifokor nomidan yozadi → 201', async () => {
    const list = await call(tokens.tenant_admin as string, 'GET', '/appointments/doctors');
    expect(list.status).toBe(200);
    const doctors = ((await list.json()) as { data: { id: string }[] }).data.map((d) => d.id);
    expect(doctors).toContain(ids.doctor);
    expect(doctors).not.toContain(ids.tenant_admin);

    const res = await call(
      tokens.tenant_admin as string,
      'POST',
      '/prescriptions',
      rxBody(ids.doctor as string),
    );
    expect(res.status).toBe(201);
  });

  test('Doctor o‘z nomidan → 201', async () => {
    const res = await call(
      tokens.doctor as string,
      'POST',
      '/prescriptions',
      rxBody(ids.doctor as string),
    );
    expect(res.status).toBe(201);
  });
});

describe('FX-155 review — vizit yozuvi, real shablon permset bilan', () => {
  test('Branch Manager o‘z nomidan → 400, shifokor nomidan → 403', async () => {
    const self = await call(tokens.branch_manager as string, 'POST', '/visit-notes', {
      patientId,
      doctorId: ids.branch_manager,
    });
    expect(self.status).toBe(400);
    expect(await errCode(self)).toBe('ownership.not_practitioner');
    const other = await call(tokens.branch_manager as string, 'POST', '/visit-notes', {
      patientId,
      doctorId: ids.doctor,
    });
    expect(other.status).toBe(403);
    expect(await errCode(other)).toBe('visit_note.on_behalf_forbidden');
  });

  test('Tenant Admin shifokor nomidan → 201; Doctor o‘z nomidan → 201', async () => {
    const ta = await call(tokens.tenant_admin as string, 'POST', '/visit-notes', {
      patientId,
      doctorId: ids.doctor,
      subjective: 'og‘riq',
    });
    expect(ta.status).toBe(201);
    const doc = await call(tokens.doctor as string, 'POST', '/visit-notes', {
      patientId,
      doctorId: ids.doctor,
      subjective: 'og‘riq',
    });
    expect(doc.status).toBe(201);
  });
});
