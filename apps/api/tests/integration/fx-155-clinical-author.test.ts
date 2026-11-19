/**
 * FX-155 (LC-33) — vizit/retsept muallifi (`doctorId`) tekshiruvi (REAL DB, cheklangan rol).
 * Avval: doctorId mijozdan olinardi, faqat «tenantda tayinlovi bor» tekshirilardi — hamshira/
 * registrator ham boshqa nomidan klinik yozuv yarata olardi. Endi: doctorId `is_practitioner`
 * shifokor bo'lishi shart; joriy foydalanuvchi emas bo'lsa `*.on_behalf` (yoki owner) kerak.
 *
 *   cd apps/api && bun test tests/integration/fx-155-clinical-author.test.ts --env-file=../../.env --timeout 30000
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patients, roles, tenants, userAssignments, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { CrossEntityError, OnBehalfForbiddenError } from '../../src/lib/ownership.ts';
import { createVisitNotesService } from '../../src/modules/clinical/visit-notes/visit-notes.service.ts';
import { createPrescriptionsService } from '../../src/modules/prescriptions/prescriptions.service.ts';

const audit = { record: async () => {} } as unknown as AuditLogger;
const visitService = createVisitNotesService({ audit });
const rxService = createPrescriptionsService({ audit });

let tenantId: string;
let owner: string;
let docA: string;
let docB: string;
let nurse: string;
let patientId: string;

const ctx = (tx: DbOrTx, userId: string, perms: string[]): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: userId }
            : k === 'accessClaims'
              ? { perms }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const inTenant = <T>(fn: (tx: DbOrTx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const rxInput = (doctorId: string) =>
  ({
    patientId,
    doctorId,
    items: [{ drug: 'Paracetamol', dosage: '500mg', frequency: '2x', durationDays: 3 }],
  }) as never;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const ins = await db
    .insert(users)
    .values([
      { phone: '+998900015501', passwordHash: 'x', fullName: 'Owner' },
      { phone: '+998900015502', passwordHash: 'x', fullName: 'Doctor A' },
      { phone: '+998900015503', passwordHash: 'x', fullName: 'Doctor B' },
      { phone: '+998900015504', passwordHash: 'x', fullName: 'Nurse' },
    ])
    .returning({ id: users.id });
  [owner, docA, docB, nurse] = ins.map((u) => u.id) as [string, string, string, string];
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX155', slug: 'fx155', ownerUserId: owner })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await inTenant(async (tx) => {
    const [docRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Doctor', isPractitioner: true })
      .returning({ id: roles.id });
    const [nurseRole] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Nurse', isPractitioner: false })
      .returning({ id: roles.id });
    await tx.insert(userAssignments).values([
      { tenantId, userId: docA, roleId: docRole!.id },
      { tenantId, userId: docB, roleId: docRole!.id },
      { tenantId, userId: nurse, roleId: nurseRole!.id },
    ]);
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor 155' })
      .returning({ id: patients.id });
    patientId = p!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-155 — vizit yozuvi muallifi', () => {
  test('shifokor emas (hamshira) doctorId bo‘la olmaydi → CrossEntityError', async () => {
    await expect(
      inTenant((tx) =>
        visitService.create(ctx(tx, nurse, ['medical_record.edit', 'medical_record.on_behalf']), {
          patientId,
          doctorId: nurse,
        } as never),
      ),
    ).rejects.toBeInstanceOf(CrossEntityError);
  });

  test('boshqa shifokor nomidan — on_behalf ruxsatisiz → OnBehalfForbiddenError', async () => {
    await expect(
      inTenant((tx) =>
        visitService.create(ctx(tx, docA, ['medical_record.edit']), {
          patientId,
          doctorId: docB,
        } as never),
      ),
    ).rejects.toBeInstanceOf(OnBehalfForbiddenError);
  });

  test('on_behalf ruxsati bilan boshqa shifokor nomidan — o‘tadi', async () => {
    const note = await inTenant((tx) =>
      visitService.create(ctx(tx, nurse, ['medical_record.edit', 'medical_record.on_behalf']), {
        patientId,
        doctorId: docB,
      } as never),
    );
    expect(note?.doctorId).toBe(docB);
  });

  test('o‘z nomidan (shifokor) — ruxsatsiz o‘tadi; update doctorId o‘zgartirish ham tekshiriladi', async () => {
    const note = await inTenant((tx) =>
      visitService.create(ctx(tx, docA, ['medical_record.edit']), {
        patientId,
        doctorId: docA,
      } as never),
    );
    expect(note?.doctorId).toBe(docA);
    await expect(
      inTenant((tx) =>
        visitService.update(ctx(tx, docA, ['medical_record.edit']), note!.id, {
          doctorId: docB,
        } as never),
      ),
    ).rejects.toBeInstanceOf(OnBehalfForbiddenError);
  });

  test('owner (is_practitioner roli yo‘q) o‘z nomidan va @owner boshqa nomidan yoza oladi', async () => {
    const own = await inTenant((tx) =>
      visitService.create(ctx(tx, owner, ['@owner']), { patientId, doctorId: owner } as never),
    );
    expect(own?.doctorId).toBe(owner);
    const other = await inTenant((tx) =>
      visitService.create(ctx(tx, owner, ['@owner']), { patientId, doctorId: docA } as never),
    );
    expect(other?.doctorId).toBe(docA);
  });
});

describe('FX-155 — retsept muallifi', () => {
  test('hamshira doctorId → CrossEntityError', async () => {
    await expect(
      inTenant((tx) => rxService.create(ctx(tx, nurse, ['prescription.manage']), rxInput(nurse))),
    ).rejects.toBeInstanceOf(CrossEntityError);
  });

  test('boshqa shifokor nomidan — ruxsatsiz rad, on_behalf bilan o‘tadi', async () => {
    await expect(
      inTenant((tx) => rxService.create(ctx(tx, docA, ['prescription.manage']), rxInput(docB))),
    ).rejects.toBeInstanceOf(OnBehalfForbiddenError);
    const rx = await inTenant((tx) =>
      rxService.create(
        ctx(tx, nurse, ['prescription.manage', 'prescription.on_behalf']),
        rxInput(docB),
      ),
    );
    expect(rx?.doctorId).toBe(docB);
  });

  test('o‘z nomidan shifokor — o‘tadi', async () => {
    const rx = await inTenant((tx) =>
      rxService.create(ctx(tx, docA, ['prescription.manage']), rxInput(docA)),
    );
    expect(rx?.doctorId).toBe(docA);
  });
});
