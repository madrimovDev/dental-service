import { diagnoses } from '@dental/db-schema';
import { asc } from 'drizzle-orm';
import type { Database } from '../../../db/client.ts';
import { rankDiagnoses } from './diagnoses.search.ts';

const LIMIT = 100;
// Katalog platform-level va kichik; qidiruv xotirada (xatoga chidamli) — o'qish ham chegaralangan.
const SCAN_CAP = 5000;

export const createDiagnosesRepository = (deps: { db: Database }) => {
  async function list(search?: string) {
    const term = search?.trim();
    if (term) {
      // UI-D3: nom (uz/ru) + sinonim + kod, harf xatosi va kirill/lotinga chidamli
      // (`diagnoses.search.ts`). `like` bilan aniq moslik yetarli emas edi («karies»↔«kariyes»).
      const all = await deps.db
        .select()
        .from(diagnoses)
        .orderBy(asc(diagnoses.code))
        .limit(SCAN_CAP);
      return rankDiagnoses(all, term, LIMIT);
    }
    // CLI-489: search'siz shox ham bounded (ICD-10 katalog o'sib ketsa unbounded
    // scan/response bo'lmasligi uchun) — search shoxi bilan bir xil ≤100 chegara.
    return deps.db.select().from(diagnoses).orderBy(asc(diagnoses.code)).limit(LIMIT);
  }

  return { list };
};
