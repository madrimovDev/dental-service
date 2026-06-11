import { appointments, patients } from '@dental/db-schema';
import { createSmsChannel } from '@dental/notifications';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { withTenant } from '../db/scoped.ts';
import { createNotificationsService } from '../modules/notifications/index.ts';
import { env } from './env.ts';
import type { ReminderJob } from './queue.ts';

export function startReminderWorker() {
  const sms = createSmsChannel({ eskizEmail: env.ESKIZ_EMAIL, eskizPassword: env.ESKIZ_PASSWORD });
  const svc = createNotificationsService({ sms });
  return new Worker<ReminderJob>(
    'appointment-reminder',
    async (job) => {
      const { tenantId, appointmentId } = job.data;
      await withTenant(tenantId, async (tx) => {
        const [appt] = await tx
          .select()
          .from(appointments)
          .where(eq(appointments.id, appointmentId));
        if (!appt) return;
        const [patient] = await tx.select().from(patients).where(eq(patients.id, appt.patientId));
        await svc.notifyInTx(tx, tenantId, {
          userId: appt.doctorId,
          type: 'appointment_reminder',
          title: 'Yozilish eslatmasi',
          body: `Bemor: ${patient?.fullName ?? ''}, ${appt.startTime.toISOString()}`,
          smsTo: patient?.phone ?? undefined,
        });
      });
    },
    { connection: { url: env.REDIS_URL } },
  );
}
