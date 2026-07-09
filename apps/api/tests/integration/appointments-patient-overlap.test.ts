/**
 * CLI-471 — bemor darajasidagi double-booking: Postgres EXCLUDE gist constraint
 * `appointments_no_patient_overlap` bir BEMOR uchun overlap yozilishlarni (hatto
 * turli doktorlarga) DB darajasida atomik rad etadi. Doctor constraint (CLI-408)
 * dan mustaqil — turli doktor, bir bemor, kesishgan vaqt → `conflict.patient_busy`.
 *
 * Bitta faylni alohida ishlating (TRUNCATE race):
 *   cd apps/api && bun test tests/integration/appointments-patient-overlap.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';

let tenantId: string;
let ownerId: string;
let doctorAId: string;
let doctorBId: string;
let branchId: string;
let patientId: string;
let otherPatientId: string;

const ctx = (tx: DbOrTx, tId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db' ? tx : k === 'activeTenantId' ? tId : k === 'user' ? { id: ownerId } : undefined,
  }) as unknown as Context;

const run = <T>(tId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tId}'`));
    return fn(ctx(tx, tId));
  });

const noopAudit = { record: async () => {} };
const svc = createAppointmentsService({ audit: noopAudit });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000471', passwordHash: 'x', fullName: 'Doc A' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  doctorAId = ownerId;
  const [docB] = await db
    .insert(users)
    .values({ phone: '+998900000472', passwordHash: 'x', fullName: 'Doc B' })
    .returning({ id: users.id });
  doctorBId = docB!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'A', slug: 'a-patient-overlap', ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B' })
      .returning({ id: branches.id });
    branchId = branch!.id;
    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Ali Valiyev', phone: '+998901112271' })
      .returning({ id: patients.id });
    patientId = patient!.id;
    const [other] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Vali Aliyev', phone: '+998901112272' })
      .returning({ id: patients.id });
    otherPatientId = other!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const day = '2026-12-03';
const input = (o: { startH: string; endH: string; doctorId: string; patientId?: string }) => ({
  branchId,
  patientId: o.patientId ?? patientId,
  doctorId: o.doctorId,
  startTime: `${day}T${o.startH}:00+05:00`,
  endTime: `${day}T${o.endH}:00+05:00`,
  serviceIds: [] as string[],
});

describe('CLI-471 patient-overlap EXCLUDE constraint', () => {
  test('constraint mavjud (pg_constraint)', async () => {
    const rows = await db.execute(
      sql`SELECT conname FROM pg_constraint WHERE conname = 'appointments_no_patient_overlap'`,
    );
    expect(rows.length).toBe(1);
  });

  test('bir bemor + turli doktor + kesishgan vaqt → conflict.patient_busy (pre-check)', async () => {
    const a = await run(tenantId, (c) =>
      svc.create(c, input({ startH: '09:00', endH: '10:00', doctorId: doctorAId })),
    );
    expect(a.ok).toBe(true);
    // Boshqa doktor (doctorB), ayni bemor, kesishgan oyna → patient_busy.
    const b = await run(tenantId, (c) =>
      svc.create(c, input({ startH: '09:30', endH: '10:30', doctorId: doctorBId })),
    );
    expect(b.ok).toBe(false);
    expect((b as { code: string }).code).toBe('conflict.patient_busy');
  });

  test('turli bemor + turli doktor + ayni vaqt → ikkalasi OK', async () => {
    const a = await run(tenantId, (c) =>
      svc.create(c, input({ startH: '11:00', endH: '12:00', doctorId: doctorAId })),
    );
    const b = await run(tenantId, (c) =>
      svc.create(
        c,
        input({ startH: '11:00', endH: '12:00', doctorId: doctorBId, patientId: otherPatientId }),
      ),
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  test('concurrent bir bemor turli doktor ayni slot → aynan 1 ok, 1 patient_busy (DB backstop)', async () => {
    const [r1, r2] = await Promise.allSettled([
      run(tenantId, (c) =>
        svc.create(c, input({ startH: '13:00', endH: '14:00', doctorId: doctorAId })),
      ),
      run(tenantId, (c) =>
        svc.create(c, input({ startH: '13:00', endH: '14:00', doctorId: doctorBId })),
      ),
    ]);
    const results = [r1, r2].map((r) =>
      r.status === 'fulfilled' ? r.value : { ok: false, code: 'rejected' },
    );
    const oks = results.filter((r) => r.ok).length;
    const conflicts = results.filter(
      (r) => !r.ok && (r as { code: string }).code === 'conflict.patient_busy',
    ).length;
    expect(oks).toBe(1);
    expect(conflicts).toBe(1);
  });

  test('back-to-back (end == start) bir bemor → OK', async () => {
    const a = await run(tenantId, (c) =>
      svc.create(c, input({ startH: '15:00', endH: '16:00', doctorId: doctorAId })),
    );
    const b = await run(tenantId, (c) =>
      svc.create(c, input({ startH: '16:00', endH: '17:00', doctorId: doctorBId })),
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });
});
