/**
 * FX-75 — bot yo'lida (createBotContext + withTenant) onAfterCommit side-effect'i
 * tx COMMIT'dan keyin ishlaydi, rollback'da tashlab yuboriladi (P4 invarianti). Real DB.
 *   cd apps/api && bun test --env-file=../../.env tests/integration/fx-75-bot-after-commit.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { patients, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { onAfterCommit } from '../../src/db/after-commit.ts';
import { db } from '../../src/db/client.ts';
import { withTenant } from '../../src/db/scoped.ts';
import { createBotContext } from '../../src/lib/telegram/bot-context.ts';

let tenantId: string;

const visibleFromOutside = (name: string) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
    const rows = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.fullName, name));
    return rows.length;
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900007500', passwordHash: 'x', fullName: 'Owner FX75' })
    .returning({ id: users.id });
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX75', slug: 'fx75', ownerUserId: u!.id, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = t!.id;
});

describe('FX-75 bot onAfterCommit', () => {
  test('side-effect commit’dan KEYIN ishlaydi (ma’lumot tashqaridan ko‘rinadi)', async () => {
    const log: string[] = [];
    let seenAtEffect = -1;
    await withTenant(tenantId, async (tx) => {
      await tx
        .insert(patients)
        .values({ tenantId, fullName: 'fx75-commit', phone: '+998907500001' });
      const c = createBotContext(tx, tenantId);
      await onAfterCommit(c, async () => {
        log.push('effect');
        seenAtEffect = await visibleFromOutside('fx75-commit');
      });
      log.push('fn-done');
    });
    expect(log).toEqual(['fn-done', 'effect']);
    expect(seenAtEffect).toBe(1);
  });

  test('rollback’da side-effect tashlab yuboriladi', async () => {
    let ran = false;
    await expect(
      withTenant(tenantId, async (tx) => {
        const c = createBotContext(tx, tenantId);
        await onAfterCommit(c, async () => {
          ran = true;
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(ran).toBe(false);
  });

  test('side-effect xatosi commit bo‘lgan natijani buzmaydi', async () => {
    const res = await withTenant(tenantId, async (tx) => {
      const c = createBotContext(tx, tenantId);
      await onAfterCommit(c, async () => {
        throw new Error('effect failed');
      });
      return 'ok';
    });
    expect(res).toBe('ok');
  });
});
