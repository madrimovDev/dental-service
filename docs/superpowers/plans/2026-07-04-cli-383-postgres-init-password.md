# CLI-383 — Production Postgres role password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the `dental_app` Postgres role's real password from being a committed literal (`dental_app_local_dev` in `infra/postgres-init.sql:10`) that silently diverges from whatever password an operator sets in `DATABASE_URL` (`.env.production.example:25`). Replace the static `.sql` init file with an env-driven `.sh` entrypoint that reads the password from a new `DENTAL_APP_DB_PASSWORD` env var, so Postgres's actual role password and the app's connection string are set from the same operator-provided value instead of one being a hardcoded fallback.

**Architecture:** This is infra config only — `infra/postgres-init.sql` → `infra/postgres-init.sh` (mounted into the official `postgres:16-alpine` image's `/docker-entrypoint-initdb.d/`, which runs `.sh` files with full process-env access, unlike `.sql` files which get no interpolation). The same file is shared by both `infra/docker-compose.prod.yml` (prod) and `infra/docker-compose.yml` (dev) via an identical relative mount path, so both compose files must be updated together or dev breaks. No `apps/api` source code changes — `DATABASE_URL`/`DATABASE_ADMIN_URL` stay full connection-string env vars, unchanged shape (`apps/api/src/lib/env-schema.ts` untouched).

**Tech Stack:** Docker Compose, Postgres 16 (`postgres:16-alpine`), POSIX `sh` (Alpine busybox ash — no bashisms).

## Global Constraints

- `infra/docker-compose.yml` (dev) MUST be updated in the same change as `infra/docker-compose.prod.yml` — both files mount `./postgres-init.sql` at the identical relative path (confirmed by reading both files: prod line 27, dev line 14). Converting the file to `.sh` without updating dev's mount path breaks local dev Postgres entirely (missing-file mount).
- Dev keeps a **default** (`${DENTAL_APP_DB_PASSWORD:-dental_app_local_dev}`), matching the existing `POSTGRES_PASSWORD:-dental_local_dev` / `REDIS_PASSWORD:-dental_local_dev` convention already in `infra/docker-compose.yml` — no operator action required for local dev, zero-config experience preserved. Prod uses the fail-fast `${DENTAL_APP_DB_PASSWORD:?set DENTAL_APP_DB_PASSWORD}` form, matching every other secret in `infra/docker-compose.prod.yml`.
- Every non-password line in `infra/postgres-init.sql` (the `ALTER ROLE ... NOSUPERUSER NOBYPASSRLS`, the `GRANT CONNECT`/`GRANT USAGE`/table+sequence grants, and both `ALTER DEFAULT PRIVILEGES` statements) carries over to the new `.sh` file byte-for-byte — these are the RLS-enforcement grants, not one-time bootstrap noise. Dropping any of them silently breaks `dental_app`'s ability to read/write tables or breaks future-table auto-grants.
- No composition of `DATABASE_URL`/`DATABASE_ADMIN_URL` from parts inside `docker-compose.prod.yml` — considered as a more structural fix (would eliminate password duplication entirely) but out of scope for this ticket; `apps/api/src/lib/env-schema.ts` expects a full connection-string URL and this plan does not touch `apps/api`. Flagged as a follow-up ticket candidate, not done here.
- `infra/postgres-init-supervisor.sql` (dev-only, mounted as `02-init-supervisor.sql`, not referenced by prod compose) is untouched — separate product, out of scope.
- `ALTER DEFAULT PRIVILEGES FOR ROLE $POSTGRES_USER` (generalized from the original hardcoded `dental`) is only correct if `POSTGRES_USER` is the same role used in `DATABASE_ADMIN_URL` (the role that actually runs migrations and creates future tables). True in both `.env*.example` files today (`dental` in both) — not enforced by this change, just documented as an assumption.

---

### Task 1: Replace static SQL init with an env-driven entrypoint script

**Files:**
- Create: `infra/postgres-init.sh`
- Delete: `infra/postgres-init.sql`
- Modify: `infra/docker-compose.prod.yml:21-27` (postgres service `environment` + `volumes`)
- Modify: `infra/docker-compose.yml:6-14` (postgres service `environment` + `volumes`)
- Modify: `.env.production.example:24-27` (new var + comment tying it to `DATABASE_URL`)
- Modify: `.env.example:9` (dev — add matching var for self-consistency; optional but cheap)
- Modify: `docs/runbooks/deployment.md:46` (required-secrets list)

- [ ] **Step 1: Write the new entrypoint script**

  Create `infra/postgres-init.sh` with this exact content (all grants below are copied verbatim from the current `infra/postgres-init.sql`, only the `CREATE ROLE` line's literal password is replaced with an env-var read):

  ```sh
  #!/bin/sh
  # Postgres init script (Docker image birinchi ishga tushishida ishlaydi).
  # .sql'dan farqli o'laroq, docker-entrypoint.sh *.sh fayllarni process env bilan
  # ishga tushiradi — shuning uchun parolni ENV orqali o'qiy olamiz (CLI-383).
  #
  # POSTGRES_USER (dental) sifatida ishga tushadi — u superuser.
  # Bu yerda app-level non-superuser role yaratamiz.
  #
  # Production-grade pattern:
  #   - 'dental' (superuser) — migrations va admin tasks uchun
  #   - 'dental_app' (non-superuser, NO BYPASSRLS) — application connections uchun
  # App 'dental_app' orqali ulanganda RLS to'liq qo'llaniladi.
  set -eu

  : "${DENTAL_APP_DB_PASSWORD:?DENTAL_APP_DB_PASSWORD muhit o'zgaruvchisi kerak (dental_app role paroli)}"

  psql -v ON_ERROR_STOP=1 -v app_pw="$DENTAL_APP_DB_PASSWORD" \
    --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
  CREATE ROLE dental_app WITH LOGIN PASSWORD :'app_pw';

  -- Xavfsizlik: superuser ham, BYPASSRLS ham bo'lmasin
  ALTER ROLE dental_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

  -- DB ga ulanish va schema ishlatish
  GRANT CONNECT ON DATABASE $POSTGRES_DB TO dental_app;
  GRANT USAGE ON SCHEMA public TO dental_app;

  -- Mavjud jadvallar va sequence'larga ruxsat (hozir bo'sh, kelajak uchun)
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON ALL TABLES IN SCHEMA public TO dental_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dental_app;

  -- Drizzle migration'lar 'dental' (superuser) bilan ishlaganda yaratadigan
  -- kelajakdagi jadvallar uchun ham avtomatik ruxsat:
  ALTER DEFAULT PRIVILEGES FOR ROLE $POSTGRES_USER IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON TABLES TO dental_app;

  ALTER DEFAULT PRIVILEGES FOR ROLE $POSTGRES_USER IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO dental_app;
  EOSQL
  ```

  **Do not splice the password directly into `'$DENTAL_APP_DB_PASSWORD'`** — a password containing a single quote (plausible output from a password manager; `.env.production.example` doesn't constrain the charset) would break the `CREATE ROLE` statement's quoting (syntax error or worse) on first boot. Instead pass it as a psql variable (`-v app_pw=...`) and reference it with `:'app_pw'` — psql's own quoting escapes it correctly regardless of content. `$POSTGRES_USER`/`$POSTGRES_DB` stay as plain shell interpolation (operator-controlled identifiers, not attacker/password-shaped input, no quoting risk).

  The heredoc terminator is a **plain, unquoted `EOSQL` at column 0** (no `<<-`) — `$POSTGRES_USER`/`$POSTGRES_DB`/`:'app_pw'` still need the heredoc body unquoted to interpolate/resolve, but `<<-` only strips **leading tabs**, not spaces; if this gets copied with space-indentation the `EOSQL` terminator silently fails to match and the heredoc runs away. SQL doesn't care about the body's leading whitespace, so column 0 is the safe choice. Also: do not put backticks anywhere in the heredoc body — in an unquoted heredoc a backtick triggers shell command substitution and would corrupt the script.

  Then make it executable so the Postgres entrypoint **exec**s it in a subshell instead of **source**-ing it into its own shell (sourcing would leak this script's `set -eu` into the calling `docker-entrypoint.sh` shell — a real, documented gotcha with `*.sh` init scripts):
  ```bash
  chmod +x infra/postgres-init.sh
  ```

- [ ] **Step 2: Wire the new env var into both compose files**

  `infra/docker-compose.prod.yml` (replace lines 21-27):
  ```yaml
      environment:
        POSTGRES_USER: ${POSTGRES_USER:?set POSTGRES_USER}
        POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}
        POSTGRES_DB: ${POSTGRES_DB:?set POSTGRES_DB}
        DENTAL_APP_DB_PASSWORD: ${DENTAL_APP_DB_PASSWORD:?set DENTAL_APP_DB_PASSWORD}
      volumes:
        - postgres_data:/var/lib/postgresql/data
        - ./postgres-init.sh:/docker-entrypoint-initdb.d/01-init.sh:ro
  ```

  `infra/docker-compose.yml` (dev — replace lines 6-14):
  ```yaml
      environment:
        POSTGRES_USER: ${POSTGRES_USER:-dental}
        POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-dental_local_dev}
        POSTGRES_DB: ${POSTGRES_DB:-dental}
        DENTAL_APP_DB_PASSWORD: ${DENTAL_APP_DB_PASSWORD:-dental_app_local_dev}
      ports:
        - "${POSTGRES_PORT:-5432}:5432"
      volumes:
        - postgres_data:/var/lib/postgresql/data
        - ./postgres-init.sh:/docker-entrypoint-initdb.d/01-init.sh:ro
        - ./postgres-init-supervisor.sql:/docker-entrypoint-initdb.d/02-init-supervisor.sql:ro
  ```

  `.env.production.example` (replace lines 24-27):
  ```
  # Non-superuser app role — created at first Postgres boot by
  # infra/postgres-init.sh (CLI-383). MUST be the exact same password as the
  # `dental_app:` segment of DATABASE_URL below — Postgres does not read
  # DATABASE_URL, this var is what actually sets the role's password.
  DENTAL_APP_DB_PASSWORD=__CHANGE_ME_app_db_password__
  # Runtime (non-superuser, RLS applies). Host = `postgres` inside compose.
  # Password segment here MUST equal DENTAL_APP_DB_PASSWORD above.
  DATABASE_URL=postgres://dental_app:__CHANGE_ME_app_db_password__@postgres:5432/dental
  # Admin/superuser — migrations + RLS DDL only.
  DATABASE_ADMIN_URL=postgres://dental:__CHANGE_ME_strong_postgres_admin_password__@postgres:5432/dental
  ```

  `.env.example` (dev — insert after line 9, the existing `DATABASE_URL` line):
  ```
  DENTAL_APP_DB_PASSWORD=dental_app_local_dev
  ```

  `docs/runbooks/deployment.md` (replace line 46):
  ```
  `POSTGRES_PASSWORD`, `DENTAL_APP_DB_PASSWORD` (sets the `dental_app` role's
  actual password — MUST match the password embedded in `DATABASE_URL` below,
  see CLI-383), `DATABASE_URL`, `DATABASE_ADMIN_URL` (migrate only),
  ```

- [ ] **Step 3: Boot-test locally**

  Init scripts only run against a **fresh** data directory — reusing an existing `postgres_data` volume from a prior local run will mask a broken script (the role already exists from before). Always `down -v` first.

  ```bash
  cd infra

  cat > /tmp/cli-383-test.env <<'EOF'
  POSTGRES_USER=dental
  POSTGRES_PASSWORD=test_admin_pw
  POSTGRES_DB=dental
  DENTAL_APP_DB_PASSWORD=abc'def
  EOF

  # --- prod compose: fresh volume, boot, connect with the NEW password ---
  # Password deliberately contains a single quote (abc'def) — this is the exact
  # input class that breaks naive `'$VAR'` splicing in the CREATE ROLE
  # statement; using an innocuous alnum-only password here would give false
  # confidence and hide exactly the bug this script is designed to avoid.
  docker compose -f docker-compose.prod.yml --env-file /tmp/cli-383-test.env down -v
  docker compose -f docker-compose.prod.yml --env-file /tmp/cli-383-test.env up -d postgres
  sleep 3
  docker compose -f docker-compose.prod.yml --env-file /tmp/cli-383-test.env \
    exec -T -e PGPASSWORD="abc'def" postgres psql -U dental_app -d dental -c "SELECT 1;"
  ```
  Expected: `SELECT 1` succeeds (one row returned) — confirms the `-v app_pw=... :'app_pw'` psql-quoting handles a quote-containing password correctly.

  ```bash
  # --- regression check: the OLD hardcoded literal must now be REJECTED ---
  docker compose -f docker-compose.prod.yml --env-file /tmp/cli-383-test.env \
    exec -T -e PGPASSWORD=dental_app_local_dev postgres psql -U dental_app -d dental -c "SELECT 1;"
  ```
  Expected: `psql: error: ... password authentication failed for user "dental_app"` — this is the core regression proof for CLI-383 (the committed literal no longer works in prod).

  ```bash
  docker compose -f docker-compose.prod.yml --env-file /tmp/cli-383-test.env down -v

  # --- dev compose: fresh volume, boot with ZERO env overrides, confirm default still works ---
  docker compose -f docker-compose.yml down -v
  docker compose -f docker-compose.yml up -d postgres
  sleep 3
  docker compose -f docker-compose.yml \
    exec -T -e PGPASSWORD=dental_app_local_dev postgres psql -U dental_app -d dental -c "SELECT 1;"
  docker compose -f docker-compose.yml down -v
  ```
  Expected: `SELECT 1` succeeds with no `.env` file at all — proves dev's zero-config default (`DENTAL_APP_DB_PASSWORD:-dental_app_local_dev`) still works and local dev is not broken by this change.

- [ ] **Step 4: Remove the old `postgres-init.sql`**

  Every statement in the old file (`ALTER ROLE ... NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`, both `GRANT` blocks, both `ALTER DEFAULT PRIVILEGES` blocks) has already been carried into `postgres-init.sh` in Step 1 — confirmed line-by-line against the file read at the start of this task. There is no `CREATE DATABASE` or other statement left behind (the target database is created by the Postgres image itself via `POSTGRES_DB`, not by this script). Delete the file:
  ```bash
  git rm infra/postgres-init.sql
  ```

- [ ] **Step 5: Commit**
  ```bash
  git add infra/postgres-init.sh infra/docker-compose.prod.yml infra/docker-compose.yml \
    .env.production.example .env.example docs/runbooks/deployment.md
  git commit -m "$(cat <<'EOF'
  fix(infra): derive prod Postgres app-role password from env instead of hardcoding

  infra/postgres-init.sql hardcoded the dental_app role's password as a
  literal, which Postgres's .sql init-script handling never interpolates from
  env — so DATABASE_URL's operator-configured password silently diverged from
  the role's real password. Replaced with postgres-init.sh (.sh scripts DO get
  full process-env access) reading a new DENTAL_APP_DB_PASSWORD var, wired
  into both prod (fail-fast, no default) and dev (defaulted, zero-config)
  compose files since they share this same init file.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Self-review

- **Placeholders:** none — the `.sh` script content, both compose diffs, both env-file diffs, and the deployment.md line are the literal text to apply, derived from the files actually read (`infra/postgres-init.sql` full 30 lines, `infra/docker-compose.prod.yml` full 207 lines, `infra/docker-compose.yml` full 82 lines, `.env.production.example` full 80 lines, `.env.example` full 47 lines, `docs/runbooks/deployment.md` lines 1-95).
- **Shared-file hazard caught:** the single biggest risk in this ticket was fixing prod without noticing `infra/docker-compose.yml` (dev) mounts the exact same `./postgres-init.sql` path — confirmed by direct read of both files. Task 1 Step 2 updates both together; Step 3's boot-test explicitly re-verifies dev after the change, not just prod.
- **Why no `DATABASE_URL` composition:** considered introducing `DATABASE_URL: postgres://dental_app:${DENTAL_APP_DB_PASSWORD}@postgres:5432/${POSTGRES_DB}` in the `api`/`worker`/`migrate` services to eliminate the password-duplication risk structurally. Not done here — `apps/api/src/lib/env-schema.ts` treats `DATABASE_URL` as an operator-supplied `z.url()` value, and changing that plumbing touches three more services' env blocks beyond what the ticket's DoD asks for (`postgres-init.sql` replaced + documented/verified). Recorded as a follow-up candidate in the spec and in the Global Constraints above, not silently dropped.
- **Heredoc correctness double-checked:** the `.sh` script uses an **unquoted**, column-0 `EOSQL` terminator deliberately (so `$POSTGRES_USER`/`$POSTGRES_DB`/`:'app_pw'` interpolate/resolve, and so a space-indented copy-paste doesn't produce a runaway heredoc the way `<<-` would if someone used spaces instead of tabs) and avoids backticks inside it for that same reason — flagged explicitly in Step 1.
- **Password quoting caught and fixed:** an earlier draft of this script spliced `'$DENTAL_APP_DB_PASSWORD'` directly into the `CREATE ROLE` statement — a password containing a single quote would have broken the SQL (syntax error, or worse) on first prod boot, and the original boot-test used an alnum-only password that would never have caught it. Fixed by passing the password as a psql variable (`-v app_pw=...`) and referencing it with `:'app_pw'` (psql's own escaping), and Step 3's test password is now `abc'def` specifically to exercise that path.
- **Verification is a real boot, not a unit test:** per the ticket's nature (infra config, no app code), Step 3 is an actual `docker compose up` + `psql` connection check with a fresh volume, including a negative-case check (old literal password now rejected) and a positive case using a quote-containing password (proving the quoting fix actually works, not just that the happy path parses) — this is the concrete evidence the bug class is closed.
