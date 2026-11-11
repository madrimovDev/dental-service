import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { appointments } from './appointments.ts';
import { branches } from './branches.ts';
import { patients } from './patients.ts';
import { services } from './services.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

export const bookingRequestStatusEnum = pgEnum('booking_request_status', [
  'pending',
  'confirmed',
  'declined',
  'expired',
]);

/**
 * UI-T2 — Telegram bot orqali kelgan bron so'rovi. Bemor bo'sh slotni tanlaydi,
 * registrator «Bugun» ekranida tasdiqlaydi (appointment yaratiladi) yoki rad etadi.
 * 24 soatdan eski `pending` → `expired`.
 */
export const bookingRequests = pgTable(
  'booking_requests',
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
    doctorId: uuid('doctor_id').references(() => users.id, { onDelete: 'set null' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    requestedStart: timestamp('requested_start', { withTimezone: true }).notNull(),
    status: bookingRequestStatusEnum('status').notNull().default('pending'),
    /** «Boshqa vaqt» oqimi: shu eski yozilish uchun ko'chirish so'rovi. */
    rescheduleOfAppointmentId: uuid('reschedule_of_appointment_id').references(
      () => appointments.id,
      { onDelete: 'set null' },
    ),
    /** Tasdiqlanganda yaratilgan yozilish. */
    appointmentId: uuid('appointment_id').references(() => appointments.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    declineReason: text('decline_reason'),
  },
  (t) => [
    index('booking_requests_tenant_status_idx').on(t.tenantId, t.status, t.createdAt),
    index('booking_requests_patient_idx').on(t.patientId),
  ],
);

export type BookingRequest = typeof bookingRequests.$inferSelect;
export type BookingRequestInsert = typeof bookingRequests.$inferInsert;
