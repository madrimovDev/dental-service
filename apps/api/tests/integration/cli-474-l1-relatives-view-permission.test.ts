/**
 * CLI-474 (L1) — relatives/emergency-contacts LIST endpoint'lari `patient.view` bilan
 * yetarli bo'lishi kerak, `patient.edit` EMAS (REAL HTTP, real createApp()).
 *
 * Avval ikkalasi ham `patient.edit` bilan gate qilingan edi — Nurse/Technician/
 * Accountant kabi rollar (haqiqatda `patient.view`ga ega, `patient.edit`ga EGA EMAS)
 * favqulodda aloqa/qarindosh ro'yxatini ko'ra olmasdi. Faqat WRITE (POST/DELETE)
 * amallar `patient.edit` talab qilishda qoladi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-474-l1-relatives-view`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  patientEmergencyContacts,
  patientRelatives,
  patients,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

let tenantId: string;
let ownerId: string;
let patientAId: string;
let patientBId: string;
/** `patient.view` bor, `patient.edit` YO'Q — Nurse/Technician/Accountant simulyatsiyasi. */
let viewOnlyToken: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900004741', passwordHash: 'x', fullName: 'Owner474L1' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'ViewOnly Clinic', slug: 'view-only-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [a] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor474L1-A' })
      .returning({ id: patients.id });
    const [b] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor474L1-B' })
      .returning({ id: patients.id });
    if (!a || !b) throw new Error('patient insert failed');
    patientAId = a.id;
    patientBId = b.id;

    await tx.insert(patientRelatives).values({
      tenantId,
      patientId: patientAId,
      relativePatientId: patientBId,
      relationship: 'ukasi',
    });
    await tx.insert(patientEmergencyContacts).values({
      tenantId,
      patientId: patientAId,
      name: 'Ali Valiyev',
      phone: '+998901112233',
      isPrimary: true,
    });
  });

  const { token } = await signAccess({
    sub: ownerId,
    atid: tenantId,
    abid: null,
    perms: ['patient.view'],
    roleKey: null,
    lang: 'uz',
  });
  viewOnlyToken = token;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-474 (L1) — relatives/emergency-contacts list — patient.view yetarli', () => {
  test('GET /api/patients/:id/relatives — patient.view (patient.edit YO`Q) → 200', async () => {
    const app = createApp();
    const res = await app.request(`/api/patients/${patientAId}/relatives`, {
      headers: { authorization: `Bearer ${viewOnlyToken}` },
    });
    expect(res.status).toBe(200);
  });

  test('GET /api/patients/:id/emergency-contacts — patient.view (patient.edit YO`Q) → 200', async () => {
    const app = createApp();
    const res = await app.request(`/api/patients/${patientAId}/emergency-contacts`, {
      headers: { authorization: `Bearer ${viewOnlyToken}` },
    });
    expect(res.status).toBe(200);
  });

  test('POST /api/patients/:id/relatives — patient.view (patient.edit YO`Q) → 403 (write hali ham edit talab qiladi)', async () => {
    const app = createApp();
    const res = await app.request(`/api/patients/${patientAId}/relatives`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${viewOnlyToken}` },
      body: JSON.stringify({ relativePatientId: patientBId, relationship: 'akasi' }),
    });
    expect(res.status).toBe(403);
  });

  test('POST /api/patients/:id/emergency-contacts — patient.view (patient.edit YO`Q) → 403', async () => {
    const app = createApp();
    const res = await app.request(`/api/patients/${patientAId}/emergency-contacts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${viewOnlyToken}` },
      body: JSON.stringify({ name: 'Vali Aliyev', phone: '+998907778899' }),
    });
    expect(res.status).toBe(403);
  });
});
