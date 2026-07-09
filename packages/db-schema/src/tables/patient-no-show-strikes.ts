import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { appointments } from './appointments.ts';
import { patients } from './patients.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

/**
 * CLI-474 (L7) — bemor no-show "strike"lari. Har `no_show`'ga o'tgan yozilish
 * uchun bir strike (unique `appointment_id` → idempotent, ON CONFLICT DO NOTHING).
 *
 * Strike row TARIX sifatida qoladi (hech qachon o'chirilmaydi). "Faol" strike'lar
 * soni `appointments.status = 'no_show'` bilan JOIN orqali hisoblanadi — yozilish
 * keyin `completed`'ga to'g'rilansa (misclick tuzatilsa) strike avtomatik ravishda
 * faol count'dan tushadi, un-transition hook kerak emas. `waived` — registratura
 * uzrli sabab bilan kechirgani (faol count'dan chiqaradi, row saqlanadi).
 */
export const patientNoShowStrikes = pgTable(
  'patient_no_show_strikes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    waived: boolean('waived').notNull().default(false),
    waivedReason: text('waived_reason'),
    waivedBy: uuid('waived_by').references(() => users.id, { onDelete: 'set null' }),
    waivedAt: timestamp('waived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('patient_no_show_strikes_appointment_unique').on(t.appointmentId),
    index('patient_no_show_strikes_patient_idx').on(t.tenantId, t.patientId),
  ],
);

export type PatientNoShowStrike = typeof patientNoShowStrikes.$inferSelect;
export type PatientNoShowStrikeInsert = typeof patientNoShowStrikes.$inferInsert;
