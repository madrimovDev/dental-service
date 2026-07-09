import {
  appointments,
  patientEmergencyContacts,
  patients,
  tenantSettings,
  tenants,
} from '@dental/db-schema';
import { createNoOpChannel } from '@dental/notifications';
import { Worker } from 'bullmq';
import { asc, desc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.ts';
import { withTenant } from '../db/scoped.ts';
import type { NotificationsService } from '../modules/notifications/index.ts';
import { createNotificationsService } from '../modules/notifications/index.ts';
import { env } from './env.ts';
import type { ReminderJob } from './queue.ts';
import { renderReminderSms, type SmsLang } from './sms-templates.ts';
import { type ResolvedTenantChannel, resolveTenantChannel } from './tenant-channel.ts';

/**
 * Status guard (CLI-186): bekor qilingan / kelmagan yozilishga eslatma SMS
 * yuborilmaydi. Job reschedule'da o'chiriladi, lekin in-flight job hali ham
 * status'ni live tekshirishi shart (race xavfsizligi).
 */
export function shouldSkipReminder(status: string): boolean {
  return status === 'cancelled' || status === 'no_show';
}

/**
 * Bitta eslatma job'ini qayta ishlash — tenant tx ichida appt'ni live o'qiydi,
 * status guard, til tanlash (tenant default), lokalizatsiya qilingan SMS.
 * `startReminderWorker` va testlar shuni chaqiradi (Redis Worker'siz).
 */
export async function processReminderJob(
  svc: NotificationsService,
  job: ReminderJob,
): Promise<void> {
  const { tenantId, appointmentId } = job;
  await withTenant(tenantId, async (tx: DbOrTx) => {
    const [appt] = await tx.select().from(appointments).where(eq(appointments.id, appointmentId));
    if (!appt) return;
    if (shouldSkipReminder(appt.status)) return;

    const [patient] = await tx.select().from(patients).where(eq(patients.id, appt.patientId));
    // Til — tenant default tili (Asia/Tashkent SMS lokalizatsiyasi, CLI-186).
    const [tenant] = await tx
      .select({ defaultLanguage: tenants.defaultLanguage })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    const lang: SmsLang = tenant?.defaultLanguage === 'ru' ? 'ru' : 'uz';

    // CLI-379/400: per-tenant kanal tanlovi uchun (resolveTenantChannel).
    const [settingsRow] = await tx
      .select({ integrationSettings: tenantSettings.integrationSettings })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId));

    const { title, body } = renderReminderSms({
      lang,
      patientName: patient?.fullName ?? '',
      startTime: appt.startTime,
    });

    // CLI-465: bemor telefoni yo'q bo'lganda SMS avval jim (kuzatilmagan)
    // o'tkazib yuborilardi. recall-worker.ts'dagi outcome:'no_phone' pattern'iga
    // mos — `notifications` jadvali reminder worker uchun mavjud persistence
    // (fayl boshidagi izoh: "Yozilish eslatmasi (reminder worker)"), shuning
    // uchun yangi jadval/migratsiya shart emas — alohida `type` bilan doktorga
    // kuzatiladigan in-app yozuv qoldiramiz, SMS umuman urinilmaydi.
    // CLI-474 (L8): bemor telefoni yo'q + rozilik (allowEmergencyRecall) bo'lsa —
    // favqulodda aloqa (primary) raqamiga fallback. recall-worker bilan bir xil.
    let targetPhone = patient?.phone ?? null;
    let emergencyFallback = false;
    if (!targetPhone && patient?.allowEmergencyRecall) {
      const [ec] = await tx
        .select({ phone: patientEmergencyContacts.phone })
        .from(patientEmergencyContacts)
        .where(eq(patientEmergencyContacts.patientId, appt.patientId))
        .orderBy(desc(patientEmergencyContacts.isPrimary), asc(patientEmergencyContacts.createdAt))
        .limit(1);
      if (ec?.phone) {
        targetPhone = ec.phone;
        emergencyFallback = true;
      }
    }

    // CLI-379/400: per-tenant kanal — Telegram(chat_id) > Eskiz SMS(phone) > NoOp.
    // `targetPhone` shu yerga kirguncha allaqachon favqulodda-fallback bilan
    // aniqlangan (yuqorida) — resolveTenantChannel Telegram bo'lsa telefonsiz
    // ham ishlaydi.
    // CLI-475 B3: `resolveTenantChannel` → `decryptSecret` buzuq/eskirgan cred
    // (MESSAGING_SECRET rotatsiyasi yoki buzilgan row) holatida THROW qiladi.
    // Tutilmasa — butun `withTenant` tx rollback bo'lib, doktor in-app eslatmasini
    // ham OLMAYDI (audit izsiz job fail). recall-worker'dagi izolyatsiya bilan bir
    // xil: xato tutiladi, doktorga kuzatiladigan in-app eslatma qoldiriladi, SMS
    // urinilmaydi. Xato matni/token HECH QACHON body'ga kirmaydi (secret leak).
    let resolved: ResolvedTenantChannel;
    try {
      resolved = resolveTenantChannel(
        settingsRow?.integrationSettings ?? null,
        patient?.telegramChatId ?? null,
        targetPhone,
      );
    } catch {
      await svc.notifyInTx(tx, tenantId, {
        userId: appt.doctorId,
        type: 'appointment_reminder_no_phone',
        title,
        body: `${body} — Bildirishnoma kanali sozlamasida xatolik, SMS yuborilmadi`,
      });
      return;
    }

    if (!resolved.to) {
      await svc.notifyInTx(tx, tenantId, {
        userId: appt.doctorId,
        type: 'appointment_reminder_no_phone',
        title,
        body: `${body} — Bemor telefoni yo‘q, SMS yuborilmadi`,
      });
      return;
    }

    await svc.notifyInTx(tx, tenantId, {
      userId: appt.doctorId,
      type: 'appointment_reminder',
      title,
      // CLI-475 B7 — "Favqulodda aloqaga yuborildi" matni FAQAT xabar haqiqatan
      // favqulodda telefonga ketganda ko'rsatiladi. Telegram (chat_id) tanlansa,
      // `emergencyFallback` (telefon-fallback) true bo'lsa ham favqulodda TELEFON
      // ishlatilmaydi (xabar bemor chat_id'ga ketadi) — matn noto'g'ri bo'lardi.
      // `source !== 'telegram'` (sms YOKI none — ikkalasida ham `resolved.to`
      // telefonga yuboriladi) bilan gate qilamiz.
      // CLI-475 B7 — "Favqulodda aloqaga yuborildi" matni FAQAT xabar haqiqatan
      // favqulodda telefonga ketganda ko'rsatiladi. Telegram (chat_id) tanlansa,
      // `emergencyFallback` (telefon-fallback) true bo'lsa ham favqulodda TELEFON
      // ishlatilmaydi (xabar bemor chat_id'ga ketadi) — matn noto'g'ri bo'lardi.
      // `source !== 'telegram'` (sms YOKI none — ikkalasida ham `resolved.to`
      // telefonga yuboriladi) bilan gate qilamiz.
      body:
        emergencyFallback && resolved.source !== 'telegram'
          ? `${body} — Favqulodda aloqaga yuborildi`
          : body,
      smsTo: resolved.to,
      // "none" (tenant hech narsa sozlamagan) holatda `channel` berilmaydi —
      // `svc`ning o'z fallback kanaliga (createNotificationsService({sms}))
      // tushadi (test-only spy yoki NoOp; CLI-379/400 boshqa tenant'ning
      // umumiy akkauntiga fallback qilmaydi — recall-worker bilan bir xil qaror).
      channel: resolved.source === 'none' ? undefined : resolved.channel,
    });
  });
}

/**
 * CLI-379/400: global `TELEGRAM_BOT_TOKEN`/`ESKIZ_*` env-based kanal OLIB
 * TASHLANDI — har eslatma endi o'z tenant'ining `integration_settings`i
 * asosida `processReminderJob` ichida (`resolveTenantChannel`) kanal tanlaydi.
 * `svc`ga shu yerda faqat NoOp beriladi — tenant o'z messaging credential'ini
 * sozlamagan bo'lsa haqiqatan NoOp (boshqa tenant'ning umumiy akkauntiga
 * fallback YO'Q; recall-worker.ts bilan bir xil qaror).
 */
export function startReminderWorker() {
  const svc = createNotificationsService({ sms: createNoOpChannel() });
  return new Worker<ReminderJob>(
    'appointment-reminder',
    async (job) => {
      await processReminderJob(svc, job.data);
    },
    { connection: { url: env.REDIS_URL } },
  );
}
