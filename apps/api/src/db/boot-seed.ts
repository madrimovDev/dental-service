import { DIAGNOSES_SEED, PERMISSIONS } from '@dental/core';
import { diagnoses, permissions } from '@dental/db-schema';
import { logger } from '../lib/logger.ts';
import type { Database } from './client.ts';

/**
 * Boot vaqtida platform-level kataloglarni idempotent upsert.
 *
 * - PERMISSIONS — packages/core/src/permissions.ts
 * - DIAGNOSES (ICD-10) — packages/core/src/diagnoses-seed.ts
 *
 * Yangi entry qo'shilganda deploy → boot → DB sinxron.
 */
export async function seedPermissions(db: Database): Promise<void> {
  let upserted = 0;

  for (const p of PERMISSIONS) {
    await db
      .insert(permissions)
      .values({
        code: p.code,
        category: p.category,
        descriptionUz: p.descriptionUz,
        descriptionRu: p.descriptionRu,
      })
      .onConflictDoUpdate({
        target: permissions.code,
        set: {
          category: p.category,
          descriptionUz: p.descriptionUz,
          descriptionRu: p.descriptionRu,
        },
      });
    upserted++;
  }

  logger.info({ count: upserted }, 'Permissions catalog seeded');
}

export async function seedDiagnoses(db: Database): Promise<void> {
  let upserted = 0;

  for (const d of DIAGNOSES_SEED) {
    await db
      .insert(diagnoses)
      .values({
        code: d.code,
        category: d.category,
        nameUz: d.nameUz,
        nameRu: d.nameRu,
      })
      .onConflictDoUpdate({
        target: diagnoses.code,
        set: {
          category: d.category,
          nameUz: d.nameUz,
          nameRu: d.nameRu,
        },
      });
    upserted++;
  }

  logger.info({ count: upserted }, 'ICD-10 dental diagnoses seeded');
}
