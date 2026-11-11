import type { Queue } from 'bullmq';
import { reminderJobId } from './reminder-job-id.ts';

/**
 * Eslatma job hayot-sikli (BullMQ). `app.ts` closure'idan ko'chirilgan (P4) —
 * alohida testlanadi.
 */
export const createReminderScheduler = (queue: Queue) => {
  // A9 (CLI-438): ilgari `remove()` keyin `add()` ketma-ket chaqirilardi — BullMQ
  // bir xil `jobId` bilan `add()`ni MAVJUD job'ni qaytarib, delay'ni YANGILAMAYDI
  // (dedupe). Endi: mavjud job'ni AVVAL topib, `changeDelay()` bilan YANGILAYMIZ;
  // topilmasa (allaqachon fire bo'lgan/yo'q) — oddiy `add()`. `removeOnComplete`/
  // `removeOnFail` — Redis'da tugagan job'lar to'planmasin (CLI-403).
  const enqueueReminder = async (
    tenantId: string,
    appointmentId: string,
    delayMs: number,
  ): Promise<void> => {
    const jobId = reminderJobId(appointmentId);
    const existing = await queue.getJob(jobId);
    if (existing) {
      try {
        await existing.changeDelay(delayMs);
        return;
      } catch {
        // Job ACTIVE/completed bo'lib o'zgartirib bo'lmadi — pastda qayta
        // qo'shishga urinamiz (worker aynan shu lahzada ishlab turgan chekka holat).
      }
    }
    await queue.add(
      'appointment-reminder',
      { tenantId, appointmentId },
      { delay: delayMs, jobId, removeOnComplete: true, removeOnFail: 100 },
    );
  };

  const removeReminder = async (appointmentId: string): Promise<void> => {
    const existing = await queue.getJob(reminderJobId(appointmentId));
    if (!existing) return;
    try {
      await existing.remove();
    } catch {
      // Active/locked (fire jarayonida) — worker `shouldSkipReminder` bilan
      // fire-vaqtida status'ni tekshiradi (cancelled/no_show), xavfsiz no-op.
    }
  };

  return { enqueueReminder, removeReminder };
};
