/**
 * FX-61 — terminal/bajarilayotgan planda konsentni qayta bog'lash RAD (409), REAL HTTP + real DB,
 * real cheklangan rol (`medical_record.edit`, @owner EMAS).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env tests/integration/fx-61-consent-terminal-plan.test.ts`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { consentForms, patients, tenants, treatmentPlans, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';

let tenantId: string;
let ownerId: string;
let patientId: string;
let formId: string;
let token: string;

const mkPlan = (
  status: 'draft' | 'presented' | 'accepted' | 'in_progress' | 'completed' | 'cancelled',
) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: ownerId, title: `Plan 61 ${status}`, status })
      .returning({ id: treatmentPlans.id });
    return plan!.id;
  });

const link = (planId: string) =>
  createApp().request(`/api/treatment-plans/${planId}/consent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ consentFormId: formId }),
  });

const consentOf = (planId: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [r] = await tx
      .select({ f: treatmentPlans.consentFormId })
      .from(treatmentPlans)
      .where(eq(treatmentPlans.id, planId));
    return r?.f ?? null;
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000061', passwordHash: 'x', fullName: 'Owner 61' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX-61 Clinic', slug: 'fx-61-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor 61' })
      .returning({ id: patients.id });
    patientId = p!.id;
    const [f] = await tx
      .insert(consentForms)
      .values({
        tenantId,
        patientId,
        type: 'treatment',
        title: 'Davolashga rozilik',
        bodyText: 'Matn',
        language: 'uz',
        signedByUserId: ownerId,
        isPerpetual: true,
        expiresAt: null,
      })
      .returning({ id: consentForms.id });
    formId = f!.id;
  });
  ({ token } = await signAccess({
    sub: ownerId,
    atid: tenantId,
    abid: null,
    perms: ['medical_record.edit'],
    roleKey: null,
    lang: 'uz',
  }));
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-61 — POST /treatment-plans/:id/consent status gate', () => {
  for (const status of ['in_progress', 'completed', 'cancelled'] as const) {
    test(`${status} plan → 409 plan.consent_locked, bog'lanmaydi`, async () => {
      const planId = await mkPlan(status);
      const res = await link(planId);
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('plan.consent_locked');
      expect(await consentOf(planId)).toBeNull();
    });
  }

  for (const status of ['draft', 'presented', 'accepted'] as const) {
    test(`${status} plan → 200, bog'lanadi`, async () => {
      const planId = await mkPlan(status);
      const res = await link(planId);
      expect(res.status).toBe(200);
      expect(await consentOf(planId)).toBe(formId);
    });
  }
});
