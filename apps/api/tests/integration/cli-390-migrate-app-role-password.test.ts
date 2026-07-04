/**
 * CLI-390 — migrate.ts ensureAppRole() paroli to'g'ri env-nomdan o'qishi kerak.
 *
 * `apps/api/src/db/migrate.ts` `dental_app` roli uchun `DATABASE_APP_PASSWORD`
 * nomli env'ni o'qirdi — bu nom hech qayerda (`docker-compose.yml`,
 * `.env.example`, `infra/postgres-init.sh`) o'rnatilmagan; haqiqiy ishlatiladigan
 * nom `DENTAL_APP_DB_PASSWORD` (CLI-383). Bu — nega bug cloud/dev'da zararsiz
 * bo'lib qolgan (u yerda `dental_app` roli allaqachon `postgres-init.sh` orqali
 * yaratiladi, `ensureAppRole()` early-return qiladi, parol umuman o'qilmaydi) —
 * lekin Local Desktop first-run'da (CLI-390 spec) load-bearing.
 *
 * `migrate.ts` import vaqtida top-level `await runMigrations()` ishga tushiradi
 * (real Postgres ulanishini talab qiladi) — shu sabab modulni to'g'ridan-to'g'ri
 * import qilib ensureAppRole()'ni izolyatsiyada sinash noqulay. Bu source-guard
 * test — env-var nomining o'zini regression-guard qiladi (plan §Task 3, "weakest
 * link" deb izohlangan cheklov).
 */
import { describe, expect, test } from 'bun:test';

describe('migrate.ts ensureAppRole password env-var (CLI-390)', () => {
  test('DENTAL_APP_DB_PASSWORD (not DATABASE_APP_PASSWORD) is read for the dental_app role password', async () => {
    const source = await Bun.file('src/db/migrate.ts').text();
    expect(source).toContain('process.env.DENTAL_APP_DB_PASSWORD');
    expect(source).not.toContain('process.env.DATABASE_APP_PASSWORD');
  });
});
