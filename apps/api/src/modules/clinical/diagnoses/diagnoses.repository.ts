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
    // CLI-489: search'siz shox ham bounded (ICD-10 katalog o'sib ketsa unbounded
    // scan/response bo'lmasligi uchun) — search shoxi bilan bir xil ≤100 chegara.
    return deps.db.select().from(diagnoses).orderBy(asc(diagnoses.code)).limit(100);
  }

  return { list };
};
