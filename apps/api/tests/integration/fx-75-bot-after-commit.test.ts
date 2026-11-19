/**
 * FX-75 — bot yo'lida (createBotContext + withTenant) onAfterCommit side-effect'i
 * tx COMMIT'dan keyin ishlaydi, rollback'da tashlab yuboriladi (P4 invarianti). Real DB.
 * FX-82 seam: savepoint (`runInSavepoint`) ichida ro'yxatdan o'tgan effekt ham yo'qolmaydi.
 *   cd apps/api && bun test --env-file=../../.env tests/integration/fx-75-bot-after-commit.test.ts
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { patients, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { onAfterCommit, runInSavepoint } from '../../src/db/after-commit.ts';
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

describe('FX-82 seam — savepoint ichidagi onAfterCommit', () => {
  test("savepoint (ichma-ich ham) ichida ro'yxatdan o'tgan effekt tashqi commit'dan KEYIN ishlaydi", async () => {
    const log: string[] = [];
    let seenAtEffect = -1;
    await withTenant(tenantId, async (tx) => {
      await runInSavepoint(tx, async (sp) => {
        await sp
          .insert(patients)
          .values({ tenantId, fullName: 'fx82-sp-commit', phone: '+998907500002' });
        await onAfterCommit(createBotContext(sp, tenantId), async () => {
          log.push('outer-sp');
          seenAtEffect = await visibleFromOutside('fx82-sp-commit');
        });
        await runInSavepoint(sp, async (sp2) => {
          await onAfterCommit(createBotContext(sp2, tenantId), async () => {
            log.push('inner-sp');
          });
        });
      });
      log.push('fn-done');
    });
    expect(log).toEqual(['fn-done', 'outer-sp', 'inner-sp']);
    expect(seenAtEffect).toBe(1);
  });

  test('savepoint rollback: uning effekti tashlanadi, tashqi tx effekti ishlaydi', async () => {
    const log: string[] = [];
    await withTenant(tenantId, async (tx) => {
      await onAfterCommit(createBotContext(tx, tenantId), async () => {
        log.push('outer');
      });
      await expect(
        runInSavepoint(tx, async (sp) => {
          await onAfterCommit(createBotContext(sp, tenantId), async () => {
            log.push('rolled-back-sp');
          });
          throw new Error('sp boom');
        }),
      ).rejects.toThrow('sp boom');
    });
    expect(log).toEqual(['outer']);
  });

  test('savepoint muvaffaqiyatli, lekin tashqi tx rollback — effekt ishlamaydi', async () => {
    let ran = false;
    await expect(
      withTenant(tenantId, async (tx) => {
        await runInSavepoint(tx, async (sp) => {
          await onAfterCommit(createBotContext(sp, tenantId), async () => {
            ran = true;
          });
        });
        throw new Error('outer boom');
      }),
    ).rejects.toThrow('outer boom');
    expect(ran).toBe(false);
  });
});
