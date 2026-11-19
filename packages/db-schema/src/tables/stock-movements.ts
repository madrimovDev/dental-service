import { sql } from 'drizzle-orm';
import { index, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { services } from './services.ts';
import { stockItems } from './stock-items.ts';
import { tenants } from './tenants.ts';
import { treatmentStages } from './treatment-plans.ts';
import { users } from './users.ts';
import { visitNotes } from './visit-notes.ts';

export const stockMovementTypeEnum = pgEnum('stock_movement_type', ['in', 'out', 'adjustment']);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => stockItems.id, { onDelete: 'cascade' }),
    type: stockMovementTypeEnum('type').notNull(),
    quantity: numeric('quantity', { precision: 14, scale: 2 }).notNull(),
    reason: text('reason'),
    sourceVisitNoteId: uuid('source_visit_note_id').references(() => visitNotes.id, {
      onDelete: 'set null',
    }),
    // FX-44: vizit BOM chiqimi qaysi xizmat uchun (ledger-asosli qaytarish). Eski qatorlarda NULL.
    sourceServiceId: uuid('source_service_id').references(() => services.id, {
      onDelete: 'set null',
    }),
    // FX-60: plan ekranidan completed bosqich BOM chiqimi qaysi bosqich uchun (dedup kaliti).
    sourceStageId: uuid('source_stage_id').references(() => treatmentStages.id, {
      onDelete: 'set null',
    }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stock_movements_tenant_item_idx').on(t.tenantId, t.itemId, t.createdAt)],
);

export type StockMovement = typeof stockMovements.$inferSelect;
