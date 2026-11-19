import { tenantSettings } from '@dental/db-schema';
import type { DbOrTx } from '../db/client.ts';

/** `tenant_settings` qatori yo'q bo'lsa eslatma oldindan necha soat ketadi. */
export const DEFAULT_REMINDER_LEAD_HOURS = 24;

/**
 * FX-39 (LA-23): tenantning `tenant_settings.reminder_lead_hours` qiymati. RLS-bound
 * tranzaksiya (`getDb(c)` / `withTenant`) ichida chaqiriladi — RLS tenantni filtrlaydi;
 * qator yo'q → 24. Yozilish oqimi (appointments.service) va boot reconcile (FX-89) bir xil
 * manbadan o'qiydi.
 */
export async function readReminderLeadHours(tx: DbOrTx): Promise<number> {
  const [row] = await tx
    .select({ hours: tenantSettings.reminderLeadHours })
    .from(tenantSettings)
    .limit(1);
  return row?.hours ?? DEFAULT_REMINDER_LEAD_HOURS;
}
