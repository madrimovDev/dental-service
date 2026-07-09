import { appointments, patients, tenants } from '@dental/db-schema';
import { createNotificationChannel } from '@dental/notifications';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.ts';
import { withTenant } from '../db/scoped.ts';
import type { NotificationsService } from '../modules/notifications/index.ts';
import { createNotificationsService } from '../modules/notifications/index.ts';
import { env } from './env.ts';
import type { ReminderJob } from './queue.ts';
import { renderReminderSms, type SmsLang } from './sms-templates.ts';

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
    if (!patient?.phone) {
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
      body,
      smsTo: patient.phone,
    });
  });
}

export function startReminderWorker() {
  // CLI-474 (L10): priority factory (Telegram > SMS) — TELEGRAM_BOT_TOKEN bo'lsa
  // Telegram, aks holda Eskiz/NoOp SMS. Ilgari to'g'ridan `createSmsChannel` edi,
  // shuning uchun Telegram token qo'shilsa ham reminder'lar SMS'da qolardi.
  // ⚠️ recall_logs.channel enum hozircha 'sms'/'manual' — 'telegram' log qiymati
  // Telegram jonli faollashganda (CLI-379) enum migration bilan qo'shiladi.
  const sms = createNotificationChannel({
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    eskizEmail: env.ESKIZ_EMAIL,
    eskizPassword: env.ESKIZ_PASSWORD,
  });
  const svc = createNotificationsService({ sms });
  return new Worker<ReminderJob>(
    'appointment-reminder',
    async (job) => {
      await processReminderJob(svc, job.data);
    },
    { connection: { url: env.REDIS_URL } },
  );
}
