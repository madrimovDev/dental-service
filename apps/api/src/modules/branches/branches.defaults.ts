/**
 * Yangi filial uchun default ish soati (P10): Du–Sha 09:00–18:00, Yakshanba dam.
 * Kalitlar `WEEKDAY_KEYS` (schedule.availability.ts) bilan bir xil.
 * Register va provisioning shu yagona konstantadan foydalanadi.
 */
export const DEFAULT_WORK_HOURS: Record<string, { open: string; close: string } | null> = {
  mon: { open: '09:00', close: '18:00' },
  tue: { open: '09:00', close: '18:00' },
  wed: { open: '09:00', close: '18:00' },
  thu: { open: '09:00', close: '18:00' },
  fri: { open: '09:00', close: '18:00' },
  sat: { open: '09:00', close: '18:00' },
  sun: null,
};
