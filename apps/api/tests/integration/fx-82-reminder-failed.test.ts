/**
 * FX-82 — Telegram eslatma tugmasi: service kutilmagan xato bersa bemorga jim «already»
 * (yoki hech narsa) EMAS — alohida `failed` natija; tx savepoint tufayli ishlashda qoladi.
 * REAL DB (tx abort holati savepoint bilan tiklanishi shart).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-82-reminder-failed.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { appointments, branches, patients, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { handleReminderAction } from '../../src/lib/telegram/reminder-actions.ts';
import { AppointmentTransitionError } from '../../src/modules/appointments/appointments.transitions.ts';

let tenantId: string;
let apptId: string;
const CHAT = '777082';

const run = <T>(fn: (tx: DbOrTx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900000082', passwordHash: 'x', fullName: 'Dr FX82' })
    .returning({ id: users.id });
  const [t] = await db
    .insert(tenants)
    .values({ name: 'T82', slug: 'fx82', ownerUserId: u!.id })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  apptId = await run(async (tx) => {
    const [b] = await tx.insert(branches).values({ tenantId, name: 'B' }).returning();
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'P82', phone: '+998903820001', telegramChatId: CHAT })
      .returning();
    const [a] = await tx
      .insert(appointments)
      .values({
        tenantId,
        branchId: b!.id,
        patientId: p!.id,
        doctorId: u!.id,
        startTime: new Date(Date.now() + 48 * 3600 * 1000),
        endTime: new Date(Date.now() + 49 * 3600 * 1000),
        serviceIds: [],
        status: 'scheduled',
      })
      .returning();
    return a!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const act = (tx: DbOrTx, update: (c: Context) => Promise<never>, action: 'ok' | 'no' = 'ok') =>
  handleReminderAction(
    tx,
    { appointments: { update } as never },
    { tenantId, chatId: CHAT, action, appointmentId: apptId },
  );

describe('FX-82 — reminder-actions failed natija', () => {
  test("DB xatosi (tx abort) → outcome `failed`; tx savepoint bilan ishlashda qoladi, qator o'zgarmaydi", async () => {
    const out = await run(async (tx) => {
      const r = await act(tx, async (c) => {
        await (c.get('db') as DbOrTx).execute(sql`SELECT 1/0`);
        throw new Error('unreachable');
      });
      // Savepoint bo'lmasa: "current transaction is aborted" — shu so'rov yiqiladi.
      const [row] = await tx.select().from(appointments).where(eq(appointments.id, apptId));
      return { r, status: row!.status };
    });
    expect(out.r.outcome).toBe('failed');
    expect(out.status).toBe('scheduled');
  });

  test("oddiy kutilmagan throw (action 'no') → `failed`, `already` EMAS", async () => {
    const r = await run((tx) =>
      act(
        tx,
        async () => {
          throw new Error('boom');
        },
        'no',
      ),
    );
    expect(r.outcome).toBe('failed');
  });

  test("regressiya: AppointmentTransitionError (poyga: holat o'zgardi) → `already`", async () => {
    const r = await run((tx) =>
      act(tx, async () => {
        throw new AppointmentTransitionError('status.invalid_transition', 'completed', 'confirmed');
      }),
    );
    expect(r.outcome).toBe('already');
  });
});
