/**
 * FX-142 (LC-20) — eslatma worker'i o'tib ketgan / yakunlangan yozilish uchun yubormaydi.
 * REAL DB, real processReminderJob; kanal — hisoblovchi sms.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-142-reminder-stale-appt.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { appointments, branches, patients, tenants, users } from '@dental/db-schema';
import { createNoOpChannel } from '@dental/notifications';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { processReminderJob, shouldSkipReminder } from '../../src/lib/reminder-worker.ts';
import { createNotificationsService } from '../../src/modules/notifications/notifications.service.ts';

let tenantId: string;
let ownerId: string;
let branchId: string;
let patientId: string;
let sent: string[] = [];
const noop = createNoOpChannel(() => {});
const svc = createNotificationsService({
  sms: {
    send: async (to: string, msg: { text: string }) => {
      sent.push(to);
      return noop.send(to, msg);
    },
  },
});

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900001420', passwordHash: 'x', fullName: 'Doc 142' })
    .returning({ id: users.id });
  ownerId = u!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'T142', slug: 'fx142', ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [b] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B' })
      .returning({ id: branches.id });
    branchId = b!.id;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'P142', phone: '+998901420001' })
      .returning({ id: patients.id });
    patientId = p!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const seed = async (startOffsetMs: number, status: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const start = new Date(Date.now() + startOffsetMs);
    const [a] = await tx
      .insert(appointments)
      .values({
        tenantId,
        branchId,
        doctorId: ownerId,
        patientId,
        startTime: start,
        endTime: new Date(start.getTime() + 3_600_000),
        status: status as never,
      })
      .returning({ id: appointments.id });
    return a!.id;
  });

describe('FX-142 — eskirgan yozilishga eslatma yuborilmaydi', () => {
  test('shouldSkipReminder: yakunlangan holatlar skip', () => {
    for (const s of ['cancelled', 'no_show', 'completed', 'in_progress', 'arrived']) {
      expect(shouldSkipReminder(s)).toBe(true);
    }
    expect(shouldSkipReminder('scheduled')).toBe(false);
    expect(shouldSkipReminder('confirmed')).toBe(false);
  });

  test("o'tib ketgan startTime (scheduled) → SMS ketmaydi", async () => {
    sent = [];
    const id = await seed(-2 * 3_600_000, 'scheduled');
    await processReminderJob(svc, { tenantId, appointmentId: id });
    expect(sent).toHaveLength(0);
  });

  test("kelajakdagi, status 'completed'/'in_progress' → SMS ketmaydi", async () => {
    sent = [];
    for (const [i, s] of ['completed', 'in_progress'].entries()) {
      const id = await seed((5 + i * 3) * 3_600_000, s); // doktor EXCLUDE — oraliqlar kesishmasin
      await processReminderJob(svc, { tenantId, appointmentId: id });
    }
    expect(sent).toHaveLength(0);
  });

  test("kelajakdagi scheduled → SMS ketadi (regressiya yo'q)", async () => {
    sent = [];
    const id = await seed(24 * 3_600_000, 'scheduled');
    await processReminderJob(svc, { tenantId, appointmentId: id });
    expect(sent).toEqual(['+998901420001']);
  });
});
