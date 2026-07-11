/**
 * Appointment STATE-MACHINE guard — SOF funksiyalar (Context/Drizzle YO'Q).
 * Service shularni chaqiradi; noto'g'ri o'tish → routes 400 ga aylantiradi (CLI-409).
 *
 * Matritsa (Qaror #25 uslubi bilan izchil):
 *   - scheduled ↔ confirmed (ikki yo'nali)
 *   - scheduled/confirmed → in_progress → completed (klinik oqim)
 *   - scheduled/confirmed/in_progress → cancelled
 *   - scheduled/confirmed/in_progress → no_show
 *     (CLI-480: chaqirilib kelmagan/ketib qolgan = no-show; queue `in_progress→
 *      missed` sync'i endi jim yiqilmaydi — appt to'g'ri `no_show`ga o'tadi)
 *   - cancelled → scheduled (qayta-faollashtirish) — conflict/schedule QAYTA tekshiriladi
 *   - no_show → scheduled (qayta bron) — xuddi shunday re-validatsiya
 *   - completed — TERMINAL (hech qanday chiqish; vaqt/doktor tahriri ham RAD)
 *
 * X → X (idempotent) ruxsat — PATCH'ni qayta yuborish xato emas.
 */

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'no_show'
  | 'cancelled';

/** Slotni egallaydigan (band qiladigan) holatlar — re-validatsiya triggeri. */
export const ACTIVE_STATUSES: readonly AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'in_progress',
];

export function isActiveStatus(s: AppointmentStatus): boolean {
  return ACTIVE_STATUSES.includes(s);
}

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  scheduled: ['confirmed', 'in_progress', 'no_show', 'cancelled'],
  confirmed: ['scheduled', 'in_progress', 'no_show', 'cancelled'],
  in_progress: ['completed', 'cancelled', 'no_show'],
  completed: [], // terminal
  no_show: ['scheduled'],
  cancelled: ['scheduled'],
};

/**
 * Noto'g'ri o'tish / terminal mutatsiyada otiladi; routes `code` bo'yicha
 * 400 (`status.invalid_transition` yoki `status.terminal`) ga aylantiradi.
 */
export class AppointmentTransitionError extends Error {
  constructor(
    readonly code: 'status.invalid_transition' | 'status.terminal',
    readonly from: string,
    readonly to?: string,
  ) {
    super(
      code === 'status.terminal'
        ? `Appointment is terminal (completed) and cannot be modified`
        : `Invalid appointment transition: ${from} → ${to}`,
    );
    this.name = 'AppointmentTransitionError';
  }
}

export function isValidAppointmentTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  if (from === to) return true; // idempotent
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertAppointmentTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!isValidAppointmentTransition(from, to)) {
    throw new AppointmentTransitionError('status.invalid_transition', from, to);
  }
}
