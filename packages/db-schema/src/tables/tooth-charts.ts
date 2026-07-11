import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { diagnoses } from './diagnoses.ts';
import { patients } from './patients.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';
import { visitNotes } from './visit-notes.ts';

/**
 * Tooth Chart — bemor uchun snapshot (har klinik update'da yangi snapshot).
 *
 * FDI numbering:
 *  - Doimiy (permanent): 11-18, 21-28, 31-38, 41-48
 *  - Sut (deciduous): 51-55, 61-65, 71-75, 81-85
 *
 * Snapshot pattern — oldingi holatlar yo'qolmaydi, tarix saqlanadi.
 */
export const toothCharts = pgTable(
  'tooth_charts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    visitNoteId: uuid('visit_note_id').references(() => visitNotes.id, { onDelete: 'set null' }),

    isPrimaryDentition: boolean('is_primary_dentition').notNull().default(false), // sut tishlar
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tooth_charts_patient_idx').on(t.patientId, t.createdAt),
    index('tooth_charts_tenant_idx').on(t.tenantId),
  ],
);

export type ToothChart = typeof toothCharts.$inferSelect;
export type ToothChartInsert = typeof toothCharts.$inferInsert;

export const toothSurfaceEnum = pgEnum('tooth_surface', [
  'whole', // umumiy tish holati
  'M', // Mesial
  'D', // Distal
  'B', // Buccal (facial)
  'L', // Lingual / Palatal
  'O', // Occlusal
  'I', // Incisal
]);

export const toothStateEnum = pgEnum('tooth_state', [
  'healthy',
  'caries',
  'filling',
  'crown',
  'implant',
  'missing',
  'root_canal',
  'to_extract',
  'temporary',
  'veneer',
]);

/** Tooth state enum qiymatlar union (CLI-488: treatment_stages.resulting_tooth_state tipi). */
export type ToothStateValue = (typeof toothStateEnum.enumValues)[number];

/**
 * Tooth State — har snapshot ichida, har tish va yuza uchun holat.
 */
export const toothStates = pgTable(
  'tooth_states',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    toothChartId: uuid('tooth_chart_id')
      .notNull()
      .references(() => toothCharts.id, { onDelete: 'cascade' }),
    toothNumber: integer('tooth_number').notNull(), // FDI: 11-48, 51-85
    surface: toothSurfaceEnum('surface').notNull().default('whole'),
    state: toothStateEnum('state').notNull(),
    diagnosisId: uuid('diagnosis_id').references(() => diagnoses.id, { onDelete: 'set null' }),
    notes: text('notes'),
  },
  (t) => [
    index('tooth_states_chart_idx').on(t.toothChartId, t.toothNumber),
    index('tooth_states_diagnosis_idx').on(t.diagnosisId),
  ],
);

export type ToothState = typeof toothStates.$inferSelect;
export type ToothStateInsert = typeof toothStates.$inferInsert;
