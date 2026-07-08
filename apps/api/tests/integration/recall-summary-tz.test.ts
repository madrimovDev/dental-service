/**
 * CLI-466 — recall summary() "overdue" KPI DB CURRENT_DATE'ga tayanadi
 * (session TZ — odatda UTC), loyihaning boshqa joylarida (queue.service.ts
 * tashkentDayStart(), recall-worker.ts localDateString()) kun chegarasi
 * Asia/Tashkent'ga JS orqali anchorlanadi. `CURRENT_DATE` tenant/klinika
 * timezone'idan mustaqil — server session TZ'ga bog'liq.
 *
 * Test strategiyasi: `service.summary(c, branchId, now)` endi injectable `now`
 * qabul qiladi. Real DB CURRENT_DATE — bu test ishga tushirilayotgan HAQIQIY
 * kalendar kuni (masalan 2026-07-xx) — testda ishlatiladigan tarixiy `now`
 * (2026-01-xx)dan ancha keyin. Shu farqdan foydalanib, ikkita implementatsiya
 * ANIQ ajraladi:
 *   - TUZATILGAN (parametrlangan, `now` orqali): dueDate injected-today bilan
 *     solishtiriladi.
 *   - BUZILGAN (hozirgi, literal CURRENT_DATE): dueDate real bugungi sana bilan
 *     solishtiriladi — bu deyarli har doim "overdue" deb hisoblaydi, chunki
 *     testdagi tarixiy sanalar haqiqiy bugundan ancha oldin.
 *
 * Bitta faylni ALOHIDA ishlating (TRUNCATE race):
 *   cd apps/api && bun test tests/integration/recall-summary-tz.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { branches, patients, recalls, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createRecallsService } from '../../src/modules/recalls/recalls.service.ts';

let tenantId: string;
let patientId: string;

const noopAudit = { record: async () => {} };
const service = createRecallsService({ audit: noopAudit });

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) => (k === 'db' ? tx : undefined),
  }) as unknown as Context;

const run = <T>(fn: (c: Context) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx));
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000466', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'TZ', slug: 'recall-tz-466', ownerUserId: owner!.id, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.insert(branches).values({ tenantId, name: 'B' });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'TZ Bemor' })
      .returning({ id: patients.id });
    patientId = p!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

beforeEach(async () => {
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.delete(recalls);
  });
});

describe('CLI-466 recall summary overdue — clinic-local (Tashkent) kun, real CURRENT_DATE emas', () => {
  test("dueDate == injected-today (uzoq tarixiy now) → overdue EMAS, real CURRENT_DATE e'tiborsiz qoldiriladi", async () => {
    // now: 2026-01-20 04:00 UTC = 2026-01-20 09:00 Tashkent — Tashkent kuni ham 01-20.
    const now = new Date('2026-01-20T04:00:00Z');
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await tx.insert(recalls).values({
        tenantId,
        patientId,
        reason: 'manual' as const,
        source: 'manual' as const,
        status: 'pending' as const,
        dueDate: '2026-01-20', // == injected-today → overdue BO'LMASLIGI kerak
      });
    });

    const r = await run((c) => service.summary(c, undefined, now));
    // Buzilgan implementatsiya: dueDate(2026-01-20) < real CURRENT_DATE
    // (test ishga tushirilayotgan haqiqiy kun, ~2026-ancha keyin) → TRUE → overdue=1.
    // Tuzatilgan: dueDate == injected-today → overdue=0.
    expect(r.overdue).toBe(0);
  });

  test("UTC+5 chegara: Tashkent kuni UTC kunidan OLDINGA siljiganda ham to'g'ri anchorlanadi", async () => {
    // now: 2026-07-15 20:00 UTC = 2026-07-16 01:00 Tashkent — Tashkent kuni
    // ALLAQACHON 07-16, naiv UTC (now.toISOString().slice(0,10)) hali 07-15
    // bo'lardi. `dueDate` KELAJAKDA (real test-ishga-tushirish kunidan keyin,
    // buzilgan CURRENT_DATE'ga nisbatan "hali muddati kelmagan" bo'lib ko'rinadi)
    // — shu bilan uchala variant (buzilgan / naiv-UTC / to'g'ri-Tashkent)
    // ANIQ ajraladi:
    //   - Buzilgan (real CURRENT_DATE, hozirgi haqiqiy kun): dueDate kelajakda → overdue=0.
    //   - Naiv UTC (today='2026-07-15'): dueDate(07-15) < today(07-15) → overdue=0.
    //   - To'g'ri Tashkent (today='2026-07-16'): dueDate(07-15) < today(07-16) → overdue=1.
    const now = new Date('2026-07-15T20:00:00Z');
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await tx.insert(recalls).values({
        tenantId,
        patientId,
        reason: 'manual' as const,
        source: 'manual' as const,
        status: 'pending' as const,
        dueDate: '2026-07-15',
      });
    });

    const r = await run((c) => service.summary(c, undefined, now));
    expect(r.overdue).toBe(1);
  });
});
