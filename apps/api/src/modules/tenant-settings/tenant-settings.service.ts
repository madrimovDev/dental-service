import { tenantSettings } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { encryptSecret } from '../../lib/crypto.ts';
import { mergeNotificationSettings } from './tenant-settings.mapper.ts';
import type { UpdateSettingsInput } from './tenant-settings.schema.ts';

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
        next.telegram =
          telegram === null ? null : { botTokenEnc: encryptSecret(telegram.botToken) };
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

    const [updated] = await db.update(tenantSettings).set(patch).returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'tenant_settings',
        resourceId: updated.id,
        before,
        after: updated,
      });
    }

    return updated ?? before;
  }

  return { getOrCreate, update };
};

export type TenantSettingsService = ReturnType<typeof createTenantSettingsService>;
