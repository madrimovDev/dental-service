import { branches, services } from '@dental/db-schema';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../db/scoped.ts';
import { CrossEntityError } from './ownership.ts';

/**
 * FX-03b (X-1): filial / xizmat egaligi. FK constraint RLS'ni chetlab o'tadi — begona
 * tenant UUID'si qabul qilinardi. `getDb(c)` (RLS-scoped) select bo'sh qaytsa
 * `CrossEntityError(..., 'not_found')` (chaqiruvchi 404'ga aylantiradi).
 */
export async function assertBranchExists(c: Context, branchId: string): Promise<void> {
  const [row] = await getDb(c)
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);
  if (!row) throw new CrossEntityError('branch', 'not_found');
}

export async function assertServiceExists(c: Context, serviceId: string): Promise<void> {
  const [row] = await getDb(c)
    .select({ id: services.id })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1);
  if (!row) throw new CrossEntityError('service', 'not_found');
}
