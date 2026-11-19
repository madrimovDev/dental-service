/**
 * FX-39 (LA-23) eslatma vaqti `tenant_settings.reminder_lead_hours`dan.
 * Real DB (dental_app, FORCE RLS). Eslatma navbati spy (enqueue chaqiruvlari kuzatiladi).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-39-57-reminder-lead.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  patients,
  tenantSettings,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';

const HOUR = 3600_000;
let tenantId: string;
let tenantNoSettings: string;
let ownerId: string;
let branchId: string;
let branchId2: string;
let patientId: string;
let patientB: string;

const ctx = (tx: DbOrTx, tId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tId
          : k === 'user'
            ? { id: ownerId }
            : k === 'accessClaims'
              ? { perms: ['@owner'] }
              : undefined,
  }) as unknown as Context;

const run = <T>(tId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tId}'`));
    return fn(ctx(tx, tId));
  });

let enqueued: { tenantId: string; appointmentId: string; delayMs: number }[] = [];
const svc = createAppointmentsService({
  audit: { record: async () => {} },
  enqueueReminder: async (t, a, d) => {
    enqueued.push({ tenantId: t, appointmentId: a, delayMs: d });
  },
  removeReminder: async () => {},
});

const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * HOUR);

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900003901', passwordHash: 'x', fullName: 'Doc' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const ts = await db
    .insert(tenants)
    .values([
      { name: 'A', slug: 'fx3957-a', ownerUserId: ownerId },
      { name: 'B', slug: 'fx3957-b', ownerUserId: ownerId },
    ])
    .returning({ id: tenants.id });
  tenantId = ts[0]!.id;
  tenantNoSettings = ts[1]!.id;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.insert(tenantSettings).values({ tenantId, reminderLeadHours: 3 });
    const [b] = await tx.insert(branches).values({ tenantId, name: 'B' }).returning();
    branchId = b!.id;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Ali', phone: '+998901110001' })
      .returning();
    patientId = p!.id;
  });
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantNoSettings}'`));
    const [b] = await tx
      .insert(branches)
      .values({ tenantId: tenantNoSettings, name: 'B' })
      .returning();
    branchId2 = b!.id;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId: tenantNoSettings, fullName: 'Sami', phone: '+998901110003' })
      .returning();
    patientB = p!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const create = (tId: string, br: string, pat: string, startH: number) =>
  run(tId, (c) =>
    svc.create(c, {
      branchId: br,
      patientId: pat,
      doctorId: ownerId,
      startTime: at(startH).toISOString(),
      endTime: at(startH + 0.5).toISOString(),
      serviceIds: [],
    } as never),
  );

const seed = (status: 'scheduled' | 'confirmed', startH: number, pat = patientId) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [a] = await tx
      .insert(appointments)
      .values({
        tenantId,
        branchId,
        doctorId: ownerId,
        patientId: pat,
        startTime: at(startH),
        endTime: at(startH + 0.5),
        status,
      })
      .returning({ id: appointments.id });
    return a!.id;
  });

describe('FX-39 eslatma vaqti tenant sozlamasidan', () => {
  test("reminderLeadHours=3: start +10h -> delay ~7h (24h hardcode bo'lsa null)", async () => {
    enqueued = [];
    const r = await create(tenantId, branchId, patientId, 10);
    expect(r.ok).toBe(true);
    expect(enqueued.length).toBe(1);
    expect(Math.abs(enqueued[0]!.delayMs - 7 * HOUR)).toBeLessThan(60_000);
  });

  test("sozlama qatori yo'q tenant: default 24h -> +10h enqueue yo'q, +30h delay ~6h", async () => {
    enqueued = [];
    const near = await create(tenantNoSettings, branchId2, patientB, 10);
    expect(near.ok).toBe(true);
    expect(enqueued.length).toBe(0);
    const far = await create(tenantNoSettings, branchId2, patientB, 30);
    expect(far.ok).toBe(true);
    expect(Math.abs(enqueued[0]!.delayMs - 6 * HOUR)).toBeLessThan(60_000);
  });

  test('reschedule ham sozlamani ishlatadi (lead=3, yangi +20h -> delay ~17h)', async () => {
    const id = await seed('scheduled', 50);
    enqueued = [];
    const r = await run(tenantId, (c) =>
      svc.update(c, id, {
        startTime: at(20).toISOString(),
        endTime: at(20.5).toISOString(),
      } as never),
    );
    expect(r.ok).toBe(true);
    expect(enqueued.length).toBe(1);
    expect(Math.abs(enqueued[0]!.delayMs - 17 * HOUR)).toBeLessThan(60_000);
  });
});
