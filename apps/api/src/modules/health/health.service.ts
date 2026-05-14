import { sql } from 'drizzle-orm';
import type { Database } from '../../db/client.ts';

export const createHealthService = (deps: { db: Database }) => {
  const checkDb = async (): Promise<'up' | 'down'> => {
    try {
      await deps.db.execute(sql`SELECT 1`);
      return 'up';
    } catch {
      return 'down';
    }
  };

  return { checkDb };
};

export type HealthService = ReturnType<typeof createHealthService>;
