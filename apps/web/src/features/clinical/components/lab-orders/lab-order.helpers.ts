import type { LabOrder, LabOrderHubFields } from '@dental/api-client';

/** UI-D5: remake sabab kodlari — backend `LAB_REMAKE_REASONS` bilan sinxron. */
export const LAB_REMAKE_REASONS = [
  'margin',
  'contact',
  'occlusion',
  'shade',
  'esthetics',
  'other',
] as const;
export type LabRemakeReason = (typeof LAB_REMAKE_REASONS)[number];

/** Vita klassik shkalasi (kanvas) — rang tanlash tugmalari. */
export const LAB_SHADES = ['A1', 'A2', 'A3', 'A3.5', 'B1', 'B2', 'C1', 'D2'] as const;

/** Material variantlari (kanvas) — kalit `labOrder.material_<key>`. */
export const LAB_MATERIALS = ['zirconia', 'metal_ceramic', 'emax', 'other'] as const;
export type LabMaterial = (typeof LAB_MATERIALS)[number];

/** Buyurtma turlari (kanvas tartibi) — kalit `lab_order.type_<key>`. */
export const LAB_ORDER_TYPES = [
  'crown',
  'bridge',
  'prosthetic',
  'denture',
  'inlay_onlay',
  'aligners',
  'other',
] as const;

/**
 * UI-D5 backend maydonlari (`dueDate`, `shade`, `remakeOfId`, `remakeReason`). Generated
 * `LabOrder` ga kontrakt regeneratsiyasidan keyin kiradi — shu paytgacha tip kengaytma.
 */
export type LabOrderExtras = {
  dueDate?: string | null;
  shade?: string | null;
  remakeOfId?: string | null;
  remakeReason?: LabRemakeReason | null;
};
export type LabOrderWire = LabOrder & LabOrderExtras & LabOrderHubFields;
/** Create body'ga qo'shimcha majburiy maydonlar (generated `CreateLabOrderInput` ga hali kirmagan). */
export type LabOrderCreateExtras = {
  shade: string;
  dueDate: string;
  remakeOfId?: string;
  remakeReason?: LabRemakeReason;
};

const p2 = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` → `DD.MM.YYYY` (deterministik, locale'siz). */
export function formatDueDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const [y, m, d] = date.split('-');
  return y && m && d ? `${d}.${m}.${y}` : date;
}

/** Mahalliy kalendar kun (`YYYY-MM-DD`) — yozilish vaqti brauzer vaqt zonasida. */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

const dayNumber = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000;
};

type ApptLike = { startTime: string; status: string };

/** Bemorning eng yaqin KELGUSI faol yozilishi (bekor/kelmadi/tugagan emas) yoki null. */
export function nextAppointmentStart(
  appointments: readonly ApptLike[] | undefined,
  now: Date = new Date(),
): string | null {
  const upcoming = (appointments ?? [])
    .filter((a) => !['cancelled', 'no_show', 'completed'].includes(a.status))
    .filter((a) => new Date(a.startTime).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  return upcoming[0]?.startTime ?? null;
}

export type DueCheck =
  | { kind: 'none' }
  | { kind: 'ok'; days: number; apptDate: string; apptTime: string }
  | { kind: 'late'; days: number; apptDate: string; apptTime: string };

/**
 * Muddat yozilish vaqti bilan solishtiriladi: muddat yozilish KUNIDAN kech bo'lsa `late`
 * (ogohlantirish), aks holda `ok` + zaxira kunlari (`days` >= 0).
 */
export function compareDueWithAppointment(
  dueDate: string | null | undefined,
  appointmentStart: string | null | undefined,
): DueCheck {
  if (!dueDate || !appointmentStart) return { kind: 'none' };
  const appt = new Date(appointmentStart);
  if (Number.isNaN(appt.getTime())) return { kind: 'none' };
  const apptDay = localDay(appt);
  const diff = dayNumber(apptDay) - dayNumber(dueDate);
  const apptDate = formatDueDate(apptDay) ?? apptDay;
  const apptTime = `${p2(appt.getHours())}:${p2(appt.getMinutes())}`;
  return diff >= 0
    ? { kind: 'ok', days: diff, apptDate, apptTime }
    : { kind: 'late', days: -diff, apptDate, apptTime };
}
