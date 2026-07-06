/**
 * CLI-408 — double-booking race: Postgres EXCLUDE gist constraint
 * `appointments_no_doctor_overlap` DB darajasida bir doktor uchun overlap
 * yozilishlarni atomik rad etadi (pre-check race'ni yopa olmaydi).
 *
 * Bitta faylni alohida ishlating (TRUNCATE race):
 *   cd apps/api && bun test tests/integration/appointments-overlap.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { appointments, branches, patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';

let tenantId: string;
let ownerId: string;
let branchId: string;
let patientId: string;

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
    .values({ phone: '+998900000408', passwordHash: 'x', fullName: 'Doc' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'A', slug: 'a-overlap', ownerUserId: ownerId, defaultLanguage: 'uz' })
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
      .values({ tenantId, fullName: 'Ali Valiyev', phone: '+998901112244' })
      .returning({ id: patients.id });
    patientId = patient!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const day = '2026-12-02';
const baseInput = (startH: string, endH: string) => ({
  branchId,
  patientId,
  doctorId: ownerId,
  startTime: `${day}T${startH}:00+05:00`,
  endTime: `${day}T${endH}:00+05:00`,
  serviceIds: [] as string[],
});

async function countRows(startH: string): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const rows = await tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        sql`${appointments.doctorId} = ${ownerId} AND ${appointments.startTime} = ${`${day}T${startH}:00+05:00`} AND ${appointments.status} <> 'cancelled'`,
      );
    return rows.length;
  });
}

describe('CLI-408 EXCLUDE gist constraint', () => {
  test('constraint mavjud (pg_constraint)', async () => {
    const rows = await db.execute(
      sql`SELECT conname FROM pg_constraint WHERE conname = 'appointments_no_doctor_overlap'`,
    );
    expect(rows.length).toBe(1);
  });

  test('concurrent create bir doktor + slot → aynan 1 muvaffaqiyat, 1 × conflict', async () => {
    const [r1, r2] = await Promise.allSettled([
      run(tenantId, (c) => svc.create(c, baseInput('09:00', '10:00'))),
      run(tenantId, (c) => svc.create(c, baseInput('09:00', '10:00'))),
    ]);
    const results = [r1, r2].map((r) =>
      r.status === 'fulfilled' ? r.value : { ok: false, code: 'rejected' },
    );
    const oks = results.filter((r) => r.ok).length;
    const conflicts = results.filter(
      (r) => !r.ok && (r as { code: string }).code === 'conflict.doctor_busy',
    ).length;
    expect(oks).toBe(1);
    expect(conflicts).toBe(1);
    expect(await countRows('09:00')).toBe(1);
  });

  test('end == start ketma-ket ikki yozilish → ikkalasi OK', async () => {
    const a = await run(tenantId, (c) => svc.create(c, baseInput('11:00', '12:00')));
    const b = await run(tenantId, (c) => svc.create(c, baseInput('12:00', '13:00')));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  test('cancelled yozilish ustiga yangi → OK', async () => {
    // 13:00–14:00 cancelled seed.
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await tx.insert(appointments).values({
        tenantId,
        branchId,
        doctorId: ownerId,
        patientId,
        startTime: new Date(`${day}T13:00:00+05:00`),
        endTime: new Date(`${day}T14:00:00+05:00`),
        status: 'cancelled',
      });
    });
    const r = await run(tenantId, (c) => svc.create(c, baseInput('13:00', '14:00')));
    expect(r.ok).toBe(true);
  });

  test('self-reschedule (o‘z vaqtini kichik siljitish) → OK (self-exclude)', async () => {
    const created = await run(tenantId, (c) => svc.create(c, baseInput('15:00', '16:00')));
    expect(created.ok).toBe(true);
    if (!created.ok || !created.appointment) return;
    const r = await run(tenantId, (c) =>
      svc.update(c, created.appointment!.id, { startTime: `${day}T15:15:00+05:00` }),
    );
    expect(r.ok).toBe(true);
  });
});
