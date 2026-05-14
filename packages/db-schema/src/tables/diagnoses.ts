import { sql } from 'drizzle-orm';
import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

/**
 * ICD-10 Dental Diagnoses katalog — PLATFORM-LEVEL (tenant_id YO'Q).
 * K00-K14 — Diseases of digestive system (Oral region).
 *
 * Seed boot vaqtida idempotent — `code` UNIQUE bo'yicha ON CONFLICT UPDATE.
 * Hech qaysi tenant bu jadvalga insert qila olmaydi (faqat read).
 */
export const diagnoses = pgTable(
  'diagnoses',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    code: text('code').notNull().unique(), // "K02.1", "K05.0"
    nameUz: text('name_uz').notNull(),
    nameRu: text('name_ru').notNull(),
    category: text('category').notNull(), // "K02" — Caries, "K05" — Gingivitis, ...
    descriptionUz: text('description_uz'),
    descriptionRu: text('description_ru'),
  },
  (t) => [index('diagnoses_category_idx').on(t.category)],
);

export type Diagnosis = typeof diagnoses.$inferSelect;
export type DiagnosisInsert = typeof diagnoses.$inferInsert;
