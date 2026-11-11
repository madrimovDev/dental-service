#!/usr/bin/env bash
# Workflow lane tayyorlash / tozalash (docs/ORCHESTRATION-GUIDE.md §5.2–5.3).
#
#   scripts/wf-lane.sh prep <name> [redisIndex] [--db] [--sv]
#     - .claude/worktrees/<name> worktree (branch wf/<name>) main tip'idan
#     - .env (+ apps/supervisor-api/.env) nusxasi, apps/*/node_modules symlink
#     - --db: dental_test_<name> bazasi + migratsiya + seedPermissions; .env URL'lari shunga
#     - --sv: supervisor_test_<name> bazasi + supervisor migratsiya; supervisor .env shunga
#   scripts/wf-lane.sh clean <name>   — worktree, branch, lane bazalari, Redis indeksi
#
# Shell env `--env-file`dan ustun — shuning uchun migratsiya/seed `env -u …` bilan.
set -euo pipefail
cmd=${1:?prep|clean}; name=${2:?lane name}; shift 2
ROOT=$(git rev-parse --show-toplevel); cd "$ROOT"
WT=".claude/worktrees/$name"; BR="wf/$name"; DBN="dental_test_${name//-/_}"; SVN="supervisor_test_${name//-/_}"
PGUSER_ADMIN=$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2-)
psqlc() { docker exec dental-postgres psql -U "$PGUSER_ADMIN" -d postgres -qtAc "$1" >/dev/null; }

if [ "$cmd" = prep ]; then
  redis=${1:-1}; shift || true
  want_db=0; want_sv=0
  for a in "$@"; do [ "$a" = --db ] && want_db=1; [ "$a" = --sv ] && want_sv=1; done
  git worktree add -q "$WT" -b "$BR" main
  [ "$(git -C "$WT" rev-parse HEAD)" = "$(git rev-parse main)" ] || { echo "stale worktree base" >&2; exit 1; }
  cp .env "$WT/.env"; cp apps/supervisor-api/.env "$WT/apps/supervisor-api/.env"
  for d in apps/*/node_modules; do [ -d "$d" ] && ln -s "$ROOT/$d" "$WT/$d"; done
  if [ $want_db = 1 ]; then
    app=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-); adm=$(grep -E '^DATABASE_ADMIN_URL=' .env | cut -d= -f2-)
    rds=$(grep -E '^REDIS_URL=' .env | cut -d= -f2-)
    psqlc "DROP DATABASE IF EXISTS $DBN WITH (FORCE)"; psqlc "CREATE DATABASE $DBN"
    sed -i "s#^DATABASE_URL=.*#DATABASE_URL=${app%/*}/$DBN#; s#^DATABASE_ADMIN_URL=.*#DATABASE_ADMIN_URL=${adm%/*}/$DBN#; s#^REDIS_URL=.*#REDIS_URL=${rds%/}/$redis#" "$WT/.env"
    (cd "$WT/apps/api" && env -u DATABASE_URL -u DATABASE_ADMIN_URL -u REDIS_URL bun --env-file=../../.env run src/db/migrate.ts >/dev/null 2>&1)
    printf "import { db } from './src/db/client.ts';\nimport { seedPermissions } from './src/db/boot-seed.ts';\nawait seedPermissions(db); process.exit(0);\n" > "$WT/apps/api/.lane-seed.ts"
    (cd "$WT/apps/api" && env -u DATABASE_URL -u DATABASE_ADMIN_URL -u REDIS_URL bun --env-file=../../.env run .lane-seed.ts >/dev/null 2>&1); rm "$WT/apps/api/.lane-seed.ts"
    n=$(docker exec dental-postgres psql -U "$PGUSER_ADMIN" -d "$DBN" -tAc "select count(*) from permissions")
    [ "$n" -gt 0 ] || { echo "seed failed ($n)" >&2; exit 1; }
    echo "db $DBN permissions=$n redis=/$redis"
  fi
  if [ $want_sv = 1 ]; then
    sv=$(grep -E '^DATABASE_URL=' apps/supervisor-api/.env | cut -d= -f2-)
    psqlc "DROP DATABASE IF EXISTS $SVN WITH (FORCE)"; psqlc "CREATE DATABASE $SVN"
    sed -i "s#^DATABASE_URL=.*#DATABASE_URL=${sv%/*}/$SVN#" "$WT/apps/supervisor-api/.env"
    (cd "$WT/apps/supervisor-api" && env -u DATABASE_URL bun --env-file=.env run src/db/migrate.ts >/dev/null 2>&1)
    echo "sv $SVN"
  fi
  echo "ready $WT ($BR)"
elif [ "$cmd" = clean ]; then
  git worktree remove --force "$WT" 2>/dev/null || true
  git branch -D -q "$BR" 2>/dev/null || true
  psqlc "DROP DATABASE IF EXISTS $DBN WITH (FORCE)"; psqlc "DROP DATABASE IF EXISTS $SVN WITH (FORCE)"
  echo "cleaned $name"
else
  echo "unknown command $cmd" >&2; exit 2
fi
