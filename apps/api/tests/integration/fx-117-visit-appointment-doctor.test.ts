/**
 * FX-117 (LB-26) — vizit yozuvi faqat O'Z shifokorining yozilishiga bog'lanadi (REAL DB).
 * Avval: backend appointmentId faqat bemorga tegishliligini tekshirardi; boshqa shifokorning
 * yozilishi bog'lanib, uning «Mendan kutilmoqda» bandi yozuvsiz yopilardi.
 *
 *   cd apps/api && bun test tests/integration/fx-117-visit-appointment-doctor.test.ts --env-file=../../.env --timeout 30000
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  patients,
  roles,
  tenants,
  userAssignments,
  users,
  visitNotes,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { CrossEntityError } from '../../src/lib/ownership.ts';
import { createVisitNotesService } from '../../src/modules/clinical/visit-notes/visit-notes.service.ts';

const audit = { record: async () => {} } as unknown as AuditLogger;
const service = createVisitNotesService({ audit });

let tenantId: string;
let doctorA: string;
let doctorB: string;
let patientId: string;
let apptA: string;
let apptB: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: doctorA }
            : k === 'accessClaims'
              ? { perms: ['visit_note.manage'] }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const inTenant = <T>(fn: (tx: DbOrTx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const noteCount = () =>
  inTenant(async (tx) => (await tx.select({ id: visitNotes.id }).from(visitNotes)).length);

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const ins = await db
    .insert(users)
    .values([
      { phone: '+998900011701', passwordHash: 'x', fullName: 'Doctor A' },
      { phone: '+998900011702', passwordHash: 'x', fullName: 'Doctor B' },
    ])
    .returning({ id: users.id });
  doctorA = ins[0]!.id;
  doctorB = ins[1]!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX117', slug: 'fx117', ownerUserId: doctorA })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await inTenant(async (tx) => {
    const [b] = await tx.insert(branches).values({ tenantId, name: 'B' }).returning();
    // doctorB — haqiqiy aktiv tayinlov (assertUserExists o'tadi; rad faqat yozilish shifokori sabab).
    const [role] = await tx
      .insert(roles)
      .values({ tenantId, name: 'Doctor (test)' })
      .returning({ id: roles.id });
    await tx.insert(userAssignments).values({ tenantId, userId: doctorB, roleId: role!.id });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor 117' })
      .returning({ id: patients.id });
    patientId = p!.id;
    const mk = async (doctorId: string, h: number) => {
      const start = new Date(Date.now() - h * 3_600_000);
      const [a] = await tx
        .insert(appointments)
        .values({
          tenantId,
          branchId: b!.id,
          patientId,
          doctorId,
          startTime: start,
          endTime: new Date(start.getTime() + 1_800_000),
          status: 'completed',
        })
        .returning({ id: appointments.id });
      return a!.id;
    };
    apptB = await mk(doctorB, 5);
    apptA = await mk(doctorA, 2);
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-117 — vizit ↔ yozilish shifokori', () => {
  test('create: boshqa shifokorning yozilishi → CrossEntityError, yozuv yaratilmaydi', async () => {
    const before = await noteCount();
    await expect(
      inTenant((tx) =>
        service.create(ctx(tx), { patientId, doctorId: doctorA, appointmentId: apptB } as never),
      ),
    ).rejects.toBeInstanceOf(CrossEntityError);
    expect(await noteCount()).toBe(before);
  });

  test("create: o'z yozilishi → bog'lanadi", async () => {
    const note = await inTenant((tx) =>
      service.create(ctx(tx), { patientId, doctorId: doctorA, appointmentId: apptA } as never),
    );
    expect(note?.appointmentId).toBe(apptA);
  });

  test("update: yozilishni boshqa shifokornikiga o'zgartirish → rad", async () => {
    const note = await inTenant((tx) =>
      service.create(ctx(tx), { patientId, doctorId: doctorA, subjective: 'x' } as never),
    );
    await expect(
      inTenant((tx) => service.update(ctx(tx), note!.id, { appointmentId: apptB } as never)),
    ).rejects.toBeInstanceOf(CrossEntityError);
    const ok = await inTenant((tx) =>
      service.update(ctx(tx), note!.id, { appointmentId: apptA } as never),
    );
    expect(ok?.appointmentId).toBe(apptA);
  });

  test("update: doctorId almashtirilsa, bog'langan yozilish shifokori bilan mos bo'lishi shart", async () => {
    const note = await inTenant((tx) =>
      service.create(ctx(tx), { patientId, doctorId: doctorA, appointmentId: apptA } as never),
    );
    await expect(
      inTenant((tx) => service.update(ctx(tx), note!.id, { doctorId: doctorB } as never)),
    ).rejects.toBeInstanceOf(CrossEntityError);
  });
});
