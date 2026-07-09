/**
 * CLI-474 (L7) — bemor no-show strike tizimi. Strike appointment `→ no_show`
 * transition'da yaratiladi (unique appointment_id, idempotent). "Faol" count
 * join-anchored: `appointments.status='no_show' AND NOT waived` — misclick
 * tuzatilsa (no_show → scheduled) strike faol count'dan avtomatik tushadi, row
 * tarix sifatida qoladi. Waive faol count'dan chiqaradi. REAL DB.
 *
 * Bitta faylni ALOHIDA ishlating (TRUNCATE race):
 *   cd apps/api && bun test tests/integration/cli-474-l7-no-show-strikes.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, patients, tenantSettings, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { createNoShowStrikesService } from '../../src/modules/no-show-strikes/no-show-strikes.service.ts';

let tenantId: string;
let ownerId: string;
let branchId: string;

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
const strikeSvc = createNoShowStrikesService({ audit: noopAudit });
const apptSvc = createAppointmentsService({ audit: noopAudit, noShowStrike: strikeSvc });

const seedPatient = (name: string) =>
  run(tenantId, async (c) => {
    const tx = c.get('db') as DbOrTx;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: name })
      .returning({ id: patients.id });
    return p!.id;
  });

// Har test uchun kelajakdagi yozilish (isInPast guard'idan o'tadi). Unikal soat
// slot — turli appointment'lar (bir doctor) doctor-overlap constraint'ga tushmasin.
let hour = 8;
const createAppt = async (patientId: string) => {
  const hh = String(hour++).padStart(2, '0');
  const created = await run(tenantId, (c) =>
    apptSvc.create(c, {
      branchId,
      patientId,
      doctorId: ownerId,
      startTime: `2027-03-02T${hh}:00:00+05:00`,
      endTime: `2027-03-02T${hh}:45:00+05:00`,
      serviceIds: [],
    }),
  );
  if (!created.ok) throw new Error(`create failed: ${(created as { code: string }).code}`);
  return created.appointment.id;
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000407', passwordHash: 'x', fullName: 'Doc' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'L7', slug: 'l7-strikes', ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;
  await run(tenantId, async (c) => {
    const tx = c.get('db') as DbOrTx;
    const [b] = await tx.insert(branches).values({ tenantId, name: 'B' }).returning({
      id: branches.id,
    });
    branchId = b!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-474 L7 — no-show strikes', () => {
  test('no_show transition → strike, activeCount = 1', async () => {
    const patientId = await seedPatient('Strike1');
    const apptId = await createAppt(patientId);
    await run(tenantId, (c) => apptSvc.update(c, apptId, { status: 'no_show' }));
    const cnt = await run(tenantId, (c) => strikeSvc.activeCount(c, patientId));
    expect(cnt).toBe(1);
  });

  test('no_show → scheduled (misclick tuzatildi) → activeCount = 0, strike row saqlanadi', async () => {
    const patientId = await seedPatient('Strike2');
    const apptId = await createAppt(patientId);
    await run(tenantId, (c) => apptSvc.update(c, apptId, { status: 'no_show' }));
    expect(await run(tenantId, (c) => strikeSvc.activeCount(c, patientId))).toBe(1);

    // Misclick correction — no_show → scheduled (transition matritsa ruxsat).
    await run(tenantId, (c) => apptSvc.update(c, apptId, { status: 'scheduled' }));
    expect(await run(tenantId, (c) => strikeSvc.activeCount(c, patientId))).toBe(0);
    // Row tarix sifatida qoladi (o'chirilmaydi).
    const list = await run(tenantId, (c) => strikeSvc.listByPatient(c, patientId));
    expect(list).toHaveLength(1);
  });

  test('idempotent: no_show → scheduled → no_show → activeCount = 1 (unique appointment_id)', async () => {
    const patientId = await seedPatient('Strike3');
    const apptId = await createAppt(patientId);
    await run(tenantId, (c) => apptSvc.update(c, apptId, { status: 'no_show' }));
    await run(tenantId, (c) => apptSvc.update(c, apptId, { status: 'scheduled' }));
    await run(tenantId, (c) => apptSvc.update(c, apptId, { status: 'no_show' }));
    expect(await run(tenantId, (c) => strikeSvc.activeCount(c, patientId))).toBe(1);
    // Yagona strike row (ON CONFLICT DO NOTHING — dublikat yaratilmaydi).
    const list = await run(tenantId, (c) => strikeSvc.listByPatient(c, patientId));
    expect(list).toHaveLength(1);
  });

  test('waive → activeCount = 0, row saqlanadi', async () => {
    const patientId = await seedPatient('Strike4');
    const apptId = await createAppt(patientId);
    await run(tenantId, (c) => apptSvc.update(c, apptId, { status: 'no_show' }));
    const list = await run(tenantId, (c) => strikeSvc.listByPatient(c, patientId));
    const strikeId = list[0]!.id;

    const res = await run(tenantId, (c) => strikeSvc.waive(c, strikeId, { reason: 'Uzrli sabab' }));
    expect(res.ok).toBe(true);
    expect(await run(tenantId, (c) => strikeSvc.activeCount(c, patientId))).toBe(0);
  });

  test('waive ikkinchi marta → already_waived', async () => {
    const patientId = await seedPatient('Strike5');
    const apptId = await createAppt(patientId);
    await run(tenantId, (c) => apptSvc.update(c, apptId, { status: 'no_show' }));
    const list = await run(tenantId, (c) => strikeSvc.listByPatient(c, patientId));
    const strikeId = list[0]!.id;
    await run(tenantId, (c) => strikeSvc.waive(c, strikeId, { reason: null }));
    const res = await run(tenantId, (c) => strikeSvc.waive(c, strikeId, { reason: null }));
    expect(res.ok).toBe(false);
    expect((res as { code: string }).code).toBe('already_waived');
  });

  test('patientSummary — tenant chegara bo‘yicha flagged + tarix', async () => {
    // tenant_settings row yo'q bo'lsa getThreshold 0 (tizim o'chiq) — bu yerda 1 o'rnatamiz.
    await run(tenantId, async (c) => {
      const tx = c.get('db') as DbOrTx;
      await tx
        .insert(tenantSettings)
        .values({ tenantId, noShowStrikeThreshold: 1 })
        .onConflictDoNothing();
    });
    const patientId = await seedPatient('Summary');
    const apptId = await createAppt(patientId);
    await run(tenantId, (c) => apptSvc.update(c, apptId, { status: 'no_show' }));
    const s = await run(tenantId, (c) => strikeSvc.patientSummary(c, patientId));
    expect(s.activeCount).toBe(1);
    expect(s.threshold).toBe(1);
    expect(s.flagged).toBe(true); // 1 >= 1
    expect(s.strikes).toHaveLength(1);
  });

  test('activeCountForPatients (grouped) — ro‘yxat uchun', async () => {
    const p1 = await seedPatient('Grp1');
    const p2 = await seedPatient('Grp2');
    const a1 = await createAppt(p1);
    const a2 = await createAppt(p2);
    await run(tenantId, (c) => apptSvc.update(c, a1, { status: 'no_show' }));
    await run(tenantId, (c) => apptSvc.update(c, a2, { status: 'no_show' }));
    const map = await run(tenantId, (c) => strikeSvc.activeCountForPatients(c, [p1, p2]));
    expect(map.get(p1)).toBe(1);
    expect(map.get(p2)).toBe(1);
  });
});
