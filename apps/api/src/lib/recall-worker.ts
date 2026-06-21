import { patients, recallLogs, recalls, tenantSettings, tenants } from '@dental/db-schema';
import { createSmsChannel, type NotificationChannel } from '@dental/notifications';
import { Worker } from 'bullmq';
import { and, eq, lte } from 'drizzle-orm';
import { createAdminDb, type Database, type DbOrTx } from '../db/client.ts';
import { withTenant } from '../db/scoped.ts';
import { env } from './env.ts';
import { logger } from './logger.ts';
import { RECALL_QUEUE_NAME } from './queue.ts';
import { CLINIC_TZ, renderRecallSms, type SmsLang } from './sms-templates.ts';

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
  sms: NotificationChannel;
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
 *      Eskiz SMS (renderRecallSms) → status=contacted + recall_logs.
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
      patientName: patients.fullName,
      patientPhone: patients.phone,
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
    if (localHour(tz, now) < sendHour) {
      result.skipped++;
      continue;
    }

    const lang: SmsLang = row.defaultLanguage === 'ru' ? 'ru' : 'uz';

    // 3. Tenant RLS context — status re-check (race guard) → SMS → contacted + log.
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

      if (!row.patientPhone) {
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

      const sendRes = await deps.sms.send(row.patientPhone, { text });

      await tx.insert(recallLogs).values({
        tenantId: row.tenantId,
        recallId: row.recallId,
        channel: 'sms',
        outcome: sendRes.ok ? 'sent' : 'failed',
        detail: sendRes.ok ? (sendRes.providerId ?? null) : (sendRes.error ?? 'send failed'),
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
  }

  return result;
}

/**
 * Real worker — admin client + Eskiz SMS + Redis Worker. Dedicated worker
 * process'da boot qilinadi (worker.ts). Har repeatable trigger'da scan ishlaydi.
 */
export function startRecallWorker(): { worker: Worker; close: () => Promise<void> } {
  const { db: adminDb, client: adminClient } = createAdminDb();
  const sms = createSmsChannel({ eskizEmail: env.ESKIZ_EMAIL, eskizPassword: env.ESKIZ_PASSWORD });

  const worker = new Worker(
    RECALL_QUEUE_NAME,
    async () => {
      const res = await processRecallScan({ adminDb, sms, withTenant });
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
