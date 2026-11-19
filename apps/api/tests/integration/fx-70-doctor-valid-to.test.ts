/**
 * FX-70 — yozilish uchun shifokorlar ro'yxati muddati o'tgan (`valid_to < now`) tayinlovlarni
 * qaytarmasligi kerak. REAL DB + real route (JWT, RLS) + cheklangan rol (Receptionist, `@owner` EMAS).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-70-doctor-valid-to.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { branches, roles, tenants, userAssignments, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { appointmentRoutes } from '../../src/modules/appointments/appointments.routes.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { grantTenantWide } from './_grant-scope.ts';

const receptionist = ROLE_TEMPLATES.find((t) => t.templateKey === 'receptionist');
if (!receptionist) throw new Error('receptionist template not found');
const receptionistPerms = [...receptionist.permissions] as string[];

const withTenant = <T>(tenantId: string, fn: (tx: typeof db) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx as unknown as typeof db);
  });

let tenantId: string;
let branchX: string;
let token: string;
let docActive: string; // validTo NULL
let docFuture: string; // validTo kelajakda
let docExpired: string; // validTo o'tgan

const app = appointmentRoutes({
  db,
  audit: { record: async () => {} },
  service: createAppointmentsService({ audit: { record: async () => {} } }),
});

const doctorIds = async (qs = '') => {
  const res = await app.request(`/doctors${qs}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { id: string }[] }).data.map((d) => d.id).sort();
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const us = await db
    .insert(users)
    .values(
      ['Owner', 'Recep', 'DocActive', 'DocFuture', 'DocExpired'].map((n, i) => ({
        phone: `+99890000370${i}`,
        passwordHash: 'x',
        fullName: n,
      })),
    )
    .returning({ id: users.id });
  const ids = us.map((u) => u.id);
  const [owner, recep] = [ids[0]!, ids[1]!];
  [docActive, docFuture, docExpired] = ids.slice(2) as [string, string, string];

  const [t] = await db
    .insert(tenants)
    .values({ name: 'T', slug: 'fx70', ownerUserId: owner })
    .returning({ id: tenants.id });
  tenantId = t!.id;

  await withTenant(tenantId, async (tx) => {
    const [br] = await tx.insert(branches).values({ tenantId, name: 'X' }).returning();
    branchX = br!.id;
    const [doctorRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Doctor', isPractitioner: true })
      .returning();
    const now = new Date();
    const a = (userId: string, roleId: string, extra = {}) => ({
      userId,
      tenantId,
      roleId,
      branchId: null,
      isActive: true,
      acceptedAt: now,
      ...extra,
    });
    await tx
      .insert(userAssignments)
      .values([
        a(docActive, doctorRole!.id),
        a(docFuture, doctorRole!.id, { validTo: new Date(now.getTime() + 7 * 86_400_000) }),
        a(docExpired, doctorRole!.id, { validTo: new Date(now.getTime() - 86_400_000) }),
      ]);
    // FX-133: `/doctors` filial doirasi tayinlovlardan o'qiladi — Registrator'ga real
    // tenant-wide tayinlov (receptionist permset, is_practitioner=false).
    await grantTenantWide(tx, tenantId, recep, receptionistPerms);
  });

  token = (
    await signAccess({
      sub: recep,
      atid: tenantId,
      abid: null,
      perms: receptionistPerms,
      roleKey: 'receptionist',
      lang: 'uz' as const,
    })
  ).token;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-70 — muddati o`tgan tayinlov shifokor ro`yxatida YO`Q', () => {
  test('sanity: Receptionist @owner emas', () => {
    expect(receptionistPerms).not.toContain('@owner');
  });

  test('filialsiz ro`yxat: validTo<now doktor chiqarilmaydi', async () => {
    expect(await doctorIds()).toEqual([docActive, docFuture].sort());
  });

  test('filial bo`yicha ro`yxat: validTo<now doktor chiqarilmaydi', async () => {
    expect(await doctorIds(`?branchId=${branchX}`)).toEqual([docActive, docFuture].sort());
  });
});
