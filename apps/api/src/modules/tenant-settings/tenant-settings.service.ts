import { patients, tenantSettings } from '@dental/db-schema';
import { gt, isNotNull, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import IORedis from 'ioredis';
import { onAfterCommit } from '../../db/after-commit.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { decryptSecret, encryptSecret } from '../../lib/crypto.ts';
import { env } from '../../lib/env.ts';
import { logger } from '../../lib/logger.ts';
import { pgErrorInfo } from '../../lib/pg-error.ts';
import { mergeNotificationSettings } from './tenant-settings.mapper.ts';
import type { UpdateSettingsInput } from './tenant-settings.schema.ts';

// CLI-379: bot-manager reload signal. Lazy singleton — faqat telegram cred
// o'zgarganda ishlatiladi; alohida pub connection (Redis subscribe holatiga
// aralashmaslik uchun).
let redisPub: IORedis | null = null;
const getRedisPub = (): IORedis => {
  if (!redisPub) redisPub = new IORedis(env.REDIS_URL);
  return redisPub;
};

/**
 * CLI-475 B5 — graceful shutdown/test uchun `telegram:reload` publish ulanishini
 * yopadi (rate-limit.ts `closeRateLimitRedis` bilan bir xil pattern). Ochilmagan
 * holatda no-op (idempotent) — shutdown ikki signal olsa ham xavfsiz.
 */
export const closeRedisPub = async (): Promise<void> => {
  if (redisPub) {
    await redisPub.quit().catch(() => {});
    redisPub = null;
  }
};

/** FX-25: bu bot boshqa tenantga ulangan (`tenant_settings_telegram_bot_id_uq`). */
export class TelegramTokenInUseError extends Error {
  readonly code = 'telegram_token_in_use';
  constructor() {
    super('This Telegram bot is already connected to another clinic');
    this.name = 'TelegramTokenInUseError';
  }
}

/** Bot token `<bot_id>:<secret>` — bot id (raqam) token prefiksi; getMe().id bilan bir xil. */
export const telegramBotIdFromToken = (token: string): string | null =>
  /^(\d{3,20}):/.exec(token.trim())?.[1] ?? null;

export const createTenantSettingsService = (deps: { audit: AuditLogger }) => {
  /**
   * Tenant settings row'ni oladi; yo'q bo'lsa default qiymatlar bilan yaratadi.
   *
   * RLS tenant orqali filtrlaydi — explicit `WHERE tenant_id` yozilmaydi
   * (unique constraint + RLS bitta row kafolatlaydi). Insert default qiymatlarni
   * schema'dan oladi (vertical='dental', reminderLeadHours=24, currency='UZS');
   * `tenantId` esa RLS NOT NULL ustunni to'ldirmaydi, shuning uchun explicit beriladi.
   */
  async function getOrCreate(c: Context) {
    const db = getDb(c);

    const [existing] = await db.select().from(tenantSettings);
    if (existing) return existing;

    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const [created] = await tx.insert(tenantSettings).values({ tenantId }).returning();
      if (!created) throw new Error('Tenant settings insert failed');

      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'tenant_settings',
        resourceId: created.id,
        after: created,
      });

      return created;
    });
  }

  /**
   * Settings'ni yangilaydi — avval get-or-create, keyin faqat berilgan maydonlar
   * (+ updatedAt) `set` qilinadi. Audit before/after bilan yoziladi.
   */
  async function update(c: Context, input: UpdateSettingsInput) {
    const db = getDb(c);
    const before = await getOrCreate(c);

    // `onboardingDismissedAt` wire'da ISO string keladi; Drizzle ustun Date kutadi.
    // DS10: `notificationSettings` — saqlangan JSONB ustiga MERGE qilinadi (to'liq
    // almashtirilmaydi); `telegram`/`sms` — CLI-379/400 xom kredensiallar (pastda
    // AES bilan shifrlanadi), shuning uchun barchasi `...rest`'dan ajratiladi.
    const { onboardingDismissedAt, notificationSettings, telegram, sms, ...rest } = input;
    const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (onboardingDismissedAt !== undefined) {
      patch.onboardingDismissedAt = onboardingDismissedAt ? new Date(onboardingDismissedAt) : null;
    }
    if (notificationSettings !== undefined) {
      patch.notificationSettings = mergeNotificationSettings(
        before.notificationSettings,
        notificationSettings,
      );
    }
    // CLI-379/400: telegram/sms xom cred → AES shifrlab integration_settings'ga.
    // `null` → integration o'chiriladi (boshqa provider saqlanadi — 2-darajali merge).
    if (telegram !== undefined || sms !== undefined) {
      const current = (before.integrationSettings ?? {}) as Record<string, unknown>;
      const next = { ...current };
      if (telegram !== undefined) {
        // FX-25: bot id alohida saqlanadi — unique indeks tenantlar orasida takrorni rad etadi.
        const botId = telegram === null ? null : telegramBotIdFromToken(telegram.botToken);
        next.telegram =
          telegram === null
            ? null
            : { botTokenEnc: encryptSecret(telegram.botToken), ...(botId ? { botId } : {}) };
      }
      if (sms !== undefined) {
        next.sms =
          sms === null
            ? null
            : {
                eskizEmailEnc: encryptSecret(sms.eskizEmail),
                eskizPasswordEnc: encryptSecret(sms.eskizPassword),
              };
      }
      patch.integrationSettings = next;
    }

    // FX-41 (LA-22): boshqa BOT ulansa (bot id — tokendagi ':' oldidagi qism — farqli) eski
    // bot bilan bog'langan chat_id'lar tozalanadi. Review: o'sha botning tokeni yangi sir
    // bilan almashtirilsa (BotFather /revoke) yoki Telegram o'chirilsa (`null`) — tegilmaydi:
    // shaxsiy chat'da chat_id = foydalanuvchi id, ya'ni boshqa bot ham faqat o'sha odamga,
    // u /start bosgandan keyingina yeta oladi; aks holda 403 → onBlocked bemor bo'yicha tozalaydi.
    let botChanged = false;
    if (telegram) {
      const prevEnc = (
        (before.integrationSettings ?? {}) as { telegram?: { botTokenEnc?: string } | null }
      ).telegram?.botTokenEnc;
      let prevToken: string | null = null;
      if (prevEnc) {
        try {
          prevToken = decryptSecret(prevEnc);
        } catch {
          prevToken = null;
        }
      }
      const botIdOf = (token: string) => token.split(':')[0];
      botChanged = prevToken !== null && botIdOf(telegram.botToken) !== botIdOf(prevToken);
    }

    let updated: typeof before | undefined;
    try {
      // SAVEPOINT: unique buzilishi (23505) so'rov tranzaksiyasini aborted qilmasin.
      [updated] = await db.transaction(async (sp) =>
        sp.update(tenantSettings).set(patch).returning(),
      );
    } catch (err) {
      const pg = pgErrorInfo(err);
      if (pg?.code === '23505' && pg.constraint === 'tenant_settings_telegram_bot_id_uq') {
        throw new TelegramTokenInUseError();
      }
      throw err;
    }

    if (botChanged) {
      await db
        .update(patients)
        .set({ telegramChatId: null })
        .where(isNotNull(patients.telegramChatId));
    }

    // FT-04.3 (review): chegara saqlanganda — undan oshgan bemor doimiy chegirmalari chegaraga
    // tushiriladi (0 → chegirma olib tashlanadi). Invariant `default_discount_percent ≤ max`:
    // aks holda reja bosqichi/POS chegarani aylanib o'tardi yoki discount.give'siz kassir bu
    // bemorga sota olmasdi. Tushirilgan bemorlar soni tenant_settings audit'iga yoziladi
    // (FX-41 bulk update precedenti). Faqat chegaradan oshganlar o'zgaradi (idempotent).
    let clampedPatients = 0;
    if (input.maxDiscountPercent !== undefined) {
      const cap = input.maxDiscountPercent;
      const clamped = await db
        .update(patients)
        .set({ defaultDiscountPercent: cap > 0 ? cap.toFixed(2) : null, updatedAt: new Date() })
        .where(gt(patients.defaultDiscountPercent, cap.toFixed(2)))
        .returning({ id: patients.id });
      clampedPatients = clamped.length;
    }

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'tenant_settings',
        resourceId: updated.id,
        before,
        after:
          clampedPatients > 0 ? { ...updated, clampedPatientDiscounts: clampedPatients } : updated,
      });
    }

    // CLI-379: telegram cred o'zgargandan keyin bot-manager'ga reload signal.
    // FX-10 (LA-24): publish FAQAT COMMIT'dan keyin — bot-manager alohida ulanishda
    // o'qiydi va commit bo'lmagan qatorni ko'rmaydi (eski/yo'q token bilan ishga tushardi).
    // Best-effort — Redis xatosi settings save'ni HECH QACHON buzmaydi.
    if (telegram !== undefined) {
      const tenantId = c.get('activeTenantId');
      if (tenantId) {
        await onAfterCommit(c, async () => {
          try {
            await getRedisPub().publish('telegram:reload', tenantId);
          } catch (err) {
            logger.error({ err, tenantId }, 'telegram:reload publish failed');
          }
        });
      }
    }

    return updated ?? before;
  }

  return { getOrCreate, update };
};

export type TenantSettingsService = ReturnType<typeof createTenantSettingsService>;
