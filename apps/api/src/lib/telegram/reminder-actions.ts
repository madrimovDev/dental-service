import { appointments, notifications, patients, queueTickets } from '@dental/db-schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { AppointmentTransitionError } from '../../modules/appointments/appointments.transitions.ts';
import type { AppointmentsService } from '../../modules/appointments/index.ts';
import { findRecipientsWithPermission } from '../notify-recipients.ts';
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
  | 'unavailable'
  | 'not_owner'
  | 'not_found';

export type ReminderActionResult = {
  outcome: ReminderOutcome;
  patientId?: string;
  appointmentId?: string;
};

/**
 * FX-83: bemor Telegram orqali bekor qilganda xodim (bekor qila oladiganlar + shifokor)
 * bildirishnoma oladi — bo'shagan slot jimgina yo'qolmasin. Best-effort: savepoint ichida,
 * xato bekor qilishni orqaga qaytarmaydi.
 */
async function notifyStaffPatientCancelled(
  tx: DbOrTx,
  tenantId: string,
  row: { id: string; branchId: string; doctorId: string; patientName: string; startTime: Date },
): Promise<void> {
  try {
    await tx.transaction(async (sp) => {
      const c = createBotContext(sp, tenantId);
      const recipients = new Set(
        await findRecipientsWithPermission(c, 'appointment.cancel', row.branchId),
      );
      recipients.add(row.doctorId);
      const when = new Intl.DateTimeFormat('uz-UZ', {
        timeZone: 'Asia/Tashkent',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(row.startTime);
      await sp.insert(notifications).values(
        [...recipients].map((userId) => ({
          tenantId,
          userId,
          type: 'appointment_cancelled_by_patient',
          title: `Bemor yozilishni bekor qildi: ${row.patientName}`,
          body: when,
        })),
      );
    });
  } catch (err) {
    console.error('[reminder-actions] xodimga bekor bildirishnomasi yozilmadi:', err);
  }
}

/**
 * Eslatma tugmasi bosilganda: FAQAT yozilish egasi (patients.telegram_chat_id
 * === callback chat_id) o'zgartira oladi. Boshlanish vaqti o'tgan yozilish → `already`. Begona chat → `not_owner`, hech narsa
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
      startTime: appointments.startTime,
      patientId: appointments.patientId,
      branchId: appointments.branchId,
      doctorId: appointments.doctorId,
      patientName: patients.fullName,
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
  // Boshlanish vaqti o'tgan yozilishga eski/takroriy tugma ta'sir qilmaydi: aks holda
  // no-show strike chetlab o'tiladi (cancelled→no_show yo'q) va bot service'ida
  // `queue.closeLinkedOpenTicket` yo'qligi sabab ochiq navbat chiptasi qolib ketadi.
  // 'ok' | 'no' | 're' — hammasiga.
  if (row.startTime.getTime() <= Date.now()) return { outcome: 'already', ...base };

  const c = createBotContext(tx, o.tenantId);
  try {
    if (o.action === 'ok') {
      if (row.status === 'confirmed') return { outcome: 'already', ...base };
      const res = await deps.appointments.update(c, row.id, { status: 'confirmed' });
      // FX-36: {ok:false} (konflikt/time-off) jimgina «already» emas — bemorga aniq xabar.
      return { outcome: res.ok ? 'confirmed' : 'unavailable', ...base };
    }
    if (o.action === 'no') {
      // FX-58: bemor erta check-in qilgan (ochiq navbat chiptasi bor) — bot service'ida queue
      // reverse-sync yo'q, bekor qilsak chipta arvoh bo'lib qoladi. Bekor qilishni registraturaga
      // qoldiramiz (kalendar/navbat reverse-sync bilan yopadi).
      const [openTicket] = await tx
        .select({ id: queueTickets.id })
        .from(queueTickets)
        .where(
          and(
            eq(queueTickets.appointmentId, row.id),
            inArray(queueTickets.status, ['waiting', 'in_progress']),
          ),
        )
        .limit(1);
      if (openTicket) return { outcome: 'already', ...base };
      const res = await deps.appointments.update(c, row.id, {
        status: 'cancelled',
        cancellationReason: 'patient_telegram',
      });
      if (!res.ok) return { outcome: 'unavailable', ...base };
      await notifyStaffPatientCancelled(tx, o.tenantId, row);
      return { outcome: 'cancelled', ...base };
    }
  } catch (err) {
    if (err instanceof AppointmentTransitionError) return { outcome: 'already', ...base };
    throw err;
  }
  // 're' — yozilish o'zgarmaydi; chaqiruvchi bron oqimini (rescheduleOf) boshlaydi.
  return { outcome: 'reschedule', ...base };
}
