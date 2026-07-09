/**
 * CLI-379/400 — "encrypt on write" runtime proof against a REAL DB.
 *
 * `tenant-settings.mapper.test.ts` only proves "mask on read" (it hand-builds an
 * already-encrypted fixture). Nothing exercised `service.update({telegram, sms})`
 * end-to-end: raw cred in → ciphertext persisted (via Postgres `RETURNING`, i.e.
 * the actual committed row, not an in-memory guess) → independent re-read →
 * masked DTO out. This file closes that gap.
 *
 * Determinism note: `crypto.ts::getOrCreateMessagingSecret` prefers `env.MESSAGING_SECRET`
 * (a value frozen into `lib/env.ts`'s validated singleton AT MODULE-IMPORT TIME — brittle
 * to set from a test file, see the ESM-hoisting note in `src/lib/crypto.test.ts` /
 * `tenant-settings.mapper.test.ts`; empirically this is ALSO order-dependent across
 * multiple test files sharing one `bun test` process, not just within one file — e.g.
 * `bun test src/lib/crypto.test.ts tests/integration/tenant-settings.test.ts` together
 * breaks crypto.test.ts's own tests even though crypto.test.ts is listed first, because
 * `tenant-settings.test.ts`'s static `app.ts` import pulls `env.ts` in through a
 * different evaluation path). This file sidesteps that entirely by using
 * `MESSAGING_SECRET_PATH` instead: `getSecretPath()` reads `process.env.MESSAGING_SECRET_PATH`
 * LIVE (plain `process.env` access) INSIDE `getOrCreateMessagingSecret()`, i.e. at
 * *call* time (when a test actually invokes `encryptSecret`/`decryptSecret` via the
 * service), not at module-import time — so plain static imports are safe here, and the
 * exact key material doesn't matter (a fresh random key is generated + persisted to this
 * file on first use within the run); we only assert on ciphertext-vs-plaintext and
 * masked-hint correctness, both of which hold for ANY valid key.
 *
 * Requires: Postgres running, DATABASE_URL in --env-file, migrations applied (same
 * precondition as tenant-settings.test.ts).
 * Run: `cd apps/api && bun test tests/integration/cli-379-tenant-settings-creds.test.ts --env-file=<path-to-env-with-DATABASE_URL>`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { toTenantSettingsDto } from '../../src/modules/tenant-settings/tenant-settings.mapper.ts';
import { createTenantSettingsService } from '../../src/modules/tenant-settings/tenant-settings.service.ts';

const secretPath = `${import.meta.dir}/.cli-379-messaging-secret-test.txt`;
process.env.MESSAGING_SECRET_PATH = secretPath;

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createTenantSettingsService({ audit: noopAudit });

let tenantId: string;
let ownerId: string;

beforeAll(async () => {
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000088', passwordHash: 'x', fullName: 'Creds Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('seed failed: owner');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Creds Clinic', slug: 'creds-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('seed failed: tenant');
  tenantId = tenant.id;
});

afterAll(async () => {
  // Targeted cleanup (not TRUNCATE) — this file may run alongside other
  // integration test files that seed their own tenants/users.
  await db.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${ownerId}`);
  if (existsSync(secretPath)) rmSync(secretPath);
});

/** Each `run` is its own (committed) transaction — proves cross-transaction persistence. */
const run = <T>(fn: (c: Context) => Promise<T>) =>
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

describe('tenant-settings — CLI-379/400 encrypt-on-write (real DB)', () => {
  test('PATCH raw telegram+sms creds → committed row stores only ciphertext, never plaintext', async () => {
    const rawToken = '123456789:ABCDEF-real-secret-token';
    const rawPassword = 'S3cr3tPW!';

    const updated = await run((c) =>
      service.update(c, {
        telegram: { botToken: rawToken },
        sms: { eskizEmail: 'clinic@eskiz.uz', eskizPassword: rawPassword },
      }),
    );

    // `updated` comes from `db.update(tenantSettings).set(patch).returning()` inside
    // the service — i.e. the actual committed row, not an in-memory value we built.
    const persisted = JSON.stringify(updated.integrationSettings);
    expect(persisted).not.toContain(rawToken);
    expect(persisted).not.toContain(rawPassword);
    expect(persisted).toContain('botTokenEnc');
    expect(persisted).toContain('eskizPasswordEnc');
    expect(persisted).not.toContain('"botToken"'); // raw input key must not leak into storage

    // Independent re-read (fresh transaction) — proves it round-trips from the DB,
    // not just from the mutation's own return value.
    const reread = await run((c) => service.getOrCreate(c));
    expect(JSON.stringify(reread.integrationSettings)).not.toContain(rawToken);
    expect(JSON.stringify(reread.integrationSettings)).not.toContain(rawPassword);

    const dto = toTenantSettingsDto(reread);
    expect(dto.integrationSettings.telegram).toEqual({ configured: true, hint: '••••oken' });
    expect(dto.integrationSettings.sms).toEqual({ configured: true, hint: '••••tPW!' });
  });

  test('PATCH telegram: null clears only telegram — sms survives (2-level merge)', async () => {
    const updated = await run((c) => service.update(c, { telegram: null }));
    const dto = toTenantSettingsDto(updated);
    expect(dto.integrationSettings.telegram).toEqual({ configured: false, hint: null });
    expect(dto.integrationSettings.sms.configured).toBe(true); // untouched by the telegram-only patch
  });
});
