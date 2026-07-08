/**
 * CLI-421 — CrossEntityError → 400 route-darajasida (REAL HTTP, real createApp()).
 *
 * ownership.ts validatorlari service qatlamida CrossEntityError tashlaydi, lekin
 * har route buni ANIQ tutib 400ga map qilishi kerak (aks holda global error-handler
 * uni umumiy 500 `internal_error`ga aylantiradi — visit-notes.routes.ts/
 * prescriptions.routes.ts(create) allaqachon shu patternni ishlatadi).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-421-routes-error-mapping`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patients, prescriptions, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

let tenantId: string;
let ownerId: string;
let patientId: string;
let prescriptionId: string;
let ownerToken: string;

const NON_EXISTENT_ID = '00000000-0000-0000-0000-000000000000';

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900004212', passwordHash: 'x', fullName: 'Owner421Routes' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Routes421 Clinic', slug: 'routes421-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor421Routes' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;

    const [rx] = await tx
      .insert(prescriptions)
      .values({
        tenantId,
        patientId,
        doctorId: ownerId,
        items: [{ medicationName: 'Amoxicillin', dosage: '500mg', frequency: '3x/kun' }],
      })
      .returning({ id: prescriptions.id });
    if (!rx) throw new Error('prescription insert failed');
    prescriptionId = rx.id;
  });

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

describe('CLI-421 — route-darajasida CrossEntityError → 400', () => {
  test("POST /api/patients/:id/relatives — mavjud bo'lmagan relativePatientId → 400", async () => {
    const app = createApp();
    const res = await app.request(`/api/patients/${patientId}/relatives`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ relativePatientId: NON_EXISTENT_ID, relationship: 'otasi' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ownership.not_found');
  });

  test("POST /api/patients/:id/emergency-contacts — mavjud bo'lmagan URL id → 400", async () => {
    const app = createApp();
    const res = await app.request(`/api/patients/${NON_EXISTENT_ID}/emergency-contacts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: 'Ali', phone: '+998901112233' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ownership.not_found');
  });

  test("PATCH /api/prescriptions/:id — mavjud bo'lmagan doctorId → 400", async () => {
    const app = createApp();
    const res = await app.request(`/api/prescriptions/${prescriptionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ doctorId: NON_EXISTENT_ID }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('ownership.not_found');
  });
});
