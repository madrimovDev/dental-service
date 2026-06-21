import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { branches } from './branches.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

/**
 * Doctor weekly schedule segments — doktorning haftalik ish jadvali.
 *
 * Har row = bir hafta-kunidagi bitta uzluksiz segment (daqiqa-asosli, yarim
 * tundan). Bir kunda bir nechta segment = smena/tushlik bo'linishi (tabiiy
 * gap). Masalan 540–720 (09:00–12:00) + 780–1080 (13:00–18:00) → 12:00–13:00
 * tushlik bo'sh qoladi.
 *
 * `weekday`: 0=Yakshanba .. 6=Shanba (JS `getUTCDay()` bilan izchil; reports
 * `['sun','mon',...]` kalit tartibiga mos).
 * `effectiveFrom`/`effectiveUntil`: ixtiyoriy amal qilish oynasi (mavsumiy
 * jadval). null → cheksiz.
 */
export const doctorSchedules = pgTable(
  'doctor_schedules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    doctorId: uuid('doctor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    weekday: integer('weekday').notNull(), // 0=Sun .. 6=Sat
    startMinute: integer('start_minute').notNull(), // yarim tundan daqiqa
    endMinute: integer('end_minute').notNull(),

    isActive: boolean('is_active').notNull().default(true),
    effectiveFrom: date('effective_from'),
    effectiveUntil: date('effective_until'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('doctor_schedules_doctor_weekday_idx').on(t.doctorId, t.weekday),
    index('doctor_schedules_tenant_branch_idx').on(t.tenantId, t.branchId),
  ],
);

export type DoctorSchedule = typeof doctorSchedules.$inferSelect;
export type DoctorScheduleInsert = typeof doctorSchedules.$inferInsert;
