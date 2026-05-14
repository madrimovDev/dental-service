import { PERMISSIONS } from '@dental/core';
import { permissions } from '@dental/db-schema';
import { logger } from '../lib/logger.ts';
import type { Database } from './client.ts';

/**
 * Boot vaqtida permissions katalogini idempotent upsert.
 *
 * `packages/core/src/permissions.ts` — source of truth.
 * Yangi permission qo'shilganda deploy → boot → DB sinxron.
 * Tenant'lar yangi rol/role tahrirlash orqali yangi permissionlarni ishlatadi.
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
