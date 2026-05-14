import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { branches } from './branches.ts';
import { patients } from './patients.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

export const appointmentStatusEnum = pgEnum('appointment_status', [
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'no_show',
  'cancelled',
]);

/**
 * Appointments — yozilish.
 * Doktor bo'yicha kalendar. Bir doktor bir vaqtda ikki vizit qila olmaydi.
 * Kabinet konsepti Phase 2 da (hozir yo'q).
 */
export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    doctorId: uuid('doctor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assistantId: uuid('assistant_id').references(() => users.id, { onDelete: 'set null' }),

    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),

    status: appointmentStatusEnum('status').notNull().default('scheduled'),
    serviceIds: uuid('service_ids').array(),
    notes: text('notes'),
    cancellationReason: text('cancellation_reason'),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('appointments_doctor_time_idx').on(t.doctorId, t.startTime),
    index('appointments_tenant_branch_time_idx').on(t.tenantId, t.branchId, t.startTime),
    index('appointments_patient_idx').on(t.patientId),
    index('appointments_status_idx').on(t.status),
  ],
);

export type Appointment = typeof appointments.$inferSelect;
export type AppointmentInsert = typeof appointments.$inferInsert;
