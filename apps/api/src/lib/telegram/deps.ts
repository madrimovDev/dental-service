import { createNoOpChannel } from '@dental/notifications';
import type { Database } from '../../db/client.ts';
import { createAppointmentsService } from '../../modules/appointments/index.ts';
import { createNoShowStrikesService } from '../../modules/no-show-strikes/index.ts';
import { createNotificationsService } from '../../modules/notifications/index.ts';
import { createPatientsService } from '../../modules/patients/patients.service.ts';
import { createRecallsService } from '../../modules/recalls/index.ts';
import { createScheduleService } from '../../modules/schedule/index.ts';
import { createAuditLogger } from '../audit-logger.ts';
import { createReminderScheduler } from '../reminder-scheduler.ts';
import { createTelegramFlows } from './flows.ts';

/**
 * Bot jarayoni uchun service'lar (HTTP `app.ts` dan mustaqil — bot-manager
 * worker.ts'da ham ishga tushadi). Queue reverse-sync (appointments→queue) bu
 * yerda ulanmaydi: bot faqat kelajakdagi yozilishni tasdiqlaydi/bekor qiladi.
 */
export function createBotFlows(adminDb: Database) {
  const audit = createAuditLogger({ db: adminDb });
  const schedule = createScheduleService({ audit });
  const recall = createRecallsService({ audit });
  const noShowStrike = createNoShowStrikesService({ audit });
  // BullMQ ulanishi faqat haqiqatan kerak bo'lganda (modul yuklanganda Redis'ga tegilmaydi).
  const reminders = async () => {
    const { reminderQueue } = await import('../queue.ts');
    return createReminderScheduler(reminderQueue);
  };
  const appointments = createAppointmentsService({
    audit,
    schedule,
    recall,
    noShowStrike,
    enqueueReminder: async (tenantId, appointmentId, delayMs) =>
      (await reminders()).enqueueReminder(tenantId, appointmentId, delayMs),
    removeReminder: async (appointmentId) => (await reminders()).removeReminder(appointmentId),
  });
  // In-app bildirishnoma uchun kanal kerak emas (smsTo berilmaydi) — NoOp.
  const notifications = createNotificationsService({ sms: createNoOpChannel() });
  const patients = createPatientsService({ audit });
  return createTelegramFlows({ appointments, schedule, audit, notifications, patients });
}
