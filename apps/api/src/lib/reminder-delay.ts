/**
 * Eslatma kechikishi (ms). start − leadHours dan now gacha.
 * O'tgan/juda yaqin → null (enqueue qilinmaydi).
 */
export function reminderDelayMs(startTime: Date, now: Date, leadHours = 24): number | null {
  const fireAt = startTime.getTime() - leadHours * 3600_000;
  const delay = fireAt - now.getTime();
  return delay > 0 ? delay : null;
}
