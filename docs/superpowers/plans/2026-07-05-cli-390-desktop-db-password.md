# CLI-390 — Desktop DB password + migrate.ts env-var fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the two literal, committed Postgres passwords baked into `apps/desktop/src/process-manager.ts` (`DATABASE_URL`'s `dental_app:dental_app_local_dev`) and fix `apps/api/src/db/migrate.ts:66`, which reads a `DATABASE_APP_PASSWORD` env var that is never set anywhere (real name, used everywhere else, is `DENTAL_APP_DB_PASSWORD` — CLI-383). Replace the hardcoded `dental_app` password with a value generated once and persisted to disk on first run, mirroring the existing `getOrCreateJwtSecret()` pattern in `apps/desktop/src/first-run.ts`, so the Electron main process, the migration step that creates the `dental_app` Postgres role, and any restart all agree on the same password without a committed literal.

**Architecture:** `getOrCreateDbPassword()` is added to `apps/desktop/src/first-run.ts` (next to `getOrCreateJwtSecret()`, same file-persistence shape: `db-password.txt` in `DENTAL_DATA_DIR`, `0o600`, idempotent). It is called from three places: (1) `runFirstSetup()`, before `initdb` runs — this ordering is load-bearing, see Global Constraints; (2) `runMigrations()`, to pass `DENTAL_APP_DB_PASSWORD` into the `api.exe migrate` subprocess env so `ensureAppRole()` creates the `dental_app` role with this password; (3) `process-manager.ts`'s `spawnApi()`, to build the runtime `DATABASE_URL`. `apps/api/src/db/migrate.ts:66` is changed to read `DENTAL_APP_DB_PASSWORD` (matching `infra/postgres-init.sh`/`docker-compose.yml`/`.env.example`) instead of the never-set `DATABASE_APP_PASSWORD`, plus two stale comments (`postgres-init.sql` → `.sh`, CLI-383 renamed the file but explicitly left `apps/api` untouched per that ticket's own scope).

**Tech Stack:** Electron, Bun, `apps/desktop/src/process-manager.ts`, `apps/api/src/db/migrate.ts`.

## Global Constraints

