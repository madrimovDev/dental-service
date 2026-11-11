import { appointments, patients } from '@dental/db-schema';
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { AppointmentTransitionError } from '../../modules/appointments/appointments.transitions.ts';
import type { AppointmentsService } from '../../modules/appointments/index.ts';
import { createBotContext } from './bot-context.ts';

/** 24 soatlik eslatma tugmalari: `rm:<action>:<appointmentId>` (≤ 64 bayt). */
export type ReminderAction = 'ok' | 're' | 'no';
export const REMINDER_PREFIX = 'rm';

export const reminderCallbackData = (action: ReminderAction, appointmentId: string): string =>
  `${REMINDER_PREFIX}:${action}:${appointmentId}`;

export const parseReminderCallback = (
  data: string,
): { action: ReminderAction; appointmentId: string } | null => {
  const m = /^rm:(ok|re|no):([0-9a-f-]{36})$/.exec(data);
  return m ? { action: m[1] as ReminderAction, appointmentId: m[2] as string } : null;
};

export type ReminderOutcome =
  | 'confirmed'
  | 'cancelled'
  | 'reschedule'
  | 'already'
  | 'not_owner'
  | 'not_found';

export type ReminderActionResult = {
  outcome: ReminderOutcome;
  patientId?: string;
  appointmentId?: string;
};

/**
 * Eslatma tugmasi bosilganda: FAQAT yozilish egasi (patients.telegram_chat_id
 * === callback chat_id) o'zgartira oladi. Begona chat → `not_owner`, hech narsa
 * o'zgarmaydi. Ikkinchi bosish (allaqachon shu holatda) → `already`.
 */
export async function handleReminderAction(
  tx: DbOrTx,
  deps: { appointments: Pick<AppointmentsService, 'update'> },
  o: { tenantId: string; chatId: string; action: ReminderAction; appointmentId: string },
): Promise<ReminderActionResult> {
  const [row] = await tx
    .select({
      id: appointments.id,
      status: appointments.status,
      patientId: appointments.patientId,
      chat: patients.telegramChatId,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .where(eq(appointments.id, o.appointmentId))
    .limit(1);
  if (!row) return { outcome: 'not_found' };
  if (!row.chat || row.chat !== o.chatId) return { outcome: 'not_owner' };

  const base = { patientId: row.patientId, appointmentId: row.id };
  const active = row.status === 'scheduled' || row.status === 'confirmed';
  if (!active) return { outcome: 'already', ...base };

  const c = createBotContext(tx, o.tenantId);
  try {
    if (o.action === 'ok') {
      if (row.status === 'confirmed') return { outcome: 'already', ...base };
      const res = await deps.appointments.update(c, row.id, { status: 'confirmed' });
      return { outcome: res.ok ? 'confirmed' : 'already', ...base };
    }
    if (o.action === 'no') {
      const res = await deps.appointments.update(c, row.id, {
        status: 'cancelled',
        cancellationReason: 'patient_telegram',
      });
      return { outcome: res.ok ? 'cancelled' : 'already', ...base };
    }
  } catch (err) {
    if (err instanceof AppointmentTransitionError) return { outcome: 'already', ...base };
    throw err;
  }
  // 're' — yozilish o'zgarmaydi; chaqiruvchi bron oqimini (rescheduleOf) boshlaydi.
  return { outcome: 'reschedule', ...base };
}
