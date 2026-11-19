/**
 * FX-10 (LA-24) — `telegram:reload` publish FAQAT tx COMMIT'dan keyin (REAL DB + REAL Redis).
 *
 * Bot-manager reload'da tokenni alohida (admin) ulanishda o'qiydi. Publish commit'dan
 * OLDIN ketsa, u commit bo'lmagan qatorni ko'rmaydi. Test: haqiqiy Redis subscriber xabar
 * kelgan zahoti admin ulanishda tokenni o'qiydi — token ko'rinishi kerak.
 *
 *   cd apps/api && bun test tests/integration/fx-10-telegram-reload-after-commit.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tenantSettings, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import IORedis from 'ioredis';
import { type AfterCommitFn, runAfterCommit } from '../../src/db/after-commit.ts';
import { createAdminDb, db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { env } from '../../src/lib/env.ts';
import {
  closeRedisPub,
  createTenantSettingsService,
} from '../../src/modules/tenant-settings/tenant-settings.service.ts';

const secretDir = mkdtempSync(join(tmpdir(), 'fx10-'));
process.env.MESSAGING_SECRET_PATH = join(secretDir, 'secret.txt');

const service = createTenantSettingsService({
  audit: { record: async () => {} } as unknown as AuditLogger,
});
const { db: adminDb, client: adminClient } = createAdminDb();

let tenantId: string;
let ownerId: string;
let sub: IORedis;
const received: { tenantId: string; tokenVisible: boolean }[] = [];

const readEnc = async () => {
  const [row] = await adminDb
    .select({ s: tenantSettings.integrationSettings })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId));
  return (row?.s as { telegram?: { botTokenEnc?: string } } | null)?.telegram?.botTokenEnc ?? null;
};

beforeAll(async () => {
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000110', passwordHash: 'x', fullName: 'FX10 Owner' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FX10 Clinic', slug: 'fx10-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  sub = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  await sub.subscribe('telegram:reload');
  sub.on('message', (_ch, tid) => {
    if (tid !== tenantId) return;
    void readEnc().then((enc) => received.push({ tenantId: tid, tokenVisible: enc !== null }));
  });
});

afterAll(async () => {
  await sub.quit().catch(() => {});
  await closeRedisPub();
  await adminClient.end({ timeout: 2 });
  await db.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${ownerId}`);
  rmSync(secretDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("FX-10 — telegram:reload commit'dan keyin", () => {
  test("tx ichida publish chiqmaydi; commit + after-commit'dan keyin chiqadi va token ko'rinadi", async () => {
    const afterCommit: AfterCommitFn[] = [];

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = {
        get: (k: string) =>
          k === 'db'
            ? tx
            : k === 'activeTenantId'
              ? tenantId
              : k === 'user'
                ? { id: ownerId }
                : k === 'afterCommit'
                  ? afterCommit
                  : undefined,
      } as unknown as Context;
      await service.update(c, { telegram: { botToken: '123456789:fx10-token' } });

      // tx hali commit bo'lmagan: signal yuborilmagan bo'lishi shart
      expect(afterCommit.length).toBe(1);
      await sleep(300);
      expect(received.length).toBe(0);
    });

    // commit bo'ldi → endi side-effect ishga tushadi (rlsMiddleware shunday qiladi)
    await runAfterCommit(afterCommit);
    for (let i = 0; i < 40 && received.length === 0; i++) await sleep(50);

    expect(received.length).toBe(1);
    // bot-manager alohida ulanishda o'qiganda commit bo'lgan token ko'rinadi
    expect(received[0]?.tokenVisible).toBe(true);
  });
});
