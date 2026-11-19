import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { labOrders } from './lab-orders.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

/**
 * Lab Hub (laboratoriya portali) — klinika tomonidagi sinxron holati (W2 clinic-sync).
 * Har tenant uchun bitta qator: Hub'dagi klinika identifikatori, Hub kaliti
 * (AES-256-GCM, `encryptSecret` — Qaror #38 naqshi), `/v1/clinic/changes` kursori.
 */
export type LabHubCachedLab = {
  id: string;
  name: string;
  city: string | null;
  description: string | null;
  linkStatus: string | null;
};

export const labHubState = pgTable(
  'lab_hub_state',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    hubClinicId: uuid('hub_clinic_id'),
    hubKeyEnc: text('hub_key_enc'),
    /** Shaffof Hub kursori `"<tx_id>.<seq>"` (boshlang'ich `0.0`). */
    cursor: text('cursor').notNull().default('0.0'),
    /**
     * FX-98: migratsiya 0068 dan oldingi kursorning `tx_id`si. O'sha paytgacha qo'llangan
     * hodisalar `(tx_id = 0, seq)` bo'lib saqlangan va ularning hammasida haqiqiy `tx_id`
     * shu chegaradan oshmaydi (kursor faqat oldinga suriladi). Davr almashib tarix qayta
     * kelganda `(0, seq)` qatori + `txId <= legacyTxCeiling` = allaqachon qo'llangan.
     */
    legacyTxCeiling: bigint('legacy_tx_ceiling', { mode: 'number' }).notNull().default(0),
    /** Oxirgi muvaffaqiyatli katalog javobi — internet yo'q paytda lab tanlash uchun. */
    labsCache: jsonb('labs_cache').$type<LabHubCachedLab[] | null>(),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    lastPollAt: timestamp('last_poll_at', { withTimezone: true }),
    lastPushAt: timestamp('last_push_at', { withTimezone: true }),
    lastError: text('last_error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('lab_hub_state_tenant_unique').on(t.tenantId)],
);

export type LabHubState = typeof labHubState.$inferSelect;

export const LAB_HUB_OUTBOX_OPS = [
  'upsert_case',
  'file',
  'message',
  'approve_price',
  'delivered',
] as const;
export type LabHubOutboxOp = (typeof LAB_HUB_OUTBOX_OPS)[number];

/**
 * Chiquvchi navbat (D1): tranzaksiya ichida yoziladi, commit'dan keyin worker
 * push qiladi. PHI payload'da SAQLANMAYDI — ish ma'lumoti push paytida buyurtma
 * va bemordan `toHubCase` (L3 mapper) orqali yig'iladi.
 */
export const labHubOutbox = pgTable(
  'lab_hub_outbox',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /**
     * Buyurtma ichida FIFO tartibi (bitta tx'dagi qatorlarda `created_at` bir xil). `clock_timestamp`
     * mikrosekundi — har INSERT alohida o'qiladi. Sequence (bigserial) ATAYLAB emas: app roli
     * sequence egasi bo'lmagani uchun `TRUNCATE … RESTART IDENTITY` (test to'plami) yiqilardi.
     */
    seq: bigint('seq', { mode: 'number' })
      .notNull()
      .default(sql`(extract(epoch from clock_timestamp()) * 1000000)::bigint`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    labOrderId: uuid('lab_order_id')
      .notNull()
      .references(() => labOrders.id, { onDelete: 'cascade' }),
    op: text('op').notNull().$type<LabHubOutboxOp>(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    /** `pending` | `done` | `failed` (qayta urinib bo'lmaydigan 4xx). */
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    /** Keyingi urinish (backoff) va ishlov berish ijarasi (lease) — ikkita worker bir qatorni olmaydi. */
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    doneAt: timestamp('done_at', { withTimezone: true }),
  },
  (t) => [
    index('lab_hub_outbox_pending_idx').on(t.tenantId, t.status, t.seq),
    index('lab_hub_outbox_order_idx').on(t.labOrderId, t.seq),
  ],
);

export type LabHubOutboxRow = typeof labHubOutbox.$inferSelect;

/**
 * Buyurtma ichidagi yozishma (lab ↔ klinika) va lab yuborgan fayllar haqida yozuv.
 * Klinika yozgani darhol shu yerga tushadi (+ outbox); lab yozgani poll orqali —
 * `hub_ref` (Hub xabar/fayl id) bo'yicha dublikatsiz.
 */
export const labOrderMessages = pgTable(
  'lab_order_messages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    labOrderId: uuid('lab_order_id')
      .notNull()
      .references(() => labOrders.id, { onDelete: 'cascade' }),
    author: text('author').notNull().$type<'clinic' | 'lab'>(),
    authorName: text('author_name'),
    kind: text('kind').notNull().default('message').$type<'message' | 'file'>(),
    body: text('body'),
    /** Lab fayli: `{ id, fileName, mimeType, sizeBytes }` (fayl Hub'da shifrlangan holda). */
    hubFile: jsonb('hub_file').$type<{
      id: string;
      fileName: string | null;
      mimeType: string;
      sizeBytes: number;
    } | null>(),
    hubRef: text('hub_ref'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lab_order_messages_order_idx').on(t.labOrderId, t.createdAt),
    unique('lab_order_messages_hub_ref_unique').on(t.tenantId, t.hubRef),
  ],
);

export type LabOrderMessage = typeof labOrderMessages.$inferSelect;

/**
 * Qo'llangan Hub hodisalari — hodisalar `(tx_id, seq)` bo'yicha idempotent qo'llanadi
 * (tarmoq uzilib bir sahifa qayta kelsa — ikkinchi marta holat/bildirishnoma yaratilmaydi).
 * FX-93: faqat `seq` emas — Hub bazasi shu klasterga zaxiradan tiklansa sequence orqaga
 * qaytadi va yangi hodisa eski `seq`ni oladi (lekin yangi, kattaroq `tx_id`). `tx_id = 0` —
 * migratsiyadan oldingi qatorlar yoki `txId` yubormaydigan eski Hub.
 */
export const labHubAppliedEvents = pgTable(
  'lab_hub_applied_events',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    txId: bigint('tx_id', { mode: 'number' }).notNull().default(0),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.txId, t.seq] })],
);
