import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { branches } from './branches.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

/** Time-off turi — ta'til/kasallik/shaxsiy/boshqa. */
export const timeOffTypeEnum = pgEnum('time_off_type', ['vacation', 'sick', 'personal', 'other']);

/**
 * Doctor time-off — doktorning ish jadvalidan tashqari band vaqtlari (ta'til,
 * kasallik, shaxsiy ishlar). `[startAt, endAt)` yarim-ochiq instant oraliq.
 *
 * `branchId` null → barcha filiallarda amal qiladi (doktor butunlay yo'q).
 * Aks holda faqat ko'rsatilgan filialga taalluqli.
 */
export const doctorTimeOff = pgTable(
  'doctor_time_off',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    doctorId: uuid('doctor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),

    type: timeOffTypeEnum('type').notNull().default('other'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    reason: text('reason'),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('doctor_time_off_doctor_range_idx').on(t.doctorId, t.startAt, t.endAt)],
);

export type DoctorTimeOff = typeof doctorTimeOff.$inferSelect;
export type DoctorTimeOffInsert = typeof doctorTimeOff.$inferInsert;
