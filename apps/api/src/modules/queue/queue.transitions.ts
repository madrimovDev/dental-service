/**
 * Queue ticket STATE-MACHINE guard — sof funksiyalar (Context/Drizzle YO'Q).
 * Service shularni chaqiradi; noto'g'ri o'tish → routes 400ga aylantiradi (A6, CLI-438).
 *
 * Matritsa (mavjud xulqni saqlab, faqat aniq noto'g'ri o'tishlarni rad etadi):
 *   - waiting → in_progress | done | missed  (waiting→done to'g'ridan-to'g'ri —
 *     CLI-425 testida tasdiqlangan mavjud tez-belgilash oqimi, saqlanadi)
 *   - in_progress → done | missed
 *   - done — TERMINAL
 *   - missed — TERMINAL
 * X → X (idempotent) ruxsat — PATCH'ni qayta yuborish xato emas (mas. done→done,
 * CLI-425 "idempotent done twice" testi).
 */

export type QueueTicketStatus = 'waiting' | 'in_progress' | 'done' | 'missed';

const ALLOWED_QUEUE_TRANSITIONS: Record<QueueTicketStatus, readonly QueueTicketStatus[]> = {
  waiting: ['in_progress', 'done', 'missed'],
  in_progress: ['done', 'missed'],
  done: [], // terminal
  missed: [], // terminal
};

/** Noto'g'ri o'tishda otiladi; routes 400 (`status.invalid_transition`) ga aylantiradi. */
export class QueueTransitionError extends Error {
  constructor(
    readonly code: 'status.invalid_transition',
    readonly from: string,
    readonly to?: string,
  ) {
    super(`Invalid queue ticket transition: ${from} → ${to}`);
    this.name = 'QueueTransitionError';
  }
}

export function isValidQueueTransition(from: QueueTicketStatus, to: QueueTicketStatus): boolean {
  if (from === to) return true; // idempotent
  return ALLOWED_QUEUE_TRANSITIONS[from].includes(to);
}

export function assertQueueTransition(from: QueueTicketStatus, to: QueueTicketStatus): void {
  if (!isValidQueueTransition(from, to)) {
    throw new QueueTransitionError('status.invalid_transition', from, to);
  }
}
