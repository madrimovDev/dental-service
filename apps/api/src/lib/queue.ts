import { Queue } from 'bullmq';
import { env } from './env.ts';

export type ReminderJob = { tenantId: string; appointmentId: string };

const connection = { url: env.REDIS_URL };

export const reminderQueue = new Queue<ReminderJob>('appointment-reminder', { connection });

/**
 * Deterministik job ID — yozilish bo'yicha. Bitta yozilishga bitta eslatma:
 * reschedule'da eski job `remove(jobId)` qilinadi, keyin yangi delay bilan
 * qayta `add` qilinadi. add/remove drift qilmasligi uchun bitta joyda.
 */
export const reminderJobId = (appointmentId: string) => `appointment:${appointmentId}`;
