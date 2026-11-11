/**
 * CLI-439 B2 — lab-order STATUS state-machine — SOF funksiya (DB/Context YO'Q).
 *
 * Muammo (ildiz sabab): avval istalgan status→status o'tishga ruxsat berilardi
 * (`delivered→draft`, `cancelled→delivered` kabi). Forward-only chiziqli oqim
 * (draft→sent→in_progress→ready→delivered) + `cancelled` istalgan non-terminal
 * holatdan yetib boradigan yakuniy holat. Orqaga qaytish BUTUNLAY bloklanadi
 * (spec §B2 "forward-only" alternativasi) — shu sabab `sentDate`/`deliveredDate`ni
 * regressда tozalash logikasi kerak emas (regress umuman yuz bermaydi).
 *
 * Idempotent re-set (X → X) ruxsat etiladi — PATCH'ni qayta yuborish xato emas.
 */

export type LabOrderStatus = 'draft' | 'sent' | 'in_progress' | 'ready' | 'delivered' | 'cancelled';

const LAB_ORDER_TRANSITIONS: Record<LabOrderStatus, readonly LabOrderStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['in_progress', 'cancelled'],
  in_progress: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

/** Noto'g'ri o'tishda otiladi; routes 400 (`lab_order.invalid_transition`) ga aylantiradi. */
export class InvalidLabOrderTransitionError extends Error {
  constructor(
    readonly from: LabOrderStatus,
    readonly to: LabOrderStatus,
  ) {
    super(`Invalid lab order status transition: ${from} → ${to}`);
    this.name = 'InvalidLabOrderTransitionError';
  }
}

export function isValidLabOrderTransition(from: LabOrderStatus, to: LabOrderStatus): boolean {
  if (from === to) return true; // idempotent
  return LAB_ORDER_TRANSITIONS[from].includes(to);
}

export function assertLabOrderTransition(from: LabOrderStatus, to: LabOrderStatus): void {
  if (!isValidLabOrderTransition(from, to)) {
    throw new InvalidLabOrderTransitionError(from, to);
  }
}

/**
 * Lab Hub qayta ishlash (remake): lab remake'ni qabul qilganda (`remake → accepted`)
 * tayyor/yetkazilgan buyurtma `in_progress`ga qaytadi. Bu — foydalanuvchi PATCH'i EMAS
 * (u forward-only qoladi), faqat Hub sinxroni ishlatadigan alohida, tor o'tish.
 */
const LAB_ORDER_REMAKE_FROM: readonly LabOrderStatus[] = ['ready', 'delivered'];

export function isValidLabOrderRemakeTransition(from: LabOrderStatus): boolean {
  return LAB_ORDER_REMAKE_FROM.includes(from);
}
