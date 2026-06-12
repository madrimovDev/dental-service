import { diagnoses } from '@dental/db-schema';
import { asc, sql } from 'drizzle-orm';
import type { Database } from '../../../db/client.ts';

export const createDiagnosesRepository = (deps: { db: Database }) => {
  async function list(search?: string) {
    if (search) {
      const term = `%${search.toLowerCase()}%`;
      return deps.db
        .select()
        .from(diagnoses)
        .where(
          sql`lower(${diagnoses.code}) like ${term} OR lower(${diagnoses.nameUz}) like ${term} OR lower(${diagnoses.nameRu}) like ${term}`,
        )
        .orderBy(asc(diagnoses.code))
        .limit(100);
    }
    return deps.db.select().from(diagnoses).orderBy(asc(diagnoses.code));
  }

  return { list };
};
