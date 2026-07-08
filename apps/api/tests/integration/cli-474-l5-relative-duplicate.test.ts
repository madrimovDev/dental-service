/**
 * CLI-474 (L5) — reciprocal relative link ikki marta qo'shilishi mumkin (REAL DB + HTTP).
 *
 * Unique constraint `(patient_id, relative_patient_id)` faqat AYNAN bir xil
 * yo'nalishdagi juftlikni bloklaydi. A→B yozilgandan keyin B→A alohida qator
 * sifatida yaratilaverar edi — `listRelatives` ikkalasini alohida link sifatida
 * ko'rsatardi (duplikat).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-474-l5-relative-duplicate`
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
let patientAId: string;
let patientBId: string;
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
    .values({ phone: '+998900004750', passwordHash: 'x', fullName: 'Owner474L5' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'DupLink Clinic', slug: 'dup-link-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [a] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor DupA' })
      .returning({ id: patients.id });
    const [b] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor DupB' })
      .returning({ id: patients.id });
    if (!a || !b) throw new Error('patient insert failed');
    patientAId = a.id;
    patientBId = b.id;
  });

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await service.addRelative(ctx(tx), patientAId, {
      relativePatientId: patientBId,
      relationship: 'ukasi',
    });
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

describe('CLI-474 (L5) — reciprocal/duplicate relative link bloklangan — real DB', () => {
  test('B→A (reciprocal, A→B mavjud bo`lgandan keyin) → rad etiladi', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return service.addRelative(ctx(tx), patientBId, {
          relativePatientId: patientAId,
          relationship: 'akasi',
        });
      }),
    ).rejects.toThrow();
  });

  test('A→B (aynan bir xil yo`nalish) yana yuborilsa → rad etiladi', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return service.addRelative(ctx(tx), patientAId, {
          relativePatientId: patientBId,
          relationship: 'ukasi',
        });
      }),
    ).rejects.toThrow();
  });

  test('POST /api/patients/:id/relatives — reciprocal → 409', async () => {
    const app = createApp();
    const res = await app.request(`/api/patients/${patientBId}/relatives`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ relativePatientId: patientAId, relationship: 'akasi' }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('patient_relative.duplicate_link');
  });

  test('listRelatives(A) — hali ham bitta link (duplikat yaratilmagan)', async () => {
    const rels = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.listRelatives(ctx(tx), patientAId);
    });
    expect(rels).toHaveLength(1);
  });
});
