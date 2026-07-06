-- Dev-only: umumiy dental-postgres container'da 'supervisor' nomli 2-baza
-- yaratadi. Supervisor kichik, bitta-tenant admin tool — dental_app/RLS split
-- takrorlanmaydi, mavjud 'dental' superuser orqali ulanadi.
SELECT 'CREATE DATABASE supervisor OWNER dental'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'supervisor')\gexec
