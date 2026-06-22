/**
 * V2-7 (Medical record versiyalash, CLI-247) — audit_log-backed history.
 * To'liq oqim: updateMedicalRecord (audit yozadi) → medicalRecordHistory (o'qiydi) →
 * toMedicalRecordHistoryEntry (field diff). REAL DB + real audit logger.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env medical-record-history`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { medicalRecords, patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { toMedicalRecordHistoryEntry } from '../../src/modules/patients/patients.mapper.ts';
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';

const audit = createAuditLogger({ db });
const service = createPatientsService({ audit });

let tenantId: string;
let userId: string;
const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: userId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

let patientId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000023', passwordHash: 'fake', fullName: 'Doctor' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  userId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'History Clinic', slug: 'history-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;
    await tx.insert(medicalRecords).values({ tenantId, patientId, anamnez: 'boshlang‘ich' });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('Medical record history — real DB + audit', () => {
  test('2 update → 2 tarix yozuvi + field diff', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.updateMedicalRecord(ctx(tx), patientId, { anamnez: 'yangilangan-1' });
    });
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.updateMedicalRecord(ctx(tx), patientId, {
        anamnez: 'yangilangan-2',
        bloodType: 'O+',
      });
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return service.medicalRecordHistory(ctx(tx), patientId);
    });

    expect(rows).toHaveLength(2);
    // desc tartib: eng so'nggi avval
    const first = rows[0];
    if (!first) throw new Error('no history row');
    const latest = toMedicalRecordHistoryEntry(first);
    expect(latest.changedBy?.id).toBe(userId);
    const fields = latest.changes.map((c) => c.field).sort();
    expect(fields).toContain('anamnez');
    expect(fields).toContain('bloodType');
    const anamnezChange = latest.changes.find((c) => c.field === 'anamnez');
    expect(anamnezChange?.before).toBe('yangilangan-1');
    expect(anamnezChange?.after).toBe('yangilangan-2');
  });
});
