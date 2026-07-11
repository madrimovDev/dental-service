/**
 * CLI-489 — diagnoses.repository.ts list() search'siz shox unbounded edi (REAL DB).
 * `list()`ning search-branchida `.limit(100)` bor edi, lekin search'siz "hammasini
 * qaytar" branchida chegara yo'q edi — ICD-10 katalog o'sib ketsa full-table scan +
 * cheksiz response. Endi ikkala shox ham ≤100 qator.
 *
 * `diagnoses` — platform-level katalog (tenant-scoped EMAS), shu sabab repository
 * to'g'ridan `db` bilan ishlaydi (getDb(c) emas). Test global katalogni ishlatadi.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-489-diagnoses-limit`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { diagnoses } from '@dental/db-schema';
import { like } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { createDiagnosesRepository } from '../../src/modules/clinical/diagnoses/diagnoses.repository.ts';

const repo = createDiagnosesRepository({ db });
const CODE_PREFIX = 'ZZ489.';

async function cleanup() {
  await db.delete(diagnoses).where(like(diagnoses.code, `${CODE_PREFIX}%`));
}

beforeAll(async () => {
  await cleanup();
  // 105 sintetik diagnoz — search'siz list ≤100 qaytishini isbotlash uchun
  const rows = Array.from({ length: 105 }, (_, i) => ({
    code: `${CODE_PREFIX}${String(i).padStart(3, '0')}`,
    nameUz: `Test diagnoz ${i}`,
    nameRu: `Тест диагноз ${i}`,
    category: 'ZZ489',
  }));
  await db.insert(diagnoses).values(rows);
});

afterAll(async () => {
  await cleanup();
});

describe('CLI-489 — diagnoses list() bounded — real DB', () => {
  test("search'siz list eng ko'pi 100 qator qaytaradi", async () => {
    const rows = await repo.list();
    expect(rows.length).toBeLessThanOrEqual(100);
  });

  test("search'siz list qaytgan qatorlar bo'sh emas (regressiya)", async () => {
    const rows = await repo.list();
    expect(rows.length).toBeGreaterThan(0);
  });
});
