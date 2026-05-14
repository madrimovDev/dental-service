-- Postgres init script — Docker image first-time setup paytida ishlaydi.
-- POSTGRES_USER (dental) sifatida ishga tushadi — u superuser.
-- Bu yerda app-level non-superuser role yaratamiz.
--
-- Production-grade pattern:
--   - `dental` (superuser) — migrations va admin tasks uchun
--   - `dental_app` (non-superuser, NO BYPASSRLS) — application connections uchun
-- App `dental_app` orqali ulanganda RLS to'liq qo'llaniladi.

CREATE ROLE dental_app WITH LOGIN PASSWORD 'dental_app_local_dev';

-- Xavfsizlik: superuser ham, BYPASSRLS ham bo'lmasin
ALTER ROLE dental_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- DB ga ulanish va schema ishlatish
GRANT CONNECT ON DATABASE dental TO dental_app;
GRANT USAGE ON SCHEMA public TO dental_app;

-- Mavjud jadvallar va sequence'larga ruxsat (hozir bo'sh, kelajak uchun)
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON ALL TABLES IN SCHEMA public TO dental_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dental_app;

-- Drizzle migration'lar `dental` (superuser) bilan ishlaganda yaratadigan
-- kelajakdagi jadvallar uchun ham avtomatik ruxsat:
ALTER DEFAULT PRIVILEGES FOR ROLE dental IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON TABLES TO dental_app;

ALTER DEFAULT PRIVILEGES FOR ROLE dental IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO dental_app;
