import {
  patientEmergencyContacts,
  patients,
  recallLogs,
  recalls,
  tenantSettings,
  tenants,
} from '@dental/db-schema';
import type { NotificationChannel } from '@dental/notifications';
import { Worker } from 'bullmq';
import { and, asc, desc, eq, lte } from 'drizzle-orm';
import { createAdminDb, type Database, type DbOrTx } from '../db/client.ts';
import { withTenant } from '../db/scoped.ts';
import { env } from './env.ts';
import { logger } from './logger.ts';
import { RECALL_QUEUE_NAME } from './queue.ts';
import { CLINIC_TZ, renderRecallSms, type SmsLang } from './sms-templates.ts';
import { resolveTenantChannel } from './tenant-channel.ts';

/** Klinika-local kun (YYYY-MM-DD) berilgan TZ'da. */
export function localDateString(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Klinika-local soat (0-23) berilgan TZ'da. */
export function localHour(tz: string, now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false,
  }).format(now);
  // "24" yarim tunni ba'zi muhitlarda qaytaradi → normalize.
  const n = Number(h);
  return n === 24 ? 0 : n;
}

export type RecallScanDeps = {
  /** RLS-bypass admin connection — cross-tenant scan uchun (Qaror #23). */
  adminDb: Database;
  /**
   * CLI-379/400: endi HAR RECALL o'z tenant'ining `integration_settings`i
   * (+ bemor `telegramChatId`) asosida `resolveTenantChannel` orqali kanal
   * tanlaydi (Telegram > Eskiz SMS > NoOp) — bitta global kanal EMAS. `sms`
   * shu bilan optional bo'ldi: faqat tenant hech qanday messaging credential
   * sozlamagan ("none") holatda ishlatiladigan test-only fallback/spy
   * (production'da berilmaydi — unconfigured tenant haqiqatan NoOp bo'ladi,
   * boshqa tenant'ning umumiy akkauntidan foydalanilmaydi).
   */
  sms?: NotificationChannel;
  /** Tenant-scoped tx ochuvchi (RLS context) — odatda `withTenant`. */
  withTenant: <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>) => Promise<T>;
  now?: Date;
};

export type RecallScanResult = { scanned: number; sent: number; failed: number; skipped: number };

/**
 * Recall kunlik scan (B7, Qaror #23). Pure + injectable — test mock adminDb bilan
 * haydaydi (Redis'siz). Oqim:
 *   1. ADMIN conn (RLS bypass) bilan barcha tenant bo'yicha due recall'lar
 *      (status=pending, dueDate <= tenant-local bugun) topiladi.
 *   2. Tenant recallSendHourLocal/timezone gate — local soat hali yetmagan
 *      tenant'lar bu sikldan o'tkazib yuboriladi (kunlik cron 11:00 default'da
 *      doim qanoatlantiradi).
 *   3. Har recall uchun `withTenant(tenantId)` → status re-check (race guard) →
 *      per-tenant kanal (CLI-379/400 `resolveTenantChannel`: Telegram > Eskiz SMS >
 *      NoOp, renderRecallSms matni) → status=contacted + recall_logs.
 */
