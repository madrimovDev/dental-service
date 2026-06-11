import { Queue } from 'bullmq';
import { env } from './env.ts';

export type ReminderJob = { tenantId: string; appointmentId: string };

const connection = { url: env.REDIS_URL };

export const reminderQueue = new Queue<ReminderJob>('appointment-reminder', { connection });