- **Call-site ordering is load-bearing.** `getOrCreateDbPassword()` MUST be called in `runFirstSetup()` **before** the `initdb` `spawnSync` call. `isFirstRun()` (used inside `getOrCreateDbPassword()` to decide fresh-random vs. legacy-literal) checks for `postgres/data/PG_VERSION`, and `initdb` is what creates that file. If the call is placed after `initdb`, a genuinely fresh install would incorrectly take the "existing install" branch (because `PG_VERSION` now exists) and would seed the same old hardcoded literal — functionally fine, but silently defeats the entire point of this ticket.
- **Must not break existing Local Desktop installs with a Postgres cluster already provisioned under the old hardcoded password.** Verified via `apps/desktop/src/main.ts:162-169`: `isFirstRun()` is read once into `firstRun`; when `true`, `runFirstSetup()` → `startDatabaseLayer()` → `runMigrations()` → `startApiLayer()` runs; when `false`, `runFirstSetup()`/`runMigrations()` are skipped entirely and `startServer()` (which calls `spawnApi()`) runs directly. So for any install that already completed first-run under the old code, `getOrCreateDbPassword()`'s first-ever call happens inside `spawnApi()`, with `isFirstRun() === false` (the real Postgres cluster already exists) — the function's existing-install branch must return the exact literal `'dental_app_local_dev'` (not a new random value) so it matches the password already baked into the live `dental_app` Postgres role. Do not add any separate migration/detection mechanism beyond this branch — the existing `isFirstRun()` semantics plus `main.ts`'s existing fresh-vs-not branching are sufficient on their own.
- **`DATABASE_ADMIN_URL` (process-manager.ts:138, `postgresql://dental:dental@localhost:5433/dental`) is explicitly OUT OF SCOPE and stays unchanged.** The `DENTAL_APP_DB_PASSWORD` pattern (CLI-383) only covers the `dental_app` role/password. The `dental` (superuser) role is created by `initdb -U dental` with **no password set at all** (`first-run.ts`'s `initdb` call has no `--pwfile`) — whether/how `'dental:dental'` actually authenticates against that role is a separate, deeper, pre-existing question not raised by this ticket's DoD (which names only the `DENTAL_APP_DB_PASSWORD` pattern). Do not attempt to fix or generate a password for the admin/superuser connection in this plan — flag it as a follow-up ticket candidate in the Task 2 commit message or PR description if convenient, but no code change here.
- **`ensureAppRole()` in migrate.ts never updates an existing role's password** (`if (existing.length > 0) return;`, line 68-70) — this is why the env-var rename in Task 3 is safe for cloud/dev too: there, `dental_app` is already created by `infra/postgres-init.sh` at Postgres container first-boot (CLI-383), so `ensureAppRole()` early-returns and `APP_ROLE_PASSWORD` is never even read. Only Local Desktop's first-run path actually executes the `CREATE ROLE` branch.
- **Test-coverage honesty:** `process-manager.test.ts`/`first-run.test.ts` mock `spawn`/`spawnSync` — no test in this plan runs a real `initdb`, so `PG_VERSION` is never actually created during tests. The "fresh install still gets a random password even right after `initdb` ran" property is **not** provable by these unit tests; it depends on correct call-site placement (verified by code review, per the constraint above) and, ultimately, on a physical Windows PC first-run (existing project convention for Electron/Windows-only paths — see CLAUDE.md's note on Local Desktop Task 6-12 verification). Do not claim more test coverage than what Task 1's two branches (fresh-random, existing-legacy, both driven by manipulating `DENTAL_DATA_DIR`'s `postgres/data/PG_VERSION` file directly in the test) actually exercise.
- Match the existing `getOrCreateJwtSecret()` shape exactly: `randomBytes(32).toString('hex')` (not a different byte length — no bikeshedding), `mode: 0o600`, `mkdirSync(getDataDir(), { recursive: true })` before write, `existsSync` short-circuit on read.

---

### Task 1: Add `getOrCreateDbPassword()` to first-run.ts, wire into `runFirstSetup()` + `runMigrations()`

**Files:**
- Modify: `apps/desktop/src/first-run.ts:60-101` (new function + `runFirstSetup` step + `runMigrations` env)
- Modify: `apps/desktop/src/first-run.test.ts` (new `describe` block)

- [ ] **Step 1: Write the failing tests**

  Add a new `describe` block to `apps/desktop/src/first-run.test.ts`, mirroring the existing `describe('getOrCreateJwtSecret', ...)` block (lines 142-165) exactly in setup/teardown shape:

  ```ts
  describe('getOrCreateDbPassword', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'first-run-test-'));
      process.env.DENTAL_DATA_DIR = tmpDir;
    });

    afterEach(async () => {
      delete process.env.DENTAL_DATA_DIR;
      await rm(tmpDir, { recursive: true, force: true });
    });

    test('fresh install (PG_VERSION yo\'q) — tasodifiy parol generatsiya qiladi va faylga yozadi', () => {
      const password = getOrCreateDbPassword();
      expect(existsSync(join(tmpDir, 'db-password.txt'))).toBe(true);
      expect(password).not.toBe('dental_app_local_dev');
      expect(password.length).toBeGreaterThanOrEqual(32);
    });

    test('idempotent — ikkinchi chaqiruvda bir xil qiymatni qaytaradi (qayta yozmaydi)', () => {
      const first = getOrCreateDbPassword();
      const second = getOrCreateDbPassword();
      expect(second).toBe(first);
    });

    test('mavjud o\'rnatish (PG_VERSION allaqachon bor) — eski hardcoded literalni qaytaradi (upgrade-safety, CLI-390)', async () => {
      // Postgres klasteri "allaqachon mavjud" holatini simulyatsiya qilamiz —
      // isFirstRun() shu faylga qarab true/false qaytaradi.
      await mkdir(join(tmpDir, 'postgres', 'data'), { recursive: true });
      await writeFile(join(tmpDir, 'postgres', 'data', 'PG_VERSION'), '16');

      const password = getOrCreateDbPassword();
      expect(password).toBe('dental_app_local_dev');
    });
  });
  ```

  Add `getOrCreateDbPassword` to the destructured import at the top of the file (alongside `isFirstRun, runFirstSetup, runMigrations, getOrCreateJwtSecret`). Add `mkdir, writeFile` to the `node:fs/promises` import if not already present (check the file's current import line first — it currently imports `mkdtemp, rm` from `node:fs/promises` per the existing `getOrCreateJwtSecret` block's `beforeEach`/`afterEach`).

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd apps/desktop && bun test first-run.test.ts
  ```
  Expect: `getOrCreateDbPassword is not a function` / import error (function doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

  In `apps/desktop/src/first-run.ts`, add right after `getOrCreateJwtSecret` (after line 71):

  ```ts
  // dental_app Postgres roli uchun parol — birinchi ishga tushishda
  // generatsiya qilinadi va `dataDir`da saqlanadi (CLI-390). getOrCreateJwtSecret
  // bilan bir xil idempotent fayl-persist pattern.
  export const getDbPasswordPath = (): string => join(getDataDir(), 'db-password.txt');

  export const getOrCreateDbPassword = (): string => {
    const path = getDbPasswordPath();
    if (existsSync(path)) {
      return readFileSync(path, 'utf8').trim();
    }
    mkdirSync(getDataDir(), { recursive: true });
    // Upgrade-safety (CLI-390): agar bu birinchi chaqiruv paytida Postgres
    // klasteri ALLAQACHON mavjud bo'lsa (isFirstRun() false — bu kod
    // versiyasidan OLDIN o'rnatilgan nusxa, dental_app roli eski hardcoded
    // parol bilan allaqachon yaratilgan) — tasodifiy YANGI parol generatsiya
    // qilib bo'lmaydi (mavjud rol paroliga mos kelmay, runtime auth-failure
    // beradi). Faqat haqiqiy fresh install (Postgres klasteri hali yo'q)da
    // tasodifiy parol xavfsiz. Chaqiruvchi tomonidan bu funksiya initdb'dan
    // OLDIN chaqirilishi SHART (runFirstSetup() qarang) — aks holda fresh
    // install ham noto'g'ri "mavjud o'rnatish" filialiga tushib qoladi.
    const password = isFirstRun() ? randomBytes(32).toString('hex') : 'dental_app_local_dev';
    writeFileSync(path, password, { mode: 0o600 });
    return password;
  };
  ```

  Update `runFirstSetup()` to call it before `initdb` (insert as new step 2, renumber existing steps 2-4 to 3-5):

  ```ts
  export const runFirstSetup = (): void => {
    const dataDir = getDataDir();
    const pgData = getPgDataDir();
    const resourcesDir = getResourcesDir();
    const confNames = getConfFileNames();

    // 1. Ma'lumotlar papkalarini yaratish
    mkdirSync(join(dataDir, 'uploads'), { recursive: true });
    mkdirSync(join(dataDir, 'logs'), { recursive: true });
    mkdirSync(pgData, { recursive: true });

    // 2. DB parolini generatsiya qilish/aniqlash — initdb'DAN OLDIN (CLI-390:
    //    isFirstRun() PG_VERSION borligiga tayanadi, initdb esa aynan shu
    //    faylni yaratadi — tartib teskari bo'lsa fresh install ham "mavjud
    //    o'rnatish" deb noto'g'ri aniqlanib qoladi).
    getOrCreateDbPassword();

    // 3. initdb — postgres data dir yaratish
    const initdb = spawnSync(
      getInitdbPath(),
      ['-D', pgData, '--encoding=UTF8', '--locale=C', '-U', 'dental'],
      { stdio: 'pipe' },
    );
    assertSuccess(initdb, 'initdb');

    // 4. postgres.conf / valkey.conf nusxalash (platform-mos)
    copyFileSync(
      join(resourcesDir, '..', 'infra', confNames.postgres),
      join(dataDir, 'postgres.conf'),
    );
    copyFileSync(join(resourcesDir, '..', 'infra', confNames.valkey), join(dataDir, 'valkey.conf'));

    // 5. JWT_SECRET — birinchi ishga tushishda generatsiya (idempotent).
    getOrCreateJwtSecret();
  };
  ```

  Update `runMigrations()` to pass the password through to `api.exe migrate`:

  ```ts
  export const runMigrations = (apiExePath: string): void => {
    const dataDir = getDataDir();
    const apiDir = dirname(apiExePath);
    const result = spawnSync(apiExePath, ['migrate'], {
      env: {
        ...process.env,
        DATABASE_URL: 'postgresql://dental:dental@localhost:5433/dental',
        DATABASE_ADMIN_URL: 'postgresql://dental:dental@localhost:5433/dental',
        DENTAL_APP_DB_PASSWORD: getOrCreateDbPassword(), // CLI-390 — dental_app roli shu parol bilan yaratiladi
        UPLOADS_DIR: join(dataDir, 'uploads'),
        MIGRATIONS_DIR: join(apiDir, 'drizzle'),
        RLS_MIGRATIONS_DIR: join(apiDir, 'migrations', 'rls'),
      },
      stdio: 'pipe',
    });
    assertSuccess(result, 'Migrations');
  };
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd apps/desktop && bun test first-run.test.ts
  ```
  Expect: all tests green, including the 3 new `getOrCreateDbPassword` tests and all pre-existing tests (`isFirstRun`, `runFirstSetup`, `runMigrations`, `getOrCreateJwtSecret` blocks) still passing unchanged.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/desktop/src/first-run.ts apps/desktop/src/first-run.test.ts
  git commit -m "$(cat <<'EOF'
  fix(desktop): generate+persist dental_app DB password on first run (CLI-390)

  getOrCreateDbPassword() mirrors the existing getOrCreateJwtSecret() pattern
  (db-password.txt in DENTAL_DATA_DIR, idempotent, 0o600) instead of relying
  on a hardcoded literal. Called before initdb in runFirstSetup() (ordering is
  load-bearing — isFirstRun() checks for PG_VERSION, which initdb creates) and
  threaded into runMigrations()'s DENTAL_APP_DB_PASSWORD env so the dental_app
  Postgres role is created with the generated password. Existing installs
  (Postgres cluster already provisioned under the old hardcoded password) are
  detected via the same isFirstRun() check and seeded with the legacy literal
  instead, so upgrades don't break.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 2: Consume `getOrCreateDbPassword()` in process-manager.ts's `spawnApi()`

**Files:**
- Modify: `apps/desktop/src/process-manager.ts:20,132`
- Modify: `apps/desktop/src/process-manager.test.ts:91-106`

- [ ] **Step 1: Write the failing test**

  In `apps/desktop/src/process-manager.test.ts`, add a cleanup line near the top (after the existing `process.env.DENTAL_DATA_DIR = '/tmp/dental-pm-test';` block, before the `describe` blocks) so the fresh-random branch of `getOrCreateDbPassword()` is deterministic across repeated local test runs (the file reuses a static, non-mkdtemp directory with no teardown):

  ```ts
  import { existsSync, rmSync } from 'node:fs';
  import { join } from 'node:path';
  ...
  // CLI-390: eski test-run'lardan qolgan db-password.txt bo'lsa tozalaymiz —
  // aks holda isFirstRun()'ning "fresh install" filiali bu statik (mkdtemp
  // emas) DENTAL_DATA_DIR'da deterministik ishlamaydi.
  rmSync(join('/tmp/dental-pm-test', 'db-password.txt'), { force: true });
  ```

  Then update the two assertion sites:

  Replace the `toMatchObject` block (lines 91-98) — remove the exact `DATABASE_URL` literal from it (it's no longer a fixed string):

  ```ts
  expect(spawnCalls[2]?.opts.env).toMatchObject({
    API_PORT: '8080',
    REDIS_URL: 'redis://localhost:6380',
    RUN_REMINDER_WORKER: 'true',
    NODE_ENV: 'production',
    WEB_ORIGIN: 'http://localhost:8080',
  });
  const env = spawnCalls[2]?.opts.env as Record<string, string>;
  expect(env.JWT_SECRET?.length).toBeGreaterThanOrEqual(32);
  expect(env.WEB_DIST_DIR).toContain('web');
  ```

  Strengthen the existing regression-guard block (lines 102-106), adding checks that the password is no longer the old hardcoded literal and matches what `getOrCreateDbPassword()` returns:

  ```ts
  // Regression guard (2026-07-02 xavfsizlik bugi): runtime HECH QACHON
  // superuser (`dental`) bilan ulanmasin — Postgres'da superuser RLS'ni
  // avtomatik chetlab o'tadi, butun tenant izolyatsiyasini yo'qqa chiqaradi.
  expect(env.DATABASE_URL).toContain('dental_app');
  expect(env.DATABASE_URL).not.toMatch(/:\/\/dental:/);
  // Regression guard (CLI-390): parol endi committed literal EMAS — persisted
  // (first-run.ts) qiymatdan qurilgan bo'lishi shart.
  expect(env.DATABASE_URL).not.toContain('dental_app:dental_app_local_dev');
  expect(env.DATABASE_URL).toBe(`postgresql://dental_app:${getOrCreateDbPassword()}@localhost:5433/dental`);
  ```

  Add `getOrCreateDbPassword` to the test file's imports — it already dynamically imports from `./process-manager.js`; add a separate import for `./first-run.js`:
  ```ts
  const { getOrCreateDbPassword } = await import('./first-run.js');
  ```
  (Place this alongside the existing `await import('./test-electron-mock.js');` / `mock.module('node:child_process', ...)` setup, before the `process-manager.js` import, so the mocked `electron`/`node:child_process` modules are already registered when `first-run.js` is loaded — same ordering constraint the file's own comments describe for `test-electron-mock.js`.)

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd apps/desktop && bun test process-manager.test.ts
  ```
  Expect: the `toMatchObject`/regression-guard assertions fail because `DATABASE_URL` still contains the literal `dental_app_local_dev` (implementation not yet changed).

- [ ] **Step 3: Write minimal implementation**

  In `apps/desktop/src/process-manager.ts`, update the import (line 20):
  ```ts
  import { getOrCreateDbPassword, getOrCreateJwtSecret } from './first-run.js';
  ```

  Replace line 132:
  ```ts
  DATABASE_URL: `postgresql://dental_app:${getOrCreateDbPassword()}@localhost:5433/dental`,
  ```

  Leave line 138 (`DATABASE_ADMIN_URL`) unchanged — out of scope per the Global Constraints (superuser `dental` role, no `DENTAL_APP_DB_PASSWORD` pattern applies to it; `initdb` never sets it a password at all, which is a separate pre-existing question, not this ticket's).

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd apps/desktop && bun test process-manager.test.ts
  ```
  Expect: all tests green, including both the updated `toMatchObject` assertion and the strengthened regression-guard block.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/desktop/src/process-manager.ts apps/desktop/src/process-manager.test.ts
  git commit -m "$(cat <<'EOF'
  fix(desktop): stop hardcoding dental_app DB password in process-manager (CLI-390)

  spawnApi()'s DATABASE_URL now builds from getOrCreateDbPassword() (first-run.ts)
  instead of the committed literal dental_app:dental_app_local_dev. DATABASE_ADMIN_URL
  (superuser dental role) is left unchanged — out of scope, see plan/spec rationale.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 3: Fix migrate.ts env-var name + stale comments

**Files:**
- Modify: `apps/api/src/db/migrate.ts:56,62,66`
- New/modify test: `apps/api/tests/` — check for an existing `migrate.test.ts` first; if none exists, add a narrow unit test colocated per the module's existing test convention (see Step 1).

- [ ] **Step 1: Write the failing test**

  First check whether `apps/api/src/db/migrate.ts` (or `ensureAppRole`) already has any unit test coverage:
  ```bash
  find /home/madrimov/Projects/dental-service/apps/api -iname "*migrate*test*"
  ```
  If none exists, add a minimal one asserting the env-var read directly (avoid spinning up a real Postgres — `migrate.ts` runs top-level `await` statements on import, which makes it awkward to unit test in isolation; if the module's structure makes a direct import-based test impractical, extract the constant-resolution logic is NOT in scope — instead, write an integration-style test only if the project already has a pattern for it, e.g. `apps/api/tests/integration/`). Given the top-level-await structure, the pragmatic test is:

  ```ts
  // apps/api/tests/integration/cli-390-migrate-app-role-password.test.ts
  import { describe, expect, test } from 'bun:test';

  describe('migrate.ts ensureAppRole password env-var (CLI-390)', () => {
    test('DENTAL_APP_DB_PASSWORD (not DATABASE_APP_PASSWORD) is read for the dental_app role password', () => {
      const source = Bun.file('apps/api/src/db/migrate.ts').text();
      // Simple grep-style guard — a full ensureAppRole() integration test
      // would require a throwaway Postgres superuser connection, which the
      // module's top-level `await runMigrations()` makes awkward to isolate
      // in a single test file. This regression-guards the specific line
      // rename this ticket makes.
      return source.then((text) => {
        expect(text).toContain('process.env.DENTAL_APP_DB_PASSWORD');
        expect(text).not.toContain('process.env.DATABASE_APP_PASSWORD');
      });
    });
  });
  ```

  **Note to implementer:** if `apps/api/tests/integration/` already has a real `ensureAppRole()` exerciser (e.g. from the CLI-346/CLI-383 work) that spins up a real test Postgres and asserts the created role's actual password, prefer extending THAT test instead of the source-grep placeholder above — a real connection test is strictly better evidence. Check `apps/api/tests/integration/` for anything referencing `ensureAppRole`, `dental_app`, or `APP_ROLE` before writing a new file.

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd apps/api && bun test --env-file=../../.env tests/integration/cli-390-migrate-app-role-password.test.ts
  ```
  Expect: fails on `expect(text).not.toContain('process.env.DATABASE_APP_PASSWORD')` (the old name is still present).

- [ ] **Step 3: Write minimal implementation**

  In `apps/api/src/db/migrate.ts`, update the comment block (lines 54-64) and the password line:

  ```ts
  // ⚠️ XAVFSIZLIK (2026-07-02 topildi): RLS-only tenant izolyatsiyasi FAQAT
  // non-superuser role orqali ulanganda ishlaydi — superuser Postgres'da RLS'ni
  // avtomatik CHETLAB O'TADI. Cloud/dev'da bu ajratish `infra/postgres-init.sh`
  // orqali (Docker birinchi ishga tushishda) qilingan, lekin Local Desktop
  // first-run `initdb`dan keyin FAQAT superuser (`dental`) mavjud edi —
  // `dental_app` roli hech qachon yaratilmagan, ya'ni desktop API runtime
  // ulanishi (agar shu yerda tuzatilmasa) superuser orqali RLS'ni butunlay
  // chetlab o'tgan bo'lardi (barcha tenant ma'lumotlari hamma tenant uchun
  // ko'rinadigan bo'lib qolardi). `postgres-init.sh`dagi bilan bir xil
  // pattern, idempotent (allaqachon mavjud bo'lsa — cloud/dev — hech narsa
  // qilmaydi).
  const APP_ROLE = 'dental_app';
  const APP_ROLE_PASSWORD = process.env.DENTAL_APP_DB_PASSWORD ?? 'dental_app_local_dev';
  ```

  (Only the filename in the two comment lines and the env-var name on the password line change — every other word stays identical to the current file.)

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd apps/api && bun test --env-file=../../.env tests/integration/cli-390-migrate-app-role-password.test.ts
  ```
  Then run the full API test suite to confirm no regression:
  ```bash
  cd apps/api && bun test --env-file=../../.env
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/db/migrate.ts apps/api/tests/integration/cli-390-migrate-app-role-password.test.ts
  git commit -m "$(cat <<'EOF'
  fix(api): migrate.ts reads DENTAL_APP_DB_PASSWORD, not the never-set DATABASE_APP_PASSWORD (CLI-390)

  ensureAppRole() silently always fell back to the hardcoded default because
  it read DATABASE_APP_PASSWORD, a name never set anywhere (docker-compose.yml,
  .env.example, and infra/postgres-init.sh all use DENTAL_APP_DB_PASSWORD,
  wired in CLI-383). Harmless in cloud/dev (dental_app role already exists via
  postgres-init.sh, so ensureAppRole early-returns before reading the
  password), but load-bearing on Local Desktop, whose first-run path is the
  only place that actually executes the CREATE ROLE branch. Also updates two
  stale comments referencing the deleted infra/postgres-init.sql filename
  (CLI-383 renamed it to .sh but explicitly left apps/api untouched).

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Self-review

- **Placeholders:** none — every code block is derived from the actual files read in full (`apps/desktop/src/process-manager.ts` 191 lines, `apps/desktop/src/first-run.ts` 125 lines, `apps/desktop/src/process-manager.test.ts` 149 lines, `apps/desktop/src/first-run.test.ts` (relevant sections 39-166), `apps/api/src/db/migrate.ts` 179 lines, `infra/postgres-init.sh` 39 lines, `infra/docker-compose.yml`/`.env.example` grepped for `DENTAL_APP_DB_PASSWORD`).
- **Skeleton deviation, deliberate:** the ticket's file list names `process-manager.ts` as the primary edit site, but tracing the codebase shows the "generate+persist on first run" precedent (`getOrCreateJwtSecret`) lives in `first-run.ts`, and the password must be shared across three call sites (`runFirstSetup`, `runMigrations`, `spawnApi`) that live in two different files. Restructured into 3 tasks accordingly instead of the 2 implied by the ticket description, so `first-run.ts`'s central role isn't hidden behind `process-manager.ts`'s literal lines.
- **Ordering hazard called out twice (spec + plan):** `getOrCreateDbPassword()` must run before `initdb` inside `runFirstSetup()`, or `isFirstRun()`'s `PG_VERSION` check would misclassify a fresh install as an existing one after `initdb` creates that file mid-function. Task 1 Step 3 places the call as step 2, before `initdb` (renumbering the file's existing steps), and the Global Constraints section states why in the same words as the spec, so a reviewer sees the same rationale in both places.
- **Upgrade-safety validated against actual control flow, not assumed:** traced `main.ts:162-169`'s `firstRun` branch explicitly — existing installs never call `runFirstSetup()`/`runMigrations()` again, so `getOrCreateDbPassword()`'s first-ever call for such an install happens inside `spawnApi()` with `isFirstRun() === false`, correctly hitting the legacy-literal branch. No new migration/detection mechanism was added beyond reusing this existing branching, per instruction to consider whether one was needed.
- **Scope boundary on `DATABASE_ADMIN_URL` made explicit, not silently dropped:** the ticket names `process-manager.ts:138` alongside the `DATABASE_URL` line, but the `DENTAL_APP_DB_PASSWORD` pattern this ticket replicates only applies to the `dental_app` role. The superuser `dental` role is created by `initdb -U dental` with no password set at all (a separate, deeper, pre-existing question outside this ticket's DoD) — left unchanged in Task 2, with the rationale recorded in both the spec (§2/§3.4) and this plan's Global Constraints, so a reviewer seeing line 138 untouched knows it was a deliberate scoping call, not an oversight.
- **Test-coverage honesty:** explicitly flagged in Global Constraints that the mocked-spawn unit tests in this plan cannot prove the "fresh install still generates random even though `initdb` just ran" property end-to-end — that depends on call-order correctness (code-reviewable) and, per this project's existing convention for Electron/Windows-only paths, a physical Windows PC first-run. Task 1's tests instead directly manipulate the `PG_VERSION` file to exercise both of `getOrCreateDbPassword()`'s branches in isolation, which is real but narrower coverage than "the whole first-run flow behaves correctly," and the plan says so rather than implying full coverage.
- **Task 3's test is the weakest link, flagged as such:** `migrate.ts` runs top-level `await` on import (connects to Postgres immediately), making a clean in-process unit test awkward without either mocking `postgres`/`drizzle` or standing up a real test database. The plan gives a minimal source-guard test as a fallback but explicitly instructs the implementer to check for and prefer an existing real `ensureAppRole()` integration exerciser first, rather than presenting the source-grep as if it were equivalent to a real behavioral test.