export async function processRecallScan(deps: RecallScanDeps): Promise<RecallScanResult> {
  const now = deps.now ?? new Date();
  const result: RecallScanResult = { scanned: 0, sent: 0, failed: 0, skipped: 0 };

  // 1. Cross-tenant due recall'lar (admin conn — RLS bypass). Tenant sozlama +
  //    bemor join: til, klinika nomi, telefon, tenant TZ/soat.
  const due = await deps.adminDb
    .select({
      recallId: recalls.id,
      tenantId: recalls.tenantId,
      patientId: recalls.patientId,
      patientName: patients.fullName,
      patientPhone: patients.phone,
      // CLI-474 (L8): rozilik bo'lsa bemor telefoni yo'qligida favqulodda aloqaga fallback.
      allowEmergencyRecall: patients.allowEmergencyRecall,
      // CLI-379/400: per-tenant kanal tanlovi uchun (resolveTenantChannel).
      telegramChatId: patients.telegramChatId,
      integrationSettings: tenantSettings.integrationSettings,
      defaultLanguage: tenants.defaultLanguage,
      clinicName: tenants.name,
      dueDate: recalls.dueDate,
      timezone: tenantSettings.timezone,
      sendHourLocal: tenantSettings.recallSendHourLocal,
    })
    .from(recalls)
    .innerJoin(patients, eq(patients.id, recalls.patientId))
    .innerJoin(tenants, eq(tenants.id, recalls.tenantId))
    .leftJoin(tenantSettings, eq(tenantSettings.tenantId, recalls.tenantId))
    .where(
      and(eq(recalls.status, 'pending'), lte(recalls.dueDate, localDateString(CLINIC_TZ, now))),
    );

  for (const row of due) {
    result.scanned++;
    const tz = row.timezone ?? CLINIC_TZ;
    const sendHour = row.sendHourLocal ?? 10;

    // 2. Tenant-local due + soat gate. dueDate tenant-local bugun(yoki oldin)
    //    bo'lishi + local soat sendHour'ga yetgan bo'lishi shart.
    const tenantToday = localDateString(tz, now);
    if (row.dueDate > tenantToday) {
      result.skipped++;
      continue;
    }
    // ⚠️ Effektiv shift: kunlik cron 11:00 Tashkent'da ishlaydi (B6). Agar tenant
    // recallSendHourLocal'ni cron soatidan YUQORI qo'ysa (>11), gate har siklda
    // skip qiladi va recall hech qachon yuborilmaydi (kunlik trigger soddaligi
    // bahosi). Default 10 ≤ 11 → doim o'tadi.
    if (localHour(tz, now) < sendHour) {
      result.skipped++;
      continue;
    }

    const lang: SmsLang = row.defaultLanguage === 'ru' ? 'ru' : 'uz';

    // 3. Tenant RLS context — status re-check (race guard) → SMS → contacted + log.
    // ⚠️ Har recall MUSTAQIL izolyatsiya qilinadi (try/catch loop darajasida, ichkarida
    // EMAS — `withTenant`ning o'zi tutmaydi): `resolveTenantChannel` → `decryptSecret`
    // buzuq/decrypt-qilib bo'lmaydigan ciphertext (masalan, MESSAGING_SECRET rotatsiya
    // qilingan yoki row buzilgan) holatida THROW qiladi. Bu tutilmasa — BITTA tenant
    // butun scan siklini to'xtatib, boshqa barcha due tenant'lar sukut bilan o'tkazib
    // yuboriladi (audit izsiz). Shuning uchun throw shu yerda ushlanadi: faqat shu
    // recall failed deb belgilanadi, scan keyingi tenant/recall'ga davom etadi.
    try {
      await deps.withTenant(row.tenantId, async (tx) => {
        const [live] = await tx
          .select({ status: recalls.status, attempts: recalls.contactAttempts })
          .from(recalls)
          .where(eq(recalls.id, row.recallId))
          .limit(1);
        // Boshqa scan allaqachon contacted qildi (overlap) → skip.
        if (!live || live.status !== 'pending') {
          result.skipped++;
          return;
        }

        // CLI-474 (L8): bemor telefoni yo'q + rozilik (allowEmergencyRecall) bo'lsa —
        // favqulodda aloqa (primary: is_primary DESC, keyin eng eski) raqamiga fallback.
        let targetPhone = row.patientPhone;
        let emergencyFallback = false;
        if (!targetPhone && row.allowEmergencyRecall) {
          const [ec] = await tx
            .select({ phone: patientEmergencyContacts.phone })
            .from(patientEmergencyContacts)
            .where(eq(patientEmergencyContacts.patientId, row.patientId))
            .orderBy(
              desc(patientEmergencyContacts.isPrimary),
              asc(patientEmergencyContacts.createdAt),
            )
            .limit(1);
          if (ec?.phone) {
            targetPhone = ec.phone;
            emergencyFallback = true;
          }
        }

        // CLI-379/400: per-tenant kanal — Telegram(chat_id) > Eskiz SMS(phone) > NoOp.
        // `targetPhone` shu yerga kirguncha allaqachon favqulodda-fallback bilan
        // aniqlangan (yuqorida) — resolveTenantChannel Telegram bo'lsa telefonsiz
        // ham ishlaydi, aks holda shu (potentsial fallback) telefonga tayanadi.
        // ⚠️ `decryptSecret` (Telegram/Eskiz cred ochilganda) shu yerda THROW qilishi
        // mumkin (buzuq ciphertext / rotatsiya qilingan kalit) — tashqi try/catch
        // (loop darajasida) ushlaydi, quyida qo'shimcha himoya shart emas.
        const resolved = resolveTenantChannel(
          row.integrationSettings,
          row.telegramChatId,
          targetPhone,
        );
        // Hech qanday tenant-credential sozlanmagan ("none") holatda ham `to` bor —
        // faqat shu holatda test/legacy fallback (`deps.sms`) beriladi bo'lsa ishlatiladi.
        const channel: NotificationChannel =
          resolved.source === 'none' && deps.sms ? deps.sms : resolved.channel;
        const to = resolved.to;

        if (!to) {
          await tx.insert(recallLogs).values({
            tenantId: row.tenantId,
            recallId: row.recallId,
            channel: 'sms',
            outcome: 'no_phone',
            detail: 'Bemor telefoni yo‘q',
          });
          result.failed++;
          return;
        }

        const { title, body } = renderRecallSms({
          lang,
          patientName: row.patientName ?? '',
          clinicName: row.clinicName ?? '',
        });
        const text = `${title} — ${body}`;

        const sendRes = await channel.send(to, { text });

        await tx.insert(recallLogs).values({
          tenantId: row.tenantId,
          recallId: row.recallId,
          channel: 'sms',
          outcome: sendRes.ok ? 'sent' : 'failed',
          // CLI-475 B7 — "Favqulodda aloqaga yuborildi" FAQAT xabar haqiqatan
          // favqulodda telefonga ketganda. Telegram (chat_id) tanlansa
          // `emergencyFallback` true bo'lsa ham favqulodda TELEFON ishlatilmaydi
          // (xabar bemor chat_id'ga ketadi) — `source !== 'telegram'` bilan gate
          // (sms YOKI none — ikkalasida ham `to` telefonga yuboriladi).
          detail:
            emergencyFallback && resolved.source !== 'telegram'
              ? `Favqulodda aloqaga yuborildi${sendRes.ok ? '' : ' (xato)'}`
              : sendRes.ok
                ? (sendRes.providerId ?? null)
                : (sendRes.error ?? 'send failed'),
        });

        if (sendRes.ok) {
          await tx
            .update(recalls)
            .set({
              status: 'contacted',
              lastContactedAt: now,
              contactAttempts: live.attempts + 1,
              updatedAt: now,
            })
            .where(eq(recalls.id, row.recallId));
          result.sent++;
        } else {
          result.failed++;
        }
      });
    } catch (err) {
      // Bitta recall'ning kanal-resolution/send xatosi (masalan, `decryptSecret`
      // throw) BOSHQA tenant/recall'larni bloklamasligi shart. Xato faqat shu
      // recall'ni failed qiladi — audit uchun `detail` FIXED matn (hech qachon
      // `err.message`/decrypt qilingan token emas — secret leak xavfsizligi).
      logger.error(
        { err, tenantId: row.tenantId, recallId: row.recallId },
        'Recall scan: tenant kanal xatosi — recall failed, scan davom etadi',
      );
      result.failed++;
      try {
        // `tx` allaqachon rollback qilingan (throw'dan keyin) — yangi tx kerak.
        await deps.withTenant(row.tenantId, (tx) =>
          tx.insert(recallLogs).values({
            tenantId: row.tenantId,
            recallId: row.recallId,
            channel: 'sms',
            outcome: 'failed',
            detail: 'channel resolution failed',
          }),
        );
      } catch (logErr) {
        logger.error(
          { err: logErr, tenantId: row.tenantId, recallId: row.recallId },
          'Recall scan: failed-log yozib bo‘lmadi',
        );
      }
    }
  }

  return result;
}

