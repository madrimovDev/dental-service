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
