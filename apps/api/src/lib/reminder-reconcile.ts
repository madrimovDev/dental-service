import { appointments, tenants } from '@dental/db-schema';
import type { Queue } from 'bullmq';
import { and, gt, inArray } from 'drizzle-orm';
import type { Database, DbOrTx } from '../db/client.ts';
import { withTenant as defaultWithTenant } from '../db/scoped.ts';
import { ACTIVE_STATUSES } from '../modules/appointments/appointments.transitions.ts';
import { logger } from './logger.ts';
import type { ReminderJob } from './queue.ts';
import { reminderDelayMs } from './reminder-delay.ts';
import { createReminderScheduler } from './reminder-scheduler.ts';

/**
 * FX-89 (+ LB-05/FX-96): eslatma navbatini bazadan qayta qurish (boot'da).
 *
 * Eslatma faqat BullMQ delayed job sifatida yashaydi (DB'da belgi yo'q). Navbat bazaga mos
 * kelmay qoladigan holatlar: desktop zaxiradan tiklash (baza eski holatga qaytadi, Valkey
 * esa yo'q), Valkey ma'lumoti yo'qolishi (AOF'dan oldingi o'rnatmalar, buzilgan AOF).
 *
 *   1) Delayed job'lar: yozilishi bazada yo'q / faol emas / eslatma oynasi o'tgan → o'chiriladi
 *      (aks holda noto'g'ri vaqtda yoki o'tgan yozilish uchun eslatma ketardi).
 *   2) Har tenant: faol va eslatma vaqti kelajakda bo'lgan yozilishlar → `enqueueReminder`
 *      (mavjud job — `changeDelay` bilan bazadagi vaqtga to'g'rilanadi, yo'q bo'lsa qo'shiladi;
 *      jobId deterministik — dublikat yo'q, idempotent).
 *
 * Oddiy yozilish oqimi bilan bir xil qoidalar: `reminderDelayMs(start, now)` (24 soat),
 * `ACTIVE_STATUSES`. Har tenant mustaqil try/catch.
 */
export type ReminderReconcileDeps = {
  /** RLS-bypass admin connection — faqat tenant ID ro'yxati uchun (Qaror #23). */
  adminDb: Database;
  queue: Queue<ReminderJob>;
  withTenant?: <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>) => Promise<T>;
  now?: () => Date;
};

export type ReminderReconcileResult = {
  tenants: number;
  enqueued: number;
  removed: number;
  failed: number;
};

export async function reconcileReminders(
  deps: ReminderReconcileDeps,
): Promise<ReminderReconcileResult> {
  const run = deps.withTenant ?? defaultWithTenant;
  const now = deps.now?.() ?? new Date();
  const scheduler = createReminderScheduler(deps.queue);
  const result: ReminderReconcileResult = { tenants: 0, enqueued: 0, removed: 0, failed: 0 };

  // 1) Eskirgan delayed job'lar — tenant bo'yicha guruhlab, har biri o'z RLS kontekstida.
  const delayed = await deps.queue.getDelayed();
  const byTenant = new Map<string, typeof delayed>();
  for (const job of delayed) {
    const tenantId = job.data?.tenantId;
    if (!tenantId || !job.data.appointmentId) continue;
    const list = byTenant.get(tenantId) ?? [];
    list.push(job);
    byTenant.set(tenantId, list);
  }
  for (const [tenantId, jobs] of byTenant) {
    try {
      const ids = jobs.map((j) => j.data.appointmentId);
      const rows = await run(tenantId, (tx) =>
        tx
          .select({
            id: appointments.id,
            status: appointments.status,
            start: appointments.startTime,
          })
          .from(appointments)
          .where(inArray(appointments.id, ids)),
      );
      const live = new Map(rows.map((r) => [r.id, r]));
      for (const job of jobs) {
        const appt = live.get(job.data.appointmentId);
        const keep =
          appt != null &&
          ACTIVE_STATUSES.includes(appt.status) &&
          reminderDelayMs(new Date(appt.start), now) != null;
        if (keep) continue;
        try {
          await job.remove();
          result.removed++;
        } catch {
          // Shu lahzada active (fire bo'layapti) — worker o'zi status'ni live tekshiradi.
        }
      }
    } catch (err) {
      result.failed++;
      logger.error({ err, tenantId }, 'Reminder reconcile (stale jobs) failed for tenant');
    }
  }

  // 2) Yetishmayotgan / vaqti noto'g'ri job'lar — bazadagi kelajakdagi faol yozilishlardan.
  const tenantRows = await deps.adminDb.select({ id: tenants.id }).from(tenants);
  result.tenants = tenantRows.length;
  const minStart = new Date(now.getTime() + 24 * 3600_000);
  for (const { id: tenantId } of tenantRows) {
    try {
      const rows = await run(tenantId, (tx) =>
        tx
          .select({ id: appointments.id, start: appointments.startTime })
          .from(appointments)
          .where(
            and(
              inArray(appointments.status, [...ACTIVE_STATUSES]),
              gt(appointments.startTime, minStart),
            ),
          ),
      );
      for (const r of rows) {
        const delay = reminderDelayMs(new Date(r.start), now);
        if (delay == null) continue;
        await scheduler.enqueueReminder(tenantId, r.id, delay);
        result.enqueued++;
      }
    } catch (err) {
      result.failed++;
      logger.error({ err, tenantId }, 'Reminder reconcile (enqueue) failed for tenant');
    }
  }
  return result;
}