/**
 * Real worker — admin client + Redis Worker. Dedicated worker process'da boot
 * qilinadi (worker.ts). Har repeatable trigger'da scan ishlaydi.
 *
 * CLI-379/400: global `TELEGRAM_BOT_TOKEN`/`ESKIZ_*` env-based kanal OLIB
 * TASHLANDI — har recall endi o'z tenant'ining `integration_settings`i
 * asosida `processRecallScan` ichida (`resolveTenantChannel`) kanal tanlaydi.
 * `deps.sms` bu yerda BERILMAYDI: tenant o'z messaging credential'ini
 * sozlamagan bo'lsa — NoOp (boshqa tenant'ning umumiy akkauntiga fallback YO'Q).
 * ⚠️ recall_logs.channel enum hozircha 'sms'/'manual' — 'telegram' log qiymati
 * Telegram jonli faollashganda (CLI-379) enum migration bilan qo'shiladi.
 */
export function startRecallWorker(): { worker: Worker; close: () => Promise<void> } {
  const { db: adminDb, client: adminClient } = createAdminDb();

  const worker = new Worker(
    RECALL_QUEUE_NAME,
    async () => {
      const res = await processRecallScan({ adminDb, withTenant });
      logger.info({ ...res }, 'Recall scan finished');
    },
    { connection: { url: env.REDIS_URL } },
  );

  return {
    worker,
    close: async () => {
      await worker.close();
      await adminClient.end({ timeout: 5 });
    },
  };
}
