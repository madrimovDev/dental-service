/**
 * FX-22 (LA-34) — dori↔allergiya tekshiruvi SERVERDA (REAL DB).
 *
 * Avval: retsept API'si allergiyani umuman tekshirmasdi (faqat bitta UI yo'li). Endi
 * `prescriptions.create/update` bemorning medical_record.allergies'iga qarshi shu core
 * funksiya (`findDrugAllergyConflicts`) bilan tekshiradi; sababli override bo'lmasa
 * `AllergyConflictError` (route → 409 `prescription.allergy_conflict`), hech narsa yozilmaydi.
 * Override sababi audit'ga yoziladi.
 *
 *   cd apps/api && bun test tests/integration/fx-22-rx-allergy-server.test.ts --env-file=../../.env --timeout 30000
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { medicalRecords, patients, prescriptions, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createPrescriptionSchema } from '../../src/modules/prescriptions/prescriptions.schema.ts';
import {
  AllergyConflictError,
  createPrescriptionsService,
} from '../../src/modules/prescriptions/prescriptions.service.ts';

const audits: Array<Record<string, unknown>> = [];
const audit = {
  record: async (_c: Context, e: Record<string, unknown>) => {
    audits.push(e);
  },
} as unknown as AuditLogger;
const service = createPrescriptionsService({ audit });

let tenantId: string;
let doctorId: string;
let allergicPatientId: string;
let cleanPatientId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: doctorId }
            : // real cheklangan rol: faqat prescription.manage, medical_record.view YO'Q
              k === 'accessClaims'
              ? { perms: ['prescription.manage'] }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const inTenant = <T>(fn: (tx: DbOrTx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const rxCount = (patientId: string) =>
  inTenant(async (tx) => {
    const rows = await tx
      .select()
      .from(prescriptions)
      .where(eq(prescriptions.patientId, patientId));
    return rows.length;
  });

const amox = { medicationName: 'Tab. Amoksitsillin 500', dosage: '500mg', frequency: '3x/kun' };
const ibu = { medicationName: 'Ibuprofen', dosage: '200mg', frequency: '2x/kun' };

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [doctor] = await db
    .insert(users)
    .values({ phone: '+998900002201', passwordHash: 'x', fullName: 'Doctor22' })
    .returning({ id: users.id });
  if (!doctor) throw new Error('doctor');
  doctorId = doctor.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX22 Clinic', slug: 'fx22-clinic', ownerUserId: doctorId })
    .returning({ id: tenants.id });
  if (!t) throw new Error('tenant');
  tenantId = t.id;
  await inTenant(async (tx) => {
    const [a] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Allergik Bemor' })
      .returning({ id: patients.id });
    const [b] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Sog Bemor' })
      .returning({ id: patients.id });
    if (!a || !b) throw new Error('patients');
    allergicPatientId = a.id;
    cleanPatientId = b.id;
    await tx.insert(medicalRecords).values({
      tenantId,
      patientId: a.id,
      allergies: [{ substance: 'Penitsillin', severity: 'severe' }] as never,
    });
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-22 — retsept allergiya tekshiruvi (server)', () => {
  test('konfliktli retsept → AllergyConflictError, qator yozilmaydi', async () => {
    const before = await rxCount(allergicPatientId);
    await expect(
      inTenant((tx) =>
        service.create(ctx(tx), { patientId: allergicPatientId, doctorId, items: [amox] }),
      ),
    ).rejects.toBeInstanceOf(AllergyConflictError);
    expect(await rxCount(allergicPatientId)).toBe(before);
  });

  test('konflikt tafsiloti: dori, guruh, allergen', async () => {
    const err = await inTenant((tx) =>
      service.create(ctx(tx), { patientId: allergicPatientId, doctorId, items: [amox] }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(AllergyConflictError);
    expect((err as AllergyConflictError).conflicts[0]).toMatchObject({
      drug: amox.medicationName,
      group: 'penicillin',
      allergen: 'Penitsillin',
    });
  });

  test("boshqa guruh dori (ibuprofen) — o'tadi", async () => {
    const row = await inTenant((tx) =>
      service.create(ctx(tx), { patientId: allergicPatientId, doctorId, items: [ibu] }),
    );
    expect(row?.id).toBeTruthy();
  });

  test("allergiyasiz bemor — o'tadi", async () => {
    const row = await inTenant((tx) =>
      service.create(ctx(tx), { patientId: cleanPatientId, doctorId, items: [amox] }),
    );
    expect(row?.id).toBeTruthy();
  });

  test("sababli override bilan — o'tadi va sabab audit'da", async () => {
    audits.length = 0;
    const row = await inTenant((tx) =>
      service.create(ctx(tx), {
        patientId: allergicPatientId,
        doctorId,
        items: [amox],
        allergyOverrides: [
          {
            drug: 'Amoksitsillin',
            group: 'penicillin',
            allergen: 'Penitsillin',
            reason: 'benefit_outweighs_risk',
          },
        ],
      }),
    );
    expect(row?.id).toBeTruthy();
    const created = audits.find((a) => a.action === 'created');
    expect(JSON.stringify(created?.after)).toContain('benefit_outweighs_risk');
  });

  test('boshqa allergen uchun override — baribir 409', async () => {
    await expect(
      inTenant((tx) =>
        service.create(ctx(tx), {
          patientId: allergicPatientId,
          doctorId,
          items: [amox],
          allergyOverrides: [
            { drug: 'Amoksitsillin', group: 'nsaid', allergen: 'Aspirin', reason: 'x' },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(AllergyConflictError);
  });

  test("update: items konfliktga o'zgartirilsa → 409, qator o'zgarmaydi", async () => {
    const row = await inTenant((tx) =>
      service.create(ctx(tx), { patientId: allergicPatientId, doctorId, items: [ibu] }),
    );
    if (!row) throw new Error('row');
    await expect(
      inTenant((tx) => service.update(ctx(tx), row.id, { items: [amox] })),
    ).rejects.toBeInstanceOf(AllergyConflictError);
    const after = await inTenant((tx) => service.get(ctx(tx), row.id));
    expect(after?.items[0]?.medicationName).toBe('Ibuprofen');
  });

  test('schema allergyOverrides qabul qiladi (sababsiz rad)', () => {
    const base = { patientId: allergicPatientId, doctorId, items: [amox] };
    expect(
      createPrescriptionSchema.safeParse({
        ...base,
        allergyOverrides: [{ drug: 'a', group: 'g', allergen: 'x', reason: '' }],
      }).success,
    ).toBe(false);
  });
});
