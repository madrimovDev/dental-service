/**
 * CLI-474 (L4) — o'z-o'ziga bog'langan relative link bloklanmagan (REAL DB + HTTP).
 *
 * `addRelative(patientId, { relativePatientId: patientId, ... })` avval hech qanday
 * to'siqsiz o'z-o'ziga havola yozardi (unique constraint buni bloklamaydi, chunki
 * patientId !== relativePatientId emas — bir xil qiymat ham qoniqtiradi).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-474-l4-relative-self-link`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { createApp } from '../../src/app.ts';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createPatientsService({ audit: noopAudit });

let tenantId: string;
let ownerId: string;
let patientId: string;
let ownerToken: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : undefined,
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900004740', passwordHash: 'x', fullName: 'Owner474L4' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'SelfLink Clinic', slug: 'self-link-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor SelfLink' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;
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

describe('CLI-474 (L4) — self-link bloklangan — real DB', () => {
  test('addRelative(patientId, {relativePatientId: patientId}) → rad etiladi', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return service.addRelative(ctx(tx), patientId, {
          relativePatientId: patientId,
          relationship: "o'zi",
        });
      }),
    ).rejects.toThrow();
  });

  test('POST /api/patients/:id/relatives — self-link → 400', async () => {
    const app = createApp();
    const res = await app.request(`/api/patients/${patientId}/relatives`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ relativePatientId: patientId, relationship: "o'zi" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('patient_relative.self_link');
  });
});
