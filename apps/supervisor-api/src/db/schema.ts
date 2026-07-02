import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const clinics = pgTable('clinics', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const branches = pgTable('branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  clinicId: uuid('clinic_id')
    .notNull()
    .references(() => clinics.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  address: text('address'),
  phone: text('phone'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const licenses = pgTable('licenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  clinicId: uuid('clinic_id')
    .notNull()
    .references(() => clinics.id, { onDelete: 'cascade' }), // denorm
  branchId: uuid('branch_id')
    .notNull()
    .references(() => branches.id, { onDelete: 'cascade' }),
  licenseKey: text('license_key').notNull().unique(),
  fingerprint: text('fingerprint'), // machine fingerprint (SHA-256)
  plan: text('plan').notNull(), // 'starter'|'standard'|'premium'|'enterprise'
  modules: jsonb('modules').notNull().$type<string[]>(),
  gracePeriodDays: integer('grace_period_days').notNull().default(30),
  expiresAt: timestamp('expires_at').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastHeartbeatAt: timestamp('last_heartbeat_at'),
  activatedAt: timestamp('activated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Litsenziya tarixi (reactivation log)
export const licenseEvents = pgTable('license_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  licenseId: uuid('license_id')
    .notNull()
    .references(() => licenses.id, { onDelete: 'cascade' }),
  event: text('event').notNull(), // 'activated'|'heartbeat'|'reactivated'|'deactivated'
  fingerprint: text('fingerprint'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Admin foydalanuvchilar (Supervisor panel uchun)
export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Clinics = typeof clinics.$inferSelect;
export type Branches = typeof branches.$inferSelect;
export type Licenses = typeof licenses.$inferSelect;
export type LicenseEvents = typeof licenseEvents.$inferSelect;
export type AdminUsers = typeof adminUsers.$inferSelect;
