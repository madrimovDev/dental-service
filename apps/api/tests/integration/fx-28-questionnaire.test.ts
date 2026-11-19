/**
 * FX-28 (LA-02) — Telegram anketasi shifokorga ko'rinadi + qayta topshirishda tarix.
 * REAL DB (RLS-bound app role) — bot yozadi, tibbiy karta servisi/DTO o'qiydi.
 *
 * `cd apps/api && bun test --env-file=../../.env tests/integration/fx-28-questionnaire.test.ts`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { medicalRecords, patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { saveQuestionnaireDraft } from '../../src/lib/telegram/questionnaire.ts';
import {
  toMedicalRecordDto,
  toMedicalRecordHistoryEntry,
} from '../../src/modules/patients/patients.mapper.ts';
import { createPatientsService } from '../../src/modules/patients/patients.service.ts';

const service = createPatientsService({ audit: createAuditLogger({ db }) });

let tenantId: string;
let userId: string;
let patientId: string;

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

const inTenant = <T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900000028', passwordHash: 'fake', fullName: 'Doctor' })
    .returning({ id: users.id });
  userId = u!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX28 Clinic', slug: 'fx28-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await inTenant(async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Anketa Bemor' })
      .returning({ id: patients.id });
    patientId = p!.id;
    await tx.insert(medicalRecords).values({ tenantId, patientId });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe("FX-28 — bot anketasi tibbiy karta DTO'sida", () => {
  test('anketa javoblari va vaqti getMedicalRecord → DTO orqali shifokorga qaytadi', async () => {
    const at = new Date('2026-11-18T10:00:00.000Z');
    await inTenant((tx) =>
      saveQuestionnaireDraft(tx, {
        tenantId,
        patientId,
        answers: { allergies: 'penitsillin', chronic: 'diabet' },
        now: at,
      }),
    );

    const rec = await inTenant((tx) => service.getMedicalRecord(ctx(tx), patientId));
    const dto = toMedicalRecordDto(rec!);
    expect(dto.questionnaireAnswers).toEqual({ allergies: 'penitsillin', chronic: 'diabet' });
    expect(dto.questionnaireAt).toBe(at.toISOString());
    // Klinik maydonlarga tegilmagan.
    expect(dto.allergies).toBeNull();
  });

  test('qayta topshirish eski javobni tarixda saqlaydi (jimgina ustiga yozilmaydi)', async () => {
    await inTenant((tx) =>
      saveQuestionnaireDraft(tx, {
        tenantId,
        patientId,
        answers: { allergies: 'lateks' },
        now: new Date('2026-11-19T10:00:00.000Z'),
      }),
    );

    const rows = await inTenant((tx) => service.medicalRecordHistory(ctx(tx), patientId));
    const entries = rows.map(toMedicalRecordHistoryEntry);
    const q = entries
      .flatMap((e) => e.changes)
      .find(
        (c) =>
          c.field === 'questionnaireAnswers' &&
          (c.before as Record<string, string> | null)?.allergies === 'penitsillin',
      );
    expect(q).toBeDefined();
    expect((q?.after as Record<string, string>).allergies).toBe('lateks');
  });
});
