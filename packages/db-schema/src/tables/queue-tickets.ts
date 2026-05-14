import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { branches } from './branches.ts';
import { patients } from './patients.ts';
import { services } from './services.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

export const queueStatusEnum = pgEnum('queue_status', ['waiting', 'in_progress', 'done', 'missed']);

/**
 * Walk-in queue tickets.
 * Per-day sequential queue_number, branch bo'yicha alohida.
 * Display board: dental-desktop'da yoki web da.
 */
export const queueTickets = pgTable(
  'queue_tickets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    patientId: uuid('patient_id').references(() => patients.id, { onDelete: 'set null' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    doctorId: uuid('doctor_id').references(() => users.id, { onDelete: 'set null' }),

    queueNumber: integer('queue_number').notNull(),
    ticketDate: timestamp('ticket_date', { withTimezone: true }).notNull().defaultNow(),

    status: queueStatusEnum('status').notNull().default('waiting'),
    calledAt: timestamp('called_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Per-branch, per-day uniqueness — application-level enforced (date_trunc kerak)
    unique('queue_tenant_branch_number_idx').on(
      t.tenantId,
      t.branchId,
      t.ticketDate,
      t.queueNumber,
    ),
    index('queue_branch_status_idx').on(t.branchId, t.status),
  ],
);

export type QueueTicket = typeof queueTickets.$inferSelect;
export type QueueTicketInsert = typeof queueTickets.$inferInsert;
