/**
 * FX-25t — bir Telegram bot tokeni (bot id) ikki tenantda ishlatilmaydi (real DB).
 *   cd apps/api && bun test tests/integration/fx-25-bot-token-unique.test.ts --env-file=../../.env
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import {
  createTenantSettingsService,
  TelegramTokenInUseError,
} from '../../src/modules/tenant-settings/tenant-settings.service.ts';

const secretPath = `${import.meta.dir}/.fx-25-messaging-secret-test.txt`;
process.env.MESSAGING_SECRET_PATH = secretPath;

const service = createTenantSettingsService({
  audit: { record: async () => {} } as unknown as AuditLogger,
});

let ownerId: string;
let tenantA: string;
let tenantB: string;

const run = <T>(tenantId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const c = {
      get: (k: string) =>
        k === 'db'
          ? tx
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: ownerId }
              : undefined,
    } as unknown as Context;
    return fn(c);
  });

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900002501', passwordHash: 'x', fullName: 'FX25 Owner' })
    .returning({ id: users.id });
  ownerId = u!.id;
  const mk = async (slug: string) => {
    const [t] = await db
      .insert(tenants)
      .values({ name: slug, slug, ownerUserId: ownerId })
      .returning({ id: tenants.id });
    return t!.id;
  };
  tenantA = await mk('fx25-a');
  tenantB = await mk('fx25-b');
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM tenants WHERE id IN (${tenantA}, ${tenantB})`);
  await db.execute(sql`DELETE FROM users WHERE id = ${ownerId}`);
  if (existsSync(secretPath)) rmSync(secretPath);
});

describe('FX-25t bot token unikalligi', () => {
  test('ikkinchi tenant bir xil bot id bilan rad etiladi; boshqa bot, qayta saqlash va uzish ishlaydi', async () => {
    const tokenA = '7700000001:AAA-secret-token-of-the-first-bot';
    await run(tenantA, (c) => service.update(c, { telegram: { botToken: tokenA } }));

    // Xuddi shu bot id (secret qismi boshqa bo'lsa ham) — boshqa tenantda 409
    await expect(
      run(tenantB, (c) =>
        service.update(c, { telegram: { botToken: '7700000001:BBB-another-secret-of-same-bot' } }),
      ),
    ).rejects.toBeInstanceOf(TelegramTokenInUseError);

    // Boshqa tenant B hech narsa saqlamagan
    const b = await run(tenantB, (c) => service.getOrCreate(c));
    expect(b.integrationSettings?.telegram ?? null).toBeNull();

    // Boshqa bot — ruxsat
    await run(tenantB, (c) =>
      service.update(c, { telegram: { botToken: '7700000002:CCC-secret-token-of-second-bot' } }),
    );

    // O'sha tenantning o'zi qayta saqlashi (token aylantirish) — ruxsat
    await run(tenantA, (c) =>
      service.update(c, { telegram: { botToken: '7700000001:DDD-rotated-secret-of-first-bot' } }),
    );

    // A uzgach, B shu botni olishi mumkin
    await run(tenantA, (c) => service.update(c, { telegram: null }));
    await run(tenantB, (c) =>
      service.update(c, { telegram: { botToken: '7700000001:EEE-secret-now-free-for-b-tenant' } }),
    );
  });
});
